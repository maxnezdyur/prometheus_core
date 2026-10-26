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
 * Typed fetch wrappers for the backend `/api` surface.
 *
 * Every call sends the auth cookie (`credentials: "include"`). Non-2xx responses
 * throw an {@link ApiError} carrying the status so callers can distinguish 401
 * (unauthenticated) from other failures. Mirrors `backend/app/routers/*`.
 */

import type {
  Agent,
  AgentCategory,
  ArtifactRecord,
  Checkpoint,
  ConversationActivity,
  DataSource,
  HomeSuggestion,
  Job,
  Plan,
  Role,
  SettingsOptions,
  Skill,
  StorageUsage,
  TeamMember,
  ViewerModel,
  Workflow,
  WorkflowGraph,
  WorkflowVersion,
  WorkspaceContext,
} from "./contract";
import type {
  AdminUser,
  AdminUserCreate,
  AdminUserUpdate,
  AuthProvider,
  ChatMessageRequest,
  ChatMessageResponse,
  ConfigResponse,
  ConversationDetailResponse,
  ConversationHistoryResponse,
  ConversationResumeRequest,
  ConversationSummary,
  CreateSessionRequest,
  OidcProvider,
  OidcProviderCreate,
  OidcProviderUpdate,
  SessionResponse,
  SetupStatus,
  SigningKey,
  UploadDescriptor,
  User,
} from "./types";

