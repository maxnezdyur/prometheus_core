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
 * The project data: the data sources and the artifact storage (F2), and the team members
 * and their roles (F3). The ids are those of the Data Management and the Project
 * Management stores. The member count per role is computed, not stored.
 */

import type { DataSource, Role, StorageUsage, TeamMember } from "../../lib/api/contract.ts";
import { ago } from "./time.ts";

export const dataSources: DataSource[] = [
  {
    source_id: "mcnp-input-decks",
    type: "s3_bucket",
    role: "read",
    name: "MCNP Input Deck Repository",
    status: "connected",
    enabled: true,
    last_sync_at: ago({ minutes: 10 }),
    volume_bytes: 2.4e12,
  },
  {
    source_id: "cad-model-vault",
    type: "file_system",
    role: "read",
    name: "CAD Model Vault (NX/STEP)",
    status: "connected",
    enabled: true,
    last_sync_at: ago({ hours: 2 }),
    volume_bytes: 890e9,
  },
  {
    source_id: "relap5-results",
    type: "postgresql",
    role: "read",
    name: "RELAP5 Results Database",
    status: "syncing",
    enabled: true,
    last_sync_at: null,
    volume_bytes: 1.2e12,
  },
  {
    source_id: "materials-properties",
    type: "rest_api",
    role: "read",
    name: "Materials Properties DB",
    status: "connected",
    enabled: true,
    last_sync_at: ago({ days: 1 }),
    volume_bytes: 320e9,
  },
  {
    source_id: "reactor-operating-logs",
    type: "s3_bucket",
    role: "read",
    name: "Reactor Operating Logs",
    status: "disconnected",
    enabled: false,
    last_sync_at: ago({ days: 3 }),
    volume_bytes: 4.1e12,
  },
  {
    source_id: "nrc-regulatory-library",
    type: "web_crawl",
    role: "read",
    name: "NRC Regulatory Library",
    status: "connected",
    enabled: true,
    last_sync_at: ago({ hours: 5 }),
    volume_bytes: 150e9,
  },
  {
    source_id: "marvel-deeplynx-egress",
    type: "deeplynx",
    role: "egress",
    name: "MARVEL DeepLynx Project Space",
    status: "connected",
    enabled: true,
    last_sync_at: ago({ minutes: 30 }),
    volume_bytes: 640e9,
  },
];

/** 1.8 TB of 5.0 TB: 36 % used. */
export const storage: StorageUsage = { used_bytes: 1.8e12, capacity_bytes: 5.0e12 };

/** "Just now" is under one minute ago. */
const JUST_NOW = ago({ minutes: 0.5 });

export const members: TeamMember[] = [
  {
    member_id: "member-1",
    name: "Dr. Elizabeth Halsey",
    email: "e.halsey@prometheus.gov",
    role_id: "platform-admin",
    department: "Reactor Design",
    status: "active",
    last_active_at: JUST_NOW,
  },
  {
    member_id: "member-2",
    name: "Viktor Kerimov",
    email: "v.kerimov@prometheus.gov",
    role_id: "design-engineer",
    department: "Safety Analysis",
    status: "active",
    last_active_at: ago({ minutes: 12 }),
  },
  {
    member_id: "member-3",
    name: "Sarah Chen",
    email: "s.chen@prometheus.gov",
    role_id: "sme-reviewer",
    department: "Neutronics",
    status: "active",
    last_active_at: ago({ hours: 2 }),
  },
  {
    member_id: "member-4",
    name: "Dr. Marcus Vance",
    email: "m.vance@prometheus.gov",
    role_id: "platform-admin",
    department: "Thermal-Hydraulics",
    status: "active",
    last_active_at: JUST_NOW,
  },
  {
    member_id: "member-5",
    name: "Elena Rostova",
    email: "e.rostova@prometheus.gov",
    role_id: "agent-developer",
    department: "Reactor Design",
    status: "invited",
    last_active_at: null,
  },
  {
    member_id: "member-6",
    name: "Aris Thorne",
    email: "a.thorne@prometheus.gov",
    role_id: "licensing-analyst",
    department: "Safety Analysis",
    status: "disabled",
    last_active_at: ago({ days: 3 }),
  },
];

