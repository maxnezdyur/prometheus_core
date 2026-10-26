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
 * The workflow templates (D1), the versions of Comprehensive Material Analysis (C7), the
 * graphs of every workflow, the builder drafts (C1, C5, C6), and the RC-7 plan (D1). A node
 * label is the name of its skill in the library, so "Get Material Data", not "Retrieve
 * Material". The checkpoint and agent counts are computed from a graph, not stored.
 */

import type { GraphNode, Plan, Workflow, WorkflowGraph, WorkflowVersion } from "../../lib/api/contract.ts";
import { skills } from "./agents.ts";
import { ago } from "./time.ts";

export const MATERIAL_ANALYSIS_WORKFLOW_ID = "comprehensive_material_analysis";
export const C1_DRAFT_GRAPH_ID = "graph-builder-draft";
export const C5_INVALID_GRAPH_ID = "graph-invalid-wiring";
export const C6_TWEAK_GRAPH_ID = "graph-tweak-draft";
export const PLAN_GRAPH_ID = "graph-plan-th-coupled-rc7";
export const PLAN_ID = "plan-th-coupled-rc7";

/** `[from_node, from_port, to_node, to_port]` */
type Wire = [string, string, string, string];

/** A node of `skill_id`: its kind follows the control skills, its label is the skill name. */
function node(node_id: string, skill_id: string, extra: Partial<GraphNode> = {}): GraphNode {
  const skill = skills.find((s) => s.skill_id === skill_id);
  if (!skill) throw new Error(`unknown skill ${skill_id}`);
  const kind = skill_id === "checkpoint_sme" ? "checkpoint" : skill_id === "qa_gate" ? "qa_gate" : "skill";
  return {
    node_id,
    kind,
    skill_id,
    label: skill.name,
    status: null,
    estimated_seconds: null,
    inputs: [],
    output_context: null,
    added_in_draft: false,
    ...extra,
  };
}

/** The Radiation Damage inputs as the C1 inspector shows them. */
const RADIATION_INPUTS: GraphNode["inputs"] = [
  { port: "material_id", source: "input.material_id", optional: false },
  { port: "neutron_flux", source: null, optional: true },
  { port: "temperature_c", source: "input.context", optional: false },
];

function radiation(node_id: string, extra: Partial<GraphNode> = {}): GraphNode {
  return node(node_id, "analyze_radiation_damage", { inputs: RADIATION_INPUTS, output_context: "radiation", ...extra });
}

/**
 * A graph whose wires become its edges. A node with no explicit inputs takes one input per
 * wire into it; the root Get Material Data node reads `input.material_id`.
 */
function graph(graph_id: string, workflow_id: string | null, nodes: GraphNode[], wires: Wire[]): WorkflowGraph {
  return {
    graph_id,
    workflow_id,
    nodes: nodes.map((n) => {
      if (n.inputs.length > 0) return n;
      const incoming = wires.filter((w) => w[2] === n.node_id);
      const inputs =
        incoming.length > 0
          ? incoming.map(([from, fromPort, , toPort]) => ({ port: toPort, source: `${from}.${fromPort}`, optional: false }))
          : [{ port: "material_id", source: "input.material_id", optional: false }];
      return { ...n, inputs };
    }),
    edges: wires.map(([from_node, from_port, to_node, to_port], i) => ({
      edge_id: `${graph_id}-e${i + 1}`,
      from_node,
      from_port,
      to_node,
      to_port,
    })),
  };
}

/** Get Material Data fans out to the three analyses. */
const FAN_OUT: Wire[] = [
  ["material", "material_data", "radiation", "material_data"],
  ["material", "material_data", "corrosion", "material_data"],
  ["material", "material_data", "thermal", "material_data"],
];

/** The three analyses join into `target`. */
function fanIn(target: string): Wire[] {
  return [
    ["radiation", "rad_result", target, "results"],
    ["corrosion", "corr_result", target, "results"],
    ["thermal", "therm_result", target, "results"],
  ];
}

