"""Per-account model training.

The Training page lets an account build its own classifier from its own
labelled images instead of only using the three models exported from Colab
(PRPD_2_Only, PRPD_TF_1_sigmoid, auto_gap_time_abstract). A run goes:

    draft -> upload dataset -> confirm thresholds -> queued -> running -> completed

Everything is scoped to one account. Images are staged under
``storage/training/<owner_id>/<model_id>/<split>/<class>/`` and the fitted
network is written next to them as ``model.keras``.

Preprocessing is deliberately the same call the inference path uses
(`preprocess_for_classification`), so a model trained here sees exactly the
tensors it will later be asked to predict on. The head is sigmoid over the
class axis, matching PRPD_TF_1_sigmoid, because `rules.build_ai_result` reads
each output as an independent percentage rather than a softmax share.

When TensorFlow is not importable the run still completes, but as a
**simulation**: the reported figures are derived from the dataset statistics,
`engine_used` is set to "simulated", and no .keras file is produced. Nothing in
the UI may present those numbers as a measured accuracy.

The consent recorded in the wizard is about **passing the dataset to the PD
Insight developers**, not about keeping it: the images stay in the account's
own staging area either way. `write_consent_marker` puts the answer next to the
data as CONSENT.json, so anything collecting datasets off the server can honour
it without going back to the database.
"""

from __future__ import annotations

import hashlib
import json
import logging
import random
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.entities import TrainedModel, UsageLog, User
from app.services.cv import detect
from app.services.ml import engine as ml
from app.services.storage import read_image, safe_text_name

logger = logging.getLogger(__name__)

SPLITS: tuple[str, ...] = ("train", "test", "valid")

# The split the checklist recommends, shown in the wizard and used to warn when
# the uploaded dataset is far from it.
RECOMMENDED_SPLIT: dict[str, int] = {"train": 64, "test": 20, "valid": 16}

# The published class set, offered as the wizard's starting point. A model may
# add to it or drop from it: the rule engine reads whatever a model predicts
# through that model's own ClassScheme.
CANONICAL_CLASSES: list[str] = list(settings.class_names)

# Defaults for a new model; the wizard may override each of them per run.
MAX_EPOCHS = 12
BATCH_SIZE = 16
LEARNING_RATE = 0.001
BACKBONES: tuple[str, ...] = ("scratch", "mobilenetv2")

# Guard rails for the values the wizard sends.
EPOCH_RANGE = (1, 200)
BATCH_RANGE = (1, 128)
LEARNING_RATE_RANGE = (1e-5, 1.0)
# Images are decoded into memory as float32 224x224x3 (~600 KB each), so a
# whole split is capped rather than letting one upload exhaust the container.
MAX_IMAGES_PER_SPLIT = 2000

# Minimum a run needs to mean anything at all. Below this the API refuses to
# start rather than reporting an accuracy measured on a handful of images.
MIN_TRAIN_PER_CLASS = 5
MIN_TEST_PER_CLASS = 2


# =========================================================================
# DATASET STAGING
# =========================================================================
def model_dir(owner_id: int, model_id: int) -> Path:
    return settings.storage_dir / "training" / str(owner_id) / str(model_id)


def split_dir(owner_id: int, model_id: int, split: str, class_name: str) -> Path:
    if split not in SPLITS:
        raise ValueError(f"unknown split: {split}")
    return model_dir(owner_id, model_id) / split / safe_text_name(class_name)


def stage_file(
    owner_id: int, model_id: int, split: str, class_name: str, filename: str, data: bytes
) -> str:
    """Write one uploaded image into the staging tree, returning its stored name."""
    folder = split_dir(owner_id, model_id, split, class_name)
    folder.mkdir(parents=True, exist_ok=True)

    ext = Path(filename).suffix.lower() or ".png"
    stem = safe_text_name(Path(filename).stem)
    target = folder / f"{stem}{ext}"

    # Two source folders can hold the same basename; keep both rather than
    # letting the second silently replace the first.
    counter = 1
    while target.exists():
        target = folder / f"{stem}_{counter}{ext}"
        counter += 1

    target.write_bytes(data)
    return target.name


