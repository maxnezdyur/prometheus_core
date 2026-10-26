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
 * Holds the Data Management page data: the connected data sources, the
 * artifact storage usage and the generated artifacts. Same
 * useSyncExternalStore pattern as store/session.ts.
 *
 * Loads from `api.listDataSources()`, `api.getStorage()`, `api.listArtifacts()`
 * and `api.listAgents()` on the first subscribe. In UI preview mode MSW answers
 * them (src/mocks); with a backend, the same calls go to the backend.
 */
import { useSyncExternalStore } from "react";
import { api } from "@/lib/api/client";
import type {
  Agent as AgentRecord,
  ArtifactRecord,
  DataSource as SourceRecord,
  StorageUsage as StorageRecord,
} from "@/lib/api/contract";
import { relativeTime } from "@/lib/clock";

export type SourceStatus = "connected" | "syncing" | "disconnected";
export type ArtifactType = "report" | "mesh" | "result";
export type DataStatus = "ready" | "empty" | "loading" | "error";

export interface DataSource {
  id: string;
  /** Glossary §5.5 connector_class: DEEPLYNX, S3_BUCKET, FILE_SYSTEM, POSTGRESQL, REST_API or WEB_CRAWL. */
  connector_class: string;
  name: string;
  status: SourceStatus;
  enabled: boolean;
  last_sync: string;
  volume_bytes: number;
}

export interface StorageUsage {
  used_bytes: number;
  total_bytes: number;
}

export interface Artifact {
  id: string;
  name: string;
  type: ArtifactType;
  agent: string;
  run_id: string;
  size_bytes: number;
  created: string;
}

export interface DataManagementState {
  status: DataStatus;
  sources: DataSource[];
  storage: StorageUsage;
  artifacts: Artifact[];
}

export function derive(sources: DataSource[], artifacts: Artifact[]): DataStatus {
  return sources.length === 0 && artifacts.length === 0 ? "empty" : "ready";
}

const EMPTY = { sources: [], storage: { used_bytes: 0, total_bytes: 0 }, artifacts: [] };
let state: DataManagementState = { status: "loading", ...EMPTY };
let started = false;
const listeners = new Set<() => void>();

function set(next: DataManagementState): void {
  state = next;
  for (const l of listeners) l();
}

/** Map one API source to the card's view. */
export function toSource(r: SourceRecord): DataSource {
  return {
    id: r.source_id,
    connector_class: r.type.toUpperCase(),
    name: r.name,
    status: r.status,
    enabled: r.enabled,
    last_sync: r.status === "syncing" || !r.last_sync_at ? "Syncing..." : relativeTime(r.last_sync_at, "short"),
    volume_bytes: r.volume_bytes,
  };
}

/** Map one API artifact to the table row, naming its producing agent. */
export function toArtifact(r: ArtifactRecord, agents: AgentRecord[]): Artifact {
  return {
    id: r.artifact_id,
    name: r.name,
    type: r.kind,
    agent: agents.find((a) => a.agent_id === r.producer_agent_id)?.name ?? "",
    run_id: r.run_id ?? "",
    size_bytes: r.size_bytes,
    created: r.created_at ? relativeTime(r.created_at, "short") : "",
  };
}

export function toStorage(r: StorageRecord): StorageUsage {
  return { used_bytes: r.used_bytes, total_bytes: r.capacity_bytes };
}

function load(): void {
  if (started) return;
  started = true;
  Promise.all([api.listDataSources(), api.getStorage(), api.listArtifacts(), api.listAgents()])
    .then(([sources, storage, artifacts, agents]) => {
      const view = {
        sources: sources.filter((r) => r.role === "read").map(toSource),
        storage: toStorage(storage),
        artifacts: artifacts.map((r) => toArtifact(r, agents)),
      };
      set({ status: derive(view.sources, view.artifacts), ...view });
    })
    .catch(() => set({ status: "error", ...EMPTY }));
}

function subscribe(cb: () => void): () => void {
  load();
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot(): DataManagementState {
  return state;
}

/** Subscribe a component to the Data Management page data. */
export function useDataManagement(): DataManagementState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Used storage as a whole percentage of the total; 0 when there is no capacity. */
export function storagePercent(s: StorageUsage): number {
  return s.total_bytes > 0 ? Math.round((s.used_bytes / s.total_bytes) * 100) : 0;
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** Bytes in decimal units with at most one decimal: 1.8e12 -> "1.8 TB", 5e12 -> "5 TB". */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${Number(value.toFixed(1))} ${UNITS[unit]}`;
}