const fullCoreGraph = graph(
  "graph-full-core-thermal-analysis",
  "full_core_thermal_analysis",
  [
    node("material", "get_material_data"),
    node("checkpoint-inputs", "checkpoint_sme"),
    node("thermal", "analyze_thermal"),
    radiation("radiation"),
    node("checkpoint-results", "checkpoint_sme"),
    node("report", "synthesize_material_analysis"),
    node("checkpoint-report", "checkpoint_sme"),
  ],
  [
    ["material", "material_data", "checkpoint-inputs", "results"],
    ["checkpoint-inputs", "approved_results", "thermal", "material_data"],
    ["checkpoint-inputs", "approved_results", "radiation", "material_data"],
    ["thermal", "therm_result", "checkpoint-results", "results"],
    ["radiation", "rad_result", "checkpoint-results", "results"],
    ["checkpoint-results", "approved_results", "report", "results"],
    ["report", "final_report", "checkpoint-report", "results"],
  ],
);

const shieldingGraph = graph(
  "graph-shielding-design-optimization",
  "shielding_design_optimization",
  [
    node("material", "get_material_data"),
    radiation("radiation"),
    node("corrosion", "analyze_corrosion"),
    node("thermal", "analyze_thermal"),
    node("checkpoint-results", "checkpoint_sme"),
    node("report", "synthesize_material_analysis"),
    node("checkpoint-report", "checkpoint_sme"),
  ],
  [
    ...FAN_OUT,
    ...fanIn("checkpoint-results"),
    ["checkpoint-results", "approved_results", "report", "results"],
    ["report", "final_report", "checkpoint-report", "results"],
  ],
);

const stressGraph = graph(
  "graph-component-stress-qualification",
  "component_stress_qualification",
  [
    node("material", "get_material_data"),
    node("checkpoint-inputs", "checkpoint_sme"),
    node("corrosion", "analyze_corrosion"),
    node("thermal", "analyze_thermal"),
    node("checkpoint-corrosion", "checkpoint_sme"),
    node("checkpoint-thermal", "checkpoint_sme"),
    node("report", "synthesize_material_analysis"),
    node("checkpoint-report", "checkpoint_sme"),
  ],
  [
    ["material", "material_data", "checkpoint-inputs", "results"],
    ["checkpoint-inputs", "approved_results", "corrosion", "material_data"],
    ["checkpoint-inputs", "approved_results", "thermal", "material_data"],
    ["corrosion", "corr_result", "checkpoint-corrosion", "results"],
    ["thermal", "therm_result", "checkpoint-thermal", "results"],
    ["checkpoint-corrosion", "approved_results", "report", "results"],
    ["checkpoint-thermal", "approved_results", "report", "results"],
    ["report", "final_report", "checkpoint-report", "results"],
  ],
);

const fuelQaGraph = graph(
  "graph-fuel-assembly-qa-pipeline",
  "fuel_assembly_qa_pipeline",
  [
    node("material", "get_material_data"),
    radiation("radiation"),
    node("checkpoint-results", "checkpoint_sme"),
    node("report", "synthesize_material_analysis"),
    node("checkpoint-report", "checkpoint_sme"),
  ],
  [
    ["material", "material_data", "radiation", "material_data"],
    ["radiation", "rad_result", "checkpoint-results", "results"],
    ["checkpoint-results", "approved_results", "report", "results"],
    ["report", "final_report", "checkpoint-report", "results"],
  ],
);

/** v1.2.0: the QA Gate after the parallel analyses, the SME Review below it. */
const materialAnalysisGraph = graph(
  "graph-comprehensive-material-analysis",
  MATERIAL_ANALYSIS_WORKFLOW_ID,
  [
    node("material", "get_material_data"),
    radiation("radiation"),
    node("corrosion", "analyze_corrosion"),
    node("thermal", "analyze_thermal"),
    node("qa-gate", "qa_gate"),
    node("sme-review", "checkpoint_sme"),
    node("report", "synthesize_material_analysis"),
  ],
  [
    ...FAN_OUT,
    ...fanIn("qa-gate"),
    ["qa-gate", "approved_results", "sme-review", "results"],
    ["sme-review", "approved_results", "report", "results"],
  ],
);

