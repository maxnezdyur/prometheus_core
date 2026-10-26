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
 * The connected mock dataset of the UI preview: every collection in one object. Records
 * name each other by id, and every time lies before `MOCK_NOW`. Only the mock layer and
 * the node:tests import it; the production build holds none of it.
 */

import { agentCategories, agents, skills } from "./agents.ts";
import { adminUsers, oidcProviders, signingKeys } from "./admin.ts";
import { artifacts, checkpoints, jobs, viewerModels } from "./operations.ts";
import { dataSources, members, roles, storage } from "./project.ts";
import {
  activities,
  authProviders,
  config,
  conversationDetails,
  conversations,
  homeSuggestions,
  settingsOptions,
  user,
  workspace,
} from "./session.ts";
import { graphs, plans, workflows, workflowVersions } from "./workflows.ts";

export { MOCK_NOW } from "./time.ts";
export { CKP_8841_ID, JOB_4029_ID, MESH_ARTIFACT_ID, VIEWER_ARTIFACT_ID } from "./operations.ts";
export { RC7_CONVERSATION_ID } from "./session.ts";
export {
  C1_DRAFT_GRAPH_ID,
  C5_INVALID_GRAPH_ID,
  C6_TWEAK_GRAPH_ID,
  MATERIAL_ANALYSIS_V1_2_0,
  MATERIAL_ANALYSIS_WORKFLOW_ID,
  PLAN_GRAPH_ID,
  PLAN_ID,
} from "./workflows.ts";

export const dataset = {
  agents,
  agentCategories,
  skills,
  workflows,
  workflowVersions,
  graphs,
  plans,
  jobs,
  artifacts,
  viewerModels,
  checkpoints,
  dataSources,
  storage,
  members,
  roles,
  conversations,
  conversationDetails,
  activities,
  user,
  workspace,
  authProviders,
  config,
  homeSuggestions,
  settingsOptions,
  adminUsers,
  signingKeys,
  oidcProviders,
};