export const roles: Role[] = [
  {
    role_id: "platform-admin",
    name: "Platform Admin",
    summary: [
      "Manage agents, data access, classification",
      "Agent card review and approval",
      "Template-level checkpoint authoring",
      "Org-wide activity visibility, raw telemetry",
    ],
    permissions: [
      { permission_key: "registry.publish", resource_type: "registry_entry", action: "publish" },
      { permission_key: "project.manage_members", resource_type: "project", action: "manage_members" },
      { permission_key: "platform.read_telemetry", resource_type: "platform", action: "read_telemetry" },
      { permission_key: "organization.manage_data_access", resource_type: "organization", action: "manage_data_access" },
    ],
  },
  {
    role_id: "design-engineer",
    name: "Design Engineer",
    summary: [
      "Run agentic workflows (free-form & templated)",
      "Direct agent invocation from registry",
      "Insert ad-hoc checkpoints in own tasks",
      "Artifact search and review (project-scoped)",
    ],
    permissions: [
      { permission_key: "deployment.invoke", resource_type: "deployment", action: "invoke" },
      { permission_key: "project.run_workflows", resource_type: "project", action: "run_workflows" },
      { permission_key: "project.create_checkpoints", resource_type: "project", action: "create_checkpoints" },
      { permission_key: "artifact.read", resource_type: "artifact", action: "read" },
    ],
  },
  {
    role_id: "sme-reviewer",
    name: "SME Reviewer",
    summary: [
      "Approve/reject agent outputs at checkpoints",
      "Review inputs, confidence, & requirements",
      "Artifact review with full provenance",
      "Evidence package assembly support",
    ],
    permissions: [
      { permission_key: "artifact.approve", resource_type: "artifact", action: "approve" },
      { permission_key: "project.read_records", resource_type: "project", action: "read_records" },
      { permission_key: "artifact.read_provenance", resource_type: "artifact", action: "read_provenance" },
    ],
  },
  {
    role_id: "licensing-analyst",
    name: "Licensing Analyst",
    summary: [
      "Search artifacts by safety claim or requirement",
      "View full provenance and approval chain",
      "Workflow visualization (read-only)",
      "Regulatory submission assembly from traced evidence",
    ],
    permissions: [
      { permission_key: "artifact.read", resource_type: "artifact", action: "read" },
      { permission_key: "artifact.read_provenance", resource_type: "artifact", action: "read_provenance" },
      { permission_key: "project.read_records", resource_type: "project", action: "read_records" },
      { permission_key: "project.assemble_submission", resource_type: "project", action: "assemble_submission" },
    ],
  },
  {
    role_id: "program-manager",
    name: "Program Manager",
    summary: [
      "Program-level status, cost and risk tracking",
      "Aggregate agent telemetry",
      "Cross-user activity visibility",
    ],
    permissions: [
      { permission_key: "project.read_status", resource_type: "project", action: "read_status" },
      { permission_key: "platform.read_telemetry", resource_type: "platform", action: "read_telemetry" },
      { permission_key: "organization.read_activity", resource_type: "organization", action: "read_activity" },
    ],
  },
  {
    role_id: "agent-developer",
    name: "Agent Developer",
    summary: [
      "Agent card authoring and versioning",
      "Interface contract maintenance",
      "Aggregate telemetry for own agents",
    ],
    permissions: [
      { permission_key: "registry.author", resource_type: "registry_entry", action: "author" },
      { permission_key: "registry.version", resource_type: "registry_entry", action: "version" },
      { permission_key: "deployment.read_telemetry", resource_type: "deployment", action: "read_telemetry" },
    ],
  },
];
