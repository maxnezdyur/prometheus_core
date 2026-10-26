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
 * The work in flight and its outputs: the jobs (B2), the artifacts (F2, B5, B6, D2), the
 * IFC viewer model (B7, B8) and the Approval Queue checkpoints (D2). `agent_version` and
 * `producing_agent_version` record the version that ran, which may differ from the
 * agent's current version.
 */

import type { ArtifactRecord, Checkpoint, Job, ViewerModel } from "../../lib/api/contract.ts";
import { ago } from "./time.ts";

export const JOB_4029_ID = "JOB-4029";
export const MESH_ARTIFACT_ID = "mesh_rc7_assembly.vtk";
export const VIEWER_ARTIFACT_ID = "Building_Model_v2.ifc";
export const CKP_8841_ID = "CKP-8841";

/** The jobs of the RC-7 conversation, as B2 lists them. */
export const jobs: Job[] = [
  {
    job_id: JOB_4029_ID,
    title: "Thermal-Hydraulic Solve [RC-7]",
    status: "solving",
    percent_complete: 72,
    eta_seconds: 12 * 60,
    agent_id: "thermal-hydraulic-modeler",
    agent_version: "2.4",
    conversation_id: "conv-thermal-analysis-rc7",
  },
  {
    job_id: "JOB-4028",
    title: "Mesh Refinement Pipeline",
    status: "finished",
    percent_complete: 100,
    eta_seconds: null,
    agent_id: "mesh-generator",
    agent_version: "1.8",
    conversation_id: "conv-thermal-analysis-rc7",
  },
  {
    job_id: "JOB-4030",
    title: "Neutron Transport Simulation",
    status: "queueing",
    percent_complete: 15,
    eta_seconds: 105 * 60,
    agent_id: "mcnp-neutronics-solver",
    agent_version: "3.0",
    conversation_id: "conv-thermal-analysis-rc7",
  },
];

/** A registry row of F2: its id is `<run_id>-<name>`, as in the Data Management store. */
function runArtifact(
  run_id: string,
  name: string,
  kind: ArtifactRecord["kind"],
  cde_status: ArtifactRecord["cde_status"],
  render_hint: ArtifactRecord["render_hint"],
  producer_agent_id: string,
  size_bytes: number,
  created_at: string,
): ArtifactRecord {
  const format = name.slice(name.lastIndexOf(".") + 1).toUpperCase();
  return {
    artifact_id: `${run_id}-${name}`,
    name,
    description: "",
    tags: [],
    render_hint,
    producer_agent_id,
    created_at,
    kind,
    cde_status,
    format,
    size_bytes,
    run_id,
    job_id: null,
  };
}

export const artifacts: ArtifactRecord[] = [
  // F2: the Data Management registry.
  runArtifact("RUN-3942", "thermal_hydraulic_summary.pdf", "report", "published", "pdf", "thermal-hydraulic-modeler", 12.4e6, ago({ hours: 2 })),
  runArtifact("RUN-3941", "core_mesh_v3.exo", "mesh", "shared", "mesh", "mesh-generator", 1.8e9, ago({ hours: 3 })),
  runArtifact("RUN-3938", "dose_rate_map.csv", "result", "shared", "table", "dose-rate-calculator", 450e6, ago({ hours: 5 })),
  runArtifact("RUN-3935", "cfd_flow_field.vtu", "result", "published", "mesh", "cfd-flow-analyzer", 84e3, ago({ days: 1 })),
  runArtifact("RUN-3930", "neutronics_report.pdf", "report", "published", "pdf", "mcnp-neutronics-solver", 1.2e6, ago({ days: 2 })),
  runArtifact("RUN-3928", "keff_tally_results.csv", "result", "archived", "table", "mcnp-neutronics-solver", 340e6, ago({ days: 3 })),
  // B5: the RC-7 artifact panel.
  {
    artifact_id: "rc7-thermal-distribution-map",
    name: "Thermal Distribution Map",
    description: "VTK visualization of the RC-7 thermal-hydraulic solve, temperature field across the assembly.",
    tags: [],
    render_hint: "mesh",
    producer_agent_id: "thermal-hydraulic-modeler",
    created_at: ago({ hours: 2, minutes: 10 }),
    kind: "mesh",
    cde_status: "shared",
    format: "VTK",
    size_bytes: 18.6e6,
    run_id: null,
    job_id: null,
  },
  {
    artifact_id: "rc7-mesh-quality-report",
    name: "Mesh Quality Report",
    description: "Boundary-layer mesh quality metrics and refinement summary for the CFD run.",
    tags: [],
    render_hint: "report",
    producer_agent_id: "mesh-generator",
    created_at: ago({ minutes: 14 }),
    kind: "report",
    cde_status: "wip",
    format: "PDF",
    size_bytes: 2.1e6,
    run_id: null,
    job_id: "JOB-4028",
  },
  {
    artifact_id: "rc7-neutron-flux-profile",
    name: "Neutron Flux Profile",
    description: "Neutron flux dataset across the core (HDF5), exported from the MCNP solve.",
    tags: [],
    render_hint: "json",
    producer_agent_id: "mcnp-neutronics-solver",
    created_at: ago({ hours: 3 }),
    kind: "result",
    cde_status: "shared",
    format: "HDF5",
    size_bytes: 96.3e6,
    run_id: null,
    job_id: null,
  },
  {
    artifact_id: "rc7-assembly-geometry-model",
    name: "Assembly Geometry Model",
    description: "CAD export of RC-7_assembly.step for geometry review in the viewer.",
    tags: [],
    render_hint: "mesh",
    producer_agent_id: "cad-geometry-validator",
    created_at: ago({ hours: 4 }),
    kind: "mesh",
    cde_status: "published",
    format: "STEP",
    size_bytes: 7.9e6,
    run_id: null,
    job_id: null,
  },
  // B6: the last RC-7 message. `file`, so no viewer fetches content that mock mode lacks.
  {
    artifact_id: VIEWER_ARTIFACT_ID,
    name: "Building_Model_v2.ifc",
    description: "",
    tags: [],
    render_hint: "file",
    producer_agent_id: "thermal-hydraulic-modeler",
    created_at: ago({ hours: 2 }),
    kind: "result",
    cde_status: "shared",
    format: "IFC",
    size_bytes: 24.8e6,
    run_id: null,
    job_id: null,
  },
  {
    artifact_id: "structural_analysis.csv",
    name: "structural_analysis.csv",
    description: "",
    tags: [],
    render_hint: "file",
    producer_agent_id: "thermal-hydraulic-modeler",
    created_at: ago({ hours: 2 }),
    kind: "result",
    cde_status: "shared",
    format: "CSV",
    size_bytes: 1.2e6,
    run_id: null,
    job_id: null,
  },
  // D2: the artifact under review at CKP-8841.
  {
    artifact_id: MESH_ARTIFACT_ID,
    name: "mesh_rc7_assembly.vtk",
    description: "",
    tags: [],
    render_hint: "mesh",
    producer_agent_id: "mesh-generator",
    created_at: ago({ minutes: 14 }),
    kind: "mesh",
    cde_status: "wip",
    format: "VTK",
    size_bytes: 12.4e6,
    run_id: null,
    job_id: "JOB-4028",
  },
];

