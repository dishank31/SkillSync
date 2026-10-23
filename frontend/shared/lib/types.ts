export type FeedbackItem = {
  code: string;
  message: string;
  severity: string;
};

export type StepInfo = {
  id: string;
  dwell_time_ms: number;
};

export type DecayPrediction = {
  student_id: string;
  total_sessions: number;
  last_session_date: string | null;
  last_score: number;
  decay_rate: number;
  current_competency: number;
  projected_decay_date: string | null;
  days_until_decay: number | null;
  refresher_date: string | null;
  refresher_needed: boolean;
  cognitive_stability_days?: number;
  motor_stability_days?: number;
  declarative_cognitive_retention_24h?: number;
  declarative_cognitive_retention_7d?: number;
  procedural_motor_retention_24h?: number;
  procedural_motor_retention_7d?: number;
  intervention_recommendation?: string;
};

export type SessionRecord = {
  id: number;
  procedure_id: string;
  difficulty: string;
  completed_at: string | null;
  final_score: number;
  duration_ms: number;
  attempt_count: number;
  avg_hesitation_ms: number;
  tremor_score: number;
  passed: boolean;
};

export type MetricStatus = "within_range" | "outside_range" | "unavailable";

export type SessionReport = {
  student_id: string;
  procedure_id: string;
  difficulty: string;
  final_score: number;
  final_score_pct: number;
  duration_ms: number;
  completed_steps: string[];
  failed_attempts: number;
  time_to_first_valid_hold_ms: number | null;
  observed_frames: number;
  estimated_frames: number;
  total_frames: number;
  coverage_pct: number;
  avg_hesitation_ms: number;
  avg_deviation: number;
  tremor_score: number;
  step_breakdown: Record<string, {
    failed_attempts: number;
    valid_observed_frames: number;
    coverage_pct: number;
    avg_deviation: number;
  }>;
  recommended_repeats: string[];
  recommendation: string;
};

export type DetectionStateType = "no_hand" | "hand_detected" | "partial_or_unreliable" | "tracking_recovered";

export type CognitiveMotorState =
  | "SYNCHRONIZED_MASTERY"
  | "MOTOR_EXECUTION_DRIFT"
  | "COGNITIVE_PROTOCOL_CONTRADICTION"
  | "SEMANTIC_HESITATION_OR_OMISSION"
  | "DUAL_PATHWAY_FAILURE";

export type FrameSemanticTuple = {
  step_index: number;
  raw_text: string;
  action_predicate: string;
  anatomical_articulator: string;
  kinematic_qualifier: string;
  hold_duration_sec: number;
  verbal_hypothesis: string;
  matched_primitive_id?: string | null;
  similarity_score?: number | null;
  target_angles: Record<string, { min: number; max: number }>;
  target_distances: Record<string, { min: number; max: number }>;
  hysteresis_exit_bands: Record<string, { min: number; max: number }>;
};

export type SOPCompilerResult = {
  procedure_schema: {
    procedure_id: string;
    steps: Array<{
      id: string;
      name?: string | null;
      description?: string | null;
      method?: string | null;
      constraints: {
        angles: Record<string, { min: number; max: number }>;
        distances: Record<string, { min?: number; max?: number }>;
      };
      dwell_time_ms: number;
      next_step: string;
      verbal_hypothesis?: string | null;
    }>;
  };
  frame_semantics: FrameSemanticTuple[];
  raw_paragraph: string;
};

export type FrameResponse = {
  step: string;
  step_name?: string;
  step_hypothesis?: string;
  valid: boolean;
  score: number;
  composite_score?: number;
  feedback: FeedbackItem[];
  landmarks?: number[][];
  joint_confidence?: Record<string, number>;
  landmarks_estimated?: boolean;
  frame_is_observed?: boolean;
  detection_state?: DetectionStateType;
  angles?: Record<string, number | null>;
  distances?: Record<string, number | null>;
  metric_targets?: Record<string, { min?: number; max?: number }>;
  metric_deviations?: Record<string, number | null>;
  metric_statuses?: Record<string, MetricStatus>;
  procedure_steps?: StepInfo[];
  reset?: boolean;
  difficulty?: string;
  session_saved?: boolean;
  session_report?: SessionReport | null;

  // CCNLP NLP Pillar 2: Verbal-Motor Entailment
  alignment_state?: CognitiveMotorState;
  p_entailment?: number;
  p_neutral?: number;
  p_contradiction?: number;
  kinematic_score?: number;

  // CCNLP NLP Pillar 3: Contrastive NLG & Dual-Memory Decay
  contrastive_feedback?: string;
  declarative_retention_24h?: number;
  declarative_retention_7d?: number;
  procedural_retention_24h?: number;
  procedural_retention_7d?: number;
  intervention_recommendation?: string;
  joint_residuals?: Record<string, number>;
  joint_compliance?: Record<string, boolean>;
  occlusion_reconstructed?: boolean;

  dwell_remaining_ms?: number;
  step_dwell_total_ms?: number;
  step_progress_pct?: number;

  fatigue?: {
    fatigue_level: string;
    fatigue_score: number;
    recommended_break_seconds: number;
    session_minutes: number;
    warning_message?: string | null;
  };
  skill_decay?: DecayPrediction;
};