const API_BASE = "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    let body: unknown;
    try {
      body = await res.json();
      if (body && typeof (body as { detail?: unknown }).detail === "string") {
        detail = (body as { detail: string }).detail;
      }
    } catch {
      /* non-JSON error body — keep statusText */
    }
    throw new ApiError(res.status, detail, body);
  }
  // 204/empty bodies → undefined; callers that expect a body type won't hit this.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // --- setup (first-run wizard) ---
  /** GET /api/setup/status — unauthenticated; true until the first admin exists. */
  setupStatus(): Promise<SetupStatus> {
    return request<SetupStatus>("/setup/status");
  },

  /** POST /api/setup/bootstrap — creates the first admin account and logs it in
   * (sets the session cookie, same as login). Throws ApiError(409) if setup has
   * already been completed. */
  async bootstrap(username: string, password: string): Promise<User> {
    const body = await request<{ user: User }>("/setup/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return body.user;
  },

  // --- auth ---
  async login(username: string, password: string): Promise<User> {
    const body = await request<{ user: User }>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return body.user;
  },

  logout(): Promise<void> {
    return request<void>("/auth/logout", { method: "POST" });
  },

  /** GET /api/auth/me — resolves to the user, or throws ApiError(401) if not authed. */
  me(): Promise<User> {
    return request<User>("/auth/me");
  },

  /** GET /api/auth/providers — public; enabled OIDC providers for <Login> to render. */
  listAuthProviders(): Promise<AuthProvider[]> {
    return request<AuthProvider[]>("/auth/providers");
  },

  /** URL for GET /api/auth/login/{provider_id} -- a full-page navigation
   * (`window.location.href = ...`), never a fetch: it's a server redirect to
   * the identity provider, not a JSON response. */
  loginUrl(providerId: string): string {
    return `${API_BASE}/auth/login/${encodeURIComponent(providerId)}`;
  },

  // --- config / session ---
  getConfig(): Promise<ConfigResponse> {
    return request<ConfigResponse>("/config");
  },

  createSession(profile?: string, bindSeq?: number): Promise<SessionResponse> {
    const body: CreateSessionRequest = { bind_seq: bindSeq };
    if (profile) body.profile = profile;
    return request<SessionResponse>("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  // --- chat turn ---
  sendMessage(body: ChatMessageRequest): Promise<ChatMessageResponse> {
    return request<ChatMessageResponse>("/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  // --- uploads ---
  uploadFile(file: File): Promise<UploadDescriptor> {
    const form = new FormData();
    form.append("file", file, file.name);
    return request<UploadDescriptor>("/uploads", { method: "POST", body: form });
  },

  // --- history ---
  getRecentConversations(limit = 20): Promise<ConversationHistoryResponse> {
    return request<ConversationHistoryResponse>(`/conversations/recent?limit=${limit}`);
  },

  /** Rebind the session to a past conversation; the next chat turn continues it. */
  resumeConversation(conversationId: string, bindSeq?: number): Promise<ConversationDetailResponse> {
    const body: ConversationResumeRequest = { bind_seq: bindSeq };
    return request<ConversationDetailResponse>(
      `/conversations/${encodeURIComponent(conversationId)}/resume`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  },

  renameConversation(conversationId: string, title: string): Promise<ConversationSummary> {
    return request<ConversationSummary>(`/conversations/${encodeURIComponent(conversationId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  },

  /** Soft delete: the conversation drops out of `getRecentConversations`. */
  deleteConversation(conversationId: string): Promise<void> {
    return request<void>(`/conversations/${encodeURIComponent(conversationId)}`, {
      method: "DELETE",
    });
  },

  /** URL for an artifact's bytes; used directly as an <img>/<embed> src or fetch target. */
  artifactContentUrl(artifactId: string): string {
    return `${API_BASE}/artifacts/${encodeURIComponent(artifactId)}/content`;
  },

  // --- admin: users (require_admin server-side; 403 for non-admins) ---
  listAdminUsers(): Promise<AdminUser[]> {
    return request<AdminUser[]>("/admin/users");
  },

  createAdminUser(input: AdminUserCreate): Promise<AdminUser> {
    return request<AdminUser>("/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  },

  updateAdminUser(userId: string, patch: AdminUserUpdate): Promise<AdminUser> {
    return request<AdminUser>(`/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  },

  deleteAdminUser(userId: string): Promise<void> {
    return request<void>(`/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  },

  // --- admin: signing keys (require_admin server-side; 403 for non-admins) ---
  listSigningKeys(): Promise<SigningKey[]> {
    return request<SigningKey[]>("/admin/signing-keys");
  },

  generateSigningKey(): Promise<SigningKey> {
    return request<SigningKey>("/admin/signing-keys", { method: "POST" });
  },

  activateSigningKey(keyId: string): Promise<SigningKey> {
    return request<SigningKey>(`/admin/signing-keys/${encodeURIComponent(keyId)}/activate`, { method: "POST" });
  },

  retireSigningKey(keyId: string): Promise<SigningKey> {
    return request<SigningKey>(`/admin/signing-keys/${encodeURIComponent(keyId)}/retire`, { method: "POST" });
  },

  // --- admin: OIDC identity providers (require_admin server-side; 403 for non-admins) ---
  listOidcProviders(): Promise<OidcProvider[]> {
    return request<OidcProvider[]>("/admin/oidc-providers");
  },

  createOidcProvider(input: OidcProviderCreate): Promise<OidcProvider> {
    return request<OidcProvider>("/admin/oidc-providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  },

  updateOidcProvider(id: string, patch: OidcProviderUpdate): Promise<OidcProvider> {
    return request<OidcProvider>(`/admin/oidc-providers/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  },

  deleteOidcProvider(id: string): Promise<void> {
    return request<void>(`/admin/oidc-providers/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  /** GET /api/conversations/{id} */
  getConversation(conversationId: string): Promise<ConversationDetailResponse> {
    return request<ConversationDetailResponse>(`/conversations/${encodeURIComponent(conversationId)}`);
  },

  // --- proposed contract (PPLT-244; served by src/mocks until a backend route exists) ---
  /** GET /api/workspace */
  getWorkspace(): Promise<WorkspaceContext> {
    return request<WorkspaceContext>("/workspace");
  },

  /** GET /api/home/suggestions */
  listHomeSuggestions(): Promise<HomeSuggestion[]> {
    return request<HomeSuggestion[]>("/home/suggestions");
  },

  /** GET /api/conversations/{id}/activity */
  getConversationActivity(conversationId: string): Promise<ConversationActivity> {
    return request<ConversationActivity>(`/conversations/${encodeURIComponent(conversationId)}/activity`);
  },

  /** GET /api/jobs */
  listJobs(): Promise<Job[]> {
    return request<Job[]>("/jobs");
  },

  /** GET /api/artifacts */
  listArtifacts(): Promise<ArtifactRecord[]> {
    return request<ArtifactRecord[]>("/artifacts");
  },

  /** GET /api/artifacts/{id}/model */
  getViewerModel(artifactId: string): Promise<ViewerModel> {
    return request<ViewerModel>(`/artifacts/${encodeURIComponent(artifactId)}/model`);
  },

  /** GET /api/agents */
  listAgents(): Promise<Agent[]> {
    return request<Agent[]>("/agents");
  },

  /** GET /api/agents/{id} */
  getAgent(agentId: string): Promise<Agent> {
    return request<Agent>(`/agents/${encodeURIComponent(agentId)}`);
  },

  /** GET /api/agent-categories */
  listAgentCategories(): Promise<AgentCategory[]> {
    return request<AgentCategory[]>("/agent-categories");
  },

  /** GET /api/skills */
  listSkills(): Promise<Skill[]> {
    return request<Skill[]>("/skills");
  },

  /** GET /api/workflows */
  listWorkflows(): Promise<Workflow[]> {
    return request<Workflow[]>("/workflows");
  },

  /** GET /api/workflows/{id} */
  getWorkflow(workflowId: string): Promise<Workflow> {
    return request<Workflow>(`/workflows/${encodeURIComponent(workflowId)}`);
  },

  /** GET /api/workflows/{id}/versions */
  listWorkflowVersions(workflowId: string): Promise<WorkflowVersion[]> {
    return request<WorkflowVersion[]>(`/workflows/${encodeURIComponent(workflowId)}/versions`);
  },

  /** GET /api/graphs/{id} */
  getGraph(graphId: string): Promise<WorkflowGraph> {
    return request<WorkflowGraph>(`/graphs/${encodeURIComponent(graphId)}`);
  },

  /** GET /api/plans/{id} */
  getPlan(planId: string): Promise<Plan> {
    return request<Plan>(`/plans/${encodeURIComponent(planId)}`);
  },

  /** GET /api/checkpoints */
  listCheckpoints(): Promise<Checkpoint[]> {
    return request<Checkpoint[]>("/checkpoints");
  },

  /** GET /api/checkpoints/{id} */
  getCheckpoint(checkpointId: string): Promise<Checkpoint> {
    return request<Checkpoint>(`/checkpoints/${encodeURIComponent(checkpointId)}`);
  },

  /** GET /api/data-sources */
  listDataSources(): Promise<DataSource[]> {
    return request<DataSource[]>("/data-sources");
  },

  /** GET /api/storage */
  getStorage(): Promise<StorageUsage> {
    return request<StorageUsage>("/storage");
  },

  /** GET /api/members */
  listMembers(): Promise<TeamMember[]> {
    return request<TeamMember[]>("/members");
  },

  /** GET /api/roles */
  listRoles(): Promise<Role[]> {
    return request<Role[]>("/roles");
  },

  /** GET /api/settings/options */
  getSettingsOptions(): Promise<SettingsOptions> {
    return request<SettingsOptions>("/settings/options");
  },
};