/** C1: the draft on the builder canvas, with the Radiation Damage inspector inputs. */
const builderDraftGraph = graph(
  C1_DRAFT_GRAPH_ID,
  null,
  [
    node("material", "get_material_data"),
    radiation("radiation"),
    node("corrosion", "analyze_corrosion"),
    node("thermal", "analyze_thermal"),
    node("report", "synthesize_material_analysis"),
  ],
  [...FAN_OUT, ...fanIn("report")],
);

/**
 * C5: the Mesh Generator `mesh` output wired to the Radiation Damage `material_data` input,
 * so the builder shows "Type mismatch: mesh → material_data". No library skill makes a mesh,
 * so the Mesh Generator node names no skill.
 */
const invalidWiringGraph = graph(
  C5_INVALID_GRAPH_ID,
  null,
  [
    {
      node_id: "mesh",
      kind: "skill",
      skill_id: null,
      label: "Mesh Generator",
      status: null,
      estimated_seconds: null,
      inputs: [{ port: "material_id", source: "input.material_id", optional: false }],
      output_context: null,
      added_in_draft: false,
    },
    radiation("radiation"),
    node("report", "synthesize_material_analysis"),
  ],
  [
    ["mesh", "mesh", "radiation", "material_data"],
    ["radiation", "rad_result", "report", "results"],
  ],
);

/** The D1 plan nodes of RC-7 with their run status and estimate. */
const planNodes: GraphNode[] = [
  node("material", "get_material_data", { status: "done", estimated_seconds: 8 }),
  radiation("radiation", { status: "queued", estimated_seconds: 40 }),
  node("corrosion", "analyze_corrosion", { status: "queued", estimated_seconds: 35 }),
  node("thermal", "analyze_thermal", { status: "queued", estimated_seconds: 50 }),
  node("sme-review", "checkpoint_sme"),
  node("report", "synthesize_material_analysis", { status: "blocked", estimated_seconds: 15 }),
];

/** D1: exactly one checkpoint node, so the plan shows 1 checkpoint. */
const planGraph = graph(PLAN_GRAPH_ID, MATERIAL_ANALYSIS_WORKFLOW_ID, planNodes, [
  ...FAN_OUT,
  ...fanIn("sme-review"),
  ["sme-review", "approved_results", "report", "results"],
]);

/** C6: the plan with a QA Gate added after the analyses, before the SME Review. */
const tweakDraftGraph = graph(
  C6_TWEAK_GRAPH_ID,
  MATERIAL_ANALYSIS_WORKFLOW_ID,
  [...planNodes.slice(0, 4), node("qa-gate", "qa_gate", { added_in_draft: true }), ...planNodes.slice(4)],
  [
    ...FAN_OUT,
    ...fanIn("qa-gate"),
    ["qa-gate", "approved_results", "sme-review", "results"],
    ["sme-review", "approved_results", "report", "results"],
  ],
);

export const graphs: WorkflowGraph[] = [
  fullCoreGraph,
  shieldingGraph,
  stressGraph,
  fuelQaGraph,
  materialAnalysisGraph,
  builderDraftGraph,
  invalidWiringGraph,
  planGraph,
  tweakDraftGraph,
];