/** The element tree of the IFC viewer (B7, B8). */
export const viewerModels: ViewerModel[] = [
  {
    artifact_id: VIEWER_ARTIFACT_ID,
    file_name: "Building_Model_v2.ifc",
    versions: ["v2"],
    element_groups: [
      { group: "BUILDING ELEMENTS", elements: ["Walls", "Floors", "Columns", "Beams", "Doors", "Windows", "Roof"] },
      { group: "EQUIPMENT", elements: ["Pump"] },
    ],
  },
];

/** A checkpoint that SME reviewers decided, with no metrics of its own. */
function decided(
  checkpoint_id: string,
  title: string,
  status: "approved" | "revision_requested",
  checkpoint_kind: Checkpoint["checkpoint_kind"],
  required_role_id: string,
  workflow_ref: string,
  decidedMinutesAgo: number,
  confidence_percent: number,
  producing_agent_id: string,
  producing_agent_version: string,
): Checkpoint {
  return {
    checkpoint_id,
    checkpoint_kind,
    required_role_id,
    title,
    priority: "standard",
    status,
    workflow_ref,
    plan_id: null,
    created_at: ago({ hours: 3, minutes: decidedMinutesAgo }),
    decided_at: ago({ minutes: decidedMinutesAgo }),
    confidence_percent,
    producing_agent_id,
    producing_agent_version,
    artifact_id: null,
    metrics: [],
    requirement: null,
  };
}

