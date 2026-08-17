"""File storage and the annotated gap-time image renderer.

`save_annotated_image` reproduces the matplotlib figure that CMD FINAL CODE
wrote to `<case>_annotated_gap_time.png`: AC reference sine, phase gridlines,
0/360 markers, the plot frame, the left/right gap lines and a summary title.
"""

from __future__ import annotations

import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from app.core.config import settings


def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def timestamp_str() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def safe_name_from_filename(filename: str) -> str:
    """Sanitise a *filename*, dropping its extension (Colab `safe_name_from_filename`)."""
    name = os.path.splitext(os.path.basename(filename or ""))[0]
    return safe_text_name(name)


def safe_text_name(text: str) -> str:
    """Sanitise an arbitrary label without treating anything as an extension.

    Case names such as ``10_3.0VS`` would otherwise lose ``.0VS`` to
    ``os.path.splitext``, collapsing ``10_3.0VS`` and ``10_3.5VS`` onto the same
    folder.
    """
    name = re.sub(r"[^\w\-]+", "_", text or "")
    name = re.sub(r"_+", "_", name).strip("_")
    return name or "case"


def case_result_dir(case_base_name: str) -> Path:
    folder = settings.results_dir / safe_text_name(case_base_name)
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def save_upload(data: bytes, case_base_name: str, suffix: str, filename: str) -> tuple[Path, str]:
    """Persist an uploaded image. Returns (absolute path, storage-relative path)."""
    folder = case_result_dir(case_base_name)
    ext = os.path.splitext(filename)[1].lower() or ".png"
    target = folder / f"{safe_text_name(case_base_name)}_{suffix}{ext}"
    target.write_bytes(data)
    return target, str(target.relative_to(settings.storage_dir)).replace("\\", "/")


def decode_image(data: bytes) -> np.ndarray:
    """Decode uploaded bytes to an RGB array."""
    arr = np.frombuffer(data, dtype=np.uint8)
    img_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise ValueError("Cannot read image. Please upload .jpg, .jpeg, .png or .bmp")
    return cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)


def read_image(path: str | Path) -> np.ndarray:
    img_bgr = cv2.imread(str(path))
    if img_bgr is None:
        raise ValueError(f"Cannot read image at {path}")
    return cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)


def save_annotated_image(
    img_rgb: np.ndarray,
    output_path: Path,
    *,
    case_base_name: str,
    x_left: int,
    x_right: int,
    y_top: int,
    y_bottom: int,
    left_x: float | None,
    right_x: float | None,
    gap_angle: float | None,
    gap_time_ms: float | None,
    gap_band: str,
    pd_source_type: str,
    severity: str,
    ai_text: str,
    not_measurable: bool = False,
) -> Path:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(11, 6))
    ax.imshow(img_rgb)

    # Plot frame in orange.
    rect_x = [x_left, x_right, x_right, x_left, x_left]
    rect_y = [y_top, y_top, y_bottom, y_bottom, y_top]
    ax.plot(rect_x, rect_y, color="orange", linewidth=2.0, label="Current plot frame")

    # 0 / 360 degree markers.
    ax.axvline(x_left, color="#3B82F6", linestyle="--", linewidth=1.6, label="0 deg")
    ax.axvline(x_right, color="#3B82F6", linestyle="--", linewidth=1.6, label="360 deg")

    # 90 / 180 / 270 reference lines.
    for deg in (90, 180, 270):
        x = x_left + (deg / 360.0) * (x_right - x_left)
        ax.axvline(x, color="gray", linestyle=":", linewidth=1.0)

    if not not_measurable and left_x is not None and right_x is not None:
        ax.axvline(left_x, color="#DC2626", linewidth=2.0, label="Left gap line")
        ax.axvline(right_x, color="#16A34A", linewidth=2.0, label="Right gap line")

    if not_measurable:
        title_lines = [
            f"{case_base_name} | GAP-TIME NOT MEASURABLE",
            f"{ai_text} | PD source: {pd_source_type}",
        ]
    else:
        gap_angle_txt = f"{gap_angle:.4f}" if gap_angle is not None else "-"
        gap_ms_txt = f"{gap_time_ms:.4f}" if gap_time_ms is not None else "-"
        title_lines = [
            f"{case_base_name} | {ai_text}",
            f"PD source: {pd_source_type}",
            f"Gap angle = {gap_angle_txt} deg | Gap time = {gap_ms_txt} ms "
            f"| Band = {gap_band} | Severity = {severity}",
        ]

    ax.set_title("\n".join(title_lines), fontsize=10)
    ax.axis("off")
    ax.legend(loc="upper right", fontsize=8)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=130, bbox_inches="tight")
    plt.close(fig)
    return output_path


def to_storage_rel(path: Path | str | None) -> str | None:
    if path is None:
        return None
    try:
        return str(Path(path).relative_to(settings.storage_dir)).replace("\\", "/")
    except ValueError:
        return str(path)


def fmt_range(value: Any) -> str:
    """Render a tuple the way pandas wrote it into final_summary.csv."""
    if value is None:
        return ""
    if isinstance(value, (tuple, list)) and len(value) == 2:
        return f"({value[0]}, {value[1]})"
    return str(value)
