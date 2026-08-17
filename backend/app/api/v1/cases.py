"""Case lifecycle: upload, analysis, calibration, gap-time, sign-off."""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import (
    CALIBRATION_MODE_OPTIONS,
    DECISION_MODES,
    NOT_MEASURABLE_REASON_OPTIONS,
    PD_SOURCE_OPTIONS,
    REVIEW_STATUS_OPTIONS,
    settings,
)
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.entities import Batch, CalibrationPreset, Case, EditHistory, User
from app.services import rules
from app.services.case_service import (
    find_matching_preset,
    log_edit,
    next_batch_key,
    owned_batch,
    owned_case,
    owned_preset,
    log_usage,
    recompute_gap,
    thresholds_for,
    thresholds_for_case,
    run_analysis,
    serialize_case,
    suggest_gap_lines,
)
from app.services.cv import detect
from app.services.ml import engine as ml
from app.services.storage import (
    case_result_dir,
    decode_image,
    read_image,
    safe_name_from_filename,
    safe_text_name,
    save_annotated_image,
    save_upload,
    to_storage_rel,
)

router = APIRouter(prefix="/cases", tags=["cases"])


# =========================================================================
# OPTIONS
# =========================================================================
@router.get("/options")
def options(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    # Constants are the caller's *effective* thresholds, so the Help text and
    # the on-screen tables always describe the rules this account is scored by.
    t = thresholds_for(db, user.id)
    return {
        "pd_source_options": PD_SOURCE_OPTIONS,
        "review_status_options": REVIEW_STATUS_OPTIONS,
        "not_measurable_reasons": [r for r in NOT_MEASURABLE_REASON_OPTIONS if r],
        "calibration_modes": CALIBRATION_MODE_OPTIONS,
        "calibration_sources": [
            "auto_contour_detected",
            "projection_fallback",
            "saved_calibration_preset_auto_loaded",
            "default_PDProcessingII",
            "manual_axis_adjusted",
        ],
        "decision_modes": [
            {
                "key": "topclass30",
                "label": f"TopClass {t.topclass_threshold:g}% (CMD FINAL V2)",
                "description": (
                    f"All classes ≤ {t.topclass_threshold:g}% → Non-identified; "
                    "otherwise the top class wins."
                ),
            },
            {
                "key": "strict85",
                "label": "Strict 85% (Mode A)",
                "description": "Exactly one class must reach 85%; 0 or 2+ → Non-identified.",
            },
            {
                "key": "loose30",
                "label": "Loose 30% (Mode B)",
                "description": "Top class only needs to exceed 30%.",
            },
            {
                "key": "smart_hybrid",
                "label": "SMART FINAL RESULT (Mode C)",
                "description": "0 over 85% → Inconclusive · 1 → that class · 2+ → Mixed PD Suspected.",
            },
        ],
        "constants": {
            "confidence_threshold": t.confidence_threshold,
            "internal_high_confidence": t.internal_high_confidence,
            "topclass_threshold": t.topclass_threshold,
            "joint_dual_threshold": t.joint_dual_threshold,
            "strong_rule_threshold": t.strong_rule_threshold,
            "gap_time_high_ms": t.gap_time_high_ms,
            "gap_time_moderate_ms": t.gap_time_moderate_ms,
            "cycle_time_ms": t.cycle_time_ms,
            "default_image_width": settings.default_image_width,
            "default_image_height": settings.default_image_height,
            "default_frame": {
                "x_left_0deg": settings.default_x_left,
                "x_right_360deg": settings.default_x_right,
                "y_top_plot": settings.default_y_top,
                "y_bottom_plot": settings.default_y_bottom,
            },
            "allowed_extensions": list(settings.allowed_extensions),
        },
        "ml_status": ml.engine.status(),
    }


# =========================================================================
# UPLOAD
# =========================================================================
@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_case(
    prpd: UploadFile = File(...),
    tf: UploadFile | None = File(None),
    batch_id: int | None = Form(None),
    batch_name: str | None = Form(None),
    defect_id: str | None = Form(None),
    defect_name: str | None = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Upload one case: PRPD required, TF map optional.

    One file runs the PRPD-only model; two files auto-switch to Hybrid.
    """
    prpd_bytes = await prpd.read()
    if not prpd_bytes:
        raise HTTPException(status_code=400, detail="PRPD file is empty.")

    if not detect.file_ext_ok(prpd.filename or ""):
        raise HTTPException(
            status_code=400,
            detail=(
                f'"{prpd.filename}" is not a supported image type. '
                f"Allowed: {', '.join(settings.allowed_extensions)}"
            ),
        )

    tf_bytes = None
    if tf is not None and tf.filename:
        tf_bytes = await tf.read()
        if tf_bytes and not detect.file_ext_ok(tf.filename):
            raise HTTPException(
                status_code=400,
                detail=f'"{tf.filename}" is not a supported image type.',
            )

    # Fail fast on undecodable data before creating any rows.
    decode_image(prpd_bytes)
    if tf_bytes:
        decode_image(tf_bytes)

    base_name = safe_name_from_filename(prpd.filename or "case")
    base_name = base_name.replace("_PRPD", "").replace("_prpd", "") or base_name

    # ---- batch ----
    if batch_id is not None:
        batch = owned_batch(db, batch_id, user)
    else:
        is_single = batch_name is None
        batch = Batch(
            batch_key=next_batch_key(db),
            name=batch_name or f"{base_name} (single upload)",
            is_single=is_single,
            created_by=user.username,
            owner_id=user.id,
        )
        db.add(batch)
        db.flush()

    existing = db.scalar(
        select(Case).where(
            Case.case_base_name == base_name, Case.batch_id == batch.id
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f'Case "{base_name}" already exists in this batch.',
        )

    case = Case(
        batch_id=batch.id,
        owner_id=user.id,
        record_id=base_name,
        case_base_name=base_name,
        case_folder=f"{base_name}_SUM",
        defect_id=defect_id,
        defect_name=defect_name or "Uploaded case (unclassified)",
        prpd_filename=prpd.filename,
        tf_filename=tf.filename if tf_bytes else None,
        reviewer_role=user.role,
        confirmed_pd_source_type=None,
    )
    db.add(case)
    db.flush()

    prpd_path, prpd_rel = save_upload(prpd_bytes, base_name, "original_PRPD", prpd.filename or "prpd.png")
    case.prpd_storage_path = prpd_rel
    case.original_prpd_path = prpd_rel
    case.source_prpd_path = prpd.filename

    if tf_bytes:
        tf_path, tf_rel = save_upload(tf_bytes, base_name, "original_TF", tf.filename or "tf.png")
        case.tf_storage_path = tf_rel
        case.original_tf_path = tf_rel
        case.source_tf_path = tf.filename

    case.result_folder = to_storage_rel(case_result_dir(base_name))

    log_usage(db, user.username, "upload_file", f"{base_name} ({case.n_files} file(s))")
    db.commit()
    db.refresh(case)

    return serialize_case(case, include_detail=True)


# =========================================================================
# READ
# =========================================================================
@router.get("")
def list_cases(
    batch_id: int | None = None,
    status_filter: str | None = None,
    defect_name: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    stmt = select(Case).where(Case.owner_id == user.id).order_by(Case.id)
    if batch_id is not None:
        stmt = stmt.where(Case.batch_id == batch_id)
    if status_filter:
        stmt = stmt.where(Case.status == status_filter)
    if defect_name:
        stmt = stmt.where(Case.defect_name == defect_name)
    return [serialize_case(c) for c in db.scalars(stmt).all()]


@router.get("/{case_id}")
def get_case(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    case = owned_case(db, case_id, user)
    return serialize_case(case, include_detail=True)


@router.get("/{case_id}/points")
def get_case_points(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Extracted PRPD scatter points, so the browser can draw the plot itself."""
    case = owned_case(db, case_id, user)
    if not case.prpd_storage_path:
        raise HTTPException(status_code=400, detail="Case has no PRPD image")

    img = read_image(settings.storage_dir / case.prpd_storage_path)
    h, w = img.shape[:2]

    points = detect.extract_prpd_points(
        img,
        case.x_left_0deg if case.x_left_0deg is not None else int(w * 0.18),
        case.x_right_360deg if case.x_right_360deg is not None else int(w * 0.88),
        case.y_top_plot if case.y_top_plot is not None else int(h * 0.15),
        case.y_bottom_plot if case.y_bottom_plot is not None else int(h * 0.85),
    )
    return {"image_width": w, "image_height": h, "points": points}


# =========================================================================
# ANALYSIS
# =========================================================================
class AnalyzeRequest(BaseModel):
    decision_mode: str | None = None
    confirm_input_warning: bool = False


@router.post("/{case_id}/analyze")
def analyze(
    case_id: int,
    payload: AnalyzeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    case = owned_case(db, case_id, user)

    if payload.decision_mode and payload.decision_mode not in DECISION_MODES:
        raise HTTPException(status_code=400, detail="Unknown decision_mode")

    if payload.confirm_input_warning:
        case.user_confirmed_input_warning = True

    run_analysis(db, case, payload.decision_mode)
    log_usage(db, user.username, "run_analysis", case.case_base_name)
    db.commit()
    db.refresh(case)
    return serialize_case(case, include_detail=True)


class DecisionModeRequest(BaseModel):
    decision_mode: str


@router.post("/{case_id}/decision-mode")
def set_decision_mode(
    case_id: int,
    payload: DecisionModeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Re-score an already-analysed case under a different decision rule."""
    case = owned_case(db, case_id, user)
    if payload.decision_mode not in DECISION_MODES:
        raise HTTPException(status_code=400, detail="Unknown decision_mode")

    old = case.decision_mode
    scores = [
        case.ai_confidence_corona or 0.0,
        case.ai_confidence_surface or 0.0,
        case.ai_confidence_internal or 0.0,
    ]

    ai = rules.build_ai_result(
        scores_percent=scores,
        input_mode=case.ai_input_mode or "PRPD_ONLY",
        model_used=case.ai_model_used or "",
        model_path=case.ai_model_path or "",
        decision_mode=payload.decision_mode,
        thresholds=thresholds_for_case(db, case),
    )

    if case.sanity_check_ran:
        ai = rules.apply_internal_sanity_override(
            ai, {"ran": True, "internal_ok": case.sanity_check_passed}
        )

    case.decision_mode = payload.decision_mode
    case.ai_final_result = ai["final_result"]
    case.ai_final_score_percent = ai["final_score"]
    case.ai_status = ai["status"]
    case.ai_high_conf_count = ai["high_conf_count"]
    case.ai_non_identified_percent = ai["non_identified_percent"]
    case.ai_decision_rule = ai["ai_decision_rule"]
    case.ai_threshold_percent = ai["ai_threshold_percent"]
    case.pd_rule_class = ai["pd_rule_class"]
    case.pd_selection_rule = ai["pd_selection_rule"]
    case.is_strong_pd_rule = ai["is_strong_pd_rule"]
    case.suggested_pd_source_type = ai["suggested_pd_source"]

    log_edit(db, case, "decision_mode", old, payload.decision_mode, user.username)
    db.commit()
    db.refresh(case)
    return serialize_case(case, include_detail=True)


# =========================================================================
# PD SOURCE
# =========================================================================
class PdSourceRequest(BaseModel):
    confirmed_pd_source_type: str


@router.post("/{case_id}/pd-source")
def confirm_pd_source(
    case_id: int,
    payload: PdSourceRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    case = owned_case(db, case_id, user)
    if payload.confirmed_pd_source_type not in PD_SOURCE_OPTIONS:
        raise HTTPException(status_code=400, detail="Unknown PD source type")

    old = case.confirmed_pd_source_type
    case.confirmed_pd_source_type = payload.confirmed_pd_source_type
    log_edit(
        db, case, "confirmed_pd_source_type", old, payload.confirmed_pd_source_type, user.username
    )
    # Severity depends on the PD source group, so it has to be recomputed here.
    recompute_gap(db, case)
    db.commit()
    db.refresh(case)
    return serialize_case(case, include_detail=True)


# =========================================================================
# CALIBRATION
# =========================================================================
class CalibrationRequest(BaseModel):
    x_left_0deg: int
    x_right_360deg: int
    y_top_plot: int
    y_bottom_plot: int
    calibration_source: str | None = None
    calibration_mode: str | None = None


@router.put("/{case_id}/calibration")
def update_calibration(
    case_id: int,
    payload: CalibrationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    case = owned_case(db, case_id, user)

    if payload.x_right_360deg <= payload.x_left_0deg:
        raise HTTPException(
            status_code=400, detail="x_right_360deg must be greater than x_left_0deg."
        )
    if payload.y_bottom_plot <= payload.y_top_plot:
        raise HTTPException(
            status_code=400, detail="y_bottom must be greater than y_top."
        )

    for field in ("x_left_0deg", "x_right_360deg", "y_top_plot", "y_bottom_plot"):
        new = getattr(payload, field)
        old = getattr(case, field)
        if old != new:
            log_edit(db, case, field, old, new, user.username)
            setattr(case, field, new)

    case.calibration_source = payload.calibration_source or "manual_axis_adjusted"
    if payload.calibration_mode:
        case.calibration_mode = payload.calibration_mode

    recompute_gap(db, case)
    db.commit()
    db.refresh(case)
    return serialize_case(case, include_detail=True)


@router.post("/{case_id}/calibration/auto-detect")
def rerun_auto_calibration(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    import cv2

    case = owned_case(db, case_id, user)

    img = read_image(settings.storage_dir / case.prpd_storage_path)
    frame = detect.detect_prpd_plot_frame(cv2.cvtColor(img, cv2.COLOR_RGB2BGR))

    case.x_left_0deg = frame["x_left"]
    case.x_right_360deg = frame["x_right"]
    case.y_top_plot = frame["y_top"]
    case.y_bottom_plot = frame["y_bottom"]
    case.calibration_source = frame["status"]
    case.auto_calibration_status = frame["status"]
    case.calibration_mode = "Use auto-detected calibration"
    case.calibration_preset_loaded = False
    case.plot_area_ratio = frame["plot_area_ratio"]

    recompute_gap(db, case)
    log_usage(db, user.username, "rerun_auto_calibration", case.case_base_name)
    db.commit()
    db.refresh(case)
    return serialize_case(case, include_detail=True)


@router.post("/{case_id}/calibration/apply-preset/{preset_id}")
def apply_preset(
    case_id: int,
    preset_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    case = owned_case(db, case_id, user)
    preset = owned_preset(db, preset_id, user)

    case.x_left_0deg = preset.x_left_0deg
    case.x_right_360deg = preset.x_right_360deg
    case.y_top_plot = preset.y_top_plot
    case.y_bottom_plot = preset.y_bottom_plot
    case.calibration_source = "saved_calibration_preset_auto_loaded"
    case.calibration_preset_loaded = True
    case.calibration_preset_path = preset.preset_name

    recompute_gap(db, case)
    log_usage(db, user.username, "apply_calibration_preset", preset.preset_name)
    db.commit()
    db.refresh(case)
    return serialize_case(case, include_detail=True)


@router.post("/{case_id}/calibration/reset")
def reset_calibration(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Reset the frame to the PDProcessingII default, scaled if the image differs."""
    case = owned_case(db, case_id, user)

    w = case.image_width or settings.default_image_width
    h = case.image_height or settings.default_image_height

    if w == settings.default_image_width and h == settings.default_image_height:
        case.x_left_0deg = settings.default_x_left
        case.x_right_360deg = settings.default_x_right
        case.y_top_plot = settings.default_y_top
        case.y_bottom_plot = settings.default_y_bottom
    else:
        case.x_left_0deg = int(w * 0.18)
        case.x_right_360deg = int(w * 0.88)
        case.y_top_plot = int(h * 0.15)
        case.y_bottom_plot = int(h * 0.85)

    case.calibration_source = "manual_axis_adjusted"
    case.calibration_mode = "Manual calibration"
    case.calibration_preset_loaded = False

    recompute_gap(db, case)
    db.commit()
    db.refresh(case)
    return serialize_case(case, include_detail=True)


@router.get("/{case_id}/calibration/matching-preset")
def matching_preset(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    case = owned_case(db, case_id, user)

    preset = find_matching_preset(db, case.image_width or 0, case.image_height or 0, user.id)
    if preset is None:
        return {"preset": None}
    return {
        "preset": {
            "id": preset.id,
            "preset_name": preset.preset_name,
            "image_width": preset.image_width,
            "image_height": preset.image_height,
            "x_left_0deg": preset.x_left_0deg,
            "x_right_360deg": preset.x_right_360deg,
            "y_top_plot": preset.y_top_plot,
            "y_bottom_plot": preset.y_bottom_plot,
            "saved_time": preset.saved_time.isoformat(),
            "remark": preset.remark,
        }
    }


# =========================================================================
# GAP-TIME
# =========================================================================
class GapLinesRequest(BaseModel):
    left_line_pixel: float
    right_line_pixel: float


@router.put("/{case_id}/gap")
def update_gap_lines(
    case_id: int,
    payload: GapLinesRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    case = owned_case(db, case_id, user)

    old_left, old_right = case.left_line_pixel, case.right_line_pixel
    case.left_line_pixel = payload.left_line_pixel
    case.right_line_pixel = payload.right_line_pixel
    case.gap_line_source = "manual"
    case.gap_measurement_status = "manually_adjusted"

    log_edit(db, case, "left_line_pixel", old_left, payload.left_line_pixel, user.username)
    log_edit(db, case, "right_line_pixel", old_right, payload.right_line_pixel, user.username)

    recompute_gap(db, case)
    db.commit()
    db.refresh(case)
    return serialize_case(case, include_detail=True)


class GapDetectRequest(BaseModel):
    # "rule" = rule-based OpenCV detection, "model" = auto-gap regression.
    method: str = "rule"


@router.post("/{case_id}/gap/detect")
def detect_gap(
    case_id: int,
    payload: GapDetectRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    case = owned_case(db, case_id, user)
    if payload.method not in ("rule", "model", "auto"):
        raise HTTPException(status_code=400, detail="method must be rule, model or auto")

    outcome = suggest_gap_lines(db, case, prefer=payload.method)
    log_usage(db, user.username, f"gap_detect_{payload.method}", case.case_base_name)
    db.commit()
    db.refresh(case)

    result = serialize_case(case, include_detail=True)
    result["detection"] = outcome
    return result


@router.get("/{case_id}/gap/validate")
def validate_gap(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    case = owned_case(db, case_id, user)

    metrics = {
        "gap_angle_deg": case.gap_angle_deg,
        "gap_time_ms": case.gap_time_ms,
    }
    ok, message = rules.validate_gap_time_result(
        metrics,
        x_left=case.x_left_0deg or 0,
        x_right=case.x_right_360deg or 0,
        y_top=case.y_top_plot or 0,
        y_bottom=case.y_bottom_plot or 0,
        left_x=case.left_line_pixel,
        right_x=case.right_line_pixel,
        not_measurable_recommended=bool(case.auto_not_measurable_recommended),
        thresholds=thresholds_for_case(db, case),
    )
    return {"valid": ok, "message": message}


# =========================================================================
# SIGN-OFF
# =========================================================================
class SaveReviewRequest(BaseModel):
    review_status: str
    review_note: str = ""
    not_measurable_reason: str = ""
    confirmed_pd_source_type: str | None = None
    remark: str = ""


@router.post("/{case_id}/review")
def save_review(
    case_id: int,
    payload: SaveReviewRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    case = owned_case(db, case_id, user)

    if payload.review_status not in REVIEW_STATUS_OPTIONS:
        raise HTTPException(status_code=400, detail="Unknown review_status")

    not_measurable = payload.review_status == "not_measurable"

    if not not_measurable:
        metrics = {"gap_angle_deg": case.gap_angle_deg, "gap_time_ms": case.gap_time_ms}
        ok, message = rules.validate_gap_time_result(
            metrics,
            x_left=case.x_left_0deg or 0,
            x_right=case.x_right_360deg or 0,
            y_top=case.y_top_plot or 0,
            y_bottom=case.y_bottom_plot or 0,
            left_x=case.left_line_pixel,
            right_x=case.right_line_pixel,
            not_measurable_recommended=bool(case.auto_not_measurable_recommended),
            thresholds=thresholds_for_case(db, case),
        )
        if not ok:
            raise HTTPException(status_code=400, detail=message)

    if payload.confirmed_pd_source_type:
        if payload.confirmed_pd_source_type not in PD_SOURCE_OPTIONS:
            raise HTTPException(status_code=400, detail="Unknown PD source type")
        log_edit(
            db,
            case,
            "confirmed_pd_source_type",
            case.confirmed_pd_source_type,
            payload.confirmed_pd_source_type,
            user.username,
        )
        case.confirmed_pd_source_type = payload.confirmed_pd_source_type

    log_edit(db, case, "review_status", case.review_status, payload.review_status, user.username)

    case.review_status = payload.review_status
    case.review_note = payload.review_note
    case.remark = payload.remark
    case.not_measurable_reason = payload.not_measurable_reason if not_measurable else ""
    case.reviewer_name = user.username
    case.reviewer_role = user.role
    case.status = "done"

    if not_measurable:
        case.gap_time_band = "Not measurable"
        case.severity_by_gap_time = "Not measurable"
        case.gap_measurement_status = "not_measurable"
    else:
        recompute_gap(db, case)

    # Render the annotated gap-time image, same output as CMD FINAL CODE.
    try:
        img = read_image(settings.storage_dir / case.prpd_storage_path)
        folder = case_result_dir(case.case_base_name)
        out = folder / f"{safe_text_name(case.case_base_name)}_annotated_gap_time.png"
        ai_text = (
            "AI result: Non-identified"
            if case.ai_final_result == "Non-identified"
            else f"AI top class: {case.ai_final_result} ({case.ai_final_score_percent:.2f}%)"
            if case.ai_final_score_percent is not None
            else "AI: Not executed"
        )
        save_annotated_image(
            img,
            out,
            case_base_name=case.case_base_name,
            x_left=case.x_left_0deg,
            x_right=case.x_right_360deg,
            y_top=case.y_top_plot,
            y_bottom=case.y_bottom_plot,
            left_x=case.left_line_pixel,
            right_x=case.right_line_pixel,
            gap_angle=case.gap_angle_deg,
            gap_time_ms=case.gap_time_ms,
            gap_band=case.gap_time_band or "",
            pd_source_type=case.confirmed_pd_source_type or "",
            severity=case.severity_by_gap_time or "",
            ai_text=ai_text,
            not_measurable=not_measurable,
        )
        case.annotated_image_path = to_storage_rel(out)
    except Exception:  # rendering must never block a sign-off
        case.annotated_image_path = case.annotated_image_path or ""

    log_usage(
        db, user.username, "save_review", f"{case.case_base_name} ({case.review_status})"
    )
    db.commit()
    db.refresh(case)
    return serialize_case(case, include_detail=True)


# =========================================================================
# DELETE
# =========================================================================
@router.delete("/{case_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_case(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    case = owned_case(db, case_id, user)

    name = case.case_base_name
    batch_id = case.batch_id

    db.execute(delete(EditHistory).where(EditHistory.case_id == case.id))
    db.delete(case)
    db.flush()

    # Drop the batch too once its last case is gone.
    if batch_id is not None:
        remaining = db.scalar(
            select(func.count(Case.id)).where(Case.batch_id == batch_id)
        )
        if not remaining:
            batch = db.get(Batch, batch_id)
            if batch is not None:
                db.delete(batch)

    log_usage(db, user.username, "delete_case", name)
    db.commit()
