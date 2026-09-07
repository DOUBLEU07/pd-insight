"""The Model Training page: dataset staging, training runs and model selection.

Every model here belongs to one account. An account can only list, train with,
select or delete models it built itself, and the dataset it uploads is staged
under its own directory.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.entities import Case, TrainedModel, UsageLog, User
from app.services.case_service import log_usage, thresholds_for
from app.services import rules
from app.services.cv import detect
from app.services.ml import engine as ml
from app.services.ml import training
from app.services.storage import decode_image

router = APIRouter(prefix="/training", tags=["training"])

MODEL_KINDS: dict[str, str] = {
    "prpd_only": "PRPD-only",
    "hybrid": "Hybrid (PRPD & T-F map)",
}


# =========================================================================
# SERIALISATION
# =========================================================================
def _classes(row: TrainedModel) -> list[str]:
    return json.loads(row.class_names or "[]")


def _serialize(row: TrainedModel, *, detail: bool = False) -> dict[str, Any]:
    class_names = _classes(row)
    payload: dict[str, Any] = {
        "id": row.id,
        "name": row.name,
        "kind": row.kind,
        "kind_label": MODEL_KINDS.get(row.kind, row.kind),
        "status": row.status,
        "is_active": row.is_active,
        "progress": row.progress,
        "stage": row.stage,
        "class_names": class_names,
        "pd_sources": json.loads(row.pd_sources or "{}"),
        "severity_groups": json.loads(row.severity_groups or "{}"),
        "max_epochs": row.max_epochs,
        "batch_size": row.batch_size,
        "learning_rate": row.learning_rate,
        "backbone": row.backbone,
        "train_count": row.train_count,
        "test_count": row.test_count,
        "valid_count": row.valid_count,
        "dataset_size": row.train_count + row.test_count + row.valid_count,
        "epochs": row.epochs,
        "accuracy": row.accuracy,
        "val_accuracy": row.val_accuracy,
        "loss": row.loss,
        "engine_used": row.engine_used,
        "note": row.note,
        "error": row.error,
        "data_consent": row.data_consent,
        "consent_at": row.consent_at.isoformat() if row.consent_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "started_at": row.started_at.isoformat() if row.started_at else None,
        "finished_at": row.finished_at.isoformat() if row.finished_at else None,
        # A model is selectable for analysis once it has finished and produced
        # a real artifact. Its classes need not be the published three: the
        # rule engine reads them through the scheme stored alongside.
        "can_activate": row.status == "completed" and bool(row.artifact_path),
        # Whether the published PD source cascade applies unchanged, which is
        # what the wizard warns about when a class set drops Internal.
        "uses_published_classes": class_names == list(settings.class_names),
    }

    if detail:
        payload["dataset_detail"] = json.loads(row.dataset_detail or "{}")
        payload["thresholds"] = json.loads(row.thresholds_snapshot or "{}")

    return payload


def _owned(db: Session, model_id: int, user: User) -> TrainedModel:
    row = db.get(TrainedModel, model_id)
    if row is None or row.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Model not found")
    return row


# A draft exists only while its wizard is open. Closing the browser instead of
# pressing Cancel would otherwise leave the staged images on disk for good, so
# an account's own abandoned drafts are swept when it opens the page or starts
# another one. The window is a full day, well past any session someone could
# still be filling in.
STALE_DRAFT_HOURS = 24


def _sweep_stale_drafts(db: Session, user: User) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=STALE_DRAFT_HOURS)

    # The age comparison is done in Python, not in the WHERE clause: SQLite
    # stores these columns naive while Postgres keeps them aware, and binding
    # an aware cutoff against SQLite's naive text silently matches nothing.
    # There are only ever a handful of drafts per account to look at.
    drafts = db.scalars(
        select(TrainedModel).where(
            TrainedModel.owner_id == user.id, TrainedModel.status == "draft"
        )
    ).all()

    stale = []
    for row in drafts:
        created = row.created_at
        if created is None:
            continue
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if created < cutoff:
            stale.append(row)

    for row in stale:
        training.discard_dataset(user.id, row.id)
        db.delete(row)
    if stale:
        db.commit()


# =========================================================================
# STATS
# =========================================================================
@router.get("/stats")
def training_stats(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    """What the Training page shows above the model list."""
    _sweep_stale_drafts(db, user)
    reviewed = (
        db.scalar(
            select(func.count(Case.id)).where(Case.status == "done", Case.owner_id == user.id)
        )
        or 0
    )
    usage_count = (
        db.scalar(select(func.count(UsageLog.id)).where(UsageLog.username == user.username)) or 0
    )
    models = db.scalars(
        select(TrainedModel)
        .where(TrainedModel.owner_id == user.id, TrainedModel.status != "draft")
        .order_by(desc(TrainedModel.created_at))
    ).all()

    return {
        "reviewed_cases": reviewed,
        "training_runs": len(models),
        "usage_events": usage_count,
        "username": user.username,
        "tensorflow_available": ml.engine.status()["tensorflow_available"],
        "recommended_split": training.RECOMMENDED_SPLIT,
        "canonical_classes": training.CANONICAL_CLASSES,
        "history": [_serialize(m) for m in models],
    }


# =========================================================================
# MODELS
# =========================================================================
class ClassSpec(BaseModel):
    """One output class, and what it means to the rule engine."""

    name: str = Field(min_length=1, max_length=64)
    # PD source reported when this class wins. Defaults to the published
    # mapping for Corona / Surface / Internal.
    pd_source: str | None = None
    # 1 = gap-time gives Initial / Moderate / High, 2 = Moderate / High only.
    severity_group: int = 1


class CreateModelRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    kind: str = "prpd_only"
    classes: list[ClassSpec] | None = None
    # Accepted for callers that only want the published three classes.
    class_names: list[str] | None = None

    # ---- training configuration ----
    max_epochs: int = training.MAX_EPOCHS
    batch_size: int = training.BATCH_SIZE
    learning_rate: float = training.LEARNING_RATE
    backbone: str = "scratch"

    # "May the dataset you upload here be passed to the PD Insight developers
    # to improve the published models?" Declining changes nothing about the
    # run; it only records that the data must not be taken.
    data_consent: bool = False


@router.get("/models")
def list_models(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[dict[str, Any]]:
    _sweep_stale_drafts(db, user)
    rows = db.scalars(
        select(TrainedModel)
        .where(TrainedModel.owner_id == user.id)
        .order_by(desc(TrainedModel.created_at))
    ).all()
    return [_serialize(r) for r in rows]


@router.post("/models", status_code=status.HTTP_201_CREATED)
def create_model(
    payload: CreateModelRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Open a draft. The dataset is uploaded against the id this returns."""
    _sweep_stale_drafts(db, user)

    if payload.kind not in MODEL_KINDS:
        raise HTTPException(status_code=400, detail="Model type must be PRPD-only or Hybrid.")

    specs = _resolve_classes(payload)
    names = [c.name.strip() for c in specs]
    if len(names) < 2:
        raise HTTPException(status_code=400, detail="A model needs at least two classes.")
    if len(set(names)) != len(names):
        raise HTTPException(status_code=400, detail="Class names must be unique.")

    pd_sources: dict[str, str] = {}
    severity_groups: dict[str, int] = {}
    for spec in specs:
        class_name = spec.name.strip()
        source = (spec.pd_source or "").strip() or rules.DEFAULT_PD_SOURCES.get(
            class_name, f"{class_name} discharge"
        )
        if spec.severity_group not in (1, 2):
            raise HTTPException(
                status_code=400,
                detail=f'"{class_name}": severity group must be 1 or 2.',
            )
        pd_sources[class_name] = source
        # Two classes sharing a source must agree on its severity group,
        # because severity is looked up by source, not by class.
        existing = severity_groups.get(source)
        if existing is not None and existing != spec.severity_group:
            raise HTTPException(
                status_code=400,
                detail=(
                    f'"{source}" is used by two classes with different severity '
                    "groups. Give them the same group, or different PD sources."
                ),
            )
        severity_groups[source] = spec.severity_group

    config = _validate_config(payload)

    name = payload.name.strip()
    if db.scalar(
        select(TrainedModel).where(TrainedModel.owner_id == user.id, TrainedModel.name == name)
    ):
        raise HTTPException(
            status_code=409, detail=f'You already have a model called "{name}".'
        )

    row = TrainedModel(
        owner_id=user.id,
        name=name,
        kind=payload.kind,
        status="draft",
        class_names=json.dumps(names),
        pd_sources=json.dumps(pd_sources),
        severity_groups=json.dumps(severity_groups),
        data_consent=payload.data_consent,
        consent_at=datetime.now(timezone.utc) if payload.data_consent else None,
        **config,
    )
    db.add(row)
    db.flush()
    training.write_consent_marker(
        user.id, row.id, username=user.username, model_name=name, consent=payload.data_consent
    )
    log_usage(db, user.username, "create_model_draft", f"{name} ({payload.kind})")
    db.commit()
    db.refresh(row)
    return _serialize(row, detail=True)


