/**
 * SPG (Student Project Group) typed data models and fallback repository
 * strictly matching server/app/schemas/spgs.py and server/app/schemas/spg_reports.py
 */

export type SPGType = "learning" | "project" | "event" | "external_event" | "miscellaneous";
export type SPGTrack = "kaggle" | "product" | "research" | "general";
export type SPGVisibility = "public" | "private";
export type SPGStatus = "active" | "paused" | "completed" | "disbanded";

export interface SPGRecord {
  id: string;
  name: string;
  description?: string;
  type: SPGType;
  track: SPGTrack;
  visibility: SPGVisibility;
  status: SPGStatus;
  lead_id: string;
  lead_name?: string;
  member_ids: string[];
  member_names?: Record<string, string>;
  is_recruiting: boolean;
  recruiting_roles: string[];
  event_id?: string;
  is_event_derived?: boolean;
  idea_id?: string;
  proposition_document_url?: string;
  source_ticket_id?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
  report_count: number;
}

export type SPGReportType = "progress" | "final";
export type SPGReportFormat = "form" | "pdf";
export type SPGReportStatus = "pending" | "verified";

export interface SPGReportRecord {
  id: string;
  spg_id: string;
  report_type: SPGReportType;
  report_format: SPGReportFormat;
  heading: string;
  short_description: string;
  sequence_number: number;
  pdf_url?: string;
  summary?: string;
  milestones: string[];
  blockers?: string;
  next_steps?: string;
  submitted_by: string;
  submitter_name?: string;
  submitted_at: string;
  status: SPGReportStatus;
  verified_by?: string;
  verified_at?: string;
}

export interface SPGFormReportSubmission {
  heading: string;
  short_description: string;
  report_type: SPGReportType;
  summary: string;
  milestones: string[];
  blockers?: string;
  next_steps?: string;
}

