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

// Proves that the production build in dist/ holds no MSW code, no worker
// file and no mock fixture. Run it after `npm run build`.

import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const MARKERS = [
  "setupWorker",
  "mockServiceWorker",
  "[MSW]",
  "MOCK_NOW",
  "Dr. A. Vance",
  "JOB-4029",
  "CKP-8841",
];

if (!existsSync(DIST)) {
  console.error(`FAIL dist/ not found at ${DIST}; run \`npm run build\` first`);
  process.exit(1);
}

const files = readdirSync(DIST, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));
const contents = files.map((file) => [file, readFileSync(file, "latin1")]);

let failed = false;
function report(ok, message) {
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
  if (!ok) failed = true;
}

report(!existsSync(path.join(DIST, "mockServiceWorker.js")), "no dist/mockServiceWorker.js");
for (const marker of MARKERS) {
  const hits = contents
    .filter(([, text]) => text.includes(marker))
    .map(([file]) => path.relative(DIST, file));
  report(hits.length === 0, `no "${marker}"${hits.length ? ` (found in ${hits.join(", ")})` : ""}`);
}

process.exit(failed ? 1 : 0);
