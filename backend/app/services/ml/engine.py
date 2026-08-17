"""Model loading and inference.

Preprocessing matches `preprocess_image` in PRPD_2_Only.md / PRPD_3_Hybrid.md
exactly: grayscale -> contrast stretch -> invert -> back to RGB -> resize with
pad. The auto-gap model instead takes the cropped plot frame at 224px, per
`preprocess_image_for_auto_gap` in CMD FINAL CODE.

When TensorFlow or the .keras files are unavailable the engine falls back to a
deterministic mock so the rest of the application still runs. Which path was
taken is recorded on every case as `inference_engine`.
"""

from __future__ import annotations

import hashlib
import logging
import threading
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)

# Google Drive prefixed the copies with "สำเนาของ " (Thai for "Copy of").
# Accept both spellings so the folder can be used as-is.
_MODEL_CANDIDATES: dict[str, list[str]] = {
    "prpd_only": ["PRPD_2_Only_best.keras", "สำเนาของ PRPD_2_Only_best.keras"],
    "hybrid": ["PRPD_TF_1_sigmoid_best.keras", "สำเนาของ PRPD_TF_1_sigmoid_best.keras"],
}

PRPD_ONLY_MODEL_NAME = "Model 2: PRPD_2_Only"
HYBRID_MODEL_NAME = "Model 3: PRPD_3_Hybrid"


def _find_model(kind: str) -> Path | None:
    base = Path(settings.models_dir)
    if kind == "auto_gap":
        names = [
            f"{settings.auto_gap_model_version}.keras",
            f"{settings.auto_gap_model_version}_best.keras",
        ]
    else:
        names = _MODEL_CANDIDATES[kind]

    for name in names:
        # Look both at the top level and one directory deep, since the Drive
        # export nests models under All/ and CMD_auto_gap_model/models/.
        direct = base / name
        if direct.exists():
            return direct
        matches = sorted(base.rglob(name))
        if matches:
            return matches[0]
    return None


