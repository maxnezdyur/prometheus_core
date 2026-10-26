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

// The app's clock: now() is the current time until fixClock() pins it, and relativeTime()
// labels an ISO time against that clock as "Just now", "<n>m ago", "<n>h ago", or days in the
// short or long style. Each test starts from an unpinned clock, so the order does not matter.
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { fixClock, now, relativeTime, resetClock } from "./clock.ts";

const FIXED = "2025-10-26T12:00:00Z";

const before = (ms: number): string => new Date(new Date(FIXED).getTime() - ms).toISOString();

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

beforeEach(() => {
  resetClock();
});

test("now() is the current time when fixClock() was never called", () => {
  const start = Date.now();
  const current = now().getTime();
  const end = Date.now();
  assert.ok(current >= start && current <= end, `now() ${current} lies outside [${start}, ${end}]`);
  assert.ok(Math.abs(current - Date.now()) < SECOND_MS);
});

test("now() returns the instant that fixClock() set", () => {
  fixClock(FIXED);
  assert.equal(now().toISOString(), "2025-10-26T12:00:00.000Z");
});

test("relativeTime() labels minutes, hours and under a minute against the fixed clock", () => {
  fixClock(FIXED);
  assert.equal(relativeTime(before(14 * MINUTE_MS)), "14m ago");
  assert.equal(relativeTime(before(2 * HOUR_MS)), "2h ago");
  assert.equal(relativeTime(before(30 * SECOND_MS)), "Just now");
});

test("relativeTime() labels days in the short and the long style", () => {
  fixClock(FIXED);
  assert.equal(relativeTime(before(3 * DAY_MS), "short"), "3d ago");
  assert.equal(relativeTime(before(3 * DAY_MS), "long"), "3 days ago");
});
