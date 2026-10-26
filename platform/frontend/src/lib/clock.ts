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
 * The app's notion of "now", and the relative time labels computed from it.
 *
 * `now()` returns the current time, unless `fixClock()` pinned it: the UI preview
 * pins it to the mock dataset's fixed instant, so every relative label matches the
 * fixtures. Kept as a leaf module with no imports, so it is unit-testable under
 * `node --test`.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

let fixedMs: number | null = null;

/** Pin `now()` to the instant `iso` from here on. */
export function fixClock(iso: string): void {
  fixedMs = new Date(iso).getTime();
}

/** Clear the pin, so `now()` returns the current time again; tests use it. */
export function resetClock(): void {
  fixedMs = null;
}

/** The fixed instant after `fixClock()`, the current time otherwise; a fresh `Date` each call. */
export function now(): Date {
  return fixedMs === null ? new Date() : new Date(fixedMs);
}

/**
 * How long before `at` the instant `iso` was: "Just now" under one minute, then
 * "14m ago", "2h ago", then days as "2d ago" (`short`) or "3 days ago" (`long`).
 */
export function relativeTime(iso: string, style: "short" | "long" = "short", at: Date = now()): string {
  const elapsed = at.getTime() - new Date(iso).getTime();
  if (elapsed < MINUTE_MS) return "Just now";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m ago`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h ago`;
  const days = Math.floor(elapsed / DAY_MS);
  if (style === "short") return `${days}d ago`;
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
