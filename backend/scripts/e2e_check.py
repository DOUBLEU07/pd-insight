"""End-to-end smoke test against a real PRPD image from the Colab dataset.

Walks the full reviewer workflow the web UI drives:
    signup -> upload -> analyze -> calibration -> gap detect -> adjust -> save
and then checks the 73-column export.

Run with DATABASE_URL pointing at a scratch database.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.core.schema_columns import MASTER_SUMMARY_COLUMNS  # noqa: E402
from app.main import app  # noqa: E402

PRPD_SAMPLE = Path(sys.argv[1]) if len(sys.argv) > 1 else None
TF_SAMPLE = Path(sys.argv[2]) if len(sys.argv) > 2 else None

# The context manager form runs the lifespan handler, which creates the tables.
client = TestClient(app)
client.__enter__()
fails: list[str] = []


def check(label: str, ok: bool, extra: str = "") -> None:
    print(f"{'PASS' if ok else 'FAIL'}  {label}{f' — {extra}' if extra else ''}")
    if not ok:
        fails.append(label)


# ---------------------------------------------------------------- auth
r = client.get("/api/v1/health")
check("health", r.status_code == 200, r.text[:120])

r = client.post(
    "/api/v1/auth/signup",
    json={"username": "e2e_reviewer", "password": "pdinsight123", "role": "researcher"},
)
check("signup", r.status_code == 200, r.text[:160])
token = r.json()["access_token"]
H = {"Authorization": f"Bearer {token}"}

r = client.get("/api/v1/auth/me", headers=H)
check("auth/me", r.status_code == 200 and r.json()["username"] == "e2e_reviewer")

r = client.get("/api/v1/cases/options", headers=H)
check("options", r.status_code == 200)
opts = r.json()
print(f"      decision modes: {[m['key'] for m in opts['decision_modes']]}")
print(f"      ml engine     : tensorflow={opts['ml_status']['tensorflow_available']}")

# ---------------------------------------------------------------- upload
if PRPD_SAMPLE is None or not PRPD_SAMPLE.exists():
    print("\nNo sample image supplied; stopping after the API checks.")
    sys.exit(1 if fails else 0)

files = {"prpd": (PRPD_SAMPLE.name, PRPD_SAMPLE.read_bytes(), "image/jpeg")}
if TF_SAMPLE and TF_SAMPLE.exists():
    files["tf"] = (TF_SAMPLE.name, TF_SAMPLE.read_bytes(), "image/jpeg")

r = client.post("/api/v1/cases/upload", headers=H, files=files)
check("upload", r.status_code == 201, r.text[:200])
case = r.json()
case_id = case["id"]
print(f"      case {case['case_base_name']} · {case['n_files']} file(s)")

# ---------------------------------------------------------------- analyze
r = client.post("/api/v1/cases/{}/analyze".format(case_id), headers=H, json={})
check("analyze", r.status_code == 200, r.text[:300])
case = r.json()

conf = case["confidence"]
print(
    f"      confidence   : corona={conf['corona']} surface={conf['surface']} "
    f"internal={conf['internal']}"
)
print(f"      final result : {case['ai_final_result']} ({case['ai_status']})")
print(f"      decision rule: {case['ai_decision_rule']} @ {case['ai_threshold_percent']}%")
print(f"      pd source    : {case['suggested_pd_source_type']} [{case['pd_selection_rule']}]")
print(f"      image size   : {case['image_width']}x{case['image_height']}")
print(f"      calibration  : {case['calibration']}")
print(f"      input check  : {case['input_quality']['input_check_status']}")

check("analysis produced confidences", conf["corona"] is not None)
check("analysis produced a final result", bool(case["ai_final_result"]))
check("calibration resolved", case["calibration"]["x_left_0deg"] is not None)
check(
    "decision rule is TOPCLASS30 by default",
    case["ai_decision_rule"] == "top_class_gt_30_else_non_identified",
    case["ai_decision_rule"],
)

# ---------------------------------------------------------------- points
r = client.get(f"/api/v1/cases/{case_id}/points", headers=H)
check("extract PRPD points", r.status_code == 200)
print(f"      extracted {len(r.json()['points'])} scatter points")

# ---------------------------------------------------------------- gap
r = client.post(f"/api/v1/cases/{case_id}/gap/detect", headers=H, json={"method": "rule"})
check("rule-based gap detect", r.status_code == 200, r.text[:200])
case = r.json()
gap = case["gap"]
print(f"      gap status   : {gap['gap_measurement_status']} / {gap['auto_gap_status']}")
print(f"      cluster      : {gap['cluster_detection_status']} case={gap['detected_case']}")
print(
    f"      measurement  : angle={gap['gap_angle_deg']} time={gap['gap_time_ms']} ms "
    f"band={gap['gap_time_band']} severity={case['severity_by_gap_time']}"
)

single_cluster = gap["auto_not_measurable_recommended"]

# ---------------------------------------------------------------- calibration edit
new_left = (case["calibration"]["x_left_0deg"] or 0) + 2
r = client.put(
    f"/api/v1/cases/{case_id}/calibration",
    headers=H,
    json={
        "x_left_0deg": new_left,
        "x_right_360deg": case["calibration"]["x_right_360deg"],
        "y_top_plot": case["calibration"]["y_top_plot"],
        "y_bottom_plot": case["calibration"]["y_bottom_plot"],
        "calibration_source": "manual_axis_adjusted",
    },
)
check("calibration update", r.status_code == 200, r.text[:200])
check("calibration persisted", r.json()["calibration"]["x_left_0deg"] == new_left)

# ---------------------------------------------------------------- pd source + severity
r = client.post(
    f"/api/v1/cases/{case_id}/pd-source",
    headers=H,
    json={"confirmed_pd_source_type": "Internal"},
)
check("confirm pd source", r.status_code == 200, r.text[:200])
case = r.json()
print(f"      severity after Internal: {case['severity_by_gap_time']}")

# ---------------------------------------------------------------- decision modes
for mode in ("strict85", "loose30", "smart_hybrid", "topclass30"):
    r = client.post(
        f"/api/v1/cases/{case_id}/decision-mode", headers=H, json={"decision_mode": mode}
    )
    ok = r.status_code == 200
    check(f"decision mode {mode}", ok, r.text[:120] if not ok else "")
    if ok:
        j = r.json()
        print(f"      {mode:14s} -> {j['ai_final_result']:20s} ({j['ai_status']})")

# ---------------------------------------------------------------- manual gap edit
if not single_cluster and gap["left_line_pixel"] is not None:
    r = client.put(
        f"/api/v1/cases/{case_id}/gap",
        headers=H,
        json={
            "left_line_pixel": gap["left_line_pixel"],
            "right_line_pixel": gap["right_line_pixel"],
        },
    )
    check("manual gap adjust", r.status_code == 200, r.text[:200])

r = client.get(f"/api/v1/cases/{case_id}/gap/validate", headers=H)
check("gap validation endpoint", r.status_code == 200)
print(f"      validation   : {r.json()}")

# ---------------------------------------------------------------- preset
r = client.post(
    "/api/v1/presets",
    headers=H,
    json={
        "preset_name": "e2e_preset",
        "image_width": case["image_width"],
        "image_height": case["image_height"],
        "x_left_0deg": case["calibration"]["x_left_0deg"],
        "x_right_360deg": case["calibration"]["x_right_360deg"],
        "y_top_plot": case["calibration"]["y_top_plot"],
        "y_bottom_plot": case["calibration"]["y_bottom_plot"],
        "remark": "e2e",
    },
)
check("save calibration preset", r.status_code == 201, r.text[:200])

r = client.get(f"/api/v1/cases/{case_id}/calibration/matching-preset", headers=H)
check("preset auto-match by image size", r.status_code == 200 and r.json()["preset"] is not None)

# ---------------------------------------------------------------- sign-off
review_status = "not_measurable" if single_cluster else "user_confirmed"
r = client.post(
    f"/api/v1/cases/{case_id}/review",
    headers=H,
    json={
        "review_status": review_status,
        "review_note": "e2e verification",
        "not_measurable_reason": "single_discharge_cluster" if single_cluster else "",
    },
)
check(f"sign-off ({review_status})", r.status_code == 200, r.text[:300])
case = r.json()
print(f"      status       : {case['status']} by {case['reviewer_name']} ({case['reviewer_role']})")
print(f"      annotated    : {case['annotated_image_url']}")
check("case marked done", case["status"] == "done")
check("annotated image rendered", bool(case["annotated_image_url"]))

# ---------------------------------------------------------------- dashboard
r = client.get("/api/v1/dashboard", headers=H)
check("dashboard", r.status_code == 200, r.text[:200])
d = r.json()
print(f"      kpi          : {d['kpi']}")
print(f"      groups       : {[(g['key'], g['count']) for g in d['severity_groups']]}")

# ---------------------------------------------------------------- exports
r = client.get("/api/v1/export/master", headers=H)
check("export master csv", r.status_code == 200)
header = r.text.lstrip("﻿").splitlines()[0].split(",")
check(
    f"master export has {len(MASTER_SUMMARY_COLUMNS)} columns",
    header == MASTER_SUMMARY_COLUMNS,
    f"got {len(header)}",
)

r = client.get("/api/v1/export/prototype-workbook", headers=H)
check("export prototype workbook (41 col)", r.status_code == 200)
check(
    "prototype export has 41 columns",
    len(r.text.lstrip("﻿").splitlines()[0].split(",")) == 41,
)

r = client.get("/api/v1/export/edit-history", headers=H)
check("export edit history", r.status_code == 200)
print(f"      edit history rows: {len(r.text.strip().splitlines()) - 1}")

# ---------------------------------------------------------------- isolation
# A second account must not see, read or delete the first account's work.
print()
r = client.post(
    "/api/v1/auth/signup",
    json={"username": "e2e_other", "password": "pdinsight123", "role": "user"},
)
check("second account signup", r.status_code == 200, r.text[:160])
H2 = {"Authorization": f"Bearer {r.json()['access_token']}"}

r = client.get("/api/v1/cases", headers=H2)
check("other user sees no cases", r.status_code == 200 and r.json() == [], r.text[:160])

r = client.get("/api/v1/batches", headers=H2)
check("other user sees no batches", r.status_code == 200 and r.json() == [], r.text[:160])

r = client.get("/api/v1/presets", headers=H2)
check("other user sees no presets", r.status_code == 200 and r.json() == [], r.text[:160])

r = client.get(f"/api/v1/cases/{case_id}", headers=H2)
check("other user cannot read the case", r.status_code == 404, f"got {r.status_code}")

r = client.delete(f"/api/v1/cases/{case_id}", headers=H2)
check("other user cannot delete the case", r.status_code == 404, f"got {r.status_code}")

r = client.post(f"/api/v1/cases/{case_id}/analyze", headers=H2, json={})
check("other user cannot analyze the case", r.status_code == 404, f"got {r.status_code}")

r = client.get("/api/v1/dashboard", headers=H2)
check(
    "other user's dashboard is empty",
    r.status_code == 200 and r.json()["kpi"]["total"] == 0,
    r.text[:160],
)

r = client.get("/api/v1/export/master", headers=H2)
body = r.text.lstrip("﻿").strip().splitlines()
check("other user's export has no rows", r.status_code == 200 and len(body) == 1)

# The owner still sees their own case.
r = client.get(f"/api/v1/cases/{case_id}", headers=H)
check("owner still sees their case", r.status_code == 200)

# ---------------------------------------------------------------- summary
print()
if fails:
    print(f"{len(fails)} CHECK(S) FAILED:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("ALL END-TO-END CHECKS PASSED")
