# PD Insight — Partial Discharge Diagnostic System

A production web application built from two sources:

- **`PD_Insight_Prototype.html`** — the approved design. Layout, palette, typography,
  wording and the five-step review flow are reproduced from it.
- **`PRPD_2_Only.md` / `PRPD_3_Hybrid.md` / `PRPD_4_Gap Time.md`** — the Colab
  notebooks. Every classification, calibration and gap-time rule is ported 1:1
  from them, with no re-derivation.

Stack: **FastAPI + PostgreSQL + Next.js + Tailwind CSS**.

---

## What runs where

| Concern | Source of truth | Implementation |
|---|---|---|
| Classification decision | `PRPD_4_Gap Time.md` → PART3 `build_ai_result` | `backend/app/services/rules.py` |
| PD source cascade | PART3 `select_pd_source_by_confidence` | `rules.select_pd_source_by_confidence` |
| Gap-time / severity | PART2–3 `gap_angle_to_ms`, `severity_from_gap_time_and_source` | `rules.py` |
| Plot frame detection | PART1 / PART3 `detect_prpd_plot_frame` | `backend/app/services/cv/detect.py` |
| Rule-based gap lines | PART3 `auto_detect_gap_lines_rule_based` | `cv/detect.py` |
| Internal sanity check | `PRPD_2_Only.md` PART 5 | `cv/detect.internal_sanity_check` |
| Input validation | PART3 `validate_input` | `cv/detect.validate_input` |
| Model inference | `PRPD_2_Only` / `PRPD_3_Hybrid` / auto-gap regression | `backend/app/services/ml/engine.py` |
| Record schema | `final_summary.csv` (73 columns) | `backend/app/core/schema_columns.py` |

### Verified against the real Colab output

Three checks confirm the port is faithful, not approximate:

- **Rule engine** — feeding the confidence values from `final_summary.csv` back
  through `build_ai_result` reproduces the recorded `ai_final_result`,
  `ai_status` and `pd_selection_rule` exactly, and `compute_gap_metrics`
  reproduces `107.6015 / 221.845 / 114.2435 / 6.3469 / 4–7 ms / High` for case
  `10_3.0VS` to four decimal places.

- **OpenCV detector** — run over the original PRPD images with the recorded
  calibration, `auto_detect_gap_lines_rule_based` returns byte-identical
  `positive_x_range_pixel` / `negative_x_range_pixel` / `detected_case` values
  (6/6 exact, e.g. `(248, 258)` and `(115, 120)` for `10_3.0VS`).

- **Model inference** — against
  `excel/section4_hybrid_model_predictions_394cases.csv` and
  `section4_prpd_model_predictions_394cases.csv`, both models reproduce the
  recorded confidences to within **8×10⁻⁴ percentage points** — float32 rounding
  noise, not an algorithmic difference:

  | | Ours | Colab |
  |---|---|---|
  | `10_3.0VS` Hybrid | 22.534169 / 20.955242 / 62.511653 | 22.534315 / 20.955362 / 62.511444 |
  | `10_3.0VS` PRPD-only | 3.878497 / 4.729634 / 89.478242 | 3.878435 / 4.729571 / 89.478447 |

  Reaching this required calling TensorFlow's own `rgb_to_grayscale` and
  `resize_with_pad` rather than OpenCV equivalents — `cv2.cvtColor` quantises to
  uint8 and `INTER_AREA` is not bilinear, which together shifted the sigmoid
  outputs by several percentage points. See `preprocess_for_classification`.

> Note: the confidences in `final_summary.csv` differ from the `section4_*`
> prediction dumps by 0.1–0.3 pp — those two files came from different runs. The
> `section4_*` dumps are the direct model outputs, so they are the reference
> used above.

---

## Decision rules

The production default is **TopClass 30**, matching the CMD FINAL V2 run that
produced the 394-case dataset. The three prototype criteria are kept selectable
per case from the Classification step.

| Mode | Rule |
|---|---|
| `topclass30` *(default)* | All three classes ≤ 30% → `Non-identified`; otherwise the top class wins. |
| `strict85` | Exactly one class must reach 85%. Zero or two-plus → `Non-identified`. |
| `loose30` | Top class only needs to exceed 30%. |
| `smart_hybrid` | 0 classes over 85% → `Inconclusive`; 1 → that class; 2+ → `Mixed PD Suspected`. |

**Internal sanity check** runs when the top class is Internal with confidence in
the 85–95% band. It measures quadrant point-mass ratios on the real pixels; if
any quadrant falls below 0.15 the result is overridden to `Non-identified`.

**Severity** combines the confirmed PD source group with the gap-time band:

