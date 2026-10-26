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

// The counter helpers compute the summary numbers of the pages from the mock dataset:
// the Approval Queue counts, the storage share, the members per role, the checkpoint
// nodes of the D1 plan and the total runs of a workflow version.
import assert from "node:assert/strict";
import test from "node:test";

import { MATERIAL_ANALYSIS_V1_2_0, MOCK_NOW, PLAN_GRAPH_ID, dataset } from "../../mocks/fixtures/index.ts";
import { checkpointCounts, graphCounts, memberCountByRole, storagePercent, totalRuns } from "./derive.ts";

// "Today" is the local calendar day of now, so pin the zone. Node re-reads TZ on assignment;
// the hoisted imports above use only Date.parse and toISOString, which ignore the zone.
process.env.TZ = "America/Denver";

test("checkpointCounts gives 4 pending, 2 urgent, 12 approved today and 1 revision requested", () => {
  assert.deepEqual(checkpointCounts(dataset.checkpoints, new Date(MOCK_NOW)), {
    pending: 4,
    urgent: 2,
    approvedToday: 12,
    revisionRequested: 1,
  });
});

test("checkpointCounts drops to 1 urgent and 3 pending when one urgent checkpoint is removed", () => {
  const firstUrgent = dataset.checkpoints.findIndex((c) => c.status === "pending" && c.priority === "urgent");
  assert.notEqual(firstUrgent, -1, "the dataset holds a pending urgent checkpoint");
  const fewer = dataset.checkpoints.filter((_, i) => i !== firstUrgent);

  const counts = checkpointCounts(fewer, new Date(MOCK_NOW));

  assert.equal(counts.urgent, 1);
  assert.equal(counts.pending, 3);
});

test("storagePercent gives 36 for the project storage", () => {
  assert.equal(storagePercent(dataset.storage), 36);
});

test("storagePercent gives 0 when there is no capacity", () => {
  assert.equal(storagePercent({ used_bytes: 0, capacity_bytes: 0 }), 0);
});

test("memberCountByRole gives platform-admin 2 and program-manager 0", () => {
  const counts = memberCountByRole(dataset.members, dataset.roles);

  assert.equal(counts["platform-admin"], 2);
  assert.equal(counts["program-manager"], 0);
});

test("graphCounts gives 4 agents and 1 checkpoint node on the D1 plan graph", () => {
  const planGraph = dataset.graphs.find((g) => g.graph_id === PLAN_GRAPH_ID);
  assert.ok(planGraph, `the dataset holds the graph ${PLAN_GRAPH_ID}`);

  const counts = graphCounts(planGraph, dataset.skills);

  // material-properties-lookup (material and corrosion), mcnp-neutronics-solver,
  // thermal-hydraulic-modeler, report-generator; the SME Review checkpoint has no agent.
  assert.equal(counts.agents, 4);
  assert.equal(counts.checkpoints, 1);
});

test("totalRuns gives 12 for Comprehensive Material Analysis v1.2.0", () => {
  assert.equal(totalRuns(MATERIAL_ANALYSIS_V1_2_0), 12);
});