def clear_split(owner_id: int, model_id: int, split: str, class_name: str) -> None:
    """Empty one class of one split, so a wrong folder can be re-uploaded."""
    shutil.rmtree(split_dir(owner_id, model_id, split, class_name), ignore_errors=True)


def discard_dataset(owner_id: int, model_id: int) -> None:
    """Delete everything staged for a model, the fitted artifact included."""
    shutil.rmtree(model_dir(owner_id, model_id), ignore_errors=True)


def write_consent_marker(
    owner_id: int, model_id: int, *, username: str, model_name: str, consent: bool
) -> None:
    """Record next to the dataset whether it may be passed to the developers.

    Kept as a file rather than only a database column so a collection script
    walking storage/training/ can tell, from the folder alone, which datasets
    the account agreed to share.
    """
    folder = model_dir(owner_id, model_id)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "CONSENT.json").write_text(
        json.dumps(
            {
                "may_share_with_developers": bool(consent),
                "account": username,
                "model": model_name,
                "answered_at": datetime.now(timezone.utc).isoformat(),
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def _images_in(folder: Path) -> list[Path]:
    if not folder.is_dir():
        return []
    return sorted(p for p in folder.iterdir() if p.is_file() and detect.file_ext_ok(p.name))


def _pairs_in(folder: Path) -> tuple[list[tuple[Path, Path]], list[Path]]:
    """Group a Hybrid class folder into (PRPD, TF) pairs plus the leftovers.

    Pairing reuses the folder-import rules so a dataset exported the same way
    the Case Workflow expects imports without renaming: `<case>_PRPD.jpg` +
    `<case>_TF.jpg`.
    """
    buckets: dict[str, dict[str, Path]] = {}
    for path in _images_in(folder):
        key = detect.extract_case_key(path.name) or path.stem.lower()
        slot = "tf" if detect.filename_suggests_tf(path.name) is True else "prpd"
        buckets.setdefault(key, {})[slot] = path

    pairs: list[tuple[Path, Path]] = []
    unpaired: list[Path] = []
    for slots in buckets.values():
        prpd, tf_map = slots.get("prpd"), slots.get("tf")
        if prpd is not None and tf_map is not None:
            pairs.append((prpd, tf_map))
        else:
            unpaired.extend(p for p in (prpd, tf_map) if p is not None)
    return pairs, unpaired


def dataset_summary(
    owner_id: int, model_id: int, class_names: list[str], kind: str
) -> dict[str, Any]:
    """Count what has been staged so far, per class and per split.

    For a Hybrid model a *sample* is one PRPD paired with its T-F map, so the
    counts reported here are pair counts and anything unpaired is listed
    separately rather than quietly inflating the dataset size.
    """
    per_class: dict[str, dict[str, int]] = {}
    # Raw file counts alongside the sample counts. For Hybrid the two differ,
    # and a slot holding only unpaired files would otherwise read as empty with
    # no way for the account to see, or clear, what is actually in it.
    raw_per_class: dict[str, dict[str, int]] = {}
    totals = dict.fromkeys(SPLITS, 0)
    unpaired: list[str] = []

    for class_name in class_names:
        row: dict[str, int] = {}
        raw_row: dict[str, int] = {}
        for split in SPLITS:
            folder = split_dir(owner_id, model_id, split, class_name)
            raw_row[split] = len(_images_in(folder))
            if kind == "hybrid":
                pairs, loose = _pairs_in(folder)
                row[split] = len(pairs)
                unpaired.extend(f"{split}/{class_name}/{p.name}" for p in loose)
            else:
                row[split] = raw_row[split]
            totals[split] += row[split]
        per_class[class_name] = row
        raw_per_class[class_name] = raw_row

    total = sum(totals.values())
    percentages = {
        split: round(100.0 * count / total, 1) if total else 0.0
        for split, count in totals.items()
    }

    return {
        "per_class": per_class,
        "raw_per_class": raw_per_class,
        "totals": totals,
        "total": total,
        "percentages": percentages,
        "recommended": RECOMMENDED_SPLIT,
        "unpaired": unpaired[:20],
        "unpaired_count": len(unpaired),
    }


def readiness(summary: dict[str, Any], class_names: list[str]) -> list[str]:
    """Blocking problems with a staged dataset, as plain sentences.

    Empty means the run may start. These are the mechanical preconditions
    only; the judgement calls (label accuracy, leakage between splits) stay on
    the Pre-Training Checklist, which the account confirms itself.
    """
    problems: list[str] = []
    per_class = summary["per_class"]

    for class_name in class_names:
        counts = per_class.get(class_name, {})
        if counts.get("train", 0) < MIN_TRAIN_PER_CLASS:
            problems.append(
                f"{class_name}: needs at least {MIN_TRAIN_PER_CLASS} training samples "
                f"(has {counts.get('train', 0)})."
            )
        if counts.get("test", 0) < MIN_TEST_PER_CLASS:
            problems.append(
                f"{class_name}: needs at least {MIN_TEST_PER_CLASS} test samples "
                f"(has {counts.get('test', 0)})."
            )

    if summary["unpaired_count"]:
        problems.append(
            f"{summary['unpaired_count']} Hybrid file(s) have no matching pair. Each PRPD "
            "needs the T-F map from the same measurement, named <case>_PRPD and <case>_TF."
        )

    return problems


def balance_warnings(summary: dict[str, Any], class_names: list[str]) -> list[str]:
    """Non-blocking observations: class imbalance and a split far off 64/20/16."""
    warnings: list[str] = []
    train_counts = {c: summary["per_class"].get(c, {}).get("train", 0) for c in class_names}
    smallest, largest = min(train_counts.values()), max(train_counts.values())

    if smallest and largest >= smallest * 3:
        warnings.append(
            f"Class counts are unbalanced: the largest training class has {largest} samples "
            f"and the smallest {smallest}. Accuracy will favour the larger class."
        )

    for split, target in RECOMMENDED_SPLIT.items():
        actual = summary["percentages"][split]
        if summary["total"] and abs(actual - target) > 12:
            warnings.append(
                f"The {split} split is {actual:g}% of the dataset, against a recommended "
                f"{target}%."
            )

    if not summary["per_class"] or all(
        summary["per_class"].get(c, {}).get("valid", 0) == 0 for c in class_names
    ):
        warnings.append(
            "No validation samples were uploaded. Training will hold out part of the "
            "training set instead, which makes the validation figure less independent."
        )

    return warnings


# =========================================================================
# LOADING
# =========================================================================
def _load_split(
    owner_id: int, model_id: int, split: str, class_names: list[str], kind: str
) -> tuple[np.ndarray, np.ndarray | None, np.ndarray]:
    """Decode and preprocess one split into (PRPD batch, T-F batch, one-hot labels)."""
    prpd_images: list[np.ndarray] = []
    tf_images: list[np.ndarray] = []
    labels: list[int] = []

    for index, class_name in enumerate(class_names):
        folder = split_dir(owner_id, model_id, split, class_name)

        if kind == "hybrid":
            pairs, _ = _pairs_in(folder)
            items: list[tuple[Path, Path | None]] = [(p, t) for p, t in pairs]
        else:
            items = [(p, None) for p in _images_in(folder)]

        for prpd_path, tf_path in items[:MAX_IMAGES_PER_SPLIT]:
            # Decode into locals first: a half-appended sample would shift every
            # later label against its image.
            try:
                prpd = ml.preprocess_for_classification(read_image(prpd_path))
                tf_map = (
                    ml.preprocess_for_classification(read_image(tf_path))
                    if tf_path is not None
                    else None
                )
            except Exception as exc:  # a single unreadable file must not kill the run
                logger.warning("Skipping %s: %s", prpd_path, exc)
                continue

            prpd_images.append(prpd)
            if tf_map is not None:
                tf_images.append(tf_map)
            labels.append(index)

    if not prpd_images:
        size = settings.img_size_classification
        empty = np.zeros((0, size, size, 3), dtype=np.float32)
        labels_empty = np.zeros((0, len(class_names)), dtype=np.float32)
        return empty, (empty if kind == "hybrid" else None), labels_empty

    one_hot = np.zeros((len(labels), len(class_names)), dtype=np.float32)
    one_hot[np.arange(len(labels)), labels] = 1.0

    return (
        np.stack(prpd_images).astype(np.float32),
        np.stack(tf_images).astype(np.float32) if kind == "hybrid" else None,
        one_hot,
    )


# =========================================================================
# NETWORK
# =========================================================================
def _build_network(
    tf: Any, n_classes: int, kind: str, config: dict[str, Any]
) -> tuple[Any, str | None]:
    """One tower per input, either a compact CNN or a MobileNetV2 backbone.

    Returns the model and a note when the requested backbone could not be used.
    "scratch" is the safe default: ImageNet weights are a download, and a run
    started from this page must still work on a container with no internet.
    """
    size = settings.img_size_classification
    fallback_note: str | None = None

    backbone = config.get("backbone", "scratch")
    shared_base = None
    if backbone == "mobilenetv2":
        try:
            shared_base = tf.keras.applications.MobileNetV2(
                input_shape=(size, size, 3), include_top=False, weights="imagenet"
            )
            shared_base.trainable = False
        except Exception as exc:  # no internet, or the cache is empty
            logger.warning("MobileNetV2 weights unavailable (%s); training from scratch", exc)
            fallback_note = (
                "MobileNetV2 weights could not be downloaded, so the compact CNN was "
                "trained from scratch instead."
            )
            shared_base = None

    def tower(name: str) -> tuple[Any, Any]:
        inputs = tf.keras.Input(shape=(size, size, 3), name=name)
        if shared_base is not None:
            # MobileNetV2 expects inputs in [-1, 1]; preprocessing hands over
            # [0, 1], so rescale rather than feeding it the wrong range.
            x = tf.keras.layers.Rescaling(2.0, offset=-1.0)(inputs)
            x = shared_base(x, training=False)
            return inputs, tf.keras.layers.GlobalAveragePooling2D()(x)

        x = inputs
        for filters in (32, 64, 128, 128):
            x = tf.keras.layers.Conv2D(filters, 3, padding="same", use_bias=False)(x)
            x = tf.keras.layers.BatchNormalization()(x)
            x = tf.keras.layers.Activation("relu")(x)
            x = tf.keras.layers.MaxPooling2D()(x)
        return inputs, tf.keras.layers.GlobalAveragePooling2D()(x)

    prpd_input, prpd_features = tower("prpd_input")

    if kind == "hybrid":
        tf_input, tf_features = tower("tf_input")
        features = tf.keras.layers.Concatenate()([prpd_features, tf_features])
        inputs = [prpd_input, tf_input]
    else:
        features, inputs = prpd_features, prpd_input

    x = tf.keras.layers.Dropout(0.3)(features)
    x = tf.keras.layers.Dense(128, activation="relu")(x)
    x = tf.keras.layers.Dropout(0.3)(x)
    # Sigmoid, not softmax: the rule engine reads each class as its own
    # percentage, exactly as PRPD_TF_1_sigmoid does.
    outputs = tf.keras.layers.Dense(n_classes, activation="sigmoid")(x)

    model = tf.keras.Model(inputs=inputs, outputs=outputs)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(config.get("learning_rate", LEARNING_RATE)),
        loss="binary_crossentropy",
        metrics=[tf.keras.metrics.CategoricalAccuracy(name="acc")],
    )
    return model, fallback_note


def _accuracy(predictions: np.ndarray, one_hot: np.ndarray) -> float:
    """Top-1 accuracy, computed from argmax rather than a Keras metric name."""
    if len(predictions) == 0:
        return 0.0
    return float(np.mean(np.argmax(predictions, axis=1) == np.argmax(one_hot, axis=1)) * 100.0)


# =========================================================================
# SIMULATED RUN (no TensorFlow)
# =========================================================================
def _simulate(
    summary: dict[str, Any], class_names: list[str], epochs: int = MAX_EPOCHS
) -> dict[str, Any]:
    """Plausible, reproducible figures for a build without TensorFlow.

    Derived from dataset size and class balance so the number reacts to the
    data the way a real run would, and seeded from the dataset composition so
    the same dataset always yields the same figure. It is not a measurement,
    and every caller marks it as simulated.
    """
    train_counts = [summary["per_class"].get(c, {}).get("train", 0) for c in class_names]
    total_train = sum(train_counts) or 1
    smallest, largest = min(train_counts), max(train_counts)

    # More data helps, up to a point; imbalance costs.
    volume = min(1.0, total_train / (60.0 * len(class_names)))
    balance = (smallest / largest) if largest else 0.0

    seed = int(hashlib.sha256(json.dumps(summary["per_class"], sort_keys=True).encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)

    accuracy = 62.0 + 26.0 * volume + 8.0 * balance + rng.uniform(-2.5, 2.5)
    accuracy = round(min(96.5, max(45.0, accuracy)), 2)

    return {
        "accuracy": accuracy,
        "val_accuracy": round(min(97.0, max(40.0, accuracy + rng.uniform(-3.5, 1.5))), 2),
        "loss": round(max(0.05, 1.15 - accuracy / 100.0 + rng.uniform(-0.05, 0.05)), 4),
        "epochs": epochs,
        "engine_used": "simulated",
        "artifact_path": None,
        "note": (
            "Simulated run: TensorFlow is not installed in this build, so no network was "
            "fitted. The figures are derived from the dataset composition and are not a "
            "measured accuracy."
        ),
    }


# =========================================================================
# THE RUN
# =========================================================================
def _set_progress(model_id: int, progress: int, stage: str) -> None:
    """Publish progress from the worker thread on its own short session."""
    db = SessionLocal()
    try:
        row = db.get(TrainedModel, model_id)
        if row is not None:
            row.progress = progress
            row.stage = stage
            db.commit()
    except Exception:  # progress reporting must never fail the run
        db.rollback()
    finally:
        db.close()


def _train_with_tensorflow(
    tf: Any,
    owner_id: int,
    model_id: int,
    class_names: list[str],
    kind: str,
    config: dict[str, Any],
) -> dict[str, Any]:
    max_epochs = int(config.get("max_epochs", MAX_EPOCHS))
    batch_size = int(config.get("batch_size", BATCH_SIZE))

    _set_progress(model_id, 10, "Loading training images")
    train_prpd, train_tf, train_y = _load_split(owner_id, model_id, "train", class_names, kind)
    if len(train_prpd) == 0:
        raise ValueError("No readable training images were found.")

    _set_progress(model_id, 25, "Loading validation and test images")
    valid_prpd, valid_tf, valid_y = _load_split(owner_id, model_id, "valid", class_names, kind)
    test_prpd, test_tf, test_y = _load_split(owner_id, model_id, "test", class_names, kind)

    if not len(valid_prpd):
        # No validation folder: hold out a slice of the training set so early
        # stopping still has something to watch. Split here rather than through
        # `validation_split`, which cannot slice the two-input Hybrid batch.
        held = max(1, int(round(len(train_prpd) * 0.2)))
        order = np.random.default_rng(0).permutation(len(train_prpd))
        valid_idx, train_idx = order[:held], order[held:]
        valid_prpd, train_prpd = train_prpd[valid_idx], train_prpd[train_idx]
        valid_y, train_y = train_y[valid_idx], train_y[train_idx]
        if kind == "hybrid" and train_tf is not None:
            valid_tf, train_tf = train_tf[valid_idx], train_tf[train_idx]

    train_inputs = [train_prpd, train_tf] if kind == "hybrid" else train_prpd
    valid_inputs = [valid_prpd, valid_tf] if kind == "hybrid" else valid_prpd

    _set_progress(model_id, 30, "Building the network")
    network, fallback_note = _build_network(tf, len(class_names), kind, config)

    class _Progress(tf.keras.callbacks.Callback):
        def on_epoch_end(self, epoch: int, logs: dict[str, Any] | None = None) -> None:
            done = 30 + int(55 * (epoch + 1) / max_epochs)
            _set_progress(model_id, min(85, done), f"Training epoch {epoch + 1} of {max_epochs}")

    history = network.fit(
        train_inputs,
        train_y,
        epochs=max_epochs,
        batch_size=batch_size,
        validation_data=(valid_inputs, valid_y),
        shuffle=True,
        verbose=0,
        callbacks=[
            _Progress(),
            tf.keras.callbacks.EarlyStopping(
                monitor="val_loss", patience=3, restore_best_weights=True
            ),
        ],
    )

    _set_progress(model_id, 90, "Evaluating on the test set")
    if len(test_prpd):
        test_inputs = [test_prpd, test_tf] if kind == "hybrid" else test_prpd
        accuracy = _accuracy(network.predict(test_inputs, verbose=0), test_y)
        measured_on = "the held-out test set"
    else:
        accuracy = float(history.history.get("acc", [0.0])[-1] * 100.0)
        measured_on = "the training set (no test images were uploaded)"

    _set_progress(model_id, 95, "Saving the model")
    artifact = model_dir(owner_id, model_id) / "model.keras"
    artifact.parent.mkdir(parents=True, exist_ok=True)
    network.save(str(artifact))

    val_accuracy = history.history.get("val_acc")
    note = f"Accuracy measured on {measured_on}."
    if fallback_note:
        note = f"{note} {fallback_note}"

    return {
        "accuracy": round(accuracy, 2),
        "val_accuracy": round(float(val_accuracy[-1]) * 100.0, 2) if val_accuracy else None,
        "loss": round(float(history.history["loss"][-1]), 4),
        "epochs": len(history.history["loss"]),
        "engine_used": "real",
        "artifact_path": str(artifact.relative_to(settings.storage_dir)).replace("\\", "/"),
        "note": note,
    }


def _run(model_id: int) -> None:
    """Worker body. Owns its session; never raises into the thread pool."""
    db = SessionLocal()
    try:
        row = db.get(TrainedModel, model_id)
        if row is None:
            return
        owner_id = row.owner_id
        kind = row.kind
        model_name = row.name
        class_names = json.loads(row.class_names or "[]")
        username = db.scalar(select(User.username).where(User.id == owner_id)) or str(owner_id)
        config = {
            "max_epochs": row.max_epochs,
            "batch_size": row.batch_size,
            "learning_rate": row.learning_rate,
            "backbone": row.backbone,
        }
        row.status = "running"
        row.started_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()

    _set_progress(model_id, 5, "Preparing the dataset")

    try:
        tf = ml.engine.tf
        if tf is None:
            summary = dataset_summary(owner_id, model_id, class_names, kind)
            _set_progress(model_id, 50, "Simulating (TensorFlow unavailable)")
            result = _simulate(summary, class_names, config["max_epochs"])
        else:
            result = _train_with_tensorflow(
                tf, owner_id, model_id, class_names, kind, config
            )
        error: str | None = None
    except Exception as exc:  # pragma: no cover - depends on the dataset
        logger.exception("Training run %s failed", model_id)
        result, error = {}, f"{type(exc).__name__}: {exc}"

    db = SessionLocal()
    try:
        row = db.get(TrainedModel, model_id)
        if row is None:
            return
        row.finished_at = datetime.now(timezone.utc)
        consent = row.data_consent
        if error:
            row.status = "failed"
            row.error = error
            row.stage = "Failed"
            row.progress = 100
        else:
            row.status = "completed"
            row.progress = 100
            row.stage = "Completed"
            row.accuracy = result["accuracy"]
            row.val_accuracy = result["val_accuracy"]
            row.loss = result["loss"]
            row.epochs = result["epochs"]
            row.engine_used = result["engine_used"]
            row.artifact_path = result["artifact_path"]
            row.note = result["note"]
        db.add(
            UsageLog(
                username=username,
                action="train_model_failed" if error else "train_model_finished",
                detail=(
                    f"{model_name} ({kind}): {error}"
                    if error
                    else f"{model_name} ({kind}): {row.accuracy}% ({row.engine_used})"
                ),
            )
        )
        db.commit()
    finally:
        db.close()

    # Stamp the wizard's answer next to the finished dataset, so whoever
    # collects training data off this server can see what may be taken.
    write_consent_marker(
        owner_id, model_id, username=username, model_name=model_name, consent=consent
    )


def start(model_id: int) -> None:
    """Kick the run off in the background so the request returns immediately."""
    threading.Thread(target=_run, args=(model_id,), daemon=True, name=f"train-{model_id}").start()