export const fallbackSpgs: SPGRecord[] = [
  {
    id: "spg_drone_swarms",
    name: "Autonomous Drone Swarms (SwarmRL)",
    description:
      "Developing decentralized multi-agent reinforcement learning architectures for tactical swarm coordination and navigation in GPS-denied environments.",
    type: "project",
    track: "research",
    visibility: "public",
    status: "active",
    lead_id: "usr_julian_chen",
    lead_name: "Julian Chen",
    member_ids: ["usr_julian_chen", "usr_ananya_kumar", "usr_rohan_das", "usr_tanya_levine"],
    member_names: {
      usr_julian_chen: "Julian Chen",
      usr_ananya_kumar: "Ananya Kumar",
      usr_rohan_das: "Rohan Das",
      usr_tanya_levine: "Tanya Levine",
    },
    is_recruiting: true,
    recruiting_roles: ["PyTorch / Isaac Gym Engineer", "Embedded ROS2 Developer"],
    is_event_derived: false,
    proposition_document_url: "https://reinforce-sst.org/propositions/swarm-rl-v1.pdf",
    created_at: "2025-07-15T10:00:00Z",
    updated_at: "2025-09-20T14:30:00Z",
    report_count: 4,
  },
  {
    id: "spg_decentralized_compute",
    name: "Decentralized Compute & P2P GPU Brokerage",
    description:
      "High-throughput architecture for peer-to-peer GPU resource brokerage, automated worker verification, and smart-contract settlement for AI training.",
    type: "project",
    track: "product",
    visibility: "public",
    status: "active",
    lead_id: "usr_maya_sen",
    lead_name: "Maya Sen",
    member_ids: ["usr_maya_sen", "usr_rohan_das", "usr_tanya_levine"],
    member_names: {
      usr_maya_sen: "Maya Sen",
      usr_rohan_das: "Rohan Das",
      usr_tanya_levine: "Tanya Levine",
    },
    is_recruiting: true,
    recruiting_roles: ["FastAPI Systems Backend", "Rust / WASM Engineer"],
    is_event_derived: true,
    event_id: "evt_hacksprint_v3",
    proposition_document_url: "https://reinforce-sst.org/propositions/p2p-gpu-network.pdf",
    created_at: "2025-08-01T12:00:00Z",
    updated_at: "2025-09-22T18:00:00Z",
    report_count: 8,
  },
  {
    id: "spg_llm_benchmark",
    name: "LLM Inference Efficiency Benchmark 2025",
    description:
      "NeurIPS competition team engineering continuous batching, custom Triton kernels, and 4-bit KV caching for sub-10ms time-to-first-token on 70B+ LLMs.",
    type: "external_event",
    track: "kaggle",
    visibility: "public",
    status: "active",
    lead_id: "usr_ananya_kumar",
    lead_name: "Ananya Kumar",
    member_ids: ["usr_ananya_kumar", "usr_julian_chen", "usr_karthik_v"],
    member_names: {
      usr_ananya_kumar: "Ananya Kumar",
      usr_julian_chen: "Julian Chen",
      usr_karthik_v: "Karthik Verma",
    },
    is_recruiting: false,
    recruiting_roles: [],
    created_at: "2025-08-10T09:30:00Z",
    updated_at: "2025-09-24T11:00:00Z",
    report_count: 6,
  },
  {
    id: "spg_quantum_gates",
    name: "Quantum Gate Noise Resilience Simulation",
    description:
      "Building high-fidelity GPU simulations for noise-resilient quantum circuits and variational quantum eigensolvers on classical CUDA clusters.",
    type: "learning",
    track: "research",
    visibility: "public",
    status: "active",
    lead_id: "usr_rohan_das",
    lead_name: "Rohan Das",
    member_ids: ["usr_rohan_das", "usr_maya_sen"],
    member_names: {
      usr_rohan_das: "Rohan Das",
      usr_maya_sen: "Maya Sen",
    },
    is_recruiting: true,
    recruiting_roles: ["Quantum Information Theorist", "Qiskit Researcher"],
    created_at: "2025-08-18T14:00:00Z",
    updated_at: "2025-09-18T16:00:00Z",
    report_count: 1,
  },
  {
    id: "spg_multimodal_ecg",
    name: "Multimodal Foundation Model for Clinical ECG",
    description:
      "Fine-tuning open weights models on federated clinical trial datasets for automated multi-lead ECG interpretation and arrhythmia risk scoring.",
    type: "project",
    track: "research",
    visibility: "public",
    status: "active",
    lead_id: "usr_julian_chen",
    lead_name: "Julian Chen",
    member_ids: ["usr_julian_chen", "usr_maya_sen", "usr_ananya_kumar"],
    member_names: {
      usr_julian_chen: "Julian Chen",
      usr_maya_sen: "Maya Sen",
      usr_ananya_kumar: "Ananya Kumar",
    },
    is_recruiting: false,
    recruiting_roles: [],
    proposition_document_url: "https://reinforce-sst.org/propositions/ecg-foundation.pdf",
    created_at: "2025-07-28T11:00:00Z",
    updated_at: "2025-09-15T09:00:00Z",
    report_count: 5,
  },
  {
    id: "spg_vision_grounding",
    name: "Temporal Vision-Language Grounding",
    description:
      "Kaggle challenge solving spatial-temporal relationship grounding and frame-accurate action localization on high-framerate dynamic video streams.",
    type: "external_event",
    track: "kaggle",
    visibility: "public",
    status: "completed",
    lead_id: "usr_tanya_levine",
    lead_name: "Tanya Levine",
    member_ids: ["usr_tanya_levine", "usr_julian_chen"],
    member_names: {
      usr_tanya_levine: "Tanya Levine",
      usr_julian_chen: "Julian Chen",
    },
    is_recruiting: false,
    recruiting_roles: [],
    created_at: "2025-06-01T10:00:00Z",
    updated_at: "2025-08-30T17:00:00Z",
    completed_at: "2025-08-30T17:00:00Z",
    report_count: 4,
  },
];

