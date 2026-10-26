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

// The mock dataset is connected: every id that a record names resolves to one record, the
// ids are unique per entity, the story's entity counts hold, every time lies before
// MOCK_NOW, and each conversation artifact is in the artifact_ids of one message only.
import assert from "node:assert/strict";
import test from "node:test";

import { MOCK_NOW, dataset } from "./index.ts";

type Dataset = typeof dataset;

/** Each reference field and the collection whose records it names. */
const REF_TARGETS: Record<string, (d: Dataset) => { id: string }[]> = {
  agent_id: (d) => d.agents.map((r) => ({ id: r.agent_id })),
  producer_agent_id: (d) => d.agents.map((r) => ({ id: r.agent_id })),
  producing_agent_id: (d) => d.agents.map((r) => ({ id: r.agent_id })),
  skill_id: (d) => d.skills.map((r) => ({ id: r.skill_id })),
  category_id: (d) => d.agentCategories.map((r) => ({ id: r.category_id })),
  graph_id: (d) => d.graphs.map((r) => ({ id: r.graph_id })),
  plan_id: (d) => d.plans.map((r) => ({ id: r.plan_id })),
  workflow_id: (d) => d.workflows.map((r) => ({ id: r.workflow_id })),
  artifact_id: (d) => d.artifacts.map((r) => ({ id: r.artifact_id })),
  role_id: (d) => d.roles.map((r) => ({ id: r.role_id })),
  required_role_id: (d) => d.roles.map((r) => ({ id: r.role_id })),
  conversation_id: (d) => d.conversations.map((r) => ({ id: r.conversation_id })),
};

/** Visits every object in `value`, with its path from the dataset root. */
function walk(value: unknown, path: string, visit: (obj: Record<string, unknown>, path: string) => void): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, `${path}[${i}]`, visit));
  } else if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    visit(obj, path);
    for (const [key, child] of Object.entries(obj)) walk(child, `${path}.${key}`, visit);
  }
}

/** Every reference of `d` that does not name exactly one record, as `path=value`. */
function brokenRefs(d: Dataset): string[] {
  const broken: string[] = [];
  const check = (path: string, field: string, value: string) => {
    const matches = REF_TARGETS[field](d).filter((r) => r.id === value).length;
    if (matches !== 1) broken.push(`${path}=${value} (${matches} matches)`);
  };
  walk(d, "dataset", (obj, path) => {
    for (const field of Object.keys(REF_TARGETS)) {
      const value = obj[field];
      if (value === null || value === undefined) continue;
      if (typeof value !== "string") broken.push(`${path}.${field} is not a string`);
      else check(`${path}.${field}`, field, value);
    }
    if (Array.isArray(obj.artifact_ids)) {
      obj.artifact_ids.forEach((id, i) => check(`${path}.artifact_ids[${i}]`, "artifact_id", String(id)));
    }
  });
  for (const workflowId of Object.keys(d.workflowVersions)) {
    check(`dataset.workflowVersions[${workflowId}]`, "workflow_id", workflowId);
  }
  for (const g of d.graphs) {
    const nodeIds = new Set(g.nodes.map((n) => n.node_id));
    for (const e of g.edges) {
      if (!nodeIds.has(e.from_node)) broken.push(`${g.graph_id}.${e.edge_id}.from_node=${e.from_node}`);
      if (!nodeIds.has(e.to_node)) broken.push(`${g.graph_id}.${e.edge_id}.to_node=${e.to_node}`);
    }
  }
  return broken;
}

/** The ids of `ids` that occur more than once. */
function duplicates(ids: string[]): string[] {
  return ids.filter((id, i) => ids.indexOf(id) !== i);
}

test("every id that a fixture record names resolves to one record", () => {
  assert.deepEqual(brokenRefs(dataset), []);
});

test("the resolver rejects a job that names an agent the dataset lacks", () => {
  const mutated = structuredClone(dataset);
  const job = mutated.jobs.find((j) => j.agent_id === "mesh-generator");
  assert.ok(job, "the dataset has a mesh-generator job");
  job.agent_id = "mesh-generator-v2";
  const broken = brokenRefs(mutated);
  assert.equal(broken.length, 1);
  assert.match(broken[0], /^dataset\.jobs\[\d+\]\.agent_id=mesh-generator-v2 /);
});

test("the resolver rejects an edge that names a node outside its graph", () => {
  const mutated = structuredClone(dataset);
  mutated.graphs[0].edges[0].to_node = "missing-node";
  assert.equal(brokenRefs(mutated).length, 1);
});

