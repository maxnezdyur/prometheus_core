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
 * The Agent Registry (F1) agents, their 5 categories, and the 8 skills of the builder
 * library (C1-C5). The agent ids are the slugs of the Agent Registry store; a `Skill`
 * names the agent that runs it.
 */

import type { Agent, AgentCategory, Skill } from "../../lib/api/contract.ts";

/** In the filter order of F1. */
export const agentCategories: AgentCategory[] = [
  { category_id: "plant-systems", label: "Plant & Systems" },
  { category_id: "core-fuel", label: "Core & Fuel" },
  { category_id: "structural-seismic", label: "Structural & Seismic" },
  { category_id: "licensing-regulatory", label: "Licensing & Regulatory" },
  { category_id: "data-knowledge", label: "Data & Knowledge" },
];

export const agents: Agent[] = [
  {
    agent_id: "cad-geometry-validator",
    name: "CAD Geometry Validator",
    description: "Validates nuclear assembly CAD files against neutronics tolerance limits.",
    version: "1.4",
    category_id: "structural-seismic",
    icon: "box",
    status: "healthy",
    avg_run_seconds: 45,
    success_percent: 99.8,
    latency_ms: 42,
  },
  {
    agent_id: "mesh-generator",
    name: "Mesh Generator",
    description: "Creates multi-million cell hex-dominant meshes optimized for fluid calculations.",
    version: "2.1",
    category_id: "plant-systems",
    icon: "grid",
    status: "healthy",
    avg_run_seconds: 320,
    success_percent: 99.5,
    latency_ms: 89,
  },
  {
    agent_id: "mcnp-neutronics-solver",
    name: "MCNP Neutronics Solver",
    description: "Performs high-fidelity Monte Carlo N-Particle radiation transport simulations.",
    version: "6.3",
    category_id: "core-fuel",
    icon: "activity",
    status: "healthy",
    avg_run_seconds: 4500,
    success_percent: 98.2,
    latency_ms: 156,
  },
  {
    agent_id: "cfd-flow-analyzer",
    name: "CFD Flow Analyzer",
    description: "Computes single-phase convective flow and velocity profiles inside core assemblies.",
    version: "4.2",
    category_id: "plant-systems",
    icon: "wind",
    status: "healthy",
    avg_run_seconds: 1120,
    success_percent: 99.9,
    latency_ms: 67,
  },
  {
    agent_id: "thermal-hydraulic-modeler",
    name: "Thermal-Hydraulic Modeler",
    description: "Subchannel thermal analysis and fuel clad temperature solvers.",
    version: "3.0",
    category_id: "core-fuel",
    icon: "thermometer",
    status: "healthy",
    avg_run_seconds: 720,
    success_percent: 97.6,
    latency_ms: 203,
  },
  {
    agent_id: "dose-rate-calculator",
    name: "Dose Rate Calculator",
    description: "Calculates local biological dosage and shield penetration profiles.",
    version: "1.2",
    category_id: "licensing-regulatory",
    icon: "shield",
    status: "offline",
    avg_run_seconds: 90,
    success_percent: 99.1,
    latency_ms: 34,
  },
  {
    agent_id: "material-properties-lookup",
    name: "Material Properties Lookup",
    description: "Cross-checks design parameters against thermodynamic databases.",
    version: "5.0",
    category_id: "data-knowledge",
    icon: "database",
    status: "healthy",
    avg_run_seconds: 2,
    success_percent: 100,
    latency_ms: 12,
  },
  {
    agent_id: "report-generator",
    name: "Report Generator",
    description: "Compiles simulation data into regulatory nuclear compliance reports.",
    version: "1.0",
    category_id: "licensing-regulatory",
    icon: "file-text",
    status: "healthy",
    avg_run_seconds: 15,
    success_percent: 99.4,
    latency_ms: 78,
  },
];

/** The control skills gate whatever reaches them, so their ports take any type. */
const GATE_IN = [{ name: "results", type: "any" }];
const GATE_OUT = [{ name: "approved_results", type: "any" }];

export const skills: Skill[] = [
  {
    skill_id: "get_material_data",
    name: "Get Material Data",
    version: "1.0",
    category: "data",
    agent_id: "material-properties-lookup",
    inputs: [{ name: "material_id", type: "material_id" }],
    outputs: [{ name: "material_data", type: "material_data" }],
  },
  {
    skill_id: "query_artifact_store",
    name: "Query Artifact Store",
    version: "1.0",
    category: "data",
    agent_id: null,
    inputs: [{ name: "query", type: "query" }],
    outputs: [{ name: "artifacts", type: "artifacts" }],
  },
  {
    skill_id: "analyze_radiation_damage",
    name: "Radiation Damage",
    version: "1.0",
    category: "analysis",
    agent_id: "mcnp-neutronics-solver",
    inputs: [{ name: "material_data", type: "material_data" }],
    outputs: [{ name: "rad_result", type: "rad_result" }],
  },
  {
    skill_id: "analyze_corrosion",
    name: "Corrosion",
    version: "2.1",
    category: "analysis",
    agent_id: "material-properties-lookup",
    inputs: [{ name: "material_data", type: "material_data" }],
    outputs: [{ name: "corr_result", type: "corr_result" }],
  },
  {
    skill_id: "analyze_thermal",
    name: "Thermal",
    version: "1.0",
    category: "analysis",
    agent_id: "thermal-hydraulic-modeler",
    inputs: [{ name: "material_data", type: "material_data" }],
    outputs: [{ name: "therm_result", type: "therm_result" }],
  },
  {
    skill_id: "synthesize_material_analysis",
    name: "Synthesize Report",
    version: "1.0",
    category: "synthesis",
    agent_id: "report-generator",
    inputs: GATE_IN,
    outputs: [{ name: "final_report", type: "final_report" }],
  },
  {
    skill_id: "checkpoint_sme",
    name: "Checkpoint (SME)",
    version: "1.0",
    category: "control",
    agent_id: null,
    inputs: GATE_IN,
    outputs: GATE_OUT,
  },
  {
    skill_id: "qa_gate",
    name: "QA Gate",
    version: "1.0",
    category: "control",
    agent_id: null,
    inputs: GATE_IN,
    outputs: GATE_OUT,
  },
];
