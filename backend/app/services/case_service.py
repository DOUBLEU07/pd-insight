"""Case-level orchestration: analysis, calibration, gap-time, sign-off.

Sequencing follows CMD FINAL CODE: validate input -> classify -> pick
calibration (preset / default 388x281 / auto contour) -> suggest gap lines
(regression model first, rule-based fallback) -> reviewer confirms -> save.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any

import numpy as np
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from fastapi import HTTPException

from app.core.config import settings
from app.models.entities import (
    Batch,
    CalibrationPreset,
    Case,
    EditHistory,
    UsageLog,
    User,
    UserThreshold,
)
from app.services import rules
from app.services.cv import detect
from app.services.ml import engine as ml
from app.services.storage import fmt_range, read_image


# =========================================================================
# PER-ACCOUNT THRESHOLDS
# =========================================================================
def thresholds_for(db: Session, user_id: int | None) -> rules.Thresholds:
    """Effective thresholds for one account.

    Fields the account has not overridden fall back to the published defaults,
    so a partially filled row still scores the rest by CMD FINAL V2.
    """
    if user_id is None:
        return rules.DEFAULT_THRESHOLDS

    row = db.scalar(select(UserThreshold).where(UserThreshold.user_id == user_id))
    if row is None:
        return rules.DEFAULT_THRESHOLDS

    overrides = {
        name: getattr(row, name)
        for name in rules.Thresholds.field_names()
        if getattr(row, name, None) is not None
    }
    return rules.Thresholds(**overrides) if overrides else rules.DEFAULT_THRESHOLDS


def thresholds_for_case(db: Session, case: Case) -> rules.Thresholds:
    """A case is always scored with the thresholds of the account that owns it."""
    return thresholds_for(db, case.owner_id)


# =========================================================================
# BATCH KEYS
# =========================================================================
def next_batch_key(db: Session, prefix: str = "B") -> str:
    """Next per-day sequential batch key, e.g. ``B-20260817-0004``.

    The suffix continues from the highest key already issued today rather than
    from a row count: counting rows means deleting any batch lowers the count,
    so the next key collides with a surviving batch and the insert fails on the
    unique index.
    """
    stem = f"{prefix}-{datetime.now().strftime('%Y%m%d')}-"
    issued = db.scalars(select(Batch.batch_key).where(Batch.batch_key.like(f"{stem}%"))).all()

    highest = 0
    for key in issued:
        suffix = key[len(stem) :]
        if suffix.isdigit():
            highest = max(highest, int(suffix))

    return f"{stem}{highest + 1:04d}"


# =========================================================================
# OWNERSHIP
# =========================================================================
# Every case and batch belongs to the account that created it. Lookups go
# through these helpers so a case that exists but belongs to someone else is
# indistinguishable from one that does not exist.
def owned_case(db: Session, case_id: int, user: User) -> Case:
    case = db.get(Case, case_id)
    if case is None or case.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


def owned_batch(db: Session, batch_id: int, user: User) -> Batch:
    batch = db.get(Batch, batch_id)
    if batch is None or batch.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Batch not found")
    return batch


def owned_preset(db: Session, preset_id: int, user: User) -> CalibrationPreset:
    preset = db.get(CalibrationPreset, preset_id)
    if preset is None or preset.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Preset not found")
    return preset


# =========================================================================
# LOGGING HELPERS
# =========================================================================
def log_usage(db: Session, username: str, action: str, detail: str = "") -> None:
    db.add(UsageLog(username=username, action=action, detail=detail))


def log_edit(
    db: Session, case: Case, field: str, old: Any, new: Any, username: str
) -> None:
    if str(old) == str(new):
        return
    db.add(
        EditHistory(
            case_id=case.id,
            case_base_name=case.case_base_name,
            changed_field=field,
            old_value="" if old is None else str(old),
            new_value="" if new is None else str(new),
            changed_by=username,
        )
    )


# =========================================================================
# CALIBRATION
# =========================================================================
def find_matching_preset(
    db: Session, width: int, height: int, owner_id: int | None
) -> CalibrationPreset | None:
    """Exact image-size match among the owner's presets; newest wins."""
    return db.scalar(
        select(CalibrationPreset)
        .where(
            CalibrationPreset.image_width == width,
            CalibrationPreset.image_height == height,
            CalibrationPreset.owner_id == owner_id,
        )
        .order_by(desc(CalibrationPreset.saved_time))
        .limit(1)
    )