test("ids are unique per entity", () => {
  const d = dataset;
  const entities: Record<string, string[]> = {
    agents: d.agents.map((r) => r.agent_id),
    agentCategories: d.agentCategories.map((r) => r.category_id),
    skills: d.skills.map((r) => r.skill_id),
    workflows: d.workflows.map((r) => r.workflow_id),
    graphs: d.graphs.map((r) => r.graph_id),
    edges: d.graphs.flatMap((g) => g.edges.map((e) => e.edge_id)),
    plans: d.plans.map((r) => r.plan_id),
    jobs: d.jobs.map((r) => r.job_id),
    artifacts: d.artifacts.map((r) => r.artifact_id),
    viewerModels: d.viewerModels.map((r) => r.artifact_id),
    checkpoints: d.checkpoints.map((r) => r.checkpoint_id),
    dataSources: d.dataSources.map((r) => r.source_id),
    members: d.members.map((r) => r.member_id),
    roles: d.roles.map((r) => r.role_id),
    conversations: d.conversations.map((r) => r.conversation_id),
    conversationDetails: d.conversationDetails.map((r) => r.conversation_id),
    activities: d.activities.map((r) => r.conversation_id),
    homeSuggestions: d.homeSuggestions.map((r) => r.suggestion_id),
    authProviders: d.authProviders.map((r) => r.provider_id),
    adminUsers: d.adminUsers.map((r) => r.id),
    signingKeys: d.signingKeys.map((r) => r.id),
    oidcProviders: d.oidcProviders.map((r) => r.id),
  };
  for (const g of d.graphs) entities[`${g.graph_id} nodes`] = g.nodes.map((n) => n.node_id);
  for (const [workflowId, versions] of Object.entries(d.workflowVersions)) {
    entities[`${workflowId} versions`] = versions.map((v) => v.version);
  }
  for (const [entity, ids] of Object.entries(entities)) {
    assert.deepEqual(duplicates(ids), [], `duplicate ids in ${entity}`);
  }
});

test("the dataset holds the entity counts of the story", () => {
  const d = dataset;
  assert.deepEqual(
    {
      agents: d.agents.length,
      skills: d.skills.length,
      conversations: d.conversations.length,
      jobs: d.jobs.length,
      dataSources: d.dataSources.length,
      readSources: d.dataSources.filter((s) => s.role === "read").length,
      egressSources: d.dataSources.filter((s) => s.role === "egress").map((s) => s.type),
      members: d.members.length,
      roles: d.roles.length,
      pendingCheckpoints: d.checkpoints.filter((c) => c.status === "pending").length,
    },
    {
      agents: 8,
      skills: 8,
      conversations: 9,
      jobs: 3,
      dataSources: 7,
      readSources: 6,
      egressSources: ["deeplynx"],
      members: 6,
      roles: 6,
      pendingCheckpoints: 4,
    },
  );
});

const RESOURCE_TYPES = [
  "platform",
  "organization",
  "workspace",
  "project",
  "deployment",
  "registry_entry",
  "external_service",
  "llm_provider",
  "artifact",
];

test("each role's permission keys are unique and name a known resource type", () => {
  for (const role of dataset.roles) {
    const keys = role.permissions.map((p) => p.permission_key);
    assert.deepEqual(duplicates(keys), [], `duplicate permission_key in ${role.role_id}`);
    for (const p of role.permissions) {
      assert.ok(
        RESOURCE_TYPES.includes(p.resource_type),
        `${role.role_id}.${p.permission_key}: unknown resource_type ${p.resource_type}`,
      );
    }
  }
});

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

test("every timestamp is an ISO instant before MOCK_NOW", () => {
  const now = Date.parse(MOCK_NOW);
  const problems: string[] = [];
  let seen = 0;
  walk(dataset, "dataset", (obj, path) => {
    for (const [key, value] of Object.entries(obj)) {
      const timeField = key.endsWith("_at") || key === "timestamp";
      if (timeField && (value === null || value === undefined)) continue;
      if (typeof value !== "string" || (!timeField && !ISO_INSTANT.test(value))) {
        if (timeField) problems.push(`${path}.${key} is not a string`);
        continue;
      }
      seen += 1;
      if (!ISO_INSTANT.test(value)) problems.push(`${path}.${key}=${value} is not an ISO instant`);
      else if (!(Date.parse(value) < now)) problems.push(`${path}.${key}=${value} is not before ${MOCK_NOW}`);
    }
  });
  assert.ok(seen > 0, "the walk found timestamps");
  assert.deepEqual(problems, []);
});

test("each conversation artifact is in the artifact_ids of one message only", () => {
  const messageIds = dataset.conversationDetails.flatMap((c) => c.messages.flatMap((m) => m.artifact_ids));
  for (const detail of dataset.conversationDetails) {
    const own = detail.artifacts.map((a) => a.artifact_id);
    for (const id of own) {
      assert.equal(
        messageIds.filter((m) => m === id).length,
        1,
        `${detail.conversation_id}: ${id} is in the artifact_ids of exactly one message`,
      );
    }
    for (const id of detail.messages.flatMap((m) => m.artifact_ids)) {
      assert.ok(own.includes(id), `${detail.conversation_id}: message artifact ${id} is in the detail's artifacts`);
    }
  }
  assert.ok(messageIds.length > 0, "the dataset has conversation artifacts");
});
