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
 * The state switch of the mock layer: which state each resource answers in.
 *
 * The `mock` query parameter selects it, as `<resource>:<state>[,<resource>:<state>...]`,
 * for example `?mock=agents:empty,jobs:loading`. `*` stands for every non-boot resource,
 * and `session:signed-out` makes `/api/auth/me` answer 401. Unknown states are ignored.
 * Pure, so the handler node:test covers it.
 */

export type MockState = "populated" | "empty" | "loading" | "error" | "signed-out";

export type Selection = ReadonlyMap<string, MockState>;

const STATES: ReadonlySet<string> = new Set(["populated", "empty", "loading", "error"]);

/** Read the selection from a URL query string such as `location.search`. */
export function parseSelection(search: string): Selection {
  const selection = new Map<string, MockState>();
  const raw = new URLSearchParams(search).get("mock");
  if (!raw) return selection;
  for (const pair of raw.split(",")) {
    const [resource, state, ...rest] = pair.trim().split(":");
    if (!resource || !state || rest.length > 0) continue;
    if (STATES.has(state)) {
      selection.set(resource, state as MockState);
    } else if (resource === "session" && state === "signed-out") {
      selection.set(resource, state);
    }
  }
  return selection;
}

/** The state of `resource`: its own entry, else the `*` entry, else `populated`. */
export function stateFor(selection: Selection, resource: string): MockState {
  return selection.get(resource) ?? selection.get("*") ?? "populated";
}
