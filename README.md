# PD Insight — Partial Discharge Diagnostic System

A production-grade web application for partial discharge (PD) pattern analysis, classification, and severity diagnosis, engineered from two authoritative sources:

- **`PD_Insight_Prototype.html`** — The approved UI/UX design. Layout, color palette, typography, interactive PRPD canvas, and the five-step diagnostic review workflow.
- **`PRPD_2_Only.md` / `PRPD_3_Hybrid.md` / `PRPD_4_Gap Time.md`** — The research Colab notebooks. Every classification algorithm, calibration method, and gap-time decision rule is ported 1:1 with mathematical fidelity.

**Technology Stack:**
- **Backend:** FastAPI (Python 3.11+), SQLAlchemy 2.0, Alembic (schema migrations), TensorFlow 2.18 (CPU), OpenCV, NumPy, Pandas.
- **Frontend:** Next.js 15 (App Router), React 18, TypeScript, Tailwind CSS.
- **Database:** PostgreSQL 16 (Docker) / SQLite (local dev).
- **Deployment:** Docker Compose, Cloudflare Quick Tunnel / Named Tunnel.

---

## Key Features

1. **Five-Step Diagnostic Wizard:**
   - **Classification:** Sigmoid probabilities, top-class rule evaluation, internal sanity check, and confirmed PD source.
   - **Calibration:** Interactive PRPD canvas with draggable frame boundaries, ±1 px precision nudging, auto-frame detection, and reusable presets.
   - **Gap-Time Analysis:** Rule-based detection and deep learning regression auto-suggestion, draggable positive/negative gap lines, live electrical angle/time calculation, and severity band assignment.
   - **Summary:** Synchronized PRPD + T-F visualization and comprehensive parameter tables.
   - **Sign-Off:** Reviewer assignment, audit remarks, and structured sign-off status.
2. **Interactive PRPD Canvas:** Zoom, pan, real-time pixel-coordinate mapping, and instant visual feedback.
3. **Multi-Tenant Data Privacy:** All cases, batches, calibration presets, and custom-trained models are strictly scoped to the owner's account.
4. **Custom Model Training:** Per-account deep learning training wizard (Compact CNN or fine-tuned MobileNetV2) supporting custom defect classes, dataset staging, and instant model selection in Settings.
5. **Modern UI & Localization:**
   - Theme toggle: Light, Dark, or Auto (synchronized with local time).
   - Bilingual support: Instant toggle between English and Thai (`EN | TH`).
6. **Automated Schema Migrations:** Managed through Alembic with automatic upgrade on container startup.

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
| Pretrained Model inference | `PRPD_2_Only` / `PRPD_3_Hybrid` / auto-gap regression | `backend/app/services/ml/engine.py` |
| Custom Model Training | MobileNetV2 / CNN transfer learning | `backend/app/services/ml/training.py` |
| Database migrations | Schema versioning & updates | `backend/alembic/` & `app/main.py` |
| Record schema | `final_summary.csv` (73 columns) | `backend/app/core/schema_columns.py` |
| Localization & Theme | Client-side reactive providers | `frontend/lib/i18n.tsx`, `frontend/lib/theme.tsx` |

### Verified against the real Colab output

Three checks confirm the port is mathematically identical, not approximate:

- **Rule engine** — Feeding the confidence values from `final_summary.csv` back through `build_ai_result` reproduces the recorded `ai_final_result`, `ai_status`, and `pd_selection_rule` exactly. `compute_gap_metrics` reproduces `107.6015 / 221.845 / 114.2435 / 6.3469 / 4–7 ms / High` for case `10_3.0VS` to four decimal places.
- **OpenCV detector** — Run over the original PRPD images with recorded calibration, `auto_detect_gap_lines_rule_based` returns byte-identical `positive_x_range_pixel` / `negative_x_range_pixel` / `detected_case` values (6/6 exact, e.g. `(248, 258)` and `(115, 120)` for `10_3.0VS`).
- **Model inference** — Against `excel/section4_hybrid_model_predictions_394cases.csv` and `section4_prpd_model_predictions_394cases.csv`, both models reproduce the recorded confidences to within **8×10⁻⁴ percentage points** (float32 rounding noise, not algorithmic difference):

  | Model | Ours | Colab |
  |---|---|---|
  | `10_3.0VS` Hybrid | 22.534169 / 20.955242 / 62.511653 | 22.534315 / 20.955362 / 62.511444 |
  | `10_3.0VS` PRPD-only | 3.878497 / 4.729634 / 89.478242 | 3.878435 / 4.729571 / 89.478447 |

