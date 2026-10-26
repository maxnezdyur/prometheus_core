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
 * The fixed "now" of the mock dataset. Every fixture time is an `ago(...)` value, so the
 * relative labels ("14m ago", "Today", "Oct 8") stay the same between runs. Noon UTC is
 * Oct 26 in every time zone from UTC-11 to UTC+11.
 */

export const MOCK_NOW = "2025-10-26T12:00:00Z";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** The ISO instant that lies `days`, `hours` and `minutes` (summed) before `MOCK_NOW`. */
export function ago({ minutes = 0, hours = 0, days = 0 }: { minutes?: number; hours?: number; days?: number }): string {
  return new Date(Date.parse(MOCK_NOW) - days * DAY_MS - hours * HOUR_MS - minutes * MINUTE_MS).toISOString();
}
