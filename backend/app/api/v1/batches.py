"""Batches, dashboard aggregation, calibration presets and the usage log."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import delete, desc, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.entities import (
    Batch,
    CalibrationPreset,
    Case,
    EditHistory,
    TrainingRun,
    UsageLog,
    User,
    UserThreshold,
)
from app.services import rules
from app.services.case_service import (
    log_usage,
    next_batch_key,
    owned_batch,
    owned_preset,
    serialize_case,
    thresholds_for,
)
from app.services.cv import detect
from app.services.storage import (
    case_result_dir,
    decode_image,
    safe_name_from_filename,
    save_upload,
    to_storage_rel,
)

router = APIRouter(tags=["workspace"])


# =========================================================================
# BATCHES
# =========================================================================
def _severity_bucket(case: Case) -> str:
    sev = case.severity_by_gap_time
    if sev in ("High", "Moderate", "Initial"):
        return sev
    return "Pending"


def _batch_summary(batch: Batch) -> dict[str, Any]:
    total = len(batch.cases)
    done = sum(1 for c in batch.cases if c.status == "done")
    in_review = sum(1 for c in batch.cases if c.status == "in_review")
    high = sum(1 for c in batch.cases if _severity_bucket(c) == "High")

    if total and done == total:
        overall = "done"
    elif in_review or done:
        overall = "in_review"
    else:
        overall = "pending"

    return {
        "id": batch.id,
        "batch_key": batch.batch_key,
        "name": batch.name,
        "is_single": batch.is_single,
        "upload_date": batch.upload_date.isoformat() if batch.upload_date else None,
        "created_by": batch.created_by,
        "total": total,
        "done": done,
        "high_severity": high,
        "overall_status": overall,
        "first_case_id": batch.cases[0].id if batch.cases else None,
    }


@router.get("/batches")
def list_batches(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[dict[str, Any]]:
    """Upload history, ordered by what needs attention first.

    Unfinished batches first, then by high-severity count, then newest.
    """
    batches = db.scalars(select(Batch).where(Batch.owner_id == user.id)).unique().all()
    summaries = [_batch_summary(b) for b in batches]
    summaries.sort(
        key=lambda s: (
            1 if s["done"] >= s["total"] and s["total"] > 0 else 0,
            -s["high_severity"],
            s["upload_date"] or "",
        ),
    )
    # The date component sorts ascending above; flip it so newest comes first
    # within each (open, severity) tier.
    summaries.sort(
        key=lambda s: (
            1 if s["done"] >= s["total"] and s["total"] > 0 else 0,
            -s["high_severity"],
        )
    )
    return summaries


@router.post("/batches", status_code=status.HTTP_201_CREATED)
def create_batch(
    name: str = Form(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    batch = Batch(
        batch_key=next_batch_key(db),
        name=name,
        is_single=False,
        created_by=user.username,
        owner_id=user.id,
    )
    db.add(batch)
    db.flush()
    log_usage(db, user.username, "create_batch", name)
    db.commit()
    db.refresh(batch)
    return _batch_summary(batch)


@router.post("/batches/{batch_id}/upload", status_code=status.HTTP_201_CREATED)
async def upload_folder(
    batch_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Folder/batch import.

    Files are paired by case key: `<case>_PRPD.jpg` + `<case>_TF.jpg` become one
    Hybrid case, an unpaired PRPD becomes a PRPD-only case.
    """
    batch = owned_batch(db, batch_id, user)

    buckets: dict[str, dict[str, tuple[str, bytes]]] = {}
    rejected: list[dict[str, str]] = []

    for upload in files:
        filename = upload.filename or ""
        if not detect.file_ext_ok(filename):
            rejected.append({"filename": filename, "reason": "unsupported file type"})
            continue

        data = await upload.read()
        if not data:
            rejected.append({"filename": filename, "reason": "empty file"})
            continue

        key = detect.extract_case_key(filename) or safe_name_from_filename(filename)
        slot = "tf" if detect.filename_suggests_tf(filename) is True else "prpd"
        buckets.setdefault(key, {})[slot] = (filename, data)

    created: list[dict[str, Any]] = []

    for key, slots in buckets.items():
        if "prpd" not in slots:
            rejected.append(
                {"filename": slots["tf"][0], "reason": "TF map without a matching PRPD image"}
            )
            continue

        prpd_name, prpd_bytes = slots["prpd"]
        tf_entry = slots.get("tf")

        try:
            decode_image(prpd_bytes)
            if tf_entry:
                decode_image(tf_entry[1])
        except ValueError as exc:
            rejected.append({"filename": prpd_name, "reason": str(exc)})
            continue

        base_name = safe_name_from_filename(prpd_name)
        base_name = base_name.replace("_PRPD", "").replace("_prpd", "") or base_name

        if db.scalar(
            select(Case).where(
                Case.case_base_name == base_name, Case.batch_id == batch.id
            )
        ):
            rejected.append({"filename": prpd_name, "reason": "duplicate case in this batch"})
            continue

        case = Case(
            batch_id=batch.id,
            owner_id=user.id,
            record_id=base_name,
            case_base_name=base_name,
            case_folder=f"{base_name}_SUM",
            defect_name="Imported case (unclassified)",
            prpd_filename=prpd_name,
            tf_filename=tf_entry[0] if tf_entry else None,
            reviewer_role=user.role,
        )
        db.add(case)
        db.flush()

        _, prpd_rel = save_upload(prpd_bytes, base_name, "original_PRPD", prpd_name)
        case.prpd_storage_path = prpd_rel
        case.original_prpd_path = prpd_rel
        case.source_prpd_path = prpd_name

        if tf_entry:
            _, tf_rel = save_upload(tf_entry[1], base_name, "original_TF", tf_entry[0])
            case.tf_storage_path = tf_rel
            case.original_tf_path = tf_rel
            case.source_tf_path = tf_entry[0]

        case.result_folder = to_storage_rel(case_result_dir(base_name))
        created.append(serialize_case(case))

    log_usage(
        db,
        user.username,
        "upload_batch",
        f"{batch.name}: {len(created)} case(s), {len(rejected)} rejected",
    )
    db.commit()

    return {"created": created, "rejected": rejected, "batch": _batch_summary(batch)}