def resolve_initial_calibration(
    db: Session, width: int, height: int, detected: dict[str, Any], owner_id: int | None
) -> dict[str, Any]:
    """Preset -> PDProcessingII default (exact 388x281 only) -> auto contour."""
    preset = find_matching_preset(db, width, height, owner_id)
    if preset is not None:
        return {
            "x_left_0deg": preset.x_left_0deg,
            "x_right_360deg": preset.x_right_360deg,
            "y_top_plot": preset.y_top_plot,
            "y_bottom_plot": preset.y_bottom_plot,
            "calibration_source": "saved_calibration_preset_auto_loaded",
            "calibration_mode": "Use default PDProcessingII calibration",
            "calibration_preset_loaded": True,
            "calibration_preset_path": preset.preset_name,
        }

    default_size_match = (
        width == settings.default_image_width and height == settings.default_image_height
    )
    if default_size_match:
        return {
            "x_left_0deg": settings.default_x_left,
            "x_right_360deg": settings.default_x_right,
            "y_top_plot": settings.default_y_top,
            "y_bottom_plot": settings.default_y_bottom,
            "calibration_source": "default_PDProcessingII",
            "calibration_mode": "Use default PDProcessingII calibration",
            "calibration_preset_loaded": False,
            "calibration_preset_path": None,
        }

    return {
        "x_left_0deg": detected["x_left"],
        "x_right_360deg": detected["x_right"],
        "y_top_plot": detected["y_top"],
        "y_bottom_plot": detected["y_bottom"],
        "calibration_source": detected["status"],
        "calibration_mode": "Use auto-detected calibration",
        "calibration_preset_loaded": False,
        "calibration_preset_path": None,
    }


