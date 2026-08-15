/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { getButtonStyling } from "@plane/propel/button";
import { cn } from "@plane/utils";
import { useInstance } from "@/hooks/store";

export const OktaOIDCConfiguration = observer(function OktaOIDCConfiguration() {
  const { formattedConfig } = useInstance();
  const configured = Boolean(
    formattedConfig?.OKTA_OIDC_ISSUER &&
    formattedConfig?.OKTA_OIDC_CLIENT_ID &&
    formattedConfig?.OKTA_OIDC_CLIENT_SECRET
  );

  return (
    <Link
      href="/authentication/okta"
      className={cn(
        getButtonStyling(configured ? "link" : "secondary", "base"),
        configured ? "font-medium" : "text-tertiary"
      )}
    >
      {!configured && <Settings2 className="h-4 w-4 p-0.5 text-tertiary" />}
      Configure
    </Link>
  );
});
