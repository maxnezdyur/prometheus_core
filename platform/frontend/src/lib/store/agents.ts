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
 * Holds the agents shown on the Agent Registry page. Same
 * useSyncExternalStore pattern as store/session.ts.
 *
 * Loads from `api.listAgents()` and `api.listAgentCategories()` on the first
 * subscribe. In UI preview mode MSW answers both (src/mocks); with a backend,
 * the same calls go to the backend.
 */
import { useSyncExternalStore } from "react";
import { api } from "@/lib/api/client";
import type { Agent as AgentRecord, AgentCategory } from "@/lib/api/contract";

export type AgentStatus = "healthy" | "degraded" | "offline" | "escalating";
export type AgentDomain =
  | "Plant & Systems"
  | "Core & Fuel"
  | "Component"
  | "Structural & Seismic"
  | "Licensing & Regulatory"
  | "Manufacturing & Construction"
  | "Data & Knowledge";
export type AgentIcon =
  | "box"
  | "grid"
  | "activity"
  | "wind"
  | "thermometer"
  | "shield"
  | "database"
  | "file-text";

export interface Agent {
  id: string;
  name: string;
  description: string;
  domain: AgentDomain;
  version: string; // "1.4"; the card shows "V1.4"
  avgRunSeconds: number; // the card shows "AVG: 5m 20s"
  uptimePercent: number; // the card shows "99.8%"
  latencyMs: number; // the card shows "42ms"
  status: AgentStatus;
  icon: AgentIcon; // a key, so the store stays JSX-free and node-testable
}

export type AgentsStatus = "ready" | "empty" | "loading" | "error";
export interface AgentsState {
  agents: readonly Agent[];
  status: AgentsStatus;
}

let state: AgentsState = { agents: [], status: "loading" };
let started = false;
const listeners = new Set<() => void>();

function set(next: AgentsState): void {
  state = next;
  for (const l of listeners) l();
}

/** Map one API record to the card's view, naming its category by label. */
export function toAgent(record: AgentRecord, categories: AgentCategory[]): Agent {
  const label = categories.find((c) => c.category_id === record.category_id)?.label ?? "Data & Knowledge";
  return {
    id: record.agent_id,
    name: record.name,
    description: record.description,
    domain: label as AgentDomain,
    version: record.version,
    avgRunSeconds: record.avg_run_seconds,
    uptimePercent: record.success_percent,
    latencyMs: record.latency_ms,
    status: record.status,
    icon: record.icon as AgentIcon,
  };
}

function load(): void {
  if (started) return;
  started = true;
  Promise.all([api.listAgents(), api.listAgentCategories()])
    .then(([records, categories]) => {
      const agents = records.map((r) => toAgent(r, categories));
      set({ agents, status: agents.length === 0 ? "empty" : "ready" });
    })
    .catch(() => set({ agents: [], status: "error" }));
}

function subscribe(cb: () => void): () => void {
  load();
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot(): AgentsState {
  return state;
}

/** Subscribe a component to the registry agents and their load status. */
export function useAgents(): AgentsState {
  return useSyncExternalStore(subscribe, getSnapshot);
}