# =========================================================================
# ANALYSIS
# =========================================================================
def run_analysis(db: Session, case: Case, decision_mode: str | None = None) -> Case:
    """Classify, calibrate and pre-suggest gap lines for one case."""
    mode = decision_mode or case.decision_mode or "topclass30"

    prpd_rgb = read_image(settings.storage_dir / case.prpd_storage_path)
    tf_rgb = (
        read_image(settings.storage_dir / case.tf_storage_path)
        if case.tf_storage_path
        else None
    )

    # ---- 1. input quality ----
    quality = detect.validate_input(
        case.prpd_filename or "", prpd_rgb, case.tf_filename, tf_rgb
    )
    case.input_check_status = quality["input_check_status"]
    case.input_has_warning = quality["input_has_warning"]
    case.input_warning_count = quality["input_warning_count"]
    case.input_warnings = quality["input_warnings"]
    case.prpd_filename_check = quality["prpd_filename_check"]
    case.tf_filename_check = quality["tf_filename_check"]
    case.pair_filename_match = quality["pair_filename_match"]
    case.plot_frame_detected = quality["plot_frame_detected"]
    case.plot_area_ratio = quality["plot_area_ratio"]
    case.plot_area_status = quality["plot_area_status"]
    case.image_width = quality["image_width"]
    case.image_height = quality["image_height"]
    case.default_size_match = quality["default_size_match"]
    case.auto_calibration_status = quality["detected_frame_status"]

    # ---- 2. classification ----
    thresholds = thresholds_for_case(db, case)

    prediction = ml.classify(prpd_rgb, tf_rgb)
    scores = prediction["scores_percent"]

    ai = rules.build_ai_result(
        scores_percent=scores,
        input_mode=prediction["input_mode"],
        model_used=prediction["model_used"],
        model_path=prediction["model_path"],
        decision_mode=mode,
        thresholds=thresholds,
    )

    # ---- 3. internal sanity check (85-95% Internal band) ----
    sanity = None
    if rules.should_run_internal_sanity_check(scores, thresholds):
        sanity = detect.internal_sanity_check(prpd_rgb)
        case.sanity_check_ran = True
        case.sanity_check_passed = sanity["internal_ok"]
        case.sanity_upper_ratio = sanity["upper_ratio"]
        case.sanity_lower_ratio = sanity["lower_ratio"]
        case.sanity_left_ratio = sanity["left_ratio"]
        case.sanity_right_ratio = sanity["right_ratio"]
        ai = rules.apply_internal_sanity_override(ai, sanity)
    else:
        case.sanity_check_ran = False
        case.sanity_check_passed = None

    case.decision_mode = mode
    case.inference_engine = prediction["engine"]
    case.ai_mode = "HYBRID" if tf_rgb is not None else "PRPD_ONLY"
    case.ai_input_mode = ai["input_mode"]
    case.ai_model_used = ai["model_used"]
    case.ai_model_path = ai["model_path_used"]
    case.ai_top_class = ai["top_class"]
    case.ai_top_score_percent = ai["top_score"]
    case.ai_final_result = ai["final_result"]
    case.ai_final_score_percent = ai["final_score"]
    case.ai_status = ai["status"]
    case.ai_high_conf_count = ai["high_conf_count"]
    case.ai_non_identified_percent = ai["non_identified_percent"]
    case.ai_decision_rule = ai["ai_decision_rule"]
    case.ai_threshold_percent = ai["ai_threshold_percent"]
    case.ai_confidence_corona = ai["confidence_dict"]["Corona"]
    case.ai_confidence_surface = ai["confidence_dict"]["Surface"]
    case.ai_confidence_internal = ai["confidence_dict"]["Internal"]
    case.pd_rule_class = ai["pd_rule_class"]
    case.pd_selection_rule = ai["pd_selection_rule"]
    case.is_strong_pd_rule = ai["is_strong_pd_rule"]
    case.suggested_pd_source_type = ai["suggested_pd_source"]
    if not case.confirmed_pd_source_type:
        case.confirmed_pd_source_type = ai["suggested_pd_source"]

    # ---- 4. calibration ----
    if case.x_left_0deg is None:
        calib = resolve_initial_calibration(
            db,
            quality["image_width"],
            quality["image_height"],
            {
                "x_left": quality["detected_x_left"],
                "x_right": quality["detected_x_right"],
                "y_top": quality["detected_y_top"],
                "y_bottom": quality["detected_y_bottom"],
                "status": quality["detected_frame_status"],
            },
            owner_id=case.owner_id,
        )
        for key, value in calib.items():
            setattr(case, key, value)

    # ---- 5. gap-line suggestion ----
    suggest_gap_lines(db, case, prefer="auto")

    case.analysis_run = True
    if case.status == "pending":
        case.status = "in_review"

    db.flush()
    return case


