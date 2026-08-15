/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { isEmpty } from "lodash-es";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { API_BASE_URL } from "@plane/constants";
import { Button, getButtonStyling } from "@plane/propel/button";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import type { IFormattedInstanceConfiguration, TInstanceOktaOIDCAuthenticationConfigurationKeys } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
import { ConfirmDiscardModal } from "@/components/common/confirm-discard-modal";
import { ControllerInput } from "@/components/common/controller-input";
import type { TControllerInputFormField } from "@/components/common/controller-input";
import { CopyField } from "@/components/common/copy-field";
import type { TCopyField } from "@/components/common/copy-field";
import { useInstance } from "@/hooks/store";

type Props = { config: IFormattedInstanceConfiguration };
type Values = Record<TInstanceOktaOIDCAuthenticationConfigurationKeys, string>;

export function InstanceOktaOIDCConfigForm({ config }: Props) {
  const [isDiscardChangesModalOpen, setIsDiscardChangesModalOpen] = useState(false);
  const { updateInstanceConfigurations } = useInstance();
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      OKTA_OIDC_ISSUER: config.OKTA_OIDC_ISSUER,
      OKTA_OIDC_CLIENT_ID: config.OKTA_OIDC_CLIENT_ID,
      OKTA_OIDC_CLIENT_SECRET: config.OKTA_OIDC_CLIENT_SECRET,
      OKTA_OIDC_REQUIRE_EMAIL_VERIFIED: config.OKTA_OIDC_REQUIRE_EMAIL_VERIFIED || "0",
    },
  });
  const originURL = !isEmpty(API_BASE_URL) ? API_BASE_URL : typeof window !== "undefined" ? window.location.origin : "";
  const fields: TControllerInputFormField[] = [
    {
      key: "OKTA_OIDC_ISSUER",
      type: "url",
      label: "Issuer URL",
      description: "Your Okta authorization server issuer URL.",
      placeholder: "https://example.okta.com/oauth2/default",
      error: Boolean(errors.OKTA_OIDC_ISSUER),
      required: true,
    },
    {
      key: "OKTA_OIDC_CLIENT_ID",
      type: "text",
      label: "Client ID",
      description: "From your Okta OIDC application integration.",
      error: Boolean(errors.OKTA_OIDC_CLIENT_ID),
      required: true,
    },
    {
      key: "OKTA_OIDC_CLIENT_SECRET",
      type: "password",
      label: "Client secret",
      description: "From your Okta OIDC application integration.",
      error: Boolean(errors.OKTA_OIDC_CLIENT_SECRET),
      required: true,
    },
  ];
  const serviceDetails: TCopyField[] = [
    {
      key: "Callback_URI",
      label: "Sign-in redirect URI",
      url: `${originURL}/auth/okta/callback/`,
      description: (
        <p>
          Paste this into the Okta application&apos;s <strong>Sign-in redirect URIs</strong>.
        </p>
      ),
    },
  ];
  const onSubmit = async (values: Values) => {
    try {
      const response = await updateInstanceConfigurations(values);
      reset({
        OKTA_OIDC_ISSUER: response.find((item) => item.key === "OKTA_OIDC_ISSUER")?.value,
        OKTA_OIDC_CLIENT_ID: response.find((item) => item.key === "OKTA_OIDC_CLIENT_ID")?.value,
        OKTA_OIDC_CLIENT_SECRET: response.find((item) => item.key === "OKTA_OIDC_CLIENT_SECRET")?.value,
        OKTA_OIDC_REQUIRE_EMAIL_VERIFIED:
          response.find((item) => item.key === "OKTA_OIDC_REQUIRE_EMAIL_VERIFIED")?.value ?? "0",
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Done!", message: "Your Okta OIDC authentication is configured." });
    } catch (error) {
      console.error(error);
    }
  };
  const handleGoBack = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (isDirty) {
      event.preventDefault();
      setIsDiscardChangesModalOpen(true);
    }
  };

  return (
    <>
      <ConfirmDiscardModal
        isOpen={isDiscardChangesModalOpen}
        onDiscardHref="/authentication"
        handleClose={() => setIsDiscardChangesModalOpen(false)}
      />
      <div className="flex flex-col gap-8">
        <div className="grid w-full grid-cols-2 gap-x-12 gap-y-8">
          <div className="col-span-2 flex flex-col gap-y-4 pt-1 md:col-span-1">
            <div className="pt-2.5 text-18 font-medium">Okta-provided details for Plane</div>
            {fields.map((field) => (
              <ControllerInput
                key={field.key}
                control={control}
                type={field.type}
                name={field.key}
                label={field.label}
                description={field.description}
                placeholder={field.placeholder}
                error={field.error}
                required={field.required}
              />
            ))}
            <div className="flex items-center justify-between gap-4 py-2">
              <div>
                <h4 className="text-sm font-medium text-primary">Require a verified email claim</h4>
                <p className="text-sm text-tertiary">Only allow sign-in when Okta includes an email_verified claim.</p>
              </div>
              <Controller
                control={control}
                name="OKTA_OIDC_REQUIRE_EMAIL_VERIFIED"
                render={({ field: { value, onChange } }) => {
                  const isEnabled = value === "1";
                  return <ToggleSwitch value={isEnabled} onChange={() => onChange(isEnabled ? "0" : "1")} size="sm" />;
                }}
              />
            </div>
            <div className="flex gap-4 pt-4">
              <Button
                variant="primary"
                size="lg"
                onClick={(event) => void handleSubmit(onSubmit)(event)}
                loading={isSubmitting}
                disabled={!isDirty}
              >
                {isSubmitting ? "Saving" : "Save changes"}
              </Button>
              <Link href="/authentication" className={getButtonStyling("secondary", "lg")} onClick={handleGoBack}>
                Go back
              </Link>
            </div>
          </div>
          <div className="col-span-2 flex flex-col gap-y-4 pt-1 md:col-span-1">
            <div className="pt-2.5 text-18 font-medium">Plane-provided details for Okta</div>
            {serviceDetails.map((detail) => (
              <CopyField key={detail.key} {...detail} />
            ))}
            <p className="text-sm text-tertiary">
              Plane trusts only verified Okta email claims and signs in users with an existing Plane account.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