def _resolve_classes(payload: CreateModelRequest) -> list[ClassSpec]:
    """Accept either the full class specs or a plain list of names."""
    if payload.classes:
        return payload.classes
    names = payload.class_names or list(settings.class_names)
    return [
        ClassSpec(
            name=n,
            pd_source=rules.DEFAULT_PD_SOURCES.get(n.strip()),
            severity_group=rules.DEFAULT_SEVERITY_GROUPS.get(
                rules.DEFAULT_PD_SOURCES.get(n.strip(), ""), 1
            ),
        )
        for n in names
    ]


def _validate_config(payload: CreateModelRequest) -> dict[str, Any]:
    """Range-check the training settings the wizard sends."""
    low, high = training.EPOCH_RANGE
    if not low <= payload.max_epochs <= high:
        raise HTTPException(
            status_code=400, detail=f"Epochs must be between {low} and {high}."
        )
    low, high = training.BATCH_RANGE
    if not low <= payload.batch_size <= high:
        raise HTTPException(
            status_code=400, detail=f"Batch size must be between {low} and {high}."
        )
    low, high = training.LEARNING_RATE_RANGE
    if not low <= payload.learning_rate <= high:
        raise HTTPException(
            status_code=400, detail=f"Learning rate must be between {low:g} and {high:g}."
        )
    if payload.backbone not in training.BACKBONES:
        raise HTTPException(
            status_code=400,
            detail=f"Backbone must be one of {', '.join(training.BACKBONES)}.",
        )
    return {
        "max_epochs": payload.max_epochs,
        "batch_size": payload.batch_size,
        "learning_rate": payload.learning_rate,
        "backbone": payload.backbone,
    }


