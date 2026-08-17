"""Seed the database from the Colab result folder.

Imports:
  * every row of final_summary.csv as a reviewed Case (73 columns, verbatim)
  * calibration/calibration_preset.csv as CalibrationPreset rows
  * edit_history.csv as EditHistory rows
  * the PRPD/TF images, copied into STORAGE_DIR so the web app can serve them

Usage (inside the api container, or with DATABASE_URL exported):

    python scripts/seed.py \
        --summary "/data/CMD_FINAL_RESULTS_TOPCLASS_RULE_V2_20260523/final_summary.csv" \
        --prpd-dir "/data/dataset_main_4th_extracted/PRPD" \
        --tf-dir   "/data/dataset_main_4th_extracted/TF"

Re-running is safe: cases are matched on record_id and updated in place.
"""

from __future__ import annotations

import argparse
import csv
import shutil
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.session import Base, SessionLocal, engine  # noqa: E402
from app.models.entities import (  # noqa: E402
    Batch,
    CalibrationPreset,
    Case,
    EditHistory,
    User,
)
from app.services.storage import case_result_dir, safe_text_name  # noqa: E402

SEED_BATCH_KEY = "B-CMD-FINAL-V2-20260523"
SEED_BATCH_NAME = "CMD_FINAL_RESULTS_TOPCLASS_RULE_V2_20260523 (Colab import)"


