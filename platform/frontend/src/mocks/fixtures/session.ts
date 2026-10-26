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
 * The signed-in session and the shell data: the user, the workspace, the login providers,
 * `/api/config`, the home suggestions, the settings options, and the 9 Chat History
 * conversations. "Thermal Analysis RC-7" holds the full B2-B6 transcript and its activity.
 */

import type { ConversationActivity, HomeSuggestion, SettingsOptions, WorkspaceContext } from "../../lib/api/contract.ts";
import type {
  AuthProvider,
  ConfigResponse,
  ConversationDetailResponse,
  ConversationSummary,
  User,
} from "../../lib/api/types.ts";
import { artifacts } from "./operations.ts";
import { ago } from "./time.ts";

/** The header shows `Dr. A. Vance` and the initials `DA`. */
export const user: User = { identifier: "Dr. A. Vance", role: "admin", provider: "credentials" };

export const workspace: WorkspaceContext = {
  org: "INL",
  project_id: "marvel",
  project_name: "MARVEL",
  project_label: "MARVEL REACTOR PROJECT",
  user_title: "CHIEF ANALYST",
};

/** Login renders each as "Sign in with <display_name>". */
export const authProviders: AuthProvider[] = [
  { provider_id: "okta", display_name: "Okta" },
  { provider_id: "azure-ad", display_name: "Azure AD" },
];

/** The 6 home suggestions of the design, in order. */
export const homeSuggestions: HomeSuggestion[] = [
  {
    suggestion_id: "suggestion-1",
    title: "Create a single-loop PWR primary coolant system with an RPV, SG, and a Pump connected in a closed loop",
    icon: "flame",
  },
  {
    suggestion_id: "suggestion-2",
    title: "Create a CAD file of a butterfly valve with 6 holes with a diameter of 5cm each for a pipe diameter of 0.9m",
    icon: "chart",
  },
  { suggestion_id: "suggestion-3", title: "Run FTL Safety Analysis", icon: "shield-check" },
  {
    suggestion_id: "suggestion-4",
    title: "Perform a literature search on suitable wall materials for molten salt reactors",
    icon: "book-open",
  },
  { suggestion_id: "suggestion-5", title: "Perform a thermal analysis of SS316 at 400C", icon: "flame" },
  { suggestion_id: "suggestion-6", title: "Do a comprehensive material analysis of SS347", icon: "chart" },
];

/** The welcome screen shows `workflow_suggestions` instead of the 7 fallbacks of `src/config.ts`. */
export const config: ConfigResponse = {
  profiles: [
    {
      name: "Beginner Chat",
      markdown_description: "This profile provides some suggestions on how to get started.",
      icon: null,
    },
    { name: "Advanced Chat", markdown_description: "This profile doesn't provide any suggestions.", icon: null },
  ],
  chat_intro: "Welcome to the Prometheus Platform.",
  chat_suggestion_title: "What would you like to do today?",
  workflow_suggestions: homeSuggestions.map((s) => s.title),
  auto_approve_steps: false,
  max_upload_bytes: 100 * 1024 * 1024,
};

export const settingsOptions: SettingsOptions = {
  models: ["None", "gpt-oss-120B (AmSC)", "gpt-oss-120B (INL)", "GPT-5.3 Chat (OpenAI)", "Claude Opus 4.6 (Anthropic)"],
  approval_types: ["None", "Workflow Level", "Agent Level"],
  chat_types: ["Beginner", "Advanced"],
};

export const RC7_CONVERSATION_ID = "conv-thermal-analysis-rc7";

const RC7_FIRST_QUERY = "Run thermal-hydraulic analysis on reactor assembly RC-7 with inlet velocity of 5.2 m/s.";

/** A conversation whose query is its title; at `days` before now, Chat History shows its date. */
function pastConversation(conversation_id: string, title: string, days: number): ConversationSummary {
  return { conversation_id, title, query: title, status: "completed", timestamp: ago({ days }), pending: false };
}