# =========================================================================
# GAP LINES
# =========================================================================
def suggest_gap_lines(db: Session, case: Case, prefer: str = "auto") -> dict[str, Any]:
    """Place the initial gap lines.

    `prefer`: "auto" tries the regression model then falls back to rule-based,
    "model" forces the regression model, "rule" forces rule-based detection.
    """
    prpd_rgb = read_image(settings.storage_dir / case.prpd_storage_path)

    x_left = case.x_left_0deg
    x_right = case.x_right_360deg
    y_top = case.y_top_plot
    y_bottom = case.y_bottom_plot

    status = ml.engine.status()
    case.auto_gap_model_available = status["auto_gap_available"]
    case.auto_gap_model_version = (
        settings.auto_gap_model_version if status["auto_gap_available"] else ""
    )

    # Rule-based detection always runs: it is the only thing that can flag the
    # single-cluster "not measurable" condition, regardless of which suggestion
    # the reviewer ends up seeing.
    rule_result, rule_status = detect.auto_detect_gap_lines_rule_based(
        prpd_rgb, x_left, x_right, y_top, y_bottom
    )
    case.rule_based_status = rule_status
    case.cluster_detection_status = rule_status

    single_cluster = rule_status in detect.SINGLE_CLUSTER_STATUSES
    case.auto_not_measurable_recommended = single_cluster
    if single_cluster:
        case.auto_not_measurable_status = rule_status
        case.auto_not_measurable_reason = "single_discharge_cluster"
    else:
        case.auto_not_measurable_status = ""
        case.auto_not_measurable_reason = ""

    if rule_result:
        case.detected_case = rule_result["detected_case"]
        case.positive_x_range_pixel = fmt_range(rule_result["positive_x_range_pixel"])
        case.negative_x_range_pixel = fmt_range(rule_result["negative_x_range_pixel"])
        case.positive_x_range_phase = fmt_range(rule_result["positive_x_range_phase"])
        case.negative_x_range_phase = fmt_range(rule_result["negative_x_range_phase"])

    chosen: dict[str, Any] | None = None
    chosen_status = rule_status
    source = "rule_based"

    if prefer in ("auto", "model"):
        model_result, model_status = ml.predict_auto_gap_lines(
            prpd_rgb, x_left, x_right, y_top, y_bottom
        )
        if model_result:
            chosen = model_result
            chosen_status = model_status
            source = "ai_auto"
        elif prefer == "model":
            chosen_status = model_status

    if chosen is None and prefer in ("auto", "rule") and rule_result:
        chosen = rule_result
        chosen_status = rule_status
        source = "rule_based"

    case.auto_gap_status = chosen_status

    if chosen and not single_cluster:
        case.auto_left_line_pixel = float(chosen["left_line_x"])
        case.auto_right_line_pixel = float(chosen["right_line_x"])
        case.left_line_pixel = float(chosen["left_line_x"])
        case.right_line_pixel = float(chosen["right_line_x"])
        case.gap_line_source = source
        case.gap_measurement_status = (
            "auto_detected_positive_negative" if source == "rule_based" else "ai_auto"
        )
    elif single_cluster:
        case.left_line_pixel = None
        case.right_line_pixel = None
        case.gap_line_source = "not_measurable"
        case.gap_measurement_status = rule_status

    recompute_gap(db, case)
    db.flush()

    return {
        "status": chosen_status,
        "source": source,
        "single_cluster": single_cluster,
        "rule_status": rule_status,
    }


def recompute_gap(db: Session, case: Case) -> dict[str, Any]:
    """Recalculate phase/angle/time/band/severity from the current line positions."""
    metrics = rules.compute_gap_metrics(
        left_x=case.left_line_pixel,
        right_x=case.right_line_pixel,
        x_left=case.x_left_0deg,
        x_right=case.x_right_360deg,
        pd_source_type=case.confirmed_pd_source_type,
        not_measurable=bool(case.auto_not_measurable_recommended)
        and case.review_status == "not_measurable",
        thresholds=thresholds_for_case(db, case),
    )

    case.left_phase_deg = metrics["left_phase_deg"]
    case.right_phase_deg = metrics["right_phase_deg"]
    case.gap_angle_deg = metrics["gap_angle_deg"]
    case.gap_time_ms = metrics["gap_time_ms"]
    case.gap_time_band = metrics["gap_time_band"]
    case.severity_by_gap_time = metrics["severity"]

    # Compare against the auto suggestion the way CMD FINAL CODE did: more than
    # 2 px on either line counts as a manual adjustment.
    if case.auto_left_line_pixel is not None and case.left_line_pixel is not None:
        left_adj = abs(case.left_line_pixel - case.auto_left_line_pixel)
        right_adj = abs((case.right_line_pixel or 0) - (case.auto_right_line_pixel or 0))
        case.left_line_adjustment_pixel = left_adj
        case.right_line_adjustment_pixel = right_adj
        case.manual_adjustment_detected = left_adj > 2 or right_adj > 2

    return metrics


# =========================================================================
# SERIALISATION
# =========================================================================
def _num(value: float | None, digits: int = 4) -> float | None:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    return round(float(value), digits)


