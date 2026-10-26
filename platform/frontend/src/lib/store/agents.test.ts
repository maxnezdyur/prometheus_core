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

import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

/* The real store, with React and the API client stubbed out, as in chat.test.ts.
 * The stub client answers from the MSW fixtures, so the test checks the store's
 * mapping against the shared dataset. */
const SRC = new URL("../../", import.meta.url).href; // .../frontend/src/
const hooks = `
const SRC = ${JSON.stringify(SRC)};
const STUBS = { "@/lib/api/client": "stub:client", react: "stub:react" };
export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) return { url: STUBS[specifier], shortCircuit: true };
  const spec = specifier.startsWith("@/") ? SRC + specifier.slice(2) : specifier;
  const fromTs = context.parentURL && context.parentURL.endsWith(".ts");
  const isRel = spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("file:");
  if ((fromTs || specifier.startsWith("@/")) && isRel && !/\\.[cm]?[jt]sx?$/.test(spec)) {
    return next(spec + ".ts", context);
  }
  return next(spec, context);
}
const SOURCES = {
  "stub:react": "export function useSyncExternalStore(sub, get) { sub(() => {}); return get(); }",
  "stub:client": "export const api = new Proxy({}, { get: (_t, k) => (...a) => globalThis.__storeTestApi[k](...a) });",
};
export async function load(url, context, next) {
  if (SOURCES[url]) return { format: "module", shortCircuit: true, source: SOURCES[url] };
  return next(url, context);
}
`;
register("data:text/javascript," + encodeURIComponent(hooks));

const { dataset, MOCK_NOW } = await import("../../mocks/fixtures/index.ts");
const { fixClock } = await import("../clock.ts");
fixClock(MOCK_NOW);
const g = globalThis as unknown as { __storeTestApi: Record<string, () => Promise<unknown>> };

const flush = () => new Promise((r) => setTimeout(r, 0));
g.__storeTestApi = {
  listAgents: () => Promise.resolve(dataset.agents),
  listAgentCategories: () => Promise.resolve(dataset.agentCategories),
};
const { useAgents, toAgent } = await import("./agents.ts");

const ICONS = ["box", "grid", "activity", "wind", "thermometer", "shield", "database", "file-text"];

test("useAgents loads the eight agents from the api with every card field", async () => {
  assert.equal(useAgents().status, "loading");
  await flush();
  const state = useAgents();
  assert.equal(state.status, "ready");
  assert.equal(state.agents.length, 8);
  assert.equal(new Set(state.agents.map((a) => a.id)).size, 8);
  for (const a of state.agents) {
    assert.ok(a.name.length > 0, `${a.id}: name`);
    assert.ok(a.description.length > 0, `${a.id}: description`);
    assert.ok(a.version.length > 0, `${a.id}: version`);
    assert.ok(Number.isFinite(a.avgRunSeconds), `${a.id}: avgRunSeconds`);
    assert.ok(Number.isFinite(a.uptimePercent), `${a.id}: uptimePercent`);
    assert.ok(Number.isFinite(a.latencyMs), `${a.id}: latencyMs`);
    assert.ok(ICONS.includes(a.icon), `${a.id}: icon ${a.icon}`);
  }
  assert.deepEqual(
    state.agents.filter((a) => a.status === "offline").map((a) => a.name),
    ["Dose Rate Calculator"],
  );
});

test("toAgent names the category by its label", () => {
  const record = dataset.agents[0];
  const label = dataset.agentCategories.find((c) => c.category_id === record.category_id)?.label;
  assert.equal(toAgent(record, dataset.agentCategories).domain, label);
});

test("useAgents returns the same snapshot object on every call", () => {
  assert.equal(useAgents(), useAgents());
});