/** Newest first, as `GET /api/conversations/recent` returns them. */
export const conversations: ConversationSummary[] = [
  {
    conversation_id: RC7_CONVERSATION_ID,
    title: "Thermal Analysis RC-7",
    query: RC7_FIRST_QUERY,
    status: "completed",
    timestamp: ago({ hours: 2 }),
    pending: false,
  },
  pastConversation("conv-neutronics-solver-config", "Neutronics Solver Config", 2),
  pastConversation("conv-coolant-loop-review", "Coolant Loop Review", 4),
  pastConversation("conv-cfd-flow-simulation", "CFD Flow Simulation", 6),
  pastConversation("conv-turbulence-model-tuning", "Turbulence Model Tuning", 8),
  pastConversation("conv-boundary-layer-analysis", "Boundary Layer Analysis", 11),
  pastConversation("conv-inlet-pressure-study", "Inlet Pressure Study", 14),
  pastConversation("conv-mesh-refinement-check", "Mesh Refinement Check", 16),
  pastConversation("conv-reactor-assembly-qa", "Reactor Assembly QA", 18),
];

/** The ids of the two B6 artifacts; they are in the `artifact_ids` of the last message only. */
const B6_ARTIFACT_IDS = ["Building_Model_v2.ifc", "structural_analysis.csv"];

const rc7Detail: ConversationDetailResponse = {
  conversation_id: RC7_CONVERSATION_ID,
  title: "Thermal Analysis RC-7",
  profile: "Beginner Chat",
  auto_approve_steps: false,
  messages: [
    { role: "user", content: RC7_FIRST_QUERY, timestamp: ago({ hours: 4, minutes: 12 }), artifact_ids: [] },
    {
      role: "assistant",
      content:
        "Understood. Analyzing reactor assembly RC-7. I've identified 3 sequential stages: (1) CAD geometry validation of RC-7_assembly.step, (2) high-fidelity mesh generation with boundary-layer refinement, (3) thermal-hydraulic solve via the OpenFOAM CFD module. I've drafted a workflow plan 'TH-COUPLED-RC7' for your review, want me to initialize the planner?",
      timestamp: ago({ hours: 4, minutes: 11 }),
      artifact_ids: [],
    },
    {
      role: "user",
      content: "Yes, show me the plan and assign MCNP Neutronics solver to run concurrently.",
      timestamp: ago({ hours: 4, minutes: 10 }),
      artifact_ids: [],
    },
    {
      role: "assistant",
      content: "I've completed the thermal-hydraulic analysis. Here are the generated artifacts:",
      timestamp: ago({ hours: 2 }),
      artifact_ids: B6_ARTIFACT_IDS,
    },
  ],
  artifacts: artifacts.filter((a) => B6_ARTIFACT_IDS.includes(a.artifact_id)),
};

/** The other conversations have a summary only; their detail holds no turns. */
export const conversationDetails: ConversationDetailResponse[] = [
  rc7Detail,
  ...conversations.slice(1).map((c) => ({
    conversation_id: c.conversation_id,
    title: c.title,
    profile: "Beginner Chat",
    auto_approve_steps: false,
    messages: [],
    artifacts: [],
  })),
];

/** RC-7's tool trace (after its first user message) and its suggested replies; the others have none. */
export const activities: ConversationActivity[] = [
  {
    conversation_id: RC7_CONVERSATION_ID,
    tool_traces: [
      {
        trace_id: "trace-rc7-1",
        after_message_index: 0,
        agent_id: "thermal-hydraulic-modeler",
        agent_label: "Thermal-Hydraulic Modeler v2.4",
        lines: [
          { text: "Planning request: loading workflows and selecting capabilities.", tone: "info" },
          { text: "Planner LLM evaluating routing / tool calls.", tone: "info" },
          { text: "Executing Thermal-Hydraulic solver pipeline.", tone: "info" },
          { text: "Solver completed, generating response.", tone: "success" },
        ],
      },
    ],
    suggested_replies: ["Initialize the planner", "Edit the plan first"],
  },
  ...conversations.slice(1).map((c) => ({ conversation_id: c.conversation_id, tool_traces: [], suggested_replies: [] })),
];
