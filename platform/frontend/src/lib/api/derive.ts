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
 * Summary counters that the pages compute from the API data, in production as in the
 * UI preview. Pure functions that hold no data. Kept with only type imports, which are
 * erased, so it is unit-testable under `node --test`.
 */

import type { Checkpoint, Role, Skill, StorageUsage, TeamMember, WorkflowGraph, WorkflowVersion } from "./contract.ts";

/** The Approval Queue counters; "today" is the local calendar day of `now`. */
export function checkpointCounts(
  list: Checkpoint[],
  now: Date,
): { pending: number; urgent: number; approvedToday: number; revisionRequested: number } {
  const sameLocalDay = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };
  const pending = list.filter((c) => c.status === "pending");
  return {
    pending: pending.length,
    urgent: pending.filter((c) => c.priority === "urgent").length,
    approvedToday: list.filter((c) => c.status === "approved" && c.decided_at !== null && sameLocalDay(c.decided_at))
      .length,
    revisionRequested: list.filter((c) => c.status === "revision_requested").length,
  };
}

/** The used share of the storage capacity, as a rounded integer percent (0 with no capacity). */
export function storagePercent(usage: StorageUsage): number {
  if (usage.capacity_bytes === 0) return 0;
  return Math.round((usage.used_bytes / usage.capacity_bytes) * 100);
}

/** The member count of every role, keyed by role id; a role with no member counts 0. */
export function memberCountByRole(members: TeamMember[], roles: Role[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const role of roles) counts[role.role_id] = 0;
  for (const member of members) {
    if (member.role_id in counts) counts[member.role_id] += 1;
  }
  return counts;
}

/** The distinct agents behind the graph's skill nodes, and its checkpoint nodes. */
export function graphCounts(graph: WorkflowGraph, skills: Skill[]): { agents: number; checkpoints: number } {
  const agentBySkill = new Map(skills.map((s) => [s.skill_id, s.agent_id]));
  const agents = new Set<string>();
  for (const node of graph.nodes) {
    if (node.kind !== "skill" || node.skill_id === null) continue;
    const agentId = agentBySkill.get(node.skill_id);
    if (agentId) agents.add(agentId);
  }
  return { agents: agents.size, checkpoints: graph.nodes.filter((n) => n.kind === "checkpoint").length };
}

/** The runs of a workflow version, summed over its projects. */
export function totalRuns(version: WorkflowVersion): number {
  return version.runs_by_project.reduce((sum, p) => sum + p.runs, 0);
}