def serialize_case(case: Case, *, include_detail: bool = False) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": case.id,
        "batch_id": case.batch_id,
        "status": case.status,
        "decision_mode": case.decision_mode,
        "analysis_run": case.analysis_run,
        "inference_engine": case.inference_engine,
        "n_files": case.n_files,
        "record_id": case.record_id,
        "case_base_name": case.case_base_name,
        "defect_id": case.defect_id,
        "defect_name": case.defect_name,
        "prpd_filename": case.prpd_filename,
        "tf_filename": case.tf_filename,
        "prpd_url": f"/api/v1/files/{case.prpd_storage_path}" if case.prpd_storage_path else None,
        "tf_url": f"/api/v1/files/{case.tf_storage_path}" if case.tf_storage_path else None,
        "ai_mode": case.ai_mode,
        "ai_input_mode": case.ai_input_mode,
        "ai_model_used": case.ai_model_used,
        "ai_top_class": case.ai_top_class,
        "ai_top_score_percent": _num(case.ai_top_score_percent),
        "ai_final_result": case.ai_final_result,
        "ai_final_score_percent": _num(case.ai_final_score_percent),
        "ai_status": case.ai_status,
        "ai_high_conf_count": case.ai_high_conf_count,
        "ai_non_identified_percent": _num(case.ai_non_identified_percent),
        "ai_decision_rule": case.ai_decision_rule,
        "ai_threshold_percent": _num(case.ai_threshold_percent, 1),
        "confidence": {
            "corona": _num(case.ai_confidence_corona),
            "surface": _num(case.ai_confidence_surface),
            "internal": _num(case.ai_confidence_internal),
        },
        "pd_rule_class": case.pd_rule_class,
        "pd_selection_rule": case.pd_selection_rule,
        "is_strong_pd_rule": case.is_strong_pd_rule,
        "suggested_pd_source_type": case.suggested_pd_source_type,
        "confirmed_pd_source_type": case.confirmed_pd_source_type,
        "image_width": case.image_width,
        "image_height": case.image_height,
        "default_size_match": case.default_size_match,
        "calibration": {
            "x_left_0deg": case.x_left_0deg,
            "x_right_360deg": case.x_right_360deg,
            "y_top_plot": case.y_top_plot,
            "y_bottom_plot": case.y_bottom_plot,
            "calibration_mode": case.calibration_mode,
            "calibration_source": case.calibration_source,
            "auto_calibration_status": case.auto_calibration_status,
            "calibration_preset_loaded": case.calibration_preset_loaded,
            "calibration_preset_path": case.calibration_preset_path,
        },
        "gap": {
            "left_line_pixel": _num(case.left_line_pixel, 2),
            "right_line_pixel": _num(case.right_line_pixel, 2),
            "left_phase_deg": _num(case.left_phase_deg),
            "right_phase_deg": _num(case.right_phase_deg),
            "gap_angle_deg": _num(case.gap_angle_deg),
            "gap_time_ms": _num(case.gap_time_ms),
            "gap_time_band": case.gap_time_band,
            "gap_measurement_status": case.gap_measurement_status,
            "gap_line_source": case.gap_line_source,
            "auto_gap_status": case.auto_gap_status,
            "auto_left_line_pixel": _num(case.auto_left_line_pixel, 2),
            "auto_right_line_pixel": _num(case.auto_right_line_pixel, 2),
            "auto_gap_model_available": case.auto_gap_model_available,
            "auto_gap_model_version": case.auto_gap_model_version,
            "rule_based_status": case.rule_based_status,
            "cluster_detection_status": case.cluster_detection_status,
            "manual_adjustment_detected": case.manual_adjustment_detected,
            "auto_not_measurable_recommended": case.auto_not_measurable_recommended,
            "auto_not_measurable_reason": case.auto_not_measurable_reason,
            "detected_case": case.detected_case,
            "positive_x_range_pixel": case.positive_x_range_pixel,
            "negative_x_range_pixel": case.negative_x_range_pixel,
        },
        "severity_by_gap_time": case.severity_by_gap_time,
        "severity_group": rules.severity_group_label(case.confirmed_pd_source_type),
        "review_status": case.review_status,
        "reviewer_name": case.reviewer_name,
        "reviewer_role": case.reviewer_role,
        "review_note": case.review_note,
        "not_measurable_reason": case.not_measurable_reason,
        "created_time": case.created_time.isoformat() if case.created_time else None,
        "updated_time": case.updated_time.isoformat() if case.updated_time else None,
        "annotated_image_url": (
            f"/api/v1/files/{case.annotated_image_path}" if case.annotated_image_path else None
        ),
    }

    if include_detail:
        data["input_quality"] = {
            "input_check_status": case.input_check_status,
            "input_has_warning": case.input_has_warning,
            "input_warning_count": case.input_warning_count,
            "input_warnings": (case.input_warnings or "").split(" | ")
            if case.input_warnings
            else [],
            "user_confirmed_input_warning": case.user_confirmed_input_warning,
            "plot_frame_detected": case.plot_frame_detected,
            "plot_area_ratio": _num(case.plot_area_ratio),
            "plot_area_status": case.plot_area_status,
            "pair_filename_match": case.pair_filename_match,
        }
        data["sanity_check"] = {
            "ran": case.sanity_check_ran,
            "passed": case.sanity_check_passed,
            "upper_ratio": _num(case.sanity_upper_ratio, 3),
            "lower_ratio": _num(case.sanity_lower_ratio, 3),
            "left_ratio": _num(case.sanity_left_ratio, 3),
            "right_ratio": _num(case.sanity_right_ratio, 3),
        }

    return data