@router.get("/models/{model_id}")
def get_model(
    model_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    """One model, with the dataset staged for it so far and what still blocks a run."""
    row = _owned(db, model_id, user)
    class_names = _classes(row)
    summary = training.dataset_summary(user.id, row.id, class_names, row.kind)

    payload = _serialize(row, detail=True)
    payload["dataset"] = summary
    payload["blocking"] = training.readiness(summary, class_names)
    payload["warnings"] = training.balance_warnings(summary, class_names)
    return payload


@router.post("/models/{model_id}/data", status_code=status.HTTP_201_CREATED)
async def upload_training_data(
    model_id: int,
    split: str = Form(...),
    class_name: str = Form(...),
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Stage images for one class of one split."""
    row = _owned(db, model_id, user)
    if row.status not in ("draft", "failed"):
        raise HTTPException(
            status_code=409,
            detail="This model has already been trained. Create a new model to change its data.",
        )
    if split not in training.SPLITS:
        raise HTTPException(status_code=400, detail=f"Split must be one of {training.SPLITS}.")

    class_names = _classes(row)
    if class_name not in class_names:
        raise HTTPException(status_code=400, detail=f'"{class_name}" is not a class of this model.')

    accepted: list[str] = []
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
        try:
            decode_image(data)
        except ValueError as exc:
            rejected.append({"filename": filename, "reason": str(exc)})
            continue

        accepted.append(
            training.stage_file(user.id, row.id, split, class_name, filename, data)
        )

    summary = training.dataset_summary(user.id, row.id, class_names, row.kind)
    _store_counts(row, summary)
    log_usage(
        db,
        user.username,
        "upload_training_data",
        f"{row.name}: {len(accepted)} file(s) into {split}/{class_name}",
    )
    db.commit()

    return {
        "accepted": accepted,
        "rejected": rejected,
        "dataset": summary,
        "blocking": training.readiness(summary, class_names),
        "warnings": training.balance_warnings(summary, class_names),
    }


@router.delete("/models/{model_id}/data")
def clear_training_data(
    model_id: int,
    split: str,
    class_name: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Empty one class of one split, so a wrong folder can be re-uploaded."""
    row = _owned(db, model_id, user)
    if row.status not in ("draft", "failed"):
        raise HTTPException(status_code=409, detail="This model has already been trained.")
    if split not in training.SPLITS:
        raise HTTPException(status_code=400, detail=f"Split must be one of {training.SPLITS}.")

    class_names = _classes(row)
    training.clear_split(user.id, row.id, split, class_name)

    summary = training.dataset_summary(user.id, row.id, class_names, row.kind)
    _store_counts(row, summary)
    db.commit()

    return {
        "dataset": summary,
        "blocking": training.readiness(summary, class_names),
        "warnings": training.balance_warnings(summary, class_names),
    }


@router.post("/models/{model_id}/train")
def start_training(
    model_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Check the dataset, snapshot the thresholds, and start the run."""
    row = _owned(db, model_id, user)
    if row.status in ("queued", "running"):
        raise HTTPException(status_code=409, detail="This model is already training.")
    if row.status == "completed":
        raise HTTPException(status_code=409, detail="This model has already been trained.")

    class_names = _classes(row)
    summary = training.dataset_summary(user.id, row.id, class_names, row.kind)
    blocking = training.readiness(summary, class_names)
    if blocking:
        raise HTTPException(status_code=400, detail=" ".join(blocking))

    _store_counts(row, summary)
    row.status = "queued"
    row.progress = 0
    row.stage = "Queued"
    row.error = None
    row.thresholds_snapshot = json.dumps(asdict(thresholds_for(db, user.id)))
    log_usage(
        db,
        user.username,
        "train_model_started",
        f"{row.name} ({row.kind}), {summary['total']} sample(s)",
    )
    db.commit()

    training.start(row.id)
    db.refresh(row)
    return _serialize(row, detail=True)


@router.post("/models/{model_id}/activate")
def activate_model(
    model_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    """Score this account's future analyses with this model."""
    row = _owned(db, model_id, user)
    if not _serialize(row)["can_activate"]:
        raise HTTPException(
            status_code=400,
            detail=(
                "Only a completed run that produced a model file can be selected for "
                "analysis. A simulated run has no model file."
            ),
        )

    db.execute(
        update(TrainedModel)
        .where(TrainedModel.owner_id == user.id, TrainedModel.id != row.id)
        .values(is_active=False)
    )
    row.is_active = True
    log_usage(db, user.username, "select_model", row.name)
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.post("/models/deactivate")
def deactivate_models(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, bool]:
    """Go back to the published Colab models for this account."""
    db.execute(
        update(TrainedModel).where(TrainedModel.owner_id == user.id).values(is_active=False)
    )
    log_usage(db, user.username, "select_model", "published Colab models")
    db.commit()
    return {"ok": True}


@router.delete("/models/{model_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_model(
    model_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    """Remove a model and everything staged for it."""
    row = _owned(db, model_id, user)
    if row.status in ("queued", "running"):
        raise HTTPException(
            status_code=409, detail="Wait for this run to finish before deleting it."
        )

    training.discard_dataset(user.id, row.id)
    name = row.name
    db.delete(row)
    log_usage(db, user.username, "delete_model", name)
    db.commit()


def _store_counts(row: TrainedModel, summary: dict[str, Any]) -> None:
    row.train_count = summary["totals"]["train"]
    row.test_count = summary["totals"]["test"]
    row.valid_count = summary["totals"]["valid"]
    row.dataset_detail = json.dumps(summary["per_class"])
