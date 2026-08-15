/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { ShieldCheck } from "lucide-react";
import { setPromiseToast } from "@plane/propel/toast";
import { Loader, ToggleSwitch } from "@plane/ui";
import { AuthenticationMethodCard } from "@/components/authentication/authentication-method-card";
import { PageWrapper } from "@/components/common/page-wrapper";
import { useInstance } from "@/hooks/store";
import type { Route } from "./+types/page";
import { InstanceOktaOIDCConfigForm } from "./form";

const InstanceOktaOIDCAuthenticationPage = observer(function InstanceOktaOIDCAuthenticationPage(
  _props: Route.ComponentProps
) {
  const { fetchInstanceConfigurations, formattedConfig, updateInstanceConfigurations } = useInstance();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enabledConfig = formattedConfig?.IS_OKTA_OIDC_ENABLED ?? "";
  const isEnabled = enabledConfig === "1";
  useSWR("INSTANCE_CONFIGURATIONS", () => fetchInstanceConfigurations());
  const updateConfig = async (value: string) => {
    setIsSubmitting(true);
    const promise = updateInstanceConfigurations({ IS_OKTA_OIDC_ENABLED: value });
    setPromiseToast(promise, {
      loading: "Saving configuration",
      success: {
        title: "Configuration saved",
        message: () => `Okta OIDC authentication is now ${value === "1" ? "active" : "disabled"}.`,
      },
      error: { title: "Error", message: () => "Failed to save configuration" },
    });
    try {
      await promise;
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <PageWrapper
      customHeader={
        <AuthenticationMethodCard
          name="Okta OIDC"
          description="Allow existing Plane members to sign in with Okta via OpenID Connect."
          icon={<ShieldCheck className="h-6 w-6 p-0.5 text-tertiary" />}
          config={
            <ToggleSwitch
              value={isEnabled}
              onChange={() => void updateConfig(isEnabled ? "0" : "1")}
              size="sm"
              disabled={isSubmitting || !formattedConfig}
            />
          }
          disabled={isSubmitting || !formattedConfig}
          withBorder={false}
        />
      }
    >
      {formattedConfig ? (
        <InstanceOktaOIDCConfigForm config={formattedConfig} />
      ) : (
        <Loader className="space-y-8">
          <Loader.Item height="50px" width="25%" />
          <Loader.Item height="50px" />
          <Loader.Item height="50px" />
          <Loader.Item height="50px" />
        </Loader>
      )}
    </PageWrapper>
  );
});

export const meta: Route.MetaFunction = () => [{ title: "Okta OIDC Authentication - Plane" }];
export default InstanceOktaOIDCAuthenticationPage;