/** The 4 D1 templates, then Comprehensive Material Analysis. */
export const workflows: Workflow[] = [
  {
    workflow_id: "full_core_thermal_analysis",
    name: "Full Core Thermal Analysis",
    version: "1.0",
    complexity: "complex",
    estimated_runtime_seconds: 90 * 60,
    speedup: 4.2,
    graph_id: fullCoreGraph.graph_id,
  },
  {
    workflow_id: "shielding_design_optimization",
    name: "Shielding Design Optimization",
    version: "2.1",
    complexity: "complex",
    estimated_runtime_seconds: 165 * 60,
    speedup: 6.1,
    graph_id: shieldingGraph.graph_id,
  },
  {
    workflow_id: "component_stress_qualification",
    name: "Component Stress Qualification",
    version: "1.0",
    complexity: "moderate",
    estimated_runtime_seconds: 40 * 60,
    speedup: 3.8,
    graph_id: stressGraph.graph_id,
  },
  {
    workflow_id: "fuel_assembly_qa_pipeline",
    name: "Fuel Assembly QA Pipeline",
    version: "1.0",
    complexity: "simple",
    estimated_runtime_seconds: 10 * 60,
    speedup: 5.5,
    graph_id: fuelQaGraph.graph_id,
  },
  {
    workflow_id: MATERIAL_ANALYSIS_WORKFLOW_ID,
    name: "Comprehensive Material Analysis",
    version: "1.2.0",
    complexity: "moderate",
    estimated_runtime_seconds: 8 + 50 + 15,
    speedup: 2.0,
    graph_id: materialAnalysisGraph.graph_id,
  },
];

/** The latest version of Comprehensive Material Analysis: 9 + 3 = 12 runs. */
export const MATERIAL_ANALYSIS_V1_2_0: WorkflowVersion = {
  version: "1.2.0",
  summary: "+ QA Gate after analyses",
  author: "V. Kerimov",
  created_at: ago({ days: 2 }),
  derived_from: "1.1.0",
  changes: [
    { op: "add", text: "Added QA Gate checkpoint after the parallel analyses" },
    { op: "change", text: "SME Review moved below the new QA Gate" },
  ],
  invalidated_runs: [{ skill_id: "synthesize_material_analysis", count: 3 }],
  runs_by_project: [
    { project_name: "MARVEL Reactor Project", runs: 9 },
    { project_name: "Fuel Assembly QA — RC-7", runs: 3 },
  ],
  last_run_at: ago({ hours: 4 }),
  last_run_conversation_id: "conv-thermal-analysis-rc7",
};

/** The versions of each workflow, newest first, keyed by `workflow_id`. */
export const workflowVersions: Record<string, WorkflowVersion[]> = {
  full_core_thermal_analysis: [],
  shielding_design_optimization: [],
  component_stress_qualification: [],
  fuel_assembly_qa_pipeline: [],
  [MATERIAL_ANALYSIS_WORKFLOW_ID]: [
    MATERIAL_ANALYSIS_V1_2_0,
    {
      version: "1.1.0",
      summary: "Swapped Thermal agent v1.8→v2.0",
      author: "Dr. Halsey",
      created_at: ago({ days: 25 }),
      derived_from: "1.0.0",
      changes: [],
      invalidated_runs: [],
      runs_by_project: [],
      last_run_at: null,
      last_run_conversation_id: null,
    },
    {
      version: "1.0.0",
      summary: "Initial template",
      author: "platform-team",
      created_at: ago({ days: 44 }),
      derived_from: null,
      changes: [],
      invalidated_runs: [],
      runs_by_project: [],
      last_run_at: null,
      last_run_conversation_id: null,
    },
  ],
};

/** D1: the RC-7 plan 'TH-COUPLED-RC7' on Comprehensive Material Analysis v1.2.0. */
export const plans: Plan[] = [
  {
    plan_id: PLAN_ID,
    workflow_id: MATERIAL_ANALYSIS_WORKFLOW_ID,
    workflow_version: "1.2.0",
    conversation_id: "conv-thermal-analysis-rc7",
    graph_id: PLAN_GRAPH_ID,
    orchestrator_status: "running",
    mode: "dag",
    input_files: ["RC-7_assembly.step", "inlet_velocity_vector.config"],
    expected_outputs: ["TH_validation_report.pdf", "velocity_vectors.vtu"],
  },
];
