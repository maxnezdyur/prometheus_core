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
 * The MSW request handlers of the UI preview: one per mocked `/api` path, then a 501
 * catch-all, so mock mode never reaches a backend. Each read applies the
 * state that `state.ts` selects for its resource; writes answer validly and change nothing.
 * The `/api/events` stream is built in `browser.ts` only, because `sse()` throws in Node.
 * Paths start with `*` so they match in the browser and under `msw/node`.
 */

import { delay, http, HttpResponse, type JsonBodyType } from "msw";
import type { GatewayErrorBody } from "../lib/api/contract.ts";
import type {
  AdminUser,
  AdminUserCreate,
  AdminUserUpdate,
  ChatMessageResponse,
  ConversationDetailResponse,
  ConversationSummary,
  CreateSessionRequest,
  OidcProvider,
  OidcProviderCreate,
  OidcProviderUpdate,
  SessionResponse,
  SigningKey,
  UploadDescriptor,
} from "../lib/api/types.ts";
import { dataset, MOCK_NOW } from "./fixtures/index.ts";
import { stateFor, type Selection } from "./state.ts";

/** The 502 body of every resource in its `error` state. */
const GATEWAY_ERROR: GatewayErrorBody = {
  detail: "ERR_GATEWAY_TIMEOUT",
  code: "ERR_GATEWAY_TIMEOUT",
  target_node: "hpc-ingress-04.inl.gov",
  ping_status: "UNREACHABLE (504)",
  last_sync_at: new Date(Date.parse(MOCK_NOW) - 2 * 60 * 1000).toISOString(),
};

const MOCK_REPLY = "Mock mode: no agent is connected.";

/** The conversation id of every new session; the chat store resumes it on reload. */
export const MOCK_SESSION_ID = "conv-mock-session";

function notFound(): Response {
  return HttpResponse.json({ detail: "Not found" }, { status: 404 });
}

/** One record by id, or undefined for an unknown id (the handler answers 404). */
function byId<T, K extends keyof T>(items: T[], key: K, id: string): T | undefined {
  return items.find((item) => item[key] === id);
}