---

## Decision Rules & Severity Matrix

The production default decision rule is **TopClass 30**, matching the CMD FINAL V2 run that produced the 394-case baseline dataset. Other modes can be toggled per-case in Step 1 (Classification):

| Mode | Rule Description |
|---|---|
| `topclass30` *(default)* | All three classes ≤ 30% → `Non-identified`; otherwise the class with highest confidence wins. |
| `strict85` | Exactly one class must reach ≥ 85%. Zero or two-plus → `Non-identified`. |
| `loose30` | Highest class only needs to exceed 30%. |
| `smart_hybrid` | 0 classes over 85% → `Inconclusive`; 1 class → that class; 2+ classes → `Mixed PD Suspected`. |

**Internal Sanity Check:**
Runs automatically when the top predicted class is `Internal` with confidence between 85% and 95%. It calculates quadrant point-mass distribution on PRPD pixels; if any quadrant falls below 0.15, the classification is overridden to `Non-identified`.

**Severity Assessment:**
Combines the confirmed PD source category with the calculated gap-time duration:

| PD Source Group | Gap-Time > 7 ms | Gap-Time 4–7 ms | Gap-Time < 4 ms |
|---|---|---|---|
| **Group 1** — Corona / Surface | Initial | Moderate | High |
| **Group 2** — Joint / Internal | Moderate | High | High |

*Note: If only a single discharge cluster is detected, gap-time is not measurable and the case is flagged as `not_measurable` with reason `single_discharge_cluster`.*

---

## Deep Learning Models (`.keras`)

### 1. The Three Core Models
The application relies on three pre-trained Keras model files exported from the research notebooks:

| File Name | Candidate / Thai Prefix | Purpose / Architecture |
|---|---|---|
| `PRPD_2_Only_best.keras` | `สำเนาของ PRPD_2_Only_best.keras` | **Model 2 — PRPD-Only Classification:** 3-class sigmoid classifier (Corona, Surface, Internal) trained exclusively on PRPD images. |
| `PRPD_TF_1_sigmoid_best.keras` | `สำเนาของ PRPD_TF_1_sigmoid_best.keras` | **Model 3 — Hybrid Classification:** Multi-input classifier combining PRPD and Time-Frequency (T-F) maps. |
| `auto_gap_time_abstract_v1.keras` | `auto_gap_time_abstract_v1_best.keras` | **Auto Gap-Time Model:** Deep regression model trained on cropped 224×224 PRPD plot frames to predict pulse gap parameters. |

### 2. How the System Discovers Models
The backend engine (`backend/app/services/ml/engine.py`):
1. Reads `MODELS_DIR` (or `/models` in Docker).
2. Performs a recursive search (`rglob`).
3. Automatically accepts both standard filenames and files prefixed with Google Drive's copy notation (`สำเนาของ `).
4. Loads models into memory behind a thread-safe singleton lock.

### 3. How to Set Up Your Models

#### Option A: Point Directly to Your Existing Download Folder (Recommended)
If you already have your model files or Google Drive download folder extracted on your computer:
1. Open `.env` in the project root.
2. Set `MODELS_HOST_DIR` to the path where your models reside:
   ```env
   MODELS_HOST_DIR=C:/Users/focus/OneDrive/Desktop/data project
   ```
   *Docker Compose will mount this directory read-only into `/models` inside the container. Thanks to recursive search, subdirectories such as `All/` and `CMD_auto_gap_model/models/` are indexed automatically.*

