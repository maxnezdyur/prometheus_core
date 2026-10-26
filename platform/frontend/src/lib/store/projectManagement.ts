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
 * Holds the Project Management page state: the team members and the role
 * catalogue. Same useSyncExternalStore pattern as store/session.ts.
 *
 * Loads from `api.listMembers()` and `api.listRoles()` on the first subscribe.
 * In UI preview mode MSW answers both (src/mocks); with a backend, the same
 * calls go to the backend.
 */
import { useSyncExternalStore } from "react";
import { api } from "@/lib/api/client";
import type { Role as RoleRecord, TeamMember as MemberRecord } from "@/lib/api/contract";
import { relativeTime } from "@/lib/clock";
import type { MemberStatus, ProjectManagementState, Role, RoleId, TeamMember } from "@/lib/store/projectManagementModel";

let state: ProjectManagementState = { status: "loading", members: [], roles: [] };
let started = false;
const listeners = new Set<() => void>();

function set(next: ProjectManagementState): void {
  state = next;
  for (const l of listeners) l();
}

/** Map one API member to the table row: a disabled account shows as suspended. */
export function toMember(r: MemberRecord): TeamMember {
  const status: MemberStatus = r.status === "invited" ? "invited" : r.status === "active" ? "active" : "suspended";
  return {
    id: r.member_id,
    name: r.name,
    email: r.email,
    role: r.role_id as RoleId,
    department: r.department,
    status,
    lastActive: status === "invited" || !r.last_active_at ? "Pending" : relativeTime(r.last_active_at, "long"),
  };
}

export function toRole(r: RoleRecord): Role {
  return { id: r.role_id as RoleId, name: r.name, permissions: r.summary };
}

function load(): void {
  if (started) return;
  started = true;
  Promise.all([api.listMembers(), api.listRoles()])
    .then(([members, roles]) =>
      set({
        status: members.length === 0 ? "empty" : "ready",
        members: members.map(toMember),
        roles: roles.map(toRole),
      }),
    )
    .catch(() => set({ status: "error", members: [], roles: [] }));
}

function subscribe(cb: () => void): () => void {
  load();
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot(): ProjectManagementState {
  return state;
}

/** Subscribe a component to the Project Management page state. */
export function useProjectManagement(): ProjectManagementState {
  return useSyncExternalStore(subscribe, getSnapshot);
}