def to_master_row(case: Case) -> dict[str, Any]:
    """Flatten a case into the 73-column final_summary.csv shape."""

    def fmt_time(value: datetime | None) -> str:
        return value.strftime("%Y-%m-%d %H:%M:%S") if value else ""

    return {
        "record_id": case.record_id,
        "defect_id": case.defect_id or "",
        "defect_name": case.defect_name or "",
        "case_folder": case.case_folder or "",
        "case_base_name": case.case_base_name,
        "prpd_filename": case.prpd_filename or "",
        "tf_filename": case.tf_filename or "",
        "source_prpd_path": case.source_prpd_path or "",
        "source_tf_path": case.source_tf_path or "",
        "ai_mode": case.ai_mode or "",
        "ai_input_mode": case.ai_input_mode or "",
        "ai_model_used": case.ai_model_used or "",
        "ai_model_path": case.ai_model_path or "",
        "ai_top_class": case.ai_top_class or "",
        "ai_top_score_percent": case.ai_top_score_percent,
        "ai_final_result": case.ai_final_result or "",
        "ai_final_score_percent": case.ai_final_score_percent,
        "ai_status": case.ai_status or "",
        "ai_high_conf_count": case.ai_high_conf_count,
        "ai_non_identified_percent": case.ai_non_identified_percent,
        "ai_decision_rule": case.ai_decision_rule or "",
        "ai_threshold_percent": case.ai_threshold_percent,
        "ai_confidence_corona": case.ai_confidence_corona,
        "ai_confidence_surface": case.ai_confidence_surface,
        "ai_confidence_internal": case.ai_confidence_internal,
        "pd_rule_class": case.pd_rule_class or "",
        "pd_selection_rule": case.pd_selection_rule or "",
        "is_strong_pd_rule": case.is_strong_pd_rule,
        "suggested_pd_source_type": case.suggested_pd_source_type or "",
        "confirmed_pd_source_type": case.confirmed_pd_source_type or "",
        "image_width": case.image_width,
        "image_height": case.image_height,
        "default_size_match": case.default_size_match,
        "calibration_mode": case.calibration_mode or "",
        "auto_calibration_status": case.auto_calibration_status or "",
        "calibration_source": case.calibration_source or "",
        "calibration_preset_loaded": case.calibration_preset_loaded,
        "calibration_preset_path": case.calibration_preset_path or "",
        "x_left_0deg": case.x_left_0deg,
        "x_right_360deg": case.x_right_360deg,
        "y_top_plot": case.y_top_plot,
        "y_bottom_plot": case.y_bottom_plot,
        "auto_gap_status": case.auto_gap_status or "",
        "review_status": case.review_status,
        "reviewer_name": case.reviewer_name or "",
        "reviewer_role": case.reviewer_role or "",
        "review_note": case.review_note or "",
        "created_time": fmt_time(case.created_time),
        "updated_time": fmt_time(case.updated_time),
        "left_line_pixel": case.left_line_pixel,
        "right_line_pixel": case.right_line_pixel,
        "left_phase_deg": case.left_phase_deg,
        "right_phase_deg": case.right_phase_deg,
        "gap_angle_deg": case.gap_angle_deg,
        "gap_time_ms": case.gap_time_ms,
        "gap_time_band": case.gap_time_band or "",
        "severity_by_gap_time": case.severity_by_gap_time or "",
        "gap_measurement_status": case.gap_measurement_status or "",
        "remark": case.remark or "",
        "detected_case": case.detected_case or "",
        "positive_x_range_pixel": case.positive_x_range_pixel or "",
        "negative_x_range_pixel": case.negative_x_range_pixel or "",
        "positive_x_range_phase": case.positive_x_range_phase or "",
        "negative_x_range_phase": case.negative_x_range_phase or "",
        "result_folder": case.result_folder or "",
        "original_prpd_path": case.original_prpd_path or "",
        "original_tf_path": case.original_tf_path or "",
        "annotated_image_path": case.annotated_image_path or "",
        "per_image_csv_path": case.per_image_csv_path or "",
        "auto_not_measurable_recommended": case.auto_not_measurable_recommended,
        "auto_not_measurable_status": case.auto_not_measurable_status or "",
        "auto_not_measurable_reason": case.auto_not_measurable_reason or "",
        "not_measurable_reason": case.not_measurable_reason or "",
    }