#### Option B: Copy Files into Local `./models/` Directory
You can organize the models inside the project repository:
1. Create a `models` directory at the project root:
   ```
   pd-insight/
   ├── models/
   │   ├── PRPD_2_Only_best.keras
   │   ├── PRPD_TF_1_sigmoid_best.keras
   │   └── auto_gap_time_abstract_v1.keras
   ```
2. In `.env`, ensure:
   ```env
   MODELS_HOST_DIR=./models
   ```

#### Option C: Running Locally Without Docker
When running the backend directly with Python:
- Place the `.keras` files in `backend/models/` or set `MODELS_DIR` in `backend/.env` pointing to your directory.

### 4. Deterministic Mock Fallback
If TensorFlow is not installed or any `.keras` file is missing:
- The system **will not crash**.
- It gracefully falls back to a deterministic mock engine that produces repeatable, schema-compliant mock scores.
- Every case records `inference_engine = "mock"`, and a yellow `mock inference` badge is displayed in the UI.
- You can check model availability at any time by navigating to `/settings`.

---

## Running the Application

### 1. Environment Configuration

```bash
cd pd-insight
cp .env.example .env
```

Review `.env` and adjust settings as needed:
```env
POSTGRES_USER=pdinsight
POSTGRES_PASSWORD=pdinsight
POSTGRES_DB=pdinsight
POSTGRES_PORT=5432

API_PORT=8000
WEB_PORT=3000

JWT_SECRET=your-random-secret-key
ENABLE_ML=true
MODELS_HOST_DIR=C:/Users/focus/OneDrive/Desktop/data project
AUTO_GAP_MODEL_VERSION=auto_gap_time_abstract_v1
```

### 2. Start with Docker Compose

```bash
docker compose up --build
```

- **Frontend Application:** <http://localhost:3000>
- **Backend Swagger API Docs:** <http://localhost:8000/docs>
- **API Redoc:** <http://localhost:8000/redoc>

### 3. Database Migrations (Alembic)
The application handles schema versioning via Alembic.
- **Automatic:** When the API container starts up, `run_migrations()` automatically applies all pending migrations (`alembic upgrade head`).
- **Manual upgrade:**
  ```bash
  docker compose exec api alembic upgrade head
  ```
- **Upgrading legacy pre-Alembic databases:**
  If you have an older database initialized before Alembic was introduced, run the one-off adoption script:
  ```bash
  docker compose exec api python scripts/adopt_alembic.py --apply
  ```

### 4. Seed Real Dataset (Optional)
To populate 394 real cases, calibration presets, and edit history from the Colab study:

```bash
docker compose exec api python scripts/seed.py \
  --summary "/data/CMD_FINAL_RESULTS_TOPCLASS_RULE_V2_20260523/final_summary.csv" \
  --presets "/data/CMD_FINAL_RESULTS_TOPCLASS_RULE_V2_20260523/calibration/calibration_preset.csv" \
  --history "/data/CMD_FINAL_RESULTS_TOPCLASS_RULE_V2_20260523/edit_history.csv" \
  --prpd-dir "/data/dataset_main_4th_extracted/PRPD" \
  --tf-dir   "/data/dataset_main_4th_extracted/TF" \
  --demo-user
```

*Default demo credentials created:* `researcher01` / `pdinsight123`

### 5. Sharing with Remote Testers (Quick Tunnel)

To generate an instant, publicly accessible HTTPS link without opening router ports or configuring DNS:

```powershell
.\share.ps1
```

- Spins up the application stack along with a Cloudflare Quick Tunnel.
- Prints a secure public URL (e.g. `https://<random>.trycloudflare.com`).
- Generates a cryptographically strong `JWT_SECRET` in `.env` if none exists.
- Stop sharing anytime using:
  ```bash
  docker compose --profile share down
  ```

### 6. Production Domain via Cloudflare Named Tunnel