| Group | > 7 ms | 4–7 ms | < 4 ms |
|---|---|---|---|
| 1 — Corona / Surface | Initial | Moderate | High |
| 2 — Joint / Internal | Moderate | High | High |

If only one discharge cluster is detected, gap-time is not measurable and the
system requires the case to be signed off as `not_measurable` with reason
`single_discharge_cluster`.

**Roles** (`researcher`, `expert`, `user`, `advisor`, `operator`) are recorded as
the `reviewer_role` label on each case. They do not gate any endpoint.

---

## Data ownership

Every case, batch and calibration preset belongs to the account that created it.
There is no shared pool: one tester's uploads are invisible to every other
account, so several people can use the same instance without colliding.

| Scoped per user | Global |
|---|---|
| Cases, batches, calibration presets | Decision constants and thresholds |
| Dashboard KPIs and severity groups | Model files |
| Edit history, usage log, exports | Nothing else |

Requesting another account's case returns **404**, not 403 — an object owned by
someone else is indistinguishable from one that does not exist. Enforcement runs
through `owned_case` / `owned_batch` / `owned_preset` in
`backend/app/services/case_service.py`, and `scripts/e2e_check.py` asserts that a
second account cannot list, read, analyze, delete or export the first
account's work.

New accounts therefore start with an empty dashboard and upload their own
images.

---

## Running it

### 1. Configure

```bash
cd pd-insight
cp .env.example .env
```

Point `MODELS_HOST_DIR` at the folder holding your `.keras` files. The loader
searches recursively and accepts both the plain names and the `สำเนาของ `
(Copy of) prefixed ones from Drive:

```
MODELS_HOST_DIR=C:/Users/focus/OneDrive/Desktop/data project
```

Expected models:

| File | Role |
|---|---|
| `PRPD_2_Only_best.keras` | Model 2 — PRPD-only classification |
| `PRPD_TF_1_sigmoid_best.keras` | Model 3 — Hybrid PRPD + TF |
| `auto_gap_time_abstract_v1.keras` | Auto Gap-time regression (CMD FINAL default) |

> **Mock fallback.** If TensorFlow or the model files are missing, the API falls
> back to a deterministic mock engine so the rest of the system still works.
> Every case records which path was used in `inference_engine`, and the UI shows
> a `mock inference` badge. Mock results are not diagnostic.

### 2. Start

```bash
docker compose up --build
```

- Web: <http://localhost:3000>
- API docs: <http://localhost:8000/docs>

### 3. Seed the real dataset (optional)

Loads all 394 cases from the Colab run, the calibration preset, the edit history
and the PRPD/TF images. Re-running is safe — cases are matched on `record_id`.

```bash
docker compose exec api python scripts/seed.py \
  --summary "/data/CMD_FINAL_RESULTS_TOPCLASS_RULE_V2_20260523/final_summary.csv" \
  --presets "/data/CMD_FINAL_RESULTS_TOPCLASS_RULE_V2_20260523/calibration/calibration_preset.csv" \
  --history "/data/CMD_FINAL_RESULTS_TOPCLASS_RULE_V2_20260523/edit_history.csv" \
  --prpd-dir "/data/dataset_main_4th_extracted/PRPD" \
  --tf-dir   "/data/dataset_main_4th_extracted/TF" \
  --demo-user
```

The compose file already mounts `MODELS_HOST_DIR` at `/data`, so the paths above
work as-is; set `DATA_HOST_DIR` if your results live elsewhere. Adjust the folder
names to match your export (Drive appends a timestamp, e.g.
`CMD_FINAL_RESULTS_TOPCLASS_RULE_V2_20260523-20260810T203129Z-1-001/`).

`--demo-user` creates `researcher01` / `pdinsight123`.

A successful seed reports:

```
  demo account: researcher01 / pdinsight123
  calibration presets: 1
  cases: 394
  edit history: 395
Seed complete.
```

and the dashboard then shows 394 total · Corona 116 / Surface 179 / Internal 99,
with 104 High, 255 Moderate and 35 awaiting measurement.

### 4. Share it with testers

```powershell
.\share.ps1
```

This starts the stack plus a Cloudflare **quick tunnel** and prints a public
HTTPS link, e.g. `https://<random-words>.trycloudflare.com`. No Cloudflare
account is needed. The script also replaces the placeholder `JWT_SECRET` in
`.env` with a random key the first time it runs.

Stop sharing with `docker compose --profile share down`.

**How the link works.** The browser only ever talks to the Next.js origin;
`/api/v1/*` is proxied server-side to the API container by a rewrite in
`next.config.mjs`. That is why one build serves `localhost`, a LAN address and a
tunnel URL without rebuilding — `NEXT_PUBLIC_*` values are inlined at build time
and could not.

