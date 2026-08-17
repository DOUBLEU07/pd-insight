"""Application settings.

Mirrors the constants block of PRPD_4_Gap Time.md → PART3 CMD FINAL CODE so the
web service and the Colab notebook stay numerically identical.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ---- infrastructure ----
    database_url: str = "postgresql+psycopg://pdinsight:pdinsight@localhost:5432/pdinsight"
    # HS256 wants at least 32 bytes; this placeholder meets that but must still
    # be replaced before any real deployment.
    jwt_secret: str = "pd-insight-dev-secret-change-me-before-deploying"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:3000"
    storage_dir: Path = Path("storage")
    models_dir: Path = Path("models")

    # ---- ML toggles ----
    enable_ml: bool = True
    auto_gap_model_version: str = "auto_gap_time_abstract_v1"

    # =====================================================================
    # DOMAIN CONSTANTS, ported 1:1 from CMD FINAL CODE
    # =====================================================================
    final_code_version: str = "CMD_FINAL_V2_TOPCLASS_RULE_30_EXCEL_REVIEW_20260523"

    class_names: tuple[str, ...] = ("Corona", "Surface", "Internal")

    img_size_classification: int = 224
    img_size_auto_gap: int = 224

    # Legacy 85% threshold, kept because the prototype's Strict/SMART modes use it.
    confidence_threshold: float = 85.0
    internal_high_confidence: float = 95.0
    # Advisor rule: all classes <= 30% => Non-identified.
    topclass_threshold: float = 30.0

    # PDProcessingII default calibration preset.
    default_image_width: int = 388
    default_image_height: int = 281
    default_x_left: int = 73
    default_x_right: int = 348
    default_y_top: int = 16
    default_y_bottom: int = 233

    # 50 Hz mains: 360 degrees = 20 ms.
    cycle_time_ms: float = 20.0

    allowed_extensions: tuple[str, ...] = (".jpg", ".jpeg", ".png", ".bmp")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def upload_dir(self) -> Path:
        return self.storage_dir / "uploads"

    @property
    def results_dir(self) -> Path:
        return self.storage_dir / "by_image"


PD_SOURCE_OPTIONS: list[str] = [
    "Floating / Corona / Bad contact",
    "Outside surface discharge",
    "Terminations / Joint",
    "Internal",
    "Manual confirmation required",
]

REVIEW_STATUS_OPTIONS: list[str] = [
    "user_confirmed",
    "expert_corrected",
    "not_measurable",
]

REVIEWER_ROLE_OPTIONS: list[str] = [
    "researcher",
    "expert",
    "user",
    "advisor",
    "operator",
]

NOT_MEASURABLE_REASON_OPTIONS: list[str] = [
    "",
    "single_discharge_cluster",
    "unclear_prpd_pattern",
    "cropped_axis",
    "low_image_quality",
    "wrong_input",
    "other",
]

CALIBRATION_MODE_OPTIONS: list[str] = [
    "Use default PDProcessingII calibration",
    "Use auto-detected calibration",
    "Manual calibration",
]

# Decision-rule modes. `topclass30` is the production rule (CMD FINAL V2); the
# other three come from the PD_Insight prototype and stay selectable per case.
DECISION_MODES: list[str] = ["topclass30", "strict85", "loose30", "smart_hybrid"]


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.results_dir.mkdir(parents=True, exist_ok=True)
    return settings


settings = get_settings()
