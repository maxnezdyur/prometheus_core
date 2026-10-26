// This file is part of Prometheus
// https://inl.gov/super-intelligence/prometheus/
//
// Copyright 2026 Battelle Energy Alliance, LLC
// All rights reserved, see NOTICE.txt for full restrictions
// https://github.com/idaholab/prometheus_core/blob/main/NOTICE.txt
//
// Licensed under the MIT License, please see LICENSE for details
// https://github.com/idaholab/prometheus_core/blob/main/LICENSE
//
// SPDX-License-Identifier: MIT

/**
 * The Admin tabs (E1-E3): users, signing keys, and OIDC identity providers. The times are
 * those of the design in America/Denver, the time zone that the screenshot runs pin.
 */

import type { AdminUser, OidcProvider, SigningKey } from "../../lib/api/types.ts";
import { ago } from "./time.ts";

/** A placeholder public key; the Signing Keys tab lists the kid, not the key. */
const PUBLIC_KEY_PEM = "-----BEGIN PUBLIC KEY-----\nMOCK\n-----END PUBLIC KEY-----\n";

export const adminUsers: AdminUser[] = [
  {
    id: "admin-user-1",
    username: "a.vance",
    role: "admin",
    provider: "local",
    is_active: true,
    created_at: ago({ days: 44 }),
    last_login_at: ago({ days: 19, hours: 19, minutes: 36 }),
  },
  {
    id: "admin-user-2",
    username: "j.chen",
    role: "user",
    provider: "local",
    is_active: true,
    created_at: ago({ days: 40 }),
    last_login_at: ago({ days: 20, hours: 13, minutes: 48 }),
  },
  {
    id: "admin-user-3",
    username: "m.okafor",
    role: "user",
    provider: "okta",
    external_subject: "m.okafor",
    is_active: true,
    created_at: ago({ days: 30 }),
    last_login_at: ago({ days: 22, hours: 20, minutes: 59 }),
  },
  {
    id: "admin-user-4",
    username: "s.petrov",
    role: "user",
    provider: "local",
    is_active: false,
    created_at: ago({ days: 28 }),
    last_login_at: null,
  },
];

export const signingKeys: SigningKey[] = [
  {
    id: "signing-key-1",
    kid: "9f3c1a7e-5b2d-4c88",
    public_key_pem: PUBLIC_KEY_PEM,
    is_active: true,
    created_at: ago({ days: 24, hours: 21, minutes: 30 }),
    retired_at: null,
  },
  {
    id: "signing-key-2",
    kid: "2d8b4f60-a1c3-4e7a",
    public_key_pem: PUBLIC_KEY_PEM,
    is_active: false,
    created_at: ago({ days: 20, hours: 15, minutes: 45 }),
    retired_at: null,
  },
  {
    id: "signing-key-3",
    kid: "5a1e9c22-7f04-4b19",
    public_key_pem: PUBLIC_KEY_PEM,
    is_active: false,
    created_at: ago({ days: 74, hours: 18, minutes: 58 }),
    retired_at: ago({ days: 24, hours: 21, minutes: 30 }),
  },
];

export const oidcProviders: OidcProvider[] = [
  {
    id: "oidc-provider-1",
    provider_id: "okta",
    display_name: "Okta",
    issuer_url: "https://your-org.okta.com",
    client_id: "prometheus-okta",
    scopes: "openid profile email",
    default_role: "user",
    is_enabled: true,
    created_at: ago({ days: 30 }),
    updated_at: ago({ days: 30 }),
  },
  {
    id: "oidc-provider-2",
    provider_id: "azure-ad",
    display_name: "Azure AD",
    issuer_url: "https://login.microsoftonline.com/common/v2.0",
    client_id: "prometheus-azure-ad",
    scopes: "openid profile email",
    default_role: "user",
    is_enabled: true,
    created_at: ago({ days: 30 }),
    updated_at: ago({ days: 30 }),
  },
  {
    id: "oidc-provider-3",
    provider_id: "keycloak",
    display_name: "Keycloak",
    issuer_url: "https://id.inl.gov/realms/marvel",
    client_id: "prometheus-keycloak",
    scopes: "openid profile email",
    default_role: "admin",
    is_enabled: false,
    created_at: ago({ days: 30 }),
    updated_at: ago({ days: 30 }),
  },
];
