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

import "@fontsource-variable/geist";
import "@fontsource-variable/roboto";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

function enableMocks(): Promise<void> {
  if (import.meta.env.VITE_UI_PREVIEW !== "true") return Promise.resolve();
  return import("./mocks/browser.ts").then(({ startMocks }) => startMocks());
}

void enableMocks()
  .catch((err: unknown) => console.error("UI preview mocks failed to start", err))
  .then(() => {
    ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
  });