export const fallbackReports: Record<string, SPGReportRecord[]> = {
  spg_drone_swarms: [
    {
      id: "rep_swarm_1",
      spg_id: "spg_drone_swarms",
      report_type: "progress",
      report_format: "form",
      heading: "Phase 1: Multi-Agent Environment Simulation Baseline",
      short_description:
        "Completed PettingZoo & Isaac Gym integration with 64 synchronized drone agents.",
      sequence_number: 1,
      summary:
        "We successfully set up the physics engine simulation using Isaac Gym and PettingZoo. Benchmarked inference throughput on single RTX 4090 GPU achieving 120k FPS in headless mode. Established baseline rewards for obstacle avoidance and goal orientation.",
      milestones: [
        "Constructed 3D obstacle terrain with dynamic wind vectors",
        "Implemented decentralized observation matrix for local LiDAR scans",
        "Achieved convergence on 10-agent collision avoidance within 2M steps",
      ],
      blockers: "GPU memory fragmentation when scaling past 128 concurrent agents in Isaac Gym.",
      next_steps: "Implement PagedAttention-style memory pooling and test MAPPO value decomposition.",
      submitted_by: "usr_julian_chen",
      submitter_name: "Julian Chen",
      submitted_at: "2025-08-05T14:30:00Z",
      status: "verified",
      verified_by: "admin_core",
      verified_at: "2025-08-06T10:00:00Z",
    },
    {
      id: "rep_swarm_2",
      spg_id: "spg_drone_swarms",
      report_type: "progress",
      report_format: "pdf",
      heading: "Phase 2: MAPPO vs QMIX Convergence Benchmarks",
      short_description:
        "Comprehensive architectural analysis comparing value factorization algorithms.",
      sequence_number: 2,
      pdf_url: "https://reinforce-sst.org/reports/swarm-rl-phase2.pdf",
      milestones: [],
      submitted_by: "usr_ananya_kumar",
      submitter_name: "Ananya Kumar",
      submitted_at: "2025-08-22T18:00:00Z",
      status: "verified",
      verified_by: "admin_core",
      verified_at: "2025-08-23T11:30:00Z",
    },
    {
      id: "rep_swarm_3",
      spg_id: "spg_drone_swarms",
      report_type: "progress",
      report_format: "form",
      heading: "Phase 3: Hardware-in-the-Loop Micro-ROS Testing",
      short_description:
        "Tested embedded policy execution on Crazyflie 2.1 drones via STM32 microcontrollers.",
      sequence_number: 3,
      summary:
        "Successfully flashed quantized int8 policy weights to STM32 microcontroller. Latency is within 4.2ms per control loop step. Validated formation flight in lab cage with 4 physical drones.",
      milestones: [
        "Quantized PyTorch actor weights to 8-bit integer precision",
        "Configured Micro-ROS serial bridge over 2.4GHz radio",
        "Maintained stable triangular formation during sudden thrust perturbation",
      ],
      blockers: "Battery life limits flight tests to 7 minutes per session.",
      next_steps: "Implement automated landing and charging pad dock detection.",
      submitted_by: "usr_rohan_das",
      submitter_name: "Rohan Das",
      submitted_at: "2025-09-10T16:15:00Z",
      status: "verified",
      verified_by: "admin_core",
      verified_at: "2025-09-11T09:00:00Z",
    },
    {
      id: "rep_swarm_4",
      spg_id: "spg_drone_swarms",
      report_type: "progress",
      report_format: "form",
      heading: "Phase 4: GPS-Denied Swarm Relocalization",
      short_description:
        "Integrated visual-inertial odometry with cooperative peer-to-peer relative ranging.",
      sequence_number: 4,
      summary:
        "Developed cooperative ranging algorithm using ultra-wideband (UWB) modules to compensate for camera drift. Swarm position error reduced by 64% over a 50-meter trajectory.",
      milestones: [
        "Mounted Decawave DWM1000 UWB transceivers onto airframes",
        "Implemented decentralized Extended Kalman Filter (EKF) state estimation",
        "Validated obstacle mapping across indoor multi-room corridor",
      ],
      blockers: "Multipath interference in narrow metallic hallways.",
      next_steps: "Prepare final project demonstration for the Autumn Club Showcase.",
      submitted_by: "usr_julian_chen",
      submitter_name: "Julian Chen",
      submitted_at: "2025-09-20T14:30:00Z",
      status: "pending",
    },
  ],
  spg_decentralized_compute: [
    {
      id: "rep_compute_1",
      spg_id: "spg_decentralized_compute",
      report_type: "progress",
      report_format: "form",
      heading: "Sprint 1: P2P Matchmaking Engine & Heartbeat Protocol",
      short_description:
        "Worker node discovery and proof-of-compute heartbeat daemon implemented in Rust.",
      sequence_number: 1,
      summary:
        "Implemented libp2p gossipsub protocol for distributed node discovery. Worker nodes report GPU hardware specifications, CUDA version, and availability via cryptographic signed heartbeats.",
      milestones: [
        "Worker node daemon compiled and tested on Linux & Windows WSL2",
        "Implemented automated hardware benchmarking suite using nvml-wrapper",
        "Secured peer communication with Ed25519 signature verification",
      ],
      blockers: "NAT traversal issues behind restrictive university firewalls.",
      next_steps: "Implement STUN/TURN relay fallback nodes.",
      submitted_by: "usr_maya_sen",
      submitter_name: "Maya Sen",
      submitted_at: "2025-08-15T10:00:00Z",
      status: "verified",
      verified_by: "admin_core",
      verified_at: "2025-08-16T12:00:00Z",
    },
  ],
};