/** 4 pending (2 urgent), 12 approved within the last hour, 1 revision requested. */
export const checkpoints: Checkpoint[] = [
  {
    checkpoint_id: CKP_8841_ID,
    checkpoint_kind: "step",
    required_role_id: "sme-reviewer",
    title: "Mesh Validation - Fuel Assembly RC-7",
    priority: "urgent",
    status: "pending",
    workflow_ref: "TH-COUPLED-RC7",
    plan_id: "plan-th-coupled-rc7",
    created_at: ago({ minutes: 14 }),
    decided_at: null,
    confidence_percent: 98.4,
    producing_agent_id: "mesh-generator",
    producing_agent_version: "1.8",
    artifact_id: MESH_ARTIFACT_ID,
    metrics: [
      { name: "Cell Count", value_label: "42,198 hex", result: "pass", threshold_label: "40k" },
      { name: "Orthogonal Quality", value_label: "0.88", result: "pass", threshold_label: "0.7" },
      { name: "Aspect Ratio", value_label: "3.2 max", result: "warn", threshold_label: "3.0" },
      { name: "Skewness", value_label: "0.31 avg", result: "pass", threshold_label: "0.5" },
      { name: "Volume Change", value_label: "0.2%", result: "pass", threshold_label: "0.5%" },
      { name: "Boundary Layers", value_label: "5 layers", result: "pass", threshold_label: "4" },
    ],
    requirement: {
      requirement_id: "REQ-TR-842",
      version: "V2.1",
      text: "Fuel assembly coolant velocity must sustain cross-flow mesh bounds under 5.2 m/s transient states without boundary model distortion.",
    },
  },
  {
    checkpoint_id: "CKP-8842",
    checkpoint_kind: "step",
    required_role_id: "sme-reviewer",
    title: "Neutronics Output - Core Loading A3",
    priority: "urgent",
    status: "pending",
    workflow_ref: "NEUTRON-TRANS-A3",
    plan_id: null,
    created_at: ago({ minutes: 28 }),
    decided_at: null,
    confidence_percent: 94.2,
    producing_agent_id: "mcnp-neutronics-solver",
    producing_agent_version: "6.3",
    artifact_id: null,
    metrics: [],
    requirement: null,
  },
  {
    checkpoint_id: "CKP-8839",
    checkpoint_kind: "final",
    required_role_id: "platform-admin",
    title: "Structural FEA Approval - RPV Nozzle",
    priority: "standard",
    status: "pending",
    workflow_ref: "STRESS-QUAL-WELD",
    plan_id: null,
    created_at: ago({ hours: 1, minutes: 10 }),
    decided_at: null,
    confidence_percent: 91.5,
    producing_agent_id: "cad-geometry-validator",
    producing_agent_version: "1.4",
    artifact_id: null,
    metrics: [],
    requirement: null,
  },
  {
    checkpoint_id: "CKP-8845",
    checkpoint_kind: "step",
    required_role_id: "sme-reviewer",
    title: "CFD Results Verification - Coolant Delta-T",
    priority: "standard",
    status: "pending",
    workflow_ref: "COOLANT-CFD-D-T",
    plan_id: null,
    created_at: ago({ hours: 2, minutes: 5 }),
    decided_at: null,
    confidence_percent: 96.8,
    producing_agent_id: "cfd-flow-analyzer",
    producing_agent_version: "4.2",
    artifact_id: null,
    metrics: [],
    requirement: null,
  },
  decided("CKP-8838", "Mesh Validation - Upper Plenum", "approved", "step", "sme-reviewer", "TH-COUPLED-RC7", 4, 97.9, "mesh-generator", "1.8"),
  decided("CKP-8837", "Thermal Margin Check - Hot Channel", "approved", "step", "design-engineer", "TH-COUPLED-RC7", 8, 95.6, "thermal-hydraulic-modeler", "2.4"),
  decided("CKP-8836", "Neutronics Output - Control Rod Worth", "approved", "step", "sme-reviewer", "NEUTRON-TRANS-A3", 11, 93.8, "mcnp-neutronics-solver", "6.3"),
  decided("CKP-8835", "CAD Geometry Check - Spacer Grid", "approved", "plan", "design-engineer", "STRESS-QUAL-WELD", 15, 99.1, "cad-geometry-validator", "1.4"),
  decided("CKP-8834", "CFD Results Verification - Downcomer Flow", "approved", "step", "sme-reviewer", "COOLANT-CFD-D-T", 19, 96.2, "cfd-flow-analyzer", "4.2"),
  decided("CKP-8833", "Dose Rate Review - Spent Fuel Pool", "approved", "final", "licensing-analyst", "NEUTRON-TRANS-A3", 23, 92.7, "dose-rate-calculator", "1.2"),
  decided("CKP-8832", "Material Data Check - SS316 Cladding", "approved", "plan", "design-engineer", "STRESS-QUAL-WELD", 27, 99.6, "material-properties-lookup", "5.0"),
  decided("CKP-8831", "Report Review - Thermal Summary RC-7", "approved", "final", "licensing-analyst", "TH-COUPLED-RC7", 31, 98.0, "report-generator", "1.0"),
  decided("CKP-8830", "Mesh Validation - Lower Plenum", "approved", "step", "sme-reviewer", "TH-COUPLED-RC7", 36, 97.3, "mesh-generator", "1.8"),
  decided("CKP-8829", "Neutronics Output - Burnup Step 4", "approved", "step", "sme-reviewer", "NEUTRON-TRANS-A3", 41, 94.9, "mcnp-neutronics-solver", "6.3"),
  decided("CKP-8828", "Thermal Margin Check - Bypass Flow", "approved", "step", "design-engineer", "COOLANT-CFD-D-T", 46, 95.1, "thermal-hydraulic-modeler", "2.4"),
  decided("CKP-8827", "Structural FEA Approval - Core Barrel", "approved", "final", "platform-admin", "STRESS-QUAL-WELD", 52, 92.4, "cad-geometry-validator", "1.4"),
  decided("CKP-8843", "CFD Results Verification - Inlet Plenum Mixing", "revision_requested", "step", "sme-reviewer", "COOLANT-CFD-D-T", 33, 88.7, "cfd-flow-analyzer", "4.2"),
];