# ---------------------------------------------------------------- helpers
def parse_float(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def parse_int(value: str | None) -> int | None:
    f = parse_float(value)
    return None if f is None else int(f)


def parse_bool(value: str | None) -> bool | None:
    if value is None or value == "":
        return None
    return value.strip().lower() in ("true", "1", "yes")


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def text(value: str | None) -> str | None:
    return value if value not in (None, "") else None


# ---------------------------------------------------------------- seeding
def seed_cases(
    db, summary_csv: Path, prpd_dir: Path | None, tf_dir: Path | None, owner: User
) -> int:
    batch = db.scalar(select(Batch).where(Batch.batch_key == SEED_BATCH_KEY))
    if batch is None:
        batch = Batch(
            batch_key=SEED_BATCH_KEY,
            name=SEED_BATCH_NAME,
            is_single=False,
            created_by=owner.username,
            owner_id=owner.id,
        )
        db.add(batch)
        db.flush()

    count = 0
    with summary_csv.open(encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            record_id = row.get("record_id") or row.get("case_base_name")
            if not record_id:
                continue

            case = db.scalar(
                select(Case).where(
                    Case.record_id == record_id, Case.batch_id == batch.id
                )
            )
            if case is None:
                case = Case(record_id=record_id, batch_id=batch.id)
                db.add(case)

            # Cases are private to their owner, so seeded rows need one too.
            case.owner_id = owner.id

            case.case_base_name = row.get("case_base_name") or record_id
            case.defect_id = text(row.get("defect_id"))
            case.defect_name = text(row.get("defect_name"))
            case.case_folder = text(row.get("case_folder"))
            case.prpd_filename = text(row.get("prpd_filename"))
            case.tf_filename = text(row.get("tf_filename"))
            case.source_prpd_path = text(row.get("source_prpd_path"))
            case.source_tf_path = text(row.get("source_tf_path"))

            case.ai_mode = text(row.get("ai_mode"))
            case.ai_input_mode = text(row.get("ai_input_mode"))
            case.ai_model_used = text(row.get("ai_model_used"))
            case.ai_model_path = text(row.get("ai_model_path"))
            case.ai_top_class = text(row.get("ai_top_class"))
            case.ai_top_score_percent = parse_float(row.get("ai_top_score_percent"))
            case.ai_final_result = text(row.get("ai_final_result"))
            case.ai_final_score_percent = parse_float(row.get("ai_final_score_percent"))
            case.ai_status = text(row.get("ai_status"))
            case.ai_high_conf_count = parse_int(row.get("ai_high_conf_count"))
            case.ai_non_identified_percent = parse_float(row.get("ai_non_identified_percent"))
            case.ai_decision_rule = text(row.get("ai_decision_rule"))
            case.ai_threshold_percent = parse_float(row.get("ai_threshold_percent"))
            case.ai_confidence_corona = parse_float(row.get("ai_confidence_corona"))
            case.ai_confidence_surface = parse_float(row.get("ai_confidence_surface"))
            case.ai_confidence_internal = parse_float(row.get("ai_confidence_internal"))

            case.pd_rule_class = text(row.get("pd_rule_class"))
            case.pd_selection_rule = text(row.get("pd_selection_rule"))
            case.is_strong_pd_rule = parse_bool(row.get("is_strong_pd_rule"))
            case.suggested_pd_source_type = text(row.get("suggested_pd_source_type"))
            case.confirmed_pd_source_type = text(row.get("confirmed_pd_source_type"))

            case.image_width = parse_int(row.get("image_width"))
            case.image_height = parse_int(row.get("image_height"))
            case.default_size_match = parse_bool(row.get("default_size_match"))

            case.calibration_mode = text(row.get("calibration_mode"))
            case.auto_calibration_status = text(row.get("auto_calibration_status"))
            case.calibration_source = text(row.get("calibration_source"))
            case.calibration_preset_loaded = parse_bool(row.get("calibration_preset_loaded"))
            case.calibration_preset_path = text(row.get("calibration_preset_path"))
            case.x_left_0deg = parse_int(row.get("x_left_0deg"))
            case.x_right_360deg = parse_int(row.get("x_right_360deg"))
            case.y_top_plot = parse_int(row.get("y_top_plot"))
            case.y_bottom_plot = parse_int(row.get("y_bottom_plot"))

            case.auto_gap_status = text(row.get("auto_gap_status"))
            case.review_status = row.get("review_status") or "user_confirmed"
            case.reviewer_name = text(row.get("reviewer_name"))
            case.reviewer_role = text(row.get("reviewer_role"))
            case.review_note = text(row.get("review_note"))

            created = parse_dt(row.get("created_time"))
            updated = parse_dt(row.get("updated_time"))
            if created:
                case.created_time = created
            if updated:
                case.updated_time = updated

            case.left_line_pixel = parse_float(row.get("left_line_pixel"))
            case.right_line_pixel = parse_float(row.get("right_line_pixel"))
            case.left_phase_deg = parse_float(row.get("left_phase_deg"))
            case.right_phase_deg = parse_float(row.get("right_phase_deg"))
            case.gap_angle_deg = parse_float(row.get("gap_angle_deg"))
            case.gap_time_ms = parse_float(row.get("gap_time_ms"))
            case.gap_time_band = text(row.get("gap_time_band"))
            case.severity_by_gap_time = text(row.get("severity_by_gap_time"))
            case.gap_measurement_status = text(row.get("gap_measurement_status"))

            case.remark = text(row.get("remark"))
            case.detected_case = text(row.get("detected_case"))
            case.positive_x_range_pixel = text(row.get("positive_x_range_pixel"))
            case.negative_x_range_pixel = text(row.get("negative_x_range_pixel"))
            case.positive_x_range_phase = text(row.get("positive_x_range_phase"))
            case.negative_x_range_phase = text(row.get("negative_x_range_phase"))

            case.result_folder = text(row.get("result_folder"))
            case.per_image_csv_path = text(row.get("per_image_csv_path"))

            case.auto_not_measurable_recommended = parse_bool(
                row.get("auto_not_measurable_recommended")
            )
            case.auto_not_measurable_status = text(row.get("auto_not_measurable_status"))
            case.auto_not_measurable_reason = text(row.get("auto_not_measurable_reason"))
            case.not_measurable_reason = text(row.get("not_measurable_reason"))

            # These rows came out of a completed Colab review run.
            case.status = "done"
            case.analysis_run = True
            case.decision_mode = "topclass30"
            case.inference_engine = "real"
            case.gap_line_source = "imported"

            # ---- copy the images so the browser can display them ----
            if prpd_dir and case.prpd_filename:
                src = prpd_dir / case.prpd_filename
                if src.exists():
                    folder = case_result_dir(case.case_base_name)
                    dest = folder / f"{safe_text_name(case.case_base_name)}_original_PRPD{src.suffix}"
                    if not dest.exists():
                        shutil.copy2(src, dest)
                    rel = str(dest.relative_to(settings.storage_dir)).replace("\\", "/")
                    case.prpd_storage_path = rel
                    case.original_prpd_path = rel

            if tf_dir and case.tf_filename:
                src = tf_dir / case.tf_filename
                if src.exists():
                    folder = case_result_dir(case.case_base_name)
                    dest = folder / f"{safe_text_name(case.case_base_name)}_original_TF{src.suffix}"
                    if not dest.exists():
                        shutil.copy2(src, dest)
                    rel = str(dest.relative_to(settings.storage_dir)).replace("\\", "/")
                    case.tf_storage_path = rel
                    case.original_tf_path = rel

            count += 1

    return count


def seed_presets(db, preset_csv: Path, owner: User) -> int:
    count = 0
    with preset_csv.open(encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            name = row.get("preset_name")
            if not name:
                continue

            preset = db.scalar(
                select(CalibrationPreset).where(
                    CalibrationPreset.preset_name == name,
                    CalibrationPreset.owner_id == owner.id,
                )
            )
            if preset is None:
                preset = CalibrationPreset(preset_name=name, owner_id=owner.id)
                db.add(preset)

            preset.image_width = parse_int(row.get("image_width")) or 0
            preset.image_height = parse_int(row.get("image_height")) or 0
            preset.x_left_0deg = parse_int(row.get("x_left_0deg")) or 0
            preset.x_right_360deg = parse_int(row.get("x_right_360deg")) or 0
            preset.y_top_plot = parse_int(row.get("y_top_plot")) or 0
            preset.y_bottom_plot = parse_int(row.get("y_bottom_plot")) or 0
            saved = parse_dt(row.get("saved_time"))
            if saved:
                preset.saved_time = saved
            preset.example_prpd_filename = text(row.get("example_prpd_filename"))
            preset.example_tf_filename = text(row.get("example_tf_filename"))
            preset.remark = text(row.get("remark"))
            count += 1
    return count


def seed_edit_history(db, history_csv: Path) -> int:
    """Import edit_history.csv.

    That file is a full snapshot of each case at save time rather than a
    field-level diff, so each row becomes a single 'imported_review' entry.
    """
    existing = db.scalar(select(EditHistory).where(EditHistory.changed_by == "seed"))
    if existing is not None:
        return 0

    count = 0
    with history_csv.open(encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            name = row.get("case_base_name")
            if not name:
                continue
            case = db.scalar(select(Case).where(Case.case_base_name == name))
            db.add(
                EditHistory(
                    case_id=case.id if case else None,
                    case_base_name=name,
                    changed_field="imported_review",
                    old_value="",
                    new_value=(
                        f"review_status={row.get('review_status', '')}, "
                        f"severity={row.get('severity_by_gap_time', '')}, "
                        f"gap_time_ms={row.get('gap_time_ms', '')}"
                    ),
                    changed_by="seed",
                    timestamp=parse_dt(row.get("updated_time")) or datetime.now(),
                )
            )
            count += 1
    return count


def get_or_create_owner(db, username: str, password: str = "pdinsight123") -> User:
    """The account seeded data will belong to."""
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        user = User(
            username=username,
            password_hash=hash_password(password),
            role="researcher",
        )
        db.add(user)
        db.flush()
        print(f"  created account: {username} / {password}")
    return user


# ---------------------------------------------------------------- entry point
def main() -> None:
    parser = argparse.ArgumentParser(description="Seed PD Insight from Colab results")
    parser.add_argument("--summary", type=Path, help="final_summary.csv")
    parser.add_argument("--presets", type=Path, help="calibration_preset.csv")
    parser.add_argument("--history", type=Path, help="edit_history.csv")
    parser.add_argument("--prpd-dir", type=Path, help="folder holding *_PRPD.jpg")
    parser.add_argument("--tf-dir", type=Path, help="folder holding *_TF.jpg")
    parser.add_argument(
        "--owner",
        default="researcher01",
        help="username that will own the seeded cases (created if absent)",
    )
    parser.add_argument(
        "--owner-password",
        default="pdinsight123",
        help="password used only when the owner account has to be created",
    )
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        owner = get_or_create_owner(db, args.owner, args.owner_password)
        print(f"  seeding as: {owner.username}")

        # Presets first: cases reference them by name.
        if args.presets and args.presets.exists():
            n = seed_presets(db, args.presets, owner)
            print(f"  calibration presets: {n}")

        if args.summary and args.summary.exists():
            n = seed_cases(db, args.summary, args.prpd_dir, args.tf_dir, owner)
            print(f"  cases: {n}")
        elif args.summary:
            print(f"  !! summary not found: {args.summary}")

        db.flush()

        if args.history and args.history.exists():
            n = seed_edit_history(db, args.history)
            print(f"  edit history: {n}")

        db.commit()
        print("Seed complete.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
