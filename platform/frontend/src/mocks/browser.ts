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
 * Starts the UI preview in the browser: pins the clock to the dataset's fixed now and
 * registers the service worker with the handlers. `main.tsx` imports this module only
 * when `VITE_UI_PREVIEW` is on, so the production build holds none of it.
 */

import { setupWorker } from "msw/browser";
import { sse } from "msw";
import { fixClock } from "../lib/clock.ts";
import { MOCK_NOW } from "./fixtures/index.ts";
import { handlers } from "./handlers.ts";
import { parseSelection } from "./state.ts";

export async function startMocks(): Promise<void> {
  fixClock(MOCK_NOW);
  const selection = parseSelection(location.search);
  // The session event stream opens and stays idle, so the chat store reports no error.
  // It goes first: MSW uses the first match, and the handlers end with the /api catch-all.
  const events = sse("*/api/events", () => {});
  await setupWorker(events, ...handlers(selection)).start({ onUnhandledRequest: "bypass" });
}
