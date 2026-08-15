# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import os
from datetime import datetime, timedelta
from urllib.parse import urlencode, urlparse

import jwt
import pytz
import requests
from django.contrib.auth import get_user_model

from plane.authentication.adapter.error import AUTHENTICATION_ERROR_CODES, AuthenticationException
from plane.authentication.adapter.oauth import OauthAdapter
from plane.license.utils.instance_value import get_configuration_value


class OktaOIDCProvider(OauthAdapter):
    provider = "okta"
    scope = "openid profile email"

    def __init__(self, request, code=None, state=None, nonce=None, callback=None):
        is_enabled, issuer, client_id, client_secret, require_email_verified = get_configuration_value(
            [
                {"key": "IS_OKTA_OIDC_ENABLED", "default": os.environ.get("IS_OKTA_OIDC_ENABLED", "0")},
                {"key": "OKTA_OIDC_ISSUER", "default": os.environ.get("OKTA_OIDC_ISSUER", "")},
                {"key": "OKTA_OIDC_CLIENT_ID", "default": os.environ.get("OKTA_OIDC_CLIENT_ID", "")},
                {"key": "OKTA_OIDC_CLIENT_SECRET", "default": os.environ.get("OKTA_OIDC_CLIENT_SECRET", "")},
                {"key": "OKTA_OIDC_REQUIRE_EMAIL_VERIFIED", "default": "0"},
            ]
        )
        issuer = str(issuer).rstrip("/")
        parsed_issuer = urlparse(issuer)
        if not (is_enabled == "1" and client_id and client_secret and parsed_issuer.scheme == "https" and parsed_issuer.netloc):
            raise self._not_configured()

        try:
            discovery_response = requests.get(f"{issuer}/.well-known/openid-configuration", timeout=10)
            discovery_response.raise_for_status()
            discovery = discovery_response.json()
            if discovery.get("issuer") != issuer:
                raise ValueError("issuer mismatch")
            authorization_endpoint = discovery["authorization_endpoint"]
            token_endpoint = discovery["token_endpoint"]
            userinfo_endpoint = discovery["userinfo_endpoint"]
            jwks_uri = discovery["jwks_uri"]
            if not all(urlparse(url).scheme == "https" for url in (authorization_endpoint, token_endpoint, userinfo_endpoint, jwks_uri)):
                raise ValueError("insecure endpoint")
        except (requests.RequestException, KeyError, ValueError):
            raise self._not_configured()

        self.issuer = issuer
        self.nonce = nonce
        self.jwks_uri = jwks_uri
        self.require_email_verified = require_email_verified == "1"
        redirect_uri = f"{'https' if request.is_secure() else 'http'}://{request.get_host()}/auth/okta/callback/"
        auth_url = f"{authorization_endpoint}?{urlencode({'client_id': client_id, 'scope': self.scope, 'redirect_uri': redirect_uri, 'response_type': 'code', 'state': state, 'nonce': nonce})}"
        super().__init__(request, self.provider, client_id, self.scope, redirect_uri, auth_url, token_endpoint, userinfo_endpoint, client_secret, code, callback)

    @staticmethod
    def _not_configured():
        return AuthenticationException(
            error_code=AUTHENTICATION_ERROR_CODES["OAUTH_NOT_CONFIGURED"], error_message="OAUTH_NOT_CONFIGURED"
        )

    def authentication_error_code(self):
        return "OAUTH_NOT_CONFIGURED"

    def set_token_data(self):
        token_response = self.get_user_token(
            {"code": self.code, "client_id": self.client_id, "client_secret": self.client_secret, "redirect_uri": self.redirect_uri, "grant_type": "authorization_code"}
        )
        id_token = token_response.get("id_token")
        try:
            claims = jwt.decode(
                id_token,
                jwt.PyJWKClient(self.jwks_uri).get_signing_key_from_jwt(id_token).key,
                algorithms=["RS256"],
                audience=self.client_id,
                issuer=self.issuer,
            )
            if not self.nonce or claims.get("nonce") != self.nonce:
                raise jwt.InvalidTokenError("nonce mismatch")
        except (jwt.PyJWTError, TypeError, ValueError):
            raise self._not_configured()
        self.id_token_claims = claims
        expires_in = token_response.get("expires_in")
        super().set_token_data(
            {
                "access_token": token_response.get("access_token"),
                "refresh_token": token_response.get("refresh_token"),
                "access_token_expired_at": datetime.now(tz=pytz.utc) + timedelta(seconds=expires_in) if expires_in else None,
                "id_token": id_token,
            }
        )

    def set_user_data(self):
        claims = self.id_token_claims
        email = claims.get("email", "").lower()
        if not email or not claims.get("sub"):
            raise self._not_configured()
        if self.require_email_verified and not claims.get("email_verified"):
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["OAUTH_PROVIDER_UNVERIFIED_EMAIL"],
                error_message="OAUTH_PROVIDER_UNVERIFIED_EMAIL",
            )
        if not get_user_model().objects.filter(email__iexact=email).exists():
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["USER_DOES_NOT_EXIST"],
                error_message="USER_DOES_NOT_EXIST",
                payload={"email": email},
            )
        super().set_user_data(
            {"email": email, "user": {"first_name": claims.get("given_name"), "last_name": claims.get("family_name"), "provider_id": claims["sub"], "is_password_autoset": True}}
        )