/** `hold` is what the `loading` state awaits; tests pass a hold they control. */
export function handlers(selection: Selection, hold: () => Promise<unknown> = () => delay("infinite")) {
  /** `resource`'s state applied to a response; `emptyBody` is its `empty` form. */
  async function answer(resource: string, body: JsonBodyType, emptyBody: JsonBodyType): Promise<Response> {
    switch (stateFor(selection, resource)) {
      case "empty":
        return HttpResponse.json(emptyBody);
      case "loading":
        await hold();
        return HttpResponse.json(body);
      case "error":
        return HttpResponse.json(GATEWAY_ERROR, { status: 502 });
      default:
        return HttpResponse.json(body);
    }
  }

  /** A list resource: the fixture, or `[]` when empty. */
  function list<T extends JsonBodyType>(resource: string, data: T[]): Promise<Response> {
    return answer(resource, data, []);
  }

  /** A single-record resource: 404 for an unknown id in every state, else the fixture or `emptied(data)`. */
  async function record<T extends JsonBodyType>(resource: string, data: T | undefined, emptied: (data: T) => T = (d) => d): Promise<Response> {
    if (data === undefined) return notFound();
    return answer(resource, data, emptied(data));
  }

  return [
    // --- boot ---
    http.get("*/api/setup/status", () => HttpResponse.json({ needs_setup: false })),

    // --- session ---
    http.post("*/api/auth/login", () => HttpResponse.json({ user: dataset.user })),
    http.post("*/api/auth/logout", () => HttpResponse.json({ ok: true })),
    http.get("*/api/auth/me", () => {
      if (stateFor(selection, "session") === "signed-out") {
        return HttpResponse.json({ detail: "Not authenticated" }, { status: 401 });
      }
      return record("session", dataset.user);
    }),
    http.get("*/api/auth/providers", () => list("session", dataset.authProviders)),

    // --- boot: config and session ---
    http.get("*/api/config", () => HttpResponse.json(dataset.config)),
    http.post("*/api/sessions", async ({ request }) => {
      const body = (await request.json()) as CreateSessionRequest;
      const session: SessionResponse = {
        conversation_id: MOCK_SESSION_ID,
        profile: body.profile ?? dataset.config.profiles[0].name,
        chat_intro: dataset.config.chat_intro,
        chat_suggestion_title: dataset.config.chat_suggestion_title,
        workflow_suggestions: dataset.config.workflow_suggestions,
        auto_approve_steps: dataset.config.auto_approve_steps,
      };
      return HttpResponse.json(session);
    }),

    // --- writes: chat turn and uploads ---
    http.post("*/api/chat/messages", () => {
      const reply: ChatMessageResponse = { turn_id: "turn-mock", status: "answer", response_text: MOCK_REPLY };
      return HttpResponse.json(reply);
    }),
    http.post("*/api/uploads", async ({ request }) => {
      const file = (await request.formData()).get("file");
      const upload: UploadDescriptor = {
        upload_id: "upload-mock",
        name: file instanceof File ? file.name : "upload",
        mime_type: file instanceof File ? file.type || "application/octet-stream" : "application/octet-stream",
        size_bytes: file instanceof File ? file.size : 0,
      };
      return HttpResponse.json(upload);
    }),

    // --- conversations ---
    http.get("*/api/conversations/recent", () =>
      answer(
        "conversations",
        { available: true, conversations: dataset.conversations },
        { available: true, conversations: [] },
      ),
    ),

    // --- conversation ---
    http.get<{ id: string }>("*/api/conversations/:id", ({ params }) =>
      record("conversation", byId(dataset.conversationDetails, "conversation_id", params.id)),
    ),
    http.post<{ id: string }>("*/api/conversations/:id/resume", ({ params }) => {
      if (params.id === MOCK_SESSION_ID) {
        const session: ConversationDetailResponse = {
          conversation_id: MOCK_SESSION_ID,
          title: "",
          profile: dataset.config.profiles[0].name,
          auto_approve_steps: dataset.config.auto_approve_steps,
          messages: [],
          artifacts: [],
        };
        return HttpResponse.json(session);
      }
      const detail = byId(dataset.conversationDetails, "conversation_id", params.id);
      return detail ? HttpResponse.json(detail) : notFound();
    }),
    http.patch<{ id: string }>("*/api/conversations/:id", async ({ params, request }) => {
      const summary = byId(dataset.conversations, "conversation_id", params.id);
      if (!summary) return notFound();
      const { title } = (await request.json()) as { title: string };
      const renamed: ConversationSummary = { ...summary, title };
      return HttpResponse.json(renamed);
    }),
    http.delete<{ id: string }>("*/api/conversations/:id", ({ params }) =>
      byId(dataset.conversations, "conversation_id", params.id) ? new HttpResponse(null, { status: 204 }) : notFound(),
    ),

    // --- admin: users ---
    http.get("*/api/admin/users", () => list("admin-users", dataset.adminUsers)),
    http.post("*/api/admin/users", async ({ request }) => {
      const input = (await request.json()) as AdminUserCreate;
      const created: AdminUser = {
        id: "admin-user-mock",
        username: input.username,
        role: input.role,
        provider: "local",
        is_active: true,
        created_at: MOCK_NOW,
        last_login_at: null,
      };
      return HttpResponse.json(created);
    }),
    http.patch<{ id: string }>("*/api/admin/users/:id", async ({ params, request }) => {
      const existing = byId(dataset.adminUsers, "id", params.id);
      if (!existing) return notFound();
      const patch = (await request.json()) as AdminUserUpdate;
      const updated: AdminUser = {
        ...existing,
        role: patch.role ?? existing.role,
        is_active: patch.is_active ?? existing.is_active,
        display_name: patch.display_name ?? existing.display_name,
        email: patch.email ?? existing.email,
      };
      return HttpResponse.json(updated);
    }),
    http.delete<{ id: string }>("*/api/admin/users/:id", ({ params }) =>
      byId(dataset.adminUsers, "id", params.id) ? new HttpResponse(null, { status: 204 }) : notFound(),
    ),

    // --- admin: signing keys ---
    http.get("*/api/admin/signing-keys", () => list("signing-keys", dataset.signingKeys)),
    http.post("*/api/admin/signing-keys", () => {
      const generated: SigningKey = {
        ...dataset.signingKeys[0],
        id: "signing-key-mock",
        kid: "mock-0000-0000-0000",
        is_active: false,
        created_at: MOCK_NOW,
        retired_at: null,
      };
      return HttpResponse.json(generated);
    }),
    http.post<{ id: string }>("*/api/admin/signing-keys/:id/activate", ({ params }) => {
      const key = byId(dataset.signingKeys, "id", params.id);
      return key ? HttpResponse.json({ ...key, is_active: true, retired_at: null }) : notFound();
    }),
    http.post<{ id: string }>("*/api/admin/signing-keys/:id/retire", ({ params }) => {
      const key = byId(dataset.signingKeys, "id", params.id);
      return key ? HttpResponse.json({ ...key, is_active: false, retired_at: MOCK_NOW }) : notFound();
    }),

    // --- admin: OIDC identity providers ---
    http.get("*/api/admin/oidc-providers", () => list("oidc-providers", dataset.oidcProviders)),
    http.post("*/api/admin/oidc-providers", async ({ request }) => {
      const input = (await request.json()) as OidcProviderCreate;
      const created: OidcProvider = {
        id: "oidc-provider-mock",
        provider_id: input.provider_id,
        display_name: input.display_name,
        issuer_url: input.issuer_url,
        client_id: input.client_id,
        scopes: input.scopes,
        default_role: input.default_role,
        is_enabled: input.is_enabled,
        created_at: MOCK_NOW,
        updated_at: MOCK_NOW,
      };
      return HttpResponse.json(created);
    }),
    http.patch<{ id: string }>("*/api/admin/oidc-providers/:id", async ({ params, request }) => {
      const existing = byId(dataset.oidcProviders, "id", params.id);
      if (!existing) return notFound();
      const patch = (await request.json()) as OidcProviderUpdate;
      const updated: OidcProvider = {
        ...existing,
        display_name: patch.display_name ?? existing.display_name,
        issuer_url: patch.issuer_url ?? existing.issuer_url,
        client_id: patch.client_id ?? existing.client_id,
        scopes: patch.scopes ?? existing.scopes,
        default_role: patch.default_role ?? existing.default_role,
        is_enabled: patch.is_enabled ?? existing.is_enabled,
        updated_at: MOCK_NOW,
      };
      return HttpResponse.json(updated);
    }),
    http.delete<{ id: string }>("*/api/admin/oidc-providers/:id", ({ params }) =>
      byId(dataset.oidcProviders, "id", params.id) ? new HttpResponse(null, { status: 204 }) : notFound(),
    ),

    // --- proposed contract ---
    http.get("*/api/workspace", () => record("workspace", dataset.workspace)),
    http.get("*/api/home/suggestions", () => list("suggestions", dataset.homeSuggestions)),
    http.get<{ id: string }>("*/api/conversations/:id/activity", ({ params }) =>
      record("activity", byId(dataset.activities, "conversation_id", params.id), (a) => ({ ...a, tool_traces: [] })),
    ),
    http.get("*/api/jobs", () => list("jobs", dataset.jobs)),
    http.get("*/api/artifacts", () => list("artifacts", dataset.artifacts)),
    http.get<{ id: string }>("*/api/artifacts/:id/model", ({ params }) =>
      record("viewer-model", byId(dataset.viewerModels, "artifact_id", params.id)),
    ),
    http.get("*/api/agents", () => list("agents", dataset.agents)),
    http.get<{ id: string }>("*/api/agents/:id", ({ params }) =>
      record("agents", byId(dataset.agents, "agent_id", params.id)),
    ),
    http.get("*/api/agent-categories", () => list("agent-categories", dataset.agentCategories)),
    http.get("*/api/skills", () => list("skills", dataset.skills)),
    http.get("*/api/workflows", () => list("workflows", dataset.workflows)),
    http.get<{ id: string }>("*/api/workflows/:id", ({ params }) =>
      record("workflows", byId(dataset.workflows, "workflow_id", params.id)),
    ),
    http.get<{ id: string }>("*/api/workflows/:id/versions", ({ params }) => {
      const versions = dataset.workflowVersions[params.id];
      return versions ? list("workflow-versions", versions) : notFound();
    }),
    http.get<{ id: string }>("*/api/graphs/:id", ({ params }) =>
      record("graph", byId(dataset.graphs, "graph_id", params.id), (g) => ({ ...g, nodes: [], edges: [] })),
    ),
    http.get<{ id: string }>("*/api/plans/:id", ({ params }) =>
      record("plan", byId(dataset.plans, "plan_id", params.id)),
    ),
    http.get("*/api/checkpoints", () => list("checkpoints", dataset.checkpoints)),
    http.get<{ id: string }>("*/api/checkpoints/:id", ({ params }) =>
      record("checkpoints", byId(dataset.checkpoints, "checkpoint_id", params.id)),
    ),
    http.get("*/api/data-sources", () => list("data-sources", dataset.dataSources)),
    http.get("*/api/storage", () => record("storage", dataset.storage, (s) => ({ ...s, used_bytes: 0 }))),
    http.get("*/api/members", () => list("members", dataset.members)),
    http.get("*/api/roles", () => list("roles", dataset.roles)),
    http.get("*/api/settings/options", () => record("settings-options", dataset.settingsOptions)),

    // --- any other /api path ---
    http.all("*/api/*", ({ request }) =>
      HttpResponse.json(
        { detail: `Not mocked: ${request.method} ${new URL(request.url).pathname}` },
        { status: 501 },
      ),
    ),
  ];
}
