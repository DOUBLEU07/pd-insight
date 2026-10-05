"""The trash: deleted items wait here for TRASH_RETENTION_DAYS before they go.

Four kinds of row can be trashed: a batch (upload folder), a case, a trained
model and a calibration preset. Trashing only stamps ``deleted_at``; the global
criteria in ``app.models.entities`` then hides the row from every query. A
restore clears the stamp, and a purge does what delete used to do.

A batch and the cases trashed with it share one timestamp. That is how a
restore of the batch knows which of its cases to bring back: a case deleted on
its own earlier keeps its own, different timestamp and stays in the trash.

Case images are not removed on purge. They are stored by case name, and two
cases with the same name share the same files on disk.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.entities import (
    TRASH_RETENTION_DAYS,
    Batch,
    CalibrationPreset,
    Case,
    EditHistory,
    TrainedModel,
    User,
)
from app.services.ml import training

KINDS: dict[str, type] = {
    "batch": Batch,
    "case": Case,
    "model": TrainedModel,
    "preset": CalibrationPreset,
}

INCLUDE_DELETED = {"include_deleted": True}


def now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime) -> datetime:
    # SQLite hands timestamps back naive; they were written as UTC.
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def expires_at(deleted_at: datetime) -> datetime:
    return _aware(deleted_at) + timedelta(days=TRASH_RETENTION_DAYS)


# =========================================================================
# TRASHING
# =========================================================================
def trash_batch(db: Session, batch: Batch) -> None:
    stamp = now()
    batch.deleted_at = stamp
    for case in batch.cases:
        case.deleted_at = stamp


def trash_case(db: Session, case: Case) -> None:
    stamp = now()
    case.deleted_at = stamp
    db.flush()

    # A batch with no visible case left goes too, as delete always did. It
    # shares the case's stamp, so restoring the case brings the batch back.
    if case.batch_id is not None:
        batch = db.get(Batch, case.batch_id)
        if batch is not None and batch.deleted_at is None:
            db.refresh(batch, ["cases"])
            if not batch.cases:
                batch.deleted_at = stamp


def trash_model(db: Session, row: TrainedModel) -> None:
    row.deleted_at = now()
    # A trashed model must not keep scoring new analyses.
    row.is_active = False


def trash_preset(db: Session, preset: CalibrationPreset) -> None:
    preset.deleted_at = now()


# =========================================================================
# LOOKUP
# =========================================================================
def _trashed(db: Session, kind: str, item_id: int, user: User) -> Any:
    model = KINDS.get(kind)
    if model is None:
        raise HTTPException(status_code=400, detail=f"Unknown trash item type: {kind}")
    row = db.get(model, item_id, execution_options=INCLUDE_DELETED)
    if row is None or row.owner_id != user.id or row.deleted_at is None:
        raise HTTPException(status_code=404, detail="Item not found in the trash")
    return row


def _cases_of(db: Session, batch_id: int) -> list[Case]:
    return list(
        db.scalars(
            select(Case).where(Case.batch_id == batch_id).execution_options(**INCLUDE_DELETED)
        ).all()
    )


# =========================================================================
# RESTORE
# =========================================================================
def restore(db: Session, kind: str, item_id: int, user: User) -> str:
    """Bring one item back. Returns its display name."""
    row = _trashed(db, kind, item_id, user)

    if kind == "batch":
        stamp = row.deleted_at
        row.deleted_at = None
        for case in _cases_of(db, row.id):
            if case.deleted_at == stamp:
                case.deleted_at = None
        return row.name

    if kind == "case":
        row.deleted_at = None
        if row.batch_id is not None:
            batch = db.get(Batch, row.batch_id, execution_options=INCLUDE_DELETED)
            if batch is not None:
                batch.deleted_at = None
        return row.case_base_name

    row.deleted_at = None
    return row.name if kind == "model" else row.preset_name


# =========================================================================
# PURGE
# =========================================================================
def _purge_case(db: Session, case: Case) -> None:
    batch_id = case.batch_id
    db.execute(delete(EditHistory).where(EditHistory.case_id == case.id))
    db.delete(case)
    db.flush()
    if batch_id is not None and not _cases_of(db, batch_id):
        batch = db.get(Batch, batch_id, execution_options=INCLUDE_DELETED)
        if batch is not None:
            db.delete(batch)


def _purge_row(db: Session, kind: str, row: Any) -> None:
    if kind == "batch":
        cases = _cases_of(db, row.id)
        stamp = row.deleted_at
        # Cases still in use elsewhere in the batch would otherwise be lost
        # with it; a batch is only removed whole once nothing in it is live.
        live = [c for c in cases if c.deleted_at is None]
        for case in cases:
            if case.deleted_at == stamp:
                db.execute(delete(EditHistory).where(EditHistory.case_id == case.id))
                db.delete(case)
        db.flush()
        if not live and not _cases_of(db, row.id):
            db.delete(row)
        return

    if kind == "case":
        _purge_case(db, row)
        return

    if kind == "model":
        training.discard_dataset(row.owner_id, row.id)
    db.delete(row)


def purge(db: Session, kind: str, item_id: int, user: User) -> None:
    _purge_row(db, kind, _trashed(db, kind, item_id, user))


def purge_expired(db: Session, owner_id: int | None = None) -> int:
    """Permanently delete everything trashed longer ago than the retention window."""
    cutoff = now() - timedelta(days=TRASH_RETENTION_DAYS)
    removed = 0
    # Cases before batches, so a batch emptied by its own expiry goes with it.
    for kind in ("case", "batch", "model", "preset"):
        model = KINDS[kind]
        stmt = select(model).where(model.deleted_at.is_not(None)).execution_options(
            **INCLUDE_DELETED
        )
        if owner_id is not None:
            stmt = stmt.where(model.owner_id == owner_id)
        for row in db.scalars(stmt).all():
            if row.deleted_at is not None and _aware(row.deleted_at) < cutoff:
                if kind == "case" and row.batch_id is not None:
                    batch = db.get(Batch, row.batch_id, execution_options=INCLUDE_DELETED)
                    # Cases trashed with their batch expire through the batch.
                    if batch is not None and batch.deleted_at == row.deleted_at and not batch.is_single:
                        continue
                _purge_row(db, kind, row)
                removed += 1
        db.flush()
    return removed


# =========================================================================
# LISTING
# =========================================================================
def _item(kind: str, row: Any, name: str, detail: str = "") -> dict[str, Any]:
    return {
        "kind": kind,
        "id": row.id,
        "name": name,
        "detail": detail,
        "deleted_at": _aware(row.deleted_at).isoformat(),
        "expires_at": expires_at(row.deleted_at).isoformat(),
    }


def list_trash(db: Session, user: User) -> list[dict[str, Any]]:
    def trashed(model: type) -> list[Any]:
        return list(
            db.scalars(
                select(model)
                .where(model.owner_id == user.id, model.deleted_at.is_not(None))
                .execution_options(**INCLUDE_DELETED)
            ).all()
        )

    items: list[dict[str, Any]] = []
    batches = {b.id: b for b in trashed(Batch)}

    for batch in batches.values():
        if batch.is_single:
            # A single-image upload is shown as its case, not as a folder.
            continue
        count = sum(1 for c in _cases_of(db, batch.id) if c.deleted_at == batch.deleted_at)
        items.append(_item("batch", batch, batch.name, f"{count} case(s)"))

    for case in trashed(Case):
        batch = batches.get(case.batch_id) if case.batch_id is not None else None
        if batch is not None and not batch.is_single and batch.deleted_at == case.deleted_at:
            continue  # listed through its folder
        items.append(_item("case", case, case.case_base_name, case.ai_final_result or ""))

    for row in trashed(TrainedModel):
        items.append(_item("model", row, row.name, row.kind))

    for preset in trashed(CalibrationPreset):
        items.append(
            _item("preset", preset, preset.preset_name, f"{preset.image_width}x{preset.image_height}")
        )

    items.sort(key=lambda i: i["deleted_at"], reverse=True)
    return items
