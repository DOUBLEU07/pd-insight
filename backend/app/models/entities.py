"""ORM models.

`Case` carries every column of final_summary.csv (73) plus the working fields
the interactive workflow needs (input-quality warnings, auto-gap suggestions,
cluster detection) that the notebook only kept in memory or in
external_summary.csv.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    # Role is a recorded label only. It is written to reviewer_role and is not
    # used to gate any endpoint.
    role: Mapped[str] = mapped_column(String(32), default="researcher")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    cases: Mapped[list["Case"]] = relationship(back_populates="owner")


class UserThreshold(Base):
    """Per-account overrides for the tunable decision thresholds.

    A row exists only once an account saves a change. No row means the account
    is scored with the published CMD FINAL V2 defaults, and clearing the
    settings deletes the row rather than writing the defaults back, so the
    defaults stay in one place (`rules.Thresholds`).
    """

    __tablename__ = "user_thresholds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )

    topclass_threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    joint_dual_threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    strong_rule_threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence_threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    internal_high_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    gap_time_high_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    gap_time_moderate_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    cycle_time_ms: Mapped[float | None] = mapped_column(Float, nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Batch(Base):
    """One upload event: a single image or a whole folder import.

    Owned by the account that created it. Batches and their cases are private
    to that user.
    """

    __tablename__ = "batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    is_single: Mapped[bool] = mapped_column(Boolean, default=False)
    upload_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )

    cases: Mapped[list["Case"]] = relationship(
        back_populates="batch", cascade="all, delete-orphan"
    )


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("batches.id", ondelete="CASCADE"), nullable=True, index=True
    )
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Workflow status shown in the queue: pending | in_review | done
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    # Which decision rule this case was scored with.
    decision_mode: Mapped[str] = mapped_column(String(24), default="topclass30")
    analysis_run: Mapped[bool] = mapped_column(Boolean, default=False)
    # "real" when TensorFlow produced the scores, "mock" for the fallback engine.
    inference_engine: Mapped[str] = mapped_column(String(16), default="mock")

    # ================= final_summary.csv columns (73) =================
    record_id: Mapped[str] = mapped_column(String(255), index=True)
    defect_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    defect_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    case_folder: Mapped[str | None] = mapped_column(String(255), nullable=True)
    case_base_name: Mapped[str] = mapped_column(String(255), index=True)
    prpd_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tf_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_prpd_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_tf_path: Mapped[str | None] = mapped_column(Text, nullable=True)

    ai_mode: Mapped[str | None] = mapped_column(String(32), nullable=True)
    ai_input_mode: Mapped[str | None] = mapped_column(String(32), nullable=True)
    ai_model_used: Mapped[str | None] = mapped_column(String(128), nullable=True)
    ai_model_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_top_class: Mapped[str | None] = mapped_column(String(32), nullable=True)
    ai_top_score_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_final_result: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    ai_final_score_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ai_high_conf_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ai_non_identified_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_decision_rule: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_threshold_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    # The three published classes keep their own columns, because
    # final_summary.csv has a fixed shape. A case scored by an account-trained
    # model with a different class set fills whichever of the three it has and
    # keeps the complete score vector in ai_confidence_json.
    ai_confidence_corona: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_confidence_surface: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_confidence_internal: Mapped[float | None] = mapped_column(Float, nullable=True)
    # JSON {class: percent} for every class the scoring model predicts.
    ai_confidence_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON snapshot of the rules.ClassScheme this case was scored with. NULL
    # means the published Corona/Surface/Internal scheme. Stored per case so
    # re-scoring and severity recomputation keep using the scheme the case was
    # analysed under, even after the account switches model.
    class_scheme: Mapped[str | None] = mapped_column(Text, nullable=True)

    pd_rule_class: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pd_selection_rule: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_strong_pd_rule: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    suggested_pd_source_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    confirmed_pd_source_type: Mapped[str | None] = mapped_column(String(64), nullable=True)

    image_width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    image_height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    default_size_match: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    calibration_mode: Mapped[str | None] = mapped_column(String(64), nullable=True)
    auto_calibration_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    calibration_source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    calibration_preset_loaded: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    calibration_preset_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    x_left_0deg: Mapped[int | None] = mapped_column(Integer, nullable=True)
    x_right_360deg: Mapped[int | None] = mapped_column(Integer, nullable=True)
    y_top_plot: Mapped[int | None] = mapped_column(Integer, nullable=True)
    y_bottom_plot: Mapped[int | None] = mapped_column(Integer, nullable=True)

    auto_gap_status: Mapped[str | None] = mapped_column(String(255), nullable=True)

    review_status: Mapped[str] = mapped_column(String(32), default="user_confirmed")
    reviewer_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    reviewer_role: Mapped[str | None] = mapped_column(String(32), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    left_line_pixel: Mapped[float | None] = mapped_column(Float, nullable=True)
    right_line_pixel: Mapped[float | None] = mapped_column(Float, nullable=True)
    left_phase_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    right_phase_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    gap_angle_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    gap_time_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    gap_time_band: Mapped[str | None] = mapped_column(String(32), nullable=True)
    severity_by_gap_time: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    gap_measurement_status: Mapped[str | None] = mapped_column(String(255), nullable=True)

    remark: Mapped[str | None] = mapped_column(Text, nullable=True)
    detected_case: Mapped[str | None] = mapped_column(String(64), nullable=True)
    positive_x_range_pixel: Mapped[str | None] = mapped_column(String(64), nullable=True)
    negative_x_range_pixel: Mapped[str | None] = mapped_column(String(64), nullable=True)
    positive_x_range_phase: Mapped[str | None] = mapped_column(String(128), nullable=True)
    negative_x_range_phase: Mapped[str | None] = mapped_column(String(128), nullable=True)

    result_folder: Mapped[str | None] = mapped_column(Text, nullable=True)
    original_prpd_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    original_tf_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    annotated_image_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    per_image_csv_path: Mapped[str | None] = mapped_column(Text, nullable=True)

    # The Colab run wrote free-text sentences here (e.g. "single discharge
    # cluster detected on the positive half-cycle only"), not just the enum
    # values, so these stay generously sized.
    auto_not_measurable_recommended: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    auto_not_measurable_status: Mapped[str | None] = mapped_column(String(255), nullable=True)
    auto_not_measurable_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    not_measurable_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ============ working fields (external_summary.csv equivalents) ============
    input_check_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    input_has_warning: Mapped[bool] = mapped_column(Boolean, default=False)
    input_warning_count: Mapped[int] = mapped_column(Integer, default=0)
    input_warnings: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_confirmed_input_warning: Mapped[bool] = mapped_column(Boolean, default=False)
    prpd_filename_check: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    tf_filename_check: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    pair_filename_match: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    plot_frame_detected: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    plot_area_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    plot_area_status: Mapped[str | None] = mapped_column(String(32), nullable=True)

    auto_gap_model_available: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    auto_gap_model_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    auto_left_line_pixel: Mapped[float | None] = mapped_column(Float, nullable=True)
    auto_right_line_pixel: Mapped[float | None] = mapped_column(Float, nullable=True)
    rule_based_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    gap_line_source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    manual_adjustment_detected: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    left_line_adjustment_pixel: Mapped[float | None] = mapped_column(Float, nullable=True)
    right_line_adjustment_pixel: Mapped[float | None] = mapped_column(Float, nullable=True)
    cluster_detection_status: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Internal sanity check (PRPD_2_Only Part 5), kept as an advisory panel that
    # may override ai_final_result to Non-identified.
    sanity_check_ran: Mapped[bool] = mapped_column(Boolean, default=False)
    sanity_check_passed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    sanity_upper_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    sanity_lower_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    sanity_left_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    sanity_right_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Relative paths under STORAGE_DIR for serving the images to the browser.
    prpd_storage_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    tf_storage_path: Mapped[str | None] = mapped_column(Text, nullable=True)

    batch: Mapped["Batch | None"] = relationship(back_populates="cases")
    owner: Mapped["User | None"] = relationship(back_populates="cases")

    @property
    def n_files(self) -> int:
        return 2 if self.tf_filename else 1


class CalibrationPreset(Base):
    __tablename__ = "calibration_presets"
    # Scoped per owner, so two testers can both keep a preset called
    # "lab_default" without colliding.
    __table_args__ = (UniqueConstraint("owner_id", "preset_name", name="uq_preset_owner_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    preset_name: Mapped[str] = mapped_column(String(128))
    image_width: Mapped[int] = mapped_column(Integer, index=True)
    image_height: Mapped[int] = mapped_column(Integer, index=True)
    x_left_0deg: Mapped[int] = mapped_column(Integer)
    x_right_360deg: Mapped[int] = mapped_column(Integer)
    y_top_plot: Mapped[int] = mapped_column(Integer)
    y_bottom_plot: Mapped[int] = mapped_column(Integer)
    saved_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    example_prpd_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    example_tf_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    remark: Mapped[str | None] = mapped_column(Text, nullable=True)


class EditHistory(Base):
    __tablename__ = "edit_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int | None] = mapped_column(
        ForeignKey("cases.id", ondelete="CASCADE"), nullable=True, index=True
    )
    case_base_name: Mapped[str] = mapped_column(String(255), index=True)
    changed_field: Mapped[str] = mapped_column(String(128))
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_by: Mapped[str] = mapped_column(String(64))
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class UsageLog(Base):
    __tablename__ = "usage_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), index=True)
    action: Mapped[str] = mapped_column(String(64))
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class TrainedModel(Base):
    """One model the account built from its own dataset on the Training page.

    A row is created the moment the wizard is opened (``status="draft"``), so
    the dataset upload has somewhere to attach to, and it stays a draft until
    the account confirms the checklist and starts the run. Everything here is
    private to ``owner_id``: an account only ever sees, trains with and
    classifies through models it built itself.
    """

    __tablename__ = "trained_models"
    # Two accounts may both call a model "model3"; one account may not.
    __table_args__ = (UniqueConstraint("owner_id", "name", name="uq_model_owner_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )

    name: Mapped[str] = mapped_column(String(128))
    # "prpd_only" (PRPD image alone) or "hybrid" (PRPD + T-F map pairs).
    kind: Mapped[str] = mapped_column(String(16), default="prpd_only")
    # draft -> queued -> running -> completed | failed
    status: Mapped[str] = mapped_column(String(16), default="draft", index=True)
    # Which of this account's models new analyses are scored with. At most one
    # row per owner is true; none means the published Colab models are used.
    # Selection lives here rather than as users.active_model_id so the two
    # tables do not end up with foreign keys pointing at each other.
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)

    # ---- progress, written by the background worker ----
    progress: Mapped[int] = mapped_column(Integer, default=0)
    stage: Mapped[str | None] = mapped_column(String(96), nullable=True)

    # ---- dataset ----
    # JSON list of class names, e.g. ["Corona", "Surface", "Internal"].
    class_names: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON {class: PD source label} and {PD source label: severity group}.
    # Together with class_names these make the rules.ClassScheme that any case
    # scored by this model is interpreted through.
    pd_sources: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity_groups: Mapped[str | None] = mapped_column(Text, nullable=True)
    train_count: Mapped[int] = mapped_column(Integer, default=0)
    test_count: Mapped[int] = mapped_column(Integer, default=0)
    valid_count: Mapped[int] = mapped_column(Integer, default=0)
    # JSON {class: {split: count}}, kept so the history row can still show what
    # the run was built from after the staged images are deleted.
    dataset_detail: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ---- training configuration, set in the wizard ----
    max_epochs: Mapped[int] = mapped_column(Integer, default=12)
    batch_size: Mapped[int] = mapped_column(Integer, default=16)
    learning_rate: Mapped[float] = mapped_column(Float, default=0.001)
    # "scratch" trains the small CNN from random weights; "mobilenetv2"
    # fine-tunes the ImageNet backbone when its weights can be fetched.
    backbone: Mapped[str] = mapped_column(String(24), default="scratch")

    # ---- result ----
    # Epochs actually run, which early stopping may cut below max_epochs.
    epochs: Mapped[int] = mapped_column(Integer, default=0)
    accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)
    val_accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)
    loss: Mapped[float | None] = mapped_column(Float, nullable=True)
    # "real" when TensorFlow actually fitted the network, "simulated" when it
    # was unavailable and the figures come from the dataset statistics only.
    engine_used: Mapped[str | None] = mapped_column(String(16), nullable=True)
    artifact_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # The decision thresholds in force when the run started, so a model stays
    # readable next to the numbers it was checked against.
    thresholds_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ---- data collection consent (project review notes, item 7) ----
    # Whether the account permits this dataset to be passed to the PD Insight
    # developers for improving the published models. Declining changes nothing
    # about the run: the images stay in the account's own staging area either
    # way, and only the answer recorded here says whether they may be taken.
    data_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