@router.get("/batches/{batch_id}")
def get_batch(
    batch_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    batch = owned_batch(db, batch_id, user)
    summary = _batch_summary(batch)
    summary["cases"] = [serialize_case(c) for c in batch.cases]
    return summary


# response_model=None is explicit: with `from __future__ import annotations`
# a `-> None` handler resolves to NoneType, which older FastAPI treats as a real
# response model and rejects against a 204.
@router.delete("/batches/{batch_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_batch(
    batch_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    batch = owned_batch(db, batch_id, user)

    case_ids = [c.id for c in batch.cases]
    if case_ids:
        db.execute(delete(EditHistory).where(EditHistory.case_id.in_(case_ids)))

    name, count = batch.name, len(batch.cases)
    db.delete(batch)
    log_usage(db, user.username, "delete_batch", f"{name} ({count} cases)")
    db.commit()


# =========================================================================
# DASHBOARD
# =========================================================================
@router.get("/dashboard")
def dashboard(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    cases = db.scalars(select(Case).where(Case.owner_id == user.id)).all()
    total = len(cases)

    def count_result(label: str) -> int:
        return sum(1 for c in cases if c.ai_final_result == label)

    def pct(n: int) -> int:
        return round(n / total * 100) if total else 0

    corona, surface, internal = (
        count_result("Corona"),
        count_result("Surface"),
        count_result("Internal"),
    )

    # Folder/batch uploads get their own severity breakdown on the batch's own
    # page; mixing them in here made this table an unreadable pile of every
    # case regardless of where it came from. This section is single-upload
    # cases only.
    single_cases = [c for c in cases if c.batch is not None and c.batch.is_single]

    groups = []
    for key, label in (
        ("High", "High severity"),
        ("Moderate", "Moderate severity"),
        ("Initial", "Initial severity"),
        ("Pending", "Awaiting gap-time measurement"),
    ):
        members = [c for c in single_cases if _severity_bucket(c) == key]
        groups.append(
            {
                "key": key,
                "label": label,
                "count": len(members),
                "cases": [serialize_case(c) for c in members],
            }
        )

    batches = db.scalars(select(Batch).where(Batch.owner_id == user.id)).unique().all()
    history = [_batch_summary(b) for b in batches]
    history.sort(
        key=lambda s: (
            1 if s["done"] >= s["total"] and s["total"] > 0 else 0,
            -s["high_severity"],
        )
    )

    return {
        "kpi": {
            "total": total,
            "corona": corona,
            "corona_pct": pct(corona),
            "surface": surface,
            "surface_pct": pct(surface),
            "internal": internal,
            "internal_pct": pct(internal),
        },
        "severity_groups": groups,
        "upload_history": history,
        "reviewed_count": sum(1 for c in cases if c.status == "done"),
    }


# =========================================================================
# CALIBRATION PRESETS
# =========================================================================
class PresetCreate(BaseModel):
    preset_name: str
    image_width: int
    image_height: int
    x_left_0deg: int
    x_right_360deg: int
    y_top_plot: int
    y_bottom_plot: int
    example_prpd_filename: str | None = None
    example_tf_filename: str | None = None
    remark: str | None = "saved_from_auto_workflow"


def _serialize_preset(p: CalibrationPreset) -> dict[str, Any]:
    return {
        "id": p.id,
        "preset_name": p.preset_name,
        "image_width": p.image_width,
        "image_height": p.image_height,
        "x_left_0deg": p.x_left_0deg,
        "x_right_360deg": p.x_right_360deg,
        "y_top_plot": p.y_top_plot,
        "y_bottom_plot": p.y_bottom_plot,
        "saved_time": p.saved_time.isoformat() if p.saved_time else None,
        "example_prpd_filename": p.example_prpd_filename,
        "example_tf_filename": p.example_tf_filename,
        "remark": p.remark,
    }


@router.get("/presets")
def list_presets(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[dict[str, Any]]:
    presets = db.scalars(
        select(CalibrationPreset)
        .where(CalibrationPreset.owner_id == user.id)
        .order_by(desc(CalibrationPreset.saved_time))
    ).all()
    return [_serialize_preset(p) for p in presets]


@router.post("/presets", status_code=status.HTTP_201_CREATED)
def create_preset(
    payload: PresetCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    if payload.x_right_360deg <= payload.x_left_0deg:
        raise HTTPException(status_code=400, detail="x_right must be greater than x_left.")
    if payload.y_bottom_plot <= payload.y_top_plot:
        raise HTTPException(status_code=400, detail="y_bottom must be greater than y_top.")

    existing = db.scalar(
        select(CalibrationPreset).where(
            CalibrationPreset.preset_name == payload.preset_name,
            CalibrationPreset.owner_id == user.id,
        )
    )
    if existing:
        # Same name means "update this preset", matching the notebook's behaviour
        # of overwriting a preset row rather than appending duplicates.
        for field, value in payload.model_dump().items():
            setattr(existing, field, value)
        existing.saved_time = datetime.now()
        db.commit()
        db.refresh(existing)
        return _serialize_preset(existing)

    preset = CalibrationPreset(**payload.model_dump(), owner_id=user.id)
    db.add(preset)
    log_usage(db, user.username, "save_calibration_preset", payload.preset_name)
    db.commit()
    db.refresh(preset)
    return _serialize_preset(preset)


@router.delete("/presets/{preset_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_preset(
    preset_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    preset = owned_preset(db, preset_id, user)
    db.delete(preset)
    log_usage(db, user.username, "delete_calibration_preset", preset.preset_name)
    db.commit()


# =========================================================================
# USAGE LOG / EDIT HISTORY / TRAINING
# =========================================================================
@router.get("/usage-log")
def usage_log(
    limit: int = 100,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(UsageLog)
        .where(UsageLog.username == user.username)
        .order_by(desc(UsageLog.timestamp))
        .limit(limit)
    ).all()
    return [
        {
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            "username": r.username,
            "action": r.action,
            "detail": r.detail,
        }
        for r in rows
    ]


@router.get("/edit-history")
def edit_history(
    case_id: int | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    my_case_ids = select(Case.id).where(Case.owner_id == user.id)
    stmt = (
        select(EditHistory)
        .where(EditHistory.case_id.in_(my_case_ids))
        .order_by(desc(EditHistory.timestamp))
        .limit(limit)
    )
    if case_id is not None:
        stmt = stmt.where(EditHistory.case_id == case_id)
    rows = db.scalars(stmt).all()
    return [
        {
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            "case_base_name": r.case_base_name,
            "changed_field": r.changed_field,
            "old_value": r.old_value,
            "new_value": r.new_value,
            "changed_by": r.changed_by,
        }
        for r in rows
    ]


@router.get("/training/stats")
def training_stats(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    """Read-only stats for the Model Training page.

    Training itself is deliberately not implemented yet. The page shows what
    a future run would draw on.
    """
    reviewed = (
        db.scalar(
            select(func.count(Case.id)).where(
                Case.status == "done", Case.owner_id == user.id
            )
        )
        or 0
    )
    usage_count = (
        db.scalar(select(func.count(UsageLog.id)).where(UsageLog.username == user.username)) or 0
    )
    runs = db.scalars(select(TrainingRun).order_by(desc(TrainingRun.started_at))).all()

    return {
        "reviewed_cases": reviewed,
        "training_runs": len(runs),
        "usage_events": usage_count,
        "username": user.username,
        "enabled": False,
        "message": "Model training is not enabled in this build.",
        "history": [
            {
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "username": r.username,
                "dataset_size": r.dataset_size,
                "accuracy": r.accuracy,
                "note": r.note,
            }
            for r in runs
        ],
    }


@router.get("/system/status")
def system_status(user: User = Depends(get_current_user)) -> dict[str, Any]:
    from app.services.ml import engine as ml

    return {
        "final_code_version": settings.final_code_version,
        "ml": ml.engine.status(),
    }


# =========================================================================
# PER-ACCOUNT DECISION THRESHOLDS
# =========================================================================
# Bounds are sanity limits, not the defaults: they stop a value that would make
# the rule engine incoherent (a negative percentage, a gap-time band wider than
# one mains cycle) without dictating what a reviewer may study.
THRESHOLD_BOUNDS: dict[str, tuple[float, float, str]] = {
    "topclass_threshold": (0.0, 100.0, "%"),
    "joint_dual_threshold": (0.0, 100.0, "%"),
    "strong_rule_threshold": (0.0, 100.0, "%"),
    "confidence_threshold": (0.0, 100.0, "%"),
    "internal_high_confidence": (0.0, 100.0, "%"),
    "gap_time_high_ms": (0.0, 100.0, "ms"),
    "gap_time_moderate_ms": (0.0, 100.0, "ms"),
    "cycle_time_ms": (1.0, 100.0, "ms"),
}


class ThresholdPayload(BaseModel):
    topclass_threshold: float | None = None
    joint_dual_threshold: float | None = None
    strong_rule_threshold: float | None = None
    confidence_threshold: float | None = None
    internal_high_confidence: float | None = None
    gap_time_high_ms: float | None = None
    gap_time_moderate_ms: float | None = None
    cycle_time_ms: float | None = None


def _threshold_response(db: Session, user: User) -> dict[str, Any]:
    effective = thresholds_for(db, user.id)
    row = db.scalar(select(UserThreshold).where(UserThreshold.user_id == user.id))
    return {
        "effective": {name: getattr(effective, name) for name in rules.Thresholds.field_names()},
        "defaults": {
            name: getattr(rules.DEFAULT_THRESHOLDS, name)
            for name in rules.Thresholds.field_names()
        },
        "overridden": [
            name
            for name in rules.Thresholds.field_names()
            if row is not None and getattr(row, name, None) is not None
        ],
        "bounds": {k: {"min": v[0], "max": v[1], "unit": v[2]} for k, v in THRESHOLD_BOUNDS.items()},
        "updated_at": row.updated_at.isoformat() if row and row.updated_at else None,
    }


@router.get("/settings/thresholds")
def get_thresholds(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    return _threshold_response(db, user)


@router.put("/settings/thresholds")
def save_thresholds(
    payload: ThresholdPayload,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Store this account's overrides. A null field clears that override."""
    values = payload.model_dump()

    for name, value in values.items():
        if value is None:
            continue
        low, high, unit = THRESHOLD_BOUNDS[name]
        if not low <= float(value) <= high:
            raise HTTPException(
                status_code=400,
                detail=f"{name} must be between {low:g} and {high:g} {unit}.",
            )

    # A band is only meaningful if its lower bound really is lower.
    high_ms = values.get("gap_time_high_ms")
    moderate_ms = values.get("gap_time_moderate_ms")
    effective = thresholds_for(db, user.id)
    high_ms = effective.gap_time_high_ms if high_ms is None else float(high_ms)
    moderate_ms = effective.gap_time_moderate_ms if moderate_ms is None else float(moderate_ms)
    if high_ms >= moderate_ms:
        raise HTTPException(
            status_code=400,
            detail="The High gap-time bound must be smaller than the Moderate bound.",
        )

    row = db.scalar(select(UserThreshold).where(UserThreshold.user_id == user.id))
    if row is None:
        row = UserThreshold(user_id=user.id)
        db.add(row)

    changed: list[str] = []
    for name, value in values.items():
        old = getattr(row, name, None)
        if old != value:
            changed.append(name)
        setattr(row, name, None if value is None else float(value))

    log_usage(db, user.username, "update_thresholds", ", ".join(changed) or "no change")
    db.commit()
    return _threshold_response(db, user)


@router.delete("/settings/thresholds", status_code=status.HTTP_200_OK)
def reset_thresholds(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    """Drop every override so the account returns to the published defaults."""
    db.execute(delete(UserThreshold).where(UserThreshold.user_id == user.id))
    log_usage(db, user.username, "reset_thresholds", "restored CMD FINAL V2 defaults")
    db.commit()
    return _threshold_response(db, user)
