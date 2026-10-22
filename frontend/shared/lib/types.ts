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

export type FrameResponse = {
  step: string;
  valid: boolean;
  score: number;
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
  fatigue?: {
    fatigue_level: string;
    fatigue_score: number;
    recommended_break_seconds: number;
    session_minutes: number;
    warning_message?: string | null;
  };
  skill_decay?: DecayPrediction;
};
