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
 * Proposed wire contract for the `/api` paths that no backend route serves yet (PPLT-244).
 *
 * Only the mock layer (`src/mocks`) serves these types. When a backend epic serves a path, its
 * type moves to `types.ts` and mirrors `backend/app/contract.py`. The wire is snake_case, every
 * enum value is lowercase, and numbers are raw; the UI formats them.
 */

import type { ArtifactMeta } from "./types.ts";

/** GET /api/workspace */
export interface WorkspaceContext {
  org: string;
  project_id: string;
  project_name: string;
  project_label: string;
  user_title: string;
}

/** GET /api/home/suggestions */
export interface HomeSuggestion {
  suggestion_id: string;
  title: string;
  icon: string;
}

/** One tool trace line of a conversation; part of `ConversationActivity`. */
export interface ToolTrace {
  trace_id: string;
  after_message_index: number;
  agent_id: string;
  agent_label: string;
  lines: { text: string; tone: "info" | "success" | "error" }[];
}

/** GET /api/conversations/{id}/activity */
export interface ConversationActivity {
  conversation_id: string;
  tool_traces: ToolTrace[];
  suggested_replies: string[];
}

/** GET /api/jobs */
export interface Job {
  job_id: string;
  title: string;
  status: "queueing" | "solving" | "finished" | "failed";
  percent_complete: number;
  eta_seconds: number | null;
  agent_id: string;
  agent_version: string;
  conversation_id: string | null;
}

/** GET /api/artifacts */
export interface ArtifactRecord extends ArtifactMeta {
  kind: "report" | "mesh" | "result";
  /** Platform Data Glossary & Storage Strategy:455; Minimum Viable Product Definition:150 */
  cde_status: "wip" | "shared" | "published" | "archived";
  format: string;
  size_bytes: number;
  run_id: string | null;
  job_id: string | null;
}

/** GET /api/artifacts/{id}/model */
export interface ViewerModel {
  artifact_id: string;
  file_name: string;
  versions: string[];
  element_groups: { group: string; elements: string[] }[];
}

/** GET /api/agents and GET /api/agents/{id} */
export interface Agent {
  agent_id: string;
  name: string;
  description: string;
  version: string;
  category_id: string;
  icon: string;
  /** Platform Data Glossary & Storage Strategy:357 */
  status: "healthy" | "degraded" | "offline" | "escalating";
  avg_run_seconds: number;
  success_percent: number;
  latency_ms: number;
}

/** GET /api/agent-categories */
export interface AgentCategory {
  category_id: string;
  label: string;
}

/** One typed input or output of a `Skill`. */
export interface Port {
  name: string;
  type: string;
}

/** GET /api/skills */
export interface Skill {
  skill_id: string;
  name: string;
  version: string;
  category: "data" | "analysis" | "synthesis" | "control";
  agent_id: string | null;
  inputs: Port[];
  outputs: Port[];
}

/** GET /api/workflows and GET /api/workflows/{id} */
export interface Workflow {
  workflow_id: string;
  name: string;
  version: string;
  complexity: "complex" | "moderate" | "simple";
  estimated_runtime_seconds: number;
  speedup: number;
  graph_id: string;
}

/** GET /api/workflows/{id}/versions */
export interface WorkflowVersion {
  version: string;
  summary: string;
  author: string;
  created_at: string;
  derived_from: string | null;
  changes: { op: "add" | "change" | "remove"; text: string }[];
  invalidated_runs: { skill_id: string; count: number }[];
  runs_by_project: { project_name: string; runs: number }[];
  last_run_at: string | null;
  last_run_conversation_id: string | null;
}

/** One node of a `WorkflowGraph`. */
export interface GraphNode {
  node_id: string;
  kind: "skill" | "checkpoint" | "qa_gate";
  skill_id: string | null;
  label: string;
  status: "done" | "running" | "queued" | "blocked" | null;
  estimated_seconds: number | null;
  inputs: { port: string; source: string | null; optional: boolean }[];
  output_context: string | null;
  added_in_draft: boolean;
}

/** One port-to-port edge of a `WorkflowGraph`. */
export interface GraphEdge {
  edge_id: string;
  from_node: string;
  from_port: string;
  to_node: string;
  to_port: string;
}

/** GET /api/graphs/{id} */
export interface WorkflowGraph {
  graph_id: string;
  workflow_id: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** GET /api/plans/{id} */
export interface Plan {
  plan_id: string;
  workflow_id: string;
  workflow_version: string;
  conversation_id: string;
  graph_id: string;
  orchestrator_status: string;
  mode: "dag";
  input_files: string[];
  expected_outputs: string[];
}

/** One quality metric of a `Checkpoint`. */
export interface CheckMetric {
  name: string;
  value_label: string;
  result: "pass" | "warn" | "fail";
  threshold_label: string;
}

/** GET /api/checkpoints and GET /api/checkpoints/{id} */
export interface Checkpoint {
  checkpoint_id: string;
  /** Platform Data Glossary & Storage Strategy:315 */
  checkpoint_kind: "plan" | "step" | "final";
  /** The Role authorized to clear this checkpoint; Platform Data Glossary & Storage Strategy:318 */
  required_role_id: string;
  title: string;
  priority: "urgent" | "standard";
  status: "pending" | "approved" | "revision_requested" | "rejected";
  workflow_ref: string;
  plan_id: string | null;
  created_at: string;
  decided_at: string | null;
  confidence_percent: number;
  producing_agent_id: string;
  producing_agent_version: string;
  artifact_id: string | null;
  metrics: CheckMetric[];
  requirement: { requirement_id: string; version: string; text: string } | null;
}

/** GET /api/data-sources */
export interface DataSource {
  source_id: string;
  /** Platform Data Glossary & Storage Strategy:535 */
  type: "deeplynx" | "s3_bucket" | "file_system" | "postgresql" | "rest_api" | "web_crawl";
  /** One egress source per Project, and it must be DeepLynx; Platform Data Glossary & Storage Strategy:536 */
  role: "read" | "egress";
  name: string;
  status: "connected" | "syncing" | "disconnected";
  enabled: boolean;
  last_sync_at: string | null;
  volume_bytes: number;
}

/** GET /api/storage */
export interface StorageUsage {
  used_bytes: number;
  capacity_bytes: number;
}

/** GET /api/members */
export interface TeamMember {
  member_id: string;
  name: string;
  email: string;
  role_id: string;
  department: string;
  /** Draft Platform Database Schema:141 */
  status: "invited" | "active" | "disabled" | "archived";
  last_active_at: string | null;
}

/** One atomic action a `Role` grants; Draft Platform Database Schema:250-256 */
export interface RolePermission {
  permission_key: string;
  resource_type:
    | "platform"
    | "organization"
    | "workspace"
    | "project"
    | "deployment"
    | "registry_entry"
    | "external_service"
    | "llm_provider"
    | "artifact";
  action: string;
}

/** GET /api/roles */
export interface Role {
  role_id: string;
  name: string;
  /** The display lines of the role's permissions. */
  summary: string[];
  /** Draft Platform Database Schema:250-256 */
  permissions: RolePermission[];
}

/** GET /api/settings/options */
export interface SettingsOptions {
  models: string[];
  approval_types: string[];
  chat_types: string[];
}

/** The 502 body of every proposed resource in its error state; `ApiError.body` carries it. */
export interface GatewayErrorBody {
  detail: string;
  code: string;
  target_node: string;
  ping_status: string;
  last_sync_at: string;
}