**What to expect when sharing:**

| | |
|---|---|
| Link lifetime | Only while this machine is on and the containers run |
| Link stability | A new random URL each time the tunnel restarts |
| Sign-up | Open — anyone with the link can create an account |
| What testers see | Only their own uploads; accounts cannot reach each other's cases |

Back the database up before handing the link out:

```bash
docker compose exec -T db pg_dump -U pdinsight pdinsight > backup.sql
# restore
docker compose exec -T db psql -U pdinsight -d pdinsight < backup.sql
```

### 5. Serve it on your own domain

A quick tunnel cannot be given a chosen name. For a stable
`https://pdinsight.dev` you need a domain you own:

1. **Register the domain.** Cloudflare Registrar sells `.dev` at cost
   (~US$12/yr) and `.com` at ~US$10/yr, which also puts it on Cloudflare
   automatically. As of this writing `pdinsight.dev`, `pdinsight.com`,
   `pdinsight.app`, `pdinsight.io`, `pdinsight.net` and `pdinsight.org` were all
   unregistered.
2. **Create a tunnel.** Cloudflare dashboard → Zero Trust → Networks → Tunnels →
   *Create a tunnel* → Cloudflared. Copy the token it shows.
3. **Add the token** to `.env`:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...
   ```
4. **Route the hostname.** In the tunnel's *Public Hostname* tab add
   `pdinsight.dev` (or a subdomain) → Service `HTTP` → URL `web:3000`.
5. **Run it:**
   ```bash
   docker compose --profile domain up -d
   ```

The DNS record is created for you, HTTPS is issued automatically, there is no
interstitial, and the URL survives restarts. Use `--profile domain` instead of
`--profile share`; running both at once just publishes the app twice.

### Running without Docker

```bash
# API
cd backend
python -m venv .venv && ./.venv/Scripts/pip install -r requirements.txt
DATABASE_URL="sqlite:///./dev.db" ./.venv/Scripts/uvicorn app.main:app --reload

# Web
cd frontend
npm install && npm run dev
```

TensorFlow wheels require Python ≤ 3.12; on 3.13 the API starts and uses the
mock engine.

---

## Verification

```bash
cd backend
DATABASE_URL="sqlite:///./e2e.db" python scripts/e2e_check.py \
  "<path>/PRPD/10_3.0VS_PRPD.jpg" "<path>/TF/10_3.0VS_TF.jpg"
```

Walks signup → upload → analyze → calibrate → detect gap → adjust → sign off →
export, and asserts the exports carry exactly 73 and 41 columns.

---

## Application map

| Page | Route | Contents |
|---|---|---|
| Sign in / Sign up | `/login` | Password strength meter, caps-lock warning, role selection |
| Dashboard | `/dashboard` | KPI cards, upload history, cases grouped by severity, quick actions |
| Batch Preview | `/batches/[id]` | Every image in one batch |
| Case Workflow | `/cases` | Single upload, folder/batch import, case queue, preset manager, Export Center |
| Case review | `/cases/[id]` | Five-step wizard |
| Model Training | `/training` | Dataset stats, edit history, usage log |
| Settings | `/settings` | Model status, decision constants, rule reference |

### The five-step wizard

1. **Classification** — per-class sigmoid scores, final result, the rule that
   produced it, the decision-mode selector, the internal sanity check panel, the
   input-quality warnings, and the PD source confirmation.
2. **Calibration** — drag the four frame lines over the real PRPD image, nudge
   by ±1 px, type exact pixel values, re-run auto-detect, save/apply presets.
3. **Gap-Time** — rule-based auto-detect and regression auto-suggest, draggable
   gap lines, live angle/time/band/severity, and the full severity matrix.
4. **Summary** — combined chart plus a grouped table of every field.
5. **Sign-off** — reviewer of record, review status, not-measurable reason.

Calibration and gap coordinates are in the original image's pixel space
throughout, so what the browser shows and what the database stores are the same
numbers.

---

## Exports

| File | Columns | Contents |
|---|---|---|
| `final_summary.csv` | 73 | Full schema, identical header to the Colab output |
| `master_workbook.csv` | 41 | Prototype workbook (spec 7.1) |
| `final_summary_short.csv` | 7 | Reviewer summary |
| `edit_history.csv` | 6 | Field-level change log |

All exports are UTF-8 with BOM so Excel renders the Thai defect names correctly.

---

## Not implemented

**Model training.** The Train Model page reports dataset size, edit history and
usage, but retraining is deliberately switched off — the models in use are the
ones exported from Colab. The `training_runs` table and the API surface are in
place for when it is wanted.