def to_prototype_row(case: Case) -> dict[str, Any]:
    """Flatten a case into the prototype's 41-column workbook shape."""
    master = to_master_row(case)
    return {
        "record_id": master["record_id"],
        "case_base_name": master["case_base_name"],
        "prpd_filename": master["prpd_filename"],
        "tf_filename": master["tf_filename"],
        "image_preview": "(thumbnail embedded in the .xlsx file; CSV export omits embedded images)",
        "annotated_image_path": master["annotated_image_path"],
        "ai_confidence_corona": master["ai_confidence_corona"],
        "ai_confidence_surface": master["ai_confidence_surface"],
        "ai_confidence_internal": master["ai_confidence_internal"],
        "ai_top_class": master["ai_top_class"],
        "ai_top_score_percent": master["ai_top_score_percent"],
        "ai_final_result": master["ai_final_result"],
        "ai_final_score_percent": master["ai_final_score_percent"],
        "ai_status": master["ai_status"],
        "ai_decision_rule": master["ai_decision_rule"],
        "ai_threshold_percent": master["ai_threshold_percent"],
        "suggested_pd_source_type": master["suggested_pd_source_type"],
        "confirmed_pd_source_type": master["confirmed_pd_source_type"],
        "gap_angle_deg": master["gap_angle_deg"],
        "gap_time_ms": master["gap_time_ms"],
        "gap_time_band": master["gap_time_band"],
        "severity_by_gap_time": master["severity_by_gap_time"],
        "final_left_line_pixel": master["left_line_pixel"],
        "final_right_line_pixel": master["right_line_pixel"],
        "left_phase_deg": master["left_phase_deg"],
        "right_phase_deg": master["right_phase_deg"],
        "gap_measurement_status": master["gap_measurement_status"],
        "not_measurable_reason": master["not_measurable_reason"],
        "review_status": master["review_status"],
        "reviewer_name": master["reviewer_name"],
        "reviewer_role": master["reviewer_role"],
        "review_note": master["review_note"],
        "is_abstract_case": "YES" if case.defect_id else "NO",
        "abstract_defect_id": master["defect_id"],
        "abstract_defect_name": master["defect_name"],
        "result_folder": master["result_folder"],
        "original_prpd_path": master["original_prpd_path"],
        "original_tf_path": master["original_tf_path"],
        "per_image_csv_path": master["per_image_csv_path"],
        "created_time": master["created_time"],
        "updated_time": master["updated_time"],
    }
