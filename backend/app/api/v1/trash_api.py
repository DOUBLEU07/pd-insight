"""The trash: list, restore and permanently delete what an account deleted."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.entities import TRASH_RETENTION_DAYS, User
from app.services import trash
from app.services.case_service import log_usage

router = APIRouter(prefix="/trash", tags=["trash"])


@router.get("")
def list_trash(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    # Expiry is enforced here as well as at startup, so nothing past its date
    # is ever offered for restore.
    if trash.purge_expired(db, user.id):
        db.commit()
    return {"retention_days": TRASH_RETENTION_DAYS, "items": trash.list_trash(db, user)}


@router.post("/{kind}/{item_id}/restore")
def restore_item(
    kind: str,
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, bool]:
    name = trash.restore(db, kind, item_id, user)
    log_usage(db, user.username, "restore_from_trash", f"{kind}: {name}")
    db.commit()
    return {"ok": True}


@router.delete("/{kind}/{item_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def purge_item(
    kind: str,
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    trash.purge(db, kind, item_id, user)
    log_usage(db, user.username, "delete_permanently", f"{kind} #{item_id}")
    db.commit()


@router.delete("", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def empty_trash(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> None:
    items = trash.list_trash(db, user)
    for item in items:
        trash.purge(db, item["kind"], item["id"], user)
        db.flush()
    log_usage(db, user.username, "empty_trash", f"{len(items)} item(s)")
    db.commit()