class _Engine:
    """Lazily loads the three Keras models, once, behind a lock."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loaded = False
        self._tf: Any = None
        self.prpd_only_model: Any = None
        self.hybrid_model: Any = None
        self.auto_gap_model: Any = None
        self.prpd_only_path: str = ""
        self.hybrid_path: str = ""
        self.auto_gap_path: str = ""
        self.load_error: str | None = None

    def _load(self) -> None:
        # `_loaded` must only be published once the models are actually in
        # place. Setting it at the start of the critical section lets a
        # concurrent caller take the unlocked fast path above while loading is
        # still in flight, find every model still None, and silently fall back
        # to the mock engine, which returns real-looking scores that are not
        # predictions. The flag therefore flips in `finally`, so racing callers
        # block on the lock and wake up to fully loaded models.
        if self._loaded:
            return
        with self._lock:
            if self._loaded:
                return
            try:
                self._load_locked()
            finally:
                self._loaded = True

    def _load_locked(self) -> None:
        if not settings.enable_ml:
            self.load_error = "ENABLE_ML=false"
            logger.warning("ML disabled by configuration; using mock engine.")
            return

        try:
            import tensorflow as tf  # noqa: PLC0415
        except Exception as exc:  # pragma: no cover - depends on environment
            self.load_error = f"tensorflow unavailable: {exc}"
            logger.warning("TensorFlow not importable: %s", exc)
            return

        self._tf = tf

        for kind, attr, path_attr in (
            ("prpd_only", "prpd_only_model", "prpd_only_path"),
            ("hybrid", "hybrid_model", "hybrid_path"),
            ("auto_gap", "auto_gap_model", "auto_gap_path"),
        ):
            path = _find_model(kind)
            if path is None:
                logger.warning("Model not found for %s under %s", kind, settings.models_dir)
                continue
            try:
                model = tf.keras.models.load_model(str(path), compile=False)
            except Exception as exc:  # pragma: no cover
                logger.warning("Failed loading %s from %s: %s", kind, path, exc)
                continue
            setattr(self, attr, model)
            setattr(self, path_attr, str(path))
            logger.info("Loaded %s: %s", kind, path)

    # ---- public API ----
    @property
    def tf(self) -> Any:
        self._load()
        return self._tf

    def status(self) -> dict[str, Any]:
        self._load()
        return {
            "enable_ml": settings.enable_ml,
            "tensorflow_available": self._tf is not None,
            "prpd_only_available": self.prpd_only_model is not None,
            "hybrid_available": self.hybrid_model is not None,
            "auto_gap_available": self.auto_gap_model is not None,
            "prpd_only_path": self.prpd_only_path,
            "hybrid_path": self.hybrid_path,
            "auto_gap_path": self.auto_gap_path,
            "auto_gap_model_version": settings.auto_gap_model_version,
            "models_dir": str(settings.models_dir),
            "load_error": self.load_error,
        }

    def get(self, kind: str) -> Any:
        self._load()
        return {
            "prpd_only": self.prpd_only_model,
            "hybrid": self.hybrid_model,
            "auto_gap": self.auto_gap_model,
        }[kind]


engine = _Engine()


# =========================================================================
# PREPROCESSING
# =========================================================================
def preprocess_for_classification(img_rgb: np.ndarray, img_size: int | None = None) -> np.ndarray:
    """grayscale -> contrast stretch -> invert -> RGB -> resize_with_pad.

    Uses the TensorFlow ops the notebooks used whenever TF is importable, so the
    tensor fed to the model is bit-for-bit what Colab produced. The NumPy path
    below is only a fallback for the mock engine; `cv2.cvtColor` quantises to
    uint8 and `INTER_AREA` is not bilinear, both of which shift the sigmoid
    outputs by several percent.
    """
    size = img_size or settings.img_size_classification
    tf = engine.tf

    if tf is not None:
        img = tf.convert_to_tensor(img_rgb)
        gray = tf.image.rgb_to_grayscale(img)
        gray = tf.cast(gray, tf.float32)

        pmin = tf.reduce_min(gray)
        pmax = tf.reduce_max(gray)
        stretched = (gray - pmin) / (pmax - pmin + 1e-5)

        final = 1.0 - stretched
        final = tf.image.grayscale_to_rgb(final)
        final = tf.image.resize_with_pad(final, size, size)
        return final.numpy()

    gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)

    pmin = float(gray.min())
    pmax = float(gray.max())
    stretched = (gray - pmin) / (pmax - pmin + 1e-5)

    final = 1.0 - stretched
    final = np.stack([final, final, final], axis=-1)

    return _resize_with_pad(final, size, size)


def preprocess_for_auto_gap(
    img_rgb: np.ndarray,
    x_left: int,
    x_right: int,
    y_top: int,
    y_bottom: int,
    img_size: int | None = None,
) -> np.ndarray:
    """Crop the plot frame first, then the same stretch/invert/pad chain."""
    size = img_size or settings.img_size_auto_gap
    crop = img_rgb[y_top:y_bottom, x_left:x_right]
    if crop.size == 0:
        crop = img_rgb
    return preprocess_for_classification(crop, size)


def _resize_with_pad(img: np.ndarray, target_h: int, target_w: int) -> np.ndarray:
    """Aspect-preserving resize onto a zero-padded canvas (tf.image.resize_with_pad)."""
    h, w = img.shape[:2]
    scale = min(target_h / h, target_w / w)
    new_h = max(1, int(round(h * scale)))
    new_w = max(1, int(round(w * scale)))

    resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

    canvas = np.zeros((target_h, target_w, 3), dtype=np.float32)
    off_y = (target_h - new_h) // 2
    off_x = (target_w - new_w) // 2
    canvas[off_y : off_y + new_h, off_x : off_x + new_w] = resized
    return canvas


# =========================================================================
# MOCK FALLBACK, deterministic per image content
# =========================================================================
def _mock_scores(img_rgb: np.ndarray, tf_rgb: np.ndarray | None) -> list[float]:
    """Stable pseudo-confidences derived from the image bytes.

    The same image always produces the same scores, so a demo without model
    files still behaves consistently across reloads.
    """
    digest = hashlib.sha256(img_rgb.tobytes()[:200_000])
    if tf_rgb is not None:
        digest.update(tf_rgb.tobytes()[:200_000])
    raw = digest.digest()

    scores = []
    for i in range(3):
        chunk = int.from_bytes(raw[i * 4 : i * 4 + 4], "big")
        scores.append(round((chunk % 10_000) / 100.0, 4))
    return scores


# =========================================================================
# INFERENCE
# =========================================================================
def classify(img_rgb: np.ndarray, tf_rgb: np.ndarray | None) -> dict[str, Any]:
    """Run PRPD-only or Hybrid classification depending on whether a TF map came in."""
    is_hybrid = tf_rgb is not None
    kind = "hybrid" if is_hybrid else "prpd_only"
    model = engine.get(kind)

    input_mode = "HYBRID_PRPD_TF" if is_hybrid else "PRPD_ONLY"
    model_used = HYBRID_MODEL_NAME if is_hybrid else PRPD_ONLY_MODEL_NAME
    model_path = engine.hybrid_path if is_hybrid else engine.prpd_only_path

    if model is None:
        return {
            "scores_percent": _mock_scores(img_rgb, tf_rgb),
            "input_mode": input_mode,
            "model_used": f"{model_used} (mock)",
            "model_path": "",
            "engine": "mock",
        }

    prpd_input = np.expand_dims(preprocess_for_classification(img_rgb), axis=0)

    if is_hybrid:
        tf_input = np.expand_dims(preprocess_for_classification(tf_rgb), axis=0)
        try:
            input_names = [
                inp.name.split(":")[0].split("/")[0] for inp in model.inputs
            ]
            if "prpd_input" in input_names and "tf_input" in input_names:
                preds = model.predict(
                    {"prpd_input": prpd_input, "tf_input": tf_input}, verbose=0
                )[0]
            else:
                preds = model.predict([prpd_input, tf_input], verbose=0)[0]
        except Exception:
            preds = model.predict([prpd_input, tf_input], verbose=0)[0]
    else:
        preds = model.predict(prpd_input, verbose=0)[0]

    return {
        "scores_percent": [float(v) * 100.0 for v in preds],
        "input_mode": input_mode,
        "model_used": model_used,
        "model_path": model_path,
        "engine": "real",
    }


def predict_auto_gap_lines(
    img_rgb: np.ndarray, x_left: int, x_right: int, y_top: int, y_bottom: int
) -> tuple[dict[str, Any] | None, str]:
    """Auto Gap-time regression, suggesting starting lines only.

    Final gap-time must always come from user-confirmed or expert-adjusted
    positions, as stated in the model card.
    """
    model = engine.get("auto_gap")
    if model is None:
        return None, "auto_gap_model_not_available"

    try:
        img = preprocess_for_auto_gap(img_rgb, x_left, x_right, y_top, y_bottom)
        batch = np.expand_dims(img, axis=0)
        pred = model.predict(batch, verbose=0)[0]

        left_norm_raw = float(pred[0])
        right_norm_raw = float(pred[1])

        left_norm = float(np.clip(left_norm_raw, 0.0, 1.0))
        right_norm = float(np.clip(right_norm_raw, 0.0, 1.0))

        if left_norm >= right_norm:
            left_norm, right_norm = min(left_norm, right_norm), max(left_norm, right_norm)
            status = "ai_auto_prediction_order_corrected_manual_review"
        else:
            status = "ai_auto_suggested"

        left_pixel = int(round(x_left + left_norm * (x_right - x_left)))
        right_pixel = int(round(x_left + right_norm * (x_right - x_left)))

        if right_pixel <= left_pixel:
            return None, "ai_auto_invalid_left_right_order"

        return (
            {
                "left_line_x": left_pixel,
                "right_line_x": right_pixel,
                "left_norm_raw": left_norm_raw,
                "right_norm_raw": right_norm_raw,
                "left_norm_used": left_norm,
                "right_norm_used": right_norm,
            },
            status,
        )
    except Exception as exc:  # pragma: no cover
        return None, f"ai_auto_prediction_failed: {exc}"
