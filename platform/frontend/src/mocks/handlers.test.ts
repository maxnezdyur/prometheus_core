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

// The mock handlers answer each resource in the state that `?mock=` selects: the fixture,
// an empty list or emptied record, a held response, or the 502 gateway body; an unmocked
// /api path answers 501. Each case runs under its own msw/node server, closed afterwards.
import assert from "node:assert/strict";
import test from "node:test";

import { setupServer } from "msw/node";

import { C1_DRAFT_GRAPH_ID, dataset } from "./fixtures/index.ts";
import { handlers, MOCK_SESSION_ID } from "./handlers.ts";
import { parseSelection, stateFor } from "./state.ts";

/** Runs `body` with the handlers of the `search` selection intercepting fetch. */
async function withServer(search: string, body: () => Promise<void>): Promise<void> {
  const server = setupServer(...handlers(parseSelection(search)));
  server.listen({ onUnhandledRequest: "error" });
  try {
    await body();
  } finally {
    server.close();
  }
}

test("parseSelection reads resource:state pairs and defaults every other resource to populated", () => {
  const selection = parseSelection("?mock=agents:empty,jobs:loading");
  assert.equal(stateFor(selection, "agents"), "empty");
  assert.equal(stateFor(selection, "jobs"), "loading");
  assert.equal(stateFor(selection, "skills"), "populated");
});

test("parseSelection ignores an unknown state", () => {
  const selection = parseSelection("?mock=agents:broken,jobs:empty");
  assert.equal(stateFor(selection, "agents"), "populated");
  assert.equal(stateFor(selection, "jobs"), "empty");
});

test("*:error selects error for agents but leaves the boot rows answering", async () => {
  assert.equal(stateFor(parseSelection("?mock=*:error"), "agents"), "error");
  await withServer("?mock=*:error", async () => {
    const agents = await fetch("http://localhost/api/agents");
    assert.equal(agents.status, 502);
    const config = await fetch("http://localhost/api/config");
    assert.equal(config.status, 200);
    const setup = await fetch("http://localhost/api/setup/status");
    assert.equal(setup.status, 200);
    assert.deepEqual(await setup.json(), { needs_setup: false });
  });
});

test("GET /api/agents returns the 8 fixture agents when populated", async () => {
  await withServer("", async () => {
    const response = await fetch("http://localhost/api/agents");
    assert.equal(response.status, 200);
    const agents = (await response.json()) as { agent_id: string }[];
    assert.equal(agents.length, 8);
  });
});

test("GET /api/agents returns [] with agents:empty", async () => {
  await withServer("?mock=agents:empty", async () => {
    const response = await fetch("http://localhost/api/agents");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  });
});

test("GET /api/graphs/<C1 draft> returns a graph with no nodes and no edges with graph:empty", async () => {
  await withServer("?mock=graph:empty", async () => {
    const response = await fetch(`http://localhost/api/graphs/${C1_DRAFT_GRAPH_ID}`);
    assert.equal(response.status, 200);
    const graph = (await response.json()) as { graph_id: string; nodes: unknown[]; edges: unknown[] };
    assert.equal(graph.graph_id, C1_DRAFT_GRAPH_ID);
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(graph.edges, []);
  });
});

test("GET /api/graphs/<C1 draft> returns the fixture's nodes in order when populated", async () => {
  const fixture = dataset.graphs.find((g) => g.graph_id === C1_DRAFT_GRAPH_ID);
  assert.ok(fixture, "the C1 draft graph is in the dataset");
  const expected = fixture.nodes.map((n) => n.node_id);
  assert.ok(expected.length > 0, "the C1 draft graph has nodes");
  await withServer("", async () => {
    const response = await fetch(`http://localhost/api/graphs/${C1_DRAFT_GRAPH_ID}`);
    assert.equal(response.status, 200);
    const graph = (await response.json()) as { nodes: { node_id: string }[] };
    assert.deepEqual(
      graph.nodes.map((n) => n.node_id),
      expected,
    );
  });
});

test("GET /api/agents returns 502 with the gateway body with agents:error", async () => {
  await withServer("?mock=agents:error", async () => {
    const response = await fetch("http://localhost/api/agents");
    assert.equal(response.status, 502);
    const body = (await response.json()) as { detail: string; target_node: string };
    assert.equal(body.detail, "ERR_GATEWAY_TIMEOUT");
    assert.equal(body.target_node, "hpc-ingress-04.inl.gov");
  });
});

test("GET /api/agents waits on the hold with agents:loading until it opens", async () => {
  let holdCalls = 0;
  let open: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const hold = () => {
    holdCalls += 1;
    return gate;
  };
  const server = setupServer(...handlers(parseSelection("?mock=agents:loading"), hold));
  server.listen({ onUnhandledRequest: "error" });
  try {
    const controller = new AbortController();
    let settled = false;
    const pending = fetch("http://localhost/api/agents", { signal: controller.signal }).finally(() => {
      settled = true;
    });
    // Mark the rejection handled now; it is asserted after the abort below.
    pending.catch(() => {});
    for (let turn = 0; turn < 50 && holdCalls === 0; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(holdCalls, 1, "the loading handler awaits the hold");
    assert.equal(settled, false, "the fetch has not settled while the hold is closed");
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });

    // The hold is what blocks the response: once it opens, a new fetch answers.
    open();
    const response = await fetch("http://localhost/api/agents");
    assert.equal(response.status, 200);
    const agents = (await response.json()) as { agent_id: string }[];
    assert.equal(agents.length, 8);
  } finally {
    server.close();
  }
});

test("an unmocked /api path answers 501", async () => {
  await withServer("", async () => {
    const response = await fetch("http://localhost/api/nope");
    assert.equal(response.status, 501);
    assert.deepEqual(await response.json(), { detail: "Not mocked: GET /api/nope" });
  });
});

test("GET /api/auth/me returns Dr. A. Vance, and 401 with session:signed-out", async () => {
  await withServer("", async () => {
    const response = await fetch("http://localhost/api/auth/me");
    assert.equal(response.status, 200);
    const user = (await response.json()) as { identifier: string };
    assert.equal(user.identifier, "Dr. A. Vance");
  });
  await withServer("?mock=session:signed-out", async () => {
    const response = await fetch("http://localhost/api/auth/me");
    assert.equal(response.status, 401);
  });
});

test("POST resume of the mock session id returns an empty conversation, and 404 for an unknown id", async () => {
  await withServer("", async () => {
    const response = await fetch(`http://localhost/api/conversations/${MOCK_SESSION_ID}/resume`, { method: "POST" });
    assert.equal(response.status, 200);
    const detail = (await response.json()) as { conversation_id: string; messages: unknown[] };
    assert.equal(detail.conversation_id, MOCK_SESSION_ID);
    assert.equal(detail.messages.length, 0);
    const unknown = await fetch("http://localhost/api/conversations/conv-nope/resume", { method: "POST" });
    assert.equal(unknown.status, 404);
  });
});
