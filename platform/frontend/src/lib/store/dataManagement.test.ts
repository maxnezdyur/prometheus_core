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
  listDataSources: () => Promise.resolve(dataset.dataSources),
  getStorage: () => Promise.resolve(dataset.storage),
  listArtifacts: () => Promise.resolve(dataset.artifacts),
  listAgents: () => Promise.resolve(dataset.agents),
};
const { useDataManagement, derive, storagePercent, formatBytes } = await import("./dataManagement.ts");

test("useDataManagement loads the read sources, the storage and the artifacts from the api", async () => {
  assert.equal(useDataManagement().status, "loading"); // not a render: the stubbed hook returns the snapshot
  await flush();
  const state = useDataManagement();
  assert.equal(state.status, "ready");
  assert.equal(state.sources.length, dataset.dataSources.filter((s) => s.role === "read").length);
  assert.deepEqual(
    state.sources.filter((s) => !s.enabled).map((s) => s.name),
    ["Reactor Operating Logs"],
  );
  assert.equal(state.sources.find((s) => s.status === "syncing")?.last_sync, "Syncing...");
  assert.equal(state.storage.total_bytes, dataset.storage.capacity_bytes);
  assert.equal(state.artifacts.length, dataset.artifacts.length);
  for (const a of state.artifacts) {
    assert.ok(a.name.length > 0, `artifact ${a.id} has an empty name`);
    assert.ok(a.agent.length > 0, `artifact ${a.id} has no producing agent`);
    assert.ok(["report", "mesh", "result"].includes(a.type), `artifact ${a.id} has type ${a.type}`);
  }
});

test("derive returns empty for no sources and no artifacts, else ready", () => {
  const { sources } = useDataManagement();
  assert.equal(derive([], []), "empty");
  assert.equal(derive(sources.slice(0, 1), []), "ready");
});

test("storagePercent rounds used over total to a whole percentage", () => {
  assert.equal(storagePercent({ used_bytes: 1.8e12, total_bytes: 5e12 }), 36);
  assert.equal(storagePercent({ used_bytes: 1, total_bytes: 3 }), 33);
  assert.equal(storagePercent({ used_bytes: 0, total_bytes: 0 }), 0);
});

test("formatBytes steps to the decimal unit with at most one decimal", () => {
  assert.equal(formatBytes(1.8e12), "1.8 TB");
  assert.equal(formatBytes(890e9), "890 GB");
  assert.equal(formatBytes(84e3), "84 KB");
});
