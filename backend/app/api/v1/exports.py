"""Export Center: master workbook, summary, edit history."""

from __future__ import annotations

import csv
import io
from typing import Any

from fastapi import APIRouter, Depends, Response
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.schema_columns import (
    EDIT_HISTORY_COLUMNS,
    FINAL_SUMMARY_SHORT_COLUMNS,
    MASTER_SUMMARY_COLUMNS,
    PROTOTYPE_EXCEL_COLUMNS,
)
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.entities import Case, EditHistory, User
from app.services.case_service import log_usage, to_master_row, to_prototype_row

router = APIRouter(prefix="/export", tags=["export"])


def _csv_response(rows: list[dict[str, Any]], columns: list[str], filename: str) -> Response:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({c: "" if row.get(c) is None else row.get(c) for c in columns})

    # utf-8-sig so Excel opens the Thai defect names correctly.
    return Response(
        content=buffer.getvalue().encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _reviewed_cases(db: Session, user: User) -> list[Case]:
    return list(
        db.scalars(
            select(Case)
            .where(Case.status == "done", Case.owner_id == user.id)
            .order_by(Case.id)
        ).all()
    )


@router.get("/master")
def export_master(
    include_pending: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """final_summary.csv, the full 73-column schema."""
    stmt = select(Case).where(Case.owner_id == user.id).order_by(Case.id)
    if not include_pending:
        stmt = stmt.where(Case.status == "done")
    cases = list(db.scalars(stmt).all())

    log_usage(db, user.username, "export_master_workbook", str(len(cases)))
    db.commit()

    return _csv_response(
        [to_master_row(c) for c in cases], MASTER_SUMMARY_COLUMNS, "final_summary.csv"
    )


@router.get("/prototype-workbook")
def export_prototype_workbook(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Response:
    """41-column master workbook from the PD_Insight prototype (spec 7.1)."""
    cases = _reviewed_cases(db, user)
    log_usage(db, user.username, "export_prototype_workbook", str(len(cases)))
    db.commit()
    return _csv_response(
        [to_prototype_row(c) for c in cases],
        PROTOTYPE_EXCEL_COLUMNS,
        "master_workbook.csv",
    )


@router.get("/summary")
def export_summary(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Response:
    """Short reviewer-facing summary."""
    cases = _reviewed_cases(db, user)
    rows = [to_master_row(c) for c in cases]
    log_usage(db, user.username, "export_final_summary", str(len(rows)))
    db.commit()
    return _csv_response(rows, FINAL_SUMMARY_SHORT_COLUMNS, "final_summary_short.csv")


@router.get("/edit-history")
def export_edit_history(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Response:
    my_case_ids = select(Case.id).where(Case.owner_id == user.id)
    entries = db.scalars(
        select(EditHistory)
        .where(EditHistory.case_id.in_(my_case_ids))
        .order_by(desc(EditHistory.timestamp))
    ).all()
    rows = [
        {
            "timestamp": e.timestamp.strftime("%Y-%m-%d %H:%M:%S") if e.timestamp else "",
            "case_base_name": e.case_base_name,
            "changed_field": e.changed_field,
            "old_value": e.old_value,
            "new_value": e.new_value,
            "changed_by": e.changed_by,
        }
        for e in entries
    ]
    log_usage(db, user.username, "export_edit_history", str(len(rows)))
    db.commit()
    return _csv_response(rows, EDIT_HISTORY_COLUMNS, "edit_history.csv")


@router.get("/counts")
def export_counts(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, int]:
    from sqlalchemy import func

    my_case_ids = select(Case.id).where(Case.owner_id == user.id)
    return {
        "reviewed_cases": db.scalar(
            select(func.count(Case.id)).where(
                Case.status == "done", Case.owner_id == user.id
            )
        )
        or 0,
        "all_cases": db.scalar(
            select(func.count(Case.id)).where(Case.owner_id == user.id)
        )
        or 0,
        "edit_history_entries": db.scalar(
            select(func.count(EditHistory.id)).where(
                EditHistory.case_id.in_(my_case_ids)
            )
        )
        or 0,
    }
