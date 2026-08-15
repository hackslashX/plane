# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import secrets
import uuid

from django.http import HttpResponseRedirect
from django.views import View

from plane.authentication.adapter.error import AUTHENTICATION_ERROR_CODES, AuthenticationException
from plane.authentication.provider.oauth.okta import OktaOIDCProvider
from plane.authentication.utils.host import base_host
from plane.authentication.utils.login import user_login
from plane.authentication.utils.redirection_path import get_redirection_path
from plane.authentication.utils.user_auth_workflow import post_user_auth_workflow
from plane.license.models import Instance
from plane.utils.path_validator import get_safe_redirect_url


class OktaOIDCInitiateEndpoint(View):
    def get(self, request):
        request.session["host"] = base_host(request=request, is_app=True)
        next_path = request.GET.get("next_path")
        if next_path:
            request.session["next_path"] = str(next_path)
        if not (instance := Instance.objects.first()) or not instance.is_setup_done:
            return self._redirect_error(request, next_path, "INSTANCE_NOT_CONFIGURED")
        try:
            state, nonce = uuid.uuid4().hex, secrets.token_urlsafe(32)
            request.session["okta_state"] = state
            request.session["okta_nonce"] = nonce
            return HttpResponseRedirect(OktaOIDCProvider(request=request, state=state, nonce=nonce).get_auth_url())
        except AuthenticationException as exc:
            return self._redirect_exception(request, next_path, exc)

    def _redirect_error(self, request, next_path, error):
        return self._redirect_exception(request, next_path, AuthenticationException(AUTHENTICATION_ERROR_CODES[error], error))

    def _redirect_exception(self, request, next_path, exc):
        return HttpResponseRedirect(get_safe_redirect_url(base_url=base_host(request=request, is_app=True), next_path=next_path, params=exc.get_error_dict()))


class OktaOIDCCallbackEndpoint(View):
    def get(self, request):
        next_path = request.session.pop("next_path", None)
        state = request.GET.get("state")
        code = request.GET.get("code")
        if not code or not state or state != request.session.pop("okta_state", None):
            return self._redirect_error(request, next_path, "OAUTH_NOT_CONFIGURED")
        try:
            provider = OktaOIDCProvider(request=request, code=code, nonce=request.session.pop("okta_nonce", None), callback=post_user_auth_workflow)
            user = provider.authenticate()
            user_login(request=request, user=user, is_app=True)
            return HttpResponseRedirect(get_safe_redirect_url(base_url=base_host(request=request, is_app=True), next_path=next_path or get_redirection_path(user=user), params={}))
        except AuthenticationException as exc:
            return self._redirect_exception(request, next_path, exc)

    def _redirect_error(self, request, next_path, error):
        return self._redirect_exception(request, next_path, AuthenticationException(AUTHENTICATION_ERROR_CODES[error], error))

    def _redirect_exception(self, request, next_path, exc):
        return HttpResponseRedirect(get_safe_redirect_url(base_url=base_host(request=request, is_app=True), next_path=next_path, params=exc.get_error_dict()))