For a permanent domain (e.g., `https://pdinsight.dev`):
1. Create a Cloudflare Tunnel in the Zero Trust dashboard.
2. Put your token in `.env`:
   ```env
   CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...
   ```
3. Set the tunnel Public Hostname to `http://web:3000`.
4. Run:
   ```bash
   docker compose --profile domain up -d
   ```

### 7. Running Locally Without Docker

**Backend:**
```bash
cd backend
python -m venv .venv
# On Windows:
.\.venv\Scripts\pip install -r requirements.txt
DATABASE_URL="sqlite:///./dev.db" .\.venv\Scripts\uvicorn app.main:app --reload --port 8000
```
*(Note: TensorFlow wheels officially support Python ≤ 3.12. On Python 3.13+, the backend starts successfully and falls back to the mock engine).*

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## Custom Model Training (`/training`)

The Model Training module provides end-to-end training and fine-tuning of custom models, fully isolated per user account:

1. **New Model Wizard:**
   - **Mode Selection:** Train a **PRPD-only** or **Hybrid (PRPD + T-F)** classification model.
   - **Model Architecture:** Choose between a lightweight **Compact CNN** (fast iteration) or transfer learning with **MobileNetV2** (high accuracy with pre-trained weights).
   - **Defect Class Configuration:** Define custom defect classes (e.g. Corona, Surface, Internal, Floating) and map each to a PD Source and Severity Group (Group 1 or Group 2).
   - **Hyperparameters:** Configure training epochs, batch size, and learning rate with Early Stopping callbacks.
2. **Dataset Management & Consent:**
   - Upload training and validation image sets partitioned per class.
   - Built-in consent gating: User choice regarding anonymous research data collection is written to `CONSENT.json`.
3. **Training Execution & Metrics:**
   - Background training task execution with real-time epoch, loss, and accuracy logging.
   - Trained `.keras` artifacts are saved under `storage/training/users/{user_id}/models/{model_id}/model.keras`.
4. **Activation:**
   - Once trained, switch active models on the **Settings** page (`/settings`). The custom model immediately takes over scoring for that account's subsequent case uploads.

---

## Application Map

| Route | View | Capabilities |
|---|---|---|
| `/login` | Authentication | Sign in / Sign up, password strength indicator, caps-lock warning, reviewer role selector. |
| `/dashboard` | Diagnostic Dashboard | Operational KPI cards, upload trends, severity grouping, quick navigation. |
| `/batches/[id]` | Batch Overview | Grid overview of all PRPD/TF pairs within an upload batch. |
| `/cases` | Case Management | Single and folder batch uploads, queue filter, calibration preset manager, export center. |
| `/cases/[id]` | 5-Step Review Wizard | Step-by-step diagnostic verification, interactive canvas, gap-time adjustments, final sign-off. |
| `/training` | Model Training Studio | Dataset staging stats, New Model Wizard, training runs history, live training logs. |
| `/settings` | System Settings | Active model selector, TensorFlow & `.keras` engine status, decision mode thresholds, rule guide. |

---

## Exports & Reporting

The Export Center generates UTF-8 with BOM CSV files ensuring full compatibility with Microsoft Excel (including Thai characters):

| Export File | Columns | Contents |
|---|---|---|
| `final_summary.csv` | 73 | Complete schema identical to the Colab research benchmark dataset. |
| `master_workbook.csv` | 41 | Compact operational workbook with diagnostic metrics. |
| `final_summary_short.csv` | 7 | Summary for quick management reporting. |
| `edit_history.csv` | 6 | Field-level audit trail of all manual calibration and gap overrides. |

---

## End-to-End Verification

A comprehensive end-to-end verification script validates the entire pipeline (user creation → image upload → ML inference → calibration → rule engine → gap detection → audit sign-off → 73-column export):

```bash
cd backend
DATABASE_URL="sqlite:///./e2e.db" python scripts/e2e_check.py \
  "<path-to-sample>/PRPD/10_3.0VS_PRPD.jpg" \
  "<path-to-sample>/TF/10_3.0VS_TF.jpg"
```
