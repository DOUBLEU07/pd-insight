export type ReviewStatus = 'user_confirmed' | 'expert_corrected' | 'not_measurable';
export type CaseStatus = 'pending' | 'in_review' | 'done';
export type DecisionMode = 'topclass30' | 'strict85' | 'loose30' | 'smart_hybrid';

export interface Confidence {
  corona: number | null;
  surface: number | null;
  internal: number | null;
}

export interface Calibration {
  x_left_0deg: number | null;
  x_right_360deg: number | null;
  y_top_plot: number | null;
  y_bottom_plot: number | null;
  calibration_mode: string | null;
  calibration_source: string | null;
  auto_calibration_status: string | null;
  calibration_preset_loaded: boolean | null;
  calibration_preset_path: string | null;
}

export interface GapInfo {
  left_line_pixel: number | null;
  right_line_pixel: number | null;
  left_phase_deg: number | null;
  right_phase_deg: number | null;
  gap_angle_deg: number | null;
  gap_time_ms: number | null;
  gap_time_band: string | null;
  gap_measurement_status: string | null;
  gap_line_source: string | null;
  auto_gap_status: string | null;
  auto_left_line_pixel: number | null;
  auto_right_line_pixel: number | null;
  auto_gap_model_available: boolean | null;
  auto_gap_model_version: string | null;
  rule_based_status: string | null;
  cluster_detection_status: string | null;
  manual_adjustment_detected: boolean | null;
  auto_not_measurable_recommended: boolean | null;
  auto_not_measurable_reason: string | null;
  detected_case: string | null;
  positive_x_range_pixel: string | null;
  negative_x_range_pixel: string | null;
}

export interface InputQuality {
  input_check_status: string | null;
  input_has_warning: boolean;
  input_warning_count: number;
  input_warnings: string[];
  user_confirmed_input_warning: boolean;
  plot_frame_detected: boolean | null;
  plot_area_ratio: number | null;
  plot_area_status: string | null;
  pair_filename_match: boolean | null;
}

export interface SanityCheck {
  ran: boolean;
  passed: boolean | null;
  upper_ratio: number | null;
  lower_ratio: number | null;
  left_ratio: number | null;
  right_ratio: number | null;
}

export interface PdCase {
  id: number;
  batch_id: number | null;
  status: CaseStatus;
  decision_mode: DecisionMode;
  analysis_run: boolean;
  inference_engine: 'real' | 'mock';
  n_files: number;
  record_id: string;
  case_base_name: string;
  defect_id: string | null;
  defect_name: string | null;
  prpd_filename: string | null;
  tf_filename: string | null;
  prpd_url: string | null;
  tf_url: string | null;
  ai_mode: string | null;
  ai_input_mode: string | null;
  ai_model_used: string | null;
  ai_top_class: string | null;
  ai_top_score_percent: number | null;
  ai_final_result: string | null;
  ai_final_score_percent: number | null;
  ai_status: string | null;
  ai_high_conf_count: number | null;
  ai_non_identified_percent: number | null;
  ai_decision_rule: string | null;
  ai_threshold_percent: number | null;
  confidence: Confidence;
  pd_rule_class: string | null;
  pd_selection_rule: string | null;
  is_strong_pd_rule: boolean | null;
  suggested_pd_source_type: string | null;
  confirmed_pd_source_type: string | null;
  image_width: number | null;
  image_height: number | null;
  default_size_match: boolean | null;
  calibration: Calibration;
  gap: GapInfo;
  severity_by_gap_time: string | null;
  severity_group: string;
  review_status: ReviewStatus;
  reviewer_name: string | null;
  reviewer_role: string | null;
  review_note: string | null;
  not_measurable_reason: string | null;
  created_time: string | null;
  updated_time: string | null;
  annotated_image_url: string | null;
  input_quality?: InputQuality;
  sanity_check?: SanityCheck;
  detection?: { status: string; source: string; single_cluster: boolean; rule_status: string };
}

export interface BatchSummary {
  id: number;
  batch_key: string;
  name: string;
  is_single: boolean;
  upload_date: string | null;
  created_by: string | null;
  total: number;
  done: number;
  high_severity: number;
  overall_status: CaseStatus;
  first_case_id: number | null;
  cases?: PdCase[];
}

export interface SeverityGroup {
  key: 'High' | 'Moderate' | 'Initial' | 'Pending';
  label: string;
  count: number;
  cases: PdCase[];
}

export interface DashboardData {
  kpi: {
    total: number;
    corona: number;
    corona_pct: number;
    surface: number;
    surface_pct: number;
    internal: number;
    internal_pct: number;
  };
  severity_groups: SeverityGroup[];
  upload_history: BatchSummary[];
  reviewed_count: number;
}

export interface CalibrationPreset {
  id: number;
  preset_name: string;
  image_width: number;
  image_height: number;
  x_left_0deg: number;
  x_right_360deg: number;
  y_top_plot: number;
  y_bottom_plot: number;
  saved_time: string | null;
  example_prpd_filename: string | null;
  example_tf_filename: string | null;
  remark: string | null;
}

export interface DecisionModeOption {
  key: DecisionMode;
  label: string;
  description: string;
}

export interface MlStatus {
  enable_ml: boolean;
  tensorflow_available: boolean;
  prpd_only_available: boolean;
  hybrid_available: boolean;
  auto_gap_available: boolean;
  auto_gap_model_version: string;
  models_dir: string;
  load_error: string | null;
}

export interface CaseOptions {
  pd_source_options: string[];
  review_status_options: ReviewStatus[];
  not_measurable_reasons: string[];
  calibration_modes: string[];
  calibration_sources: string[];
  decision_modes: DecisionModeOption[];
  constants: {
    confidence_threshold: number;
    internal_high_confidence: number;
    topclass_threshold: number;
    joint_dual_threshold: number;
    strong_rule_threshold: number;
    gap_time_high_ms: number;
    gap_time_moderate_ms: number;
    cycle_time_ms: number;
    default_image_width: number;
    default_image_height: number;
    default_frame: {
      x_left_0deg: number;
      x_right_360deg: number;
      y_top_plot: number;
      y_bottom_plot: number;
    };
    allowed_extensions: string[];
  };
  ml_status: MlStatus;
}

export interface PrpdPoint {
  x: number;
  y: number;
  phase: number;
  half: 'pos' | 'neg';
}

export interface PointsResponse {
  image_width: number;
  image_height: number;
  points: PrpdPoint[];
}

export interface UsageEntry {
  timestamp: string | null;
  username: string;
  action: string;
  detail: string | null;
}

export interface EditHistoryEntry {
  timestamp: string | null;
  case_base_name: string;
  changed_field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
}

export interface TrainingStats {
  reviewed_cases: number;
  training_runs: number;
  usage_events: number;
  username: string;
  enabled: boolean;
  message: string;
  history: {
    started_at: string | null;
    username: string;
    dataset_size: number;
    accuracy: number | null;
    note: string | null;
  }[];
}

/** The decision thresholds an account may tune for itself. */
export type ThresholdKey =
  | 'topclass_threshold'
  | 'joint_dual_threshold'
  | 'strong_rule_threshold'
  | 'confidence_threshold'
  | 'internal_high_confidence'
  | 'gap_time_high_ms'
  | 'gap_time_moderate_ms'
  | 'cycle_time_ms';

export interface ThresholdSettings {
  effective: Record<ThresholdKey, number>;
  defaults: Record<ThresholdKey, number>;
  overridden: ThresholdKey[];
  bounds: Record<ThresholdKey, { min: number; max: number; unit: string }>;
  updated_at: string | null;
}
