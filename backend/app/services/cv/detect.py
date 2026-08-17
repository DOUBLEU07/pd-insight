"""Computer-vision services, ported 1:1 from PRPD_4_Gap Time.md.

  * `detect_prpd_plot_frame`            : PART1 WORK A / PART3
  * `clean_binary_mask`                 : PART2 / PART3
  * `auto_detect_gap_lines_rule_based`  : PART3 (includes the single-cluster
                                          "not measurable" criterion)
  * `internal_sanity_check`             : PRPD_2_Only.md PART 5

Thresholds, percentile choices and morphology kernels are unchanged.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from app.core.config import settings
from app.services.rules import pixel_to_phase_deg


# =========================================================================
# PLOT FRAME DETECTION
# =========================================================================
def detect_prpd_plot_frame(img_bgr: np.ndarray) -> dict[str, Any]:
    """Locate the PRPD plot rectangle.

    Contour scoring first; falls back to a dark-pixel projection, then to a
    fixed fraction of the image.
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    edges = cv2.Canny(blur, 50, 150)

    kernel = np.ones((3, 3), np.uint8)
    edges_dilated = cv2.dilate(edges, kernel, iterations=1)

    contours, _ = cv2.findContours(
        edges_dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    img_h, img_w = gray.shape
    img_area = img_w * img_h
    candidates: list[dict[str, float]] = []

    for cnt in contours:
        x, y, ww, hh = cv2.boundingRect(cnt)
        area = ww * hh

        if area < 0.08 * img_area:
            continue
        if area > 0.90 * img_area:
            continue
        if ww < 0.35 * img_w:
            continue
        if hh < 0.25 * img_h:
            continue

        aspect = ww / max(hh, 1)
        if aspect < 0.8 or aspect > 2.5:
            continue

        cx = x + ww / 2
        cy = y + hh / 2
        center_score = 1.0 - (
            abs(cx - img_w / 2) / (img_w / 2) * 0.5
            + abs(cy - img_h / 2) / (img_h / 2) * 0.5
        )

        candidates.append(
            {
                "x": x,
                "y": y,
                "w": ww,
                "h": hh,
                "area": area,
                "aspect": aspect,
                "score": area * center_score,
            }
        )

    if candidates:
        best = sorted(candidates, key=lambda d: d["score"], reverse=True)[0]
        x_left = int(best["x"])
        x_right = int(best["x"] + best["w"])
        y_top = int(best["y"])
        y_bottom = int(best["y"] + best["h"])
        return _frame_result(
            x_left, x_right, y_top, y_bottom, "auto_contour_detected", img_w, img_h,
            len(candidates),
        )

    # ---- fallback: projection of dark columns/rows ----
    dark = gray < 120
    col_sum = dark.sum(axis=0)
    row_sum = dark.sum(axis=1)

    col_thr = max(20, int(0.18 * img_h))
    row_thr = max(20, int(0.18 * img_w))

    xs = np.where(col_sum > col_thr)[0]
    ys = np.where(row_sum > row_thr)[0]

    if len(xs) > 5 and len(ys) > 5:
        x_left = int(xs.min())
        x_right = int(xs.max())
        y_top = int(ys.min())
        y_bottom = int(ys.max())

        # Guard against latching onto the image border itself.
        if (x_right - x_left) > 0.90 * img_w:
            x_left = int(img_w * 0.18)
            x_right = int(img_w * 0.88)
        if (y_bottom - y_top) > 0.90 * img_h:
            y_top = int(img_h * 0.15)
            y_bottom = int(img_h * 0.85)

        return _frame_result(
            x_left, x_right, y_top, y_bottom, "projection_fallback", img_w, img_h, 0
        )

    return _frame_result(
        int(img_w * 0.18),
        int(img_w * 0.88),
        int(img_h * 0.15),
        int(img_h * 0.85),
        "auto_failed_manual_required",
        img_w,
        img_h,
        0,
    )


def _frame_result(
    x_left: int,
    x_right: int,
    y_top: int,
    y_bottom: int,
    status: str,
    img_w: int,
    img_h: int,
    candidate_count: int,
) -> dict[str, Any]:
    plot_area_ratio = ((x_right - x_left) * (y_bottom - y_top)) / float(img_w * img_h)
    return {
        "x_left": x_left,
        "x_right": x_right,
        "y_top": y_top,
        "y_bottom": y_bottom,
        "status": status,
        "plot_area_ratio": plot_area_ratio,
        "candidate_count": candidate_count,
    }


# =========================================================================
# MASK CLEANING + RULE-BASED GAP DETECTION
# =========================================================================
def clean_binary_mask(
    binary_mask: np.ndarray, min_area: int = 2, max_area: int | None = None
) -> np.ndarray:
    m = binary_mask.astype(np.uint8) * 255
    m = cv2.medianBlur(m, 3)

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    clean = np.zeros_like(m)

    if max_area is None:
        max_area = m.shape[0] * m.shape[1]

    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        if min_area <= area <= max_area:
            clean[labels == i] = 255

    return clean > 0


def auto_detect_gap_lines_rule_based(
    img_rgb: np.ndarray, x_left: int, x_right: int, y_top: int, y_bottom: int
) -> tuple[dict[str, Any] | None, str]:
    """Find the boundary between the positive and negative discharge clusters.

    Returns (result, status). A single detected cluster yields no result and a
    `single_discharge_cluster_detected_*` status. The supervisor's criterion
    for classifying gap-time as not measurable.
    """
    crop = img_rgb[y_top:y_bottom, x_left:x_right].copy()

    if crop.size == 0:
        return None, "empty_crop"

    crop_h, crop_w, _ = crop.shape

    hsv = cv2.cvtColor(crop, cv2.COLOR_RGB2HSV)
    gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)

    dark_mask = gray < 165
    color_mask = (hsv[:, :, 1] > 35) & (hsv[:, :, 2] < 250)
    mask = dark_mask | color_mask

    border_x = max(3, int(0.02 * crop_w))
    border_y = max(3, int(0.02 * crop_h))

    mask[:, :border_x] = False
    mask[:, -border_x:] = False
    mask[:border_y, :] = False
    mask[-border_y:, :] = False

    y_mid = crop_h // 2
    axis_band = max(3, int(0.025 * crop_h))
    mask[max(0, y_mid - axis_band) : min(crop_h, y_mid + axis_band + 1), :] = False

    positive_mask = np.zeros_like(mask)
    negative_mask = np.zeros_like(mask)
    positive_mask[: y_mid - axis_band, :] = mask[: y_mid - axis_band, :]
    negative_mask[y_mid + axis_band :, :] = mask[y_mid + axis_band :, :]

    max_component_area = int(0.30 * crop_w * crop_h)

    positive_mask = clean_binary_mask(positive_mask, 2, max_component_area)
    negative_mask = clean_binary_mask(negative_mask, 2, max_component_area)

    _, pos_x = np.where(positive_mask)
    _, neg_x = np.where(negative_mask)

    if len(pos_x) < 10 and len(neg_x) >= 10:
        return None, "single_discharge_cluster_detected_negative_only"
    if len(neg_x) < 10 and len(pos_x) >= 10:
        return None, "single_discharge_cluster_detected_positive_only"
    if len(pos_x) < 10 and len(neg_x) < 10:
        return None, "no_clear_discharge_cluster_detected"

    pos_left = int(np.percentile(pos_x, 5))
    pos_right = int(np.percentile(pos_x, 95))
    neg_left = int(np.percentile(neg_x, 5))
    neg_right = int(np.percentile(neg_x, 95))

    if neg_right < pos_left:
        left_line_crop_x = neg_right
        right_line_crop_x = pos_left
        detected_case = "negative_left_positive_right"
    elif pos_right < neg_left:
        left_line_crop_x = pos_right
        right_line_crop_x = neg_left
        detected_case = "positive_left_negative_right"
    else:
        return None, "clusters_overlap_or_unclear"

    gap_width = right_line_crop_x - left_line_crop_x
    if gap_width < 3:
        return None, "gap_too_small_or_invalid"

    return (
        {
            "left_line_x": x_left + int(left_line_crop_x),
            "right_line_x": x_left + int(right_line_crop_x),
            "positive_x_range_pixel": (x_left + pos_left, x_left + pos_right),
            "negative_x_range_pixel": (x_left + neg_left, x_left + neg_right),
            "positive_x_range_phase": (
                pixel_to_phase_deg(x_left + pos_left, x_left, x_right),
                pixel_to_phase_deg(x_left + pos_right, x_left, x_right),
            ),
            "negative_x_range_phase": (
                pixel_to_phase_deg(x_left + neg_left, x_left, x_right),
                pixel_to_phase_deg(x_left + neg_right, x_left, x_right),
            ),
            "gap_width_pixel": gap_width,
            "detected_case": detected_case,
            "pos_points": int(len(pos_x)),
            "neg_points": int(len(neg_x)),
        },
        "rule_based_auto_detected",
    )


SINGLE_CLUSTER_STATUSES = {
    "single_discharge_cluster_detected_negative_only",
    "single_discharge_cluster_detected_positive_only",
    "no_clear_discharge_cluster_detected",
}


# =========================================================================
# INTERNAL SANITY CHECK (PRPD_2_Only.md PART 5)
# =========================================================================
def internal_sanity_check(img_rgb: np.ndarray) -> dict[str, Any]:
    """Quadrant point-mass ratios for the Internal safety rule.

    Internal PD should show discharge above and below the axis and across two
    phase ranges, so every quadrant ratio must reach 0.15.
    """
    h, w, _ = img_rgb.shape

    crop = img_rgb[int(h * 0.18) : int(h * 0.82), int(w * 0.18) : int(w * 0.88)]
    if crop.size == 0:
        return {
            "ran": True,
            "internal_ok": False,
            "upper_ratio": 0.0,
            "lower_ratio": 0.0,
            "left_ratio": 0.0,
            "right_ratio": 0.0,
            "note": "empty crop",
        }

    gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    dark_mask = gray < 210

    r = crop[:, :, 0].astype(np.float32)
    g = crop[:, :, 1].astype(np.float32)
    b = crop[:, :, 2].astype(np.float32)
    red_mask = (r > 120) & (r > g * 1.15) & (r > b * 1.15)

    mask = (dark_mask | red_mask).astype(np.uint8)

    kernel = np.ones((2, 2), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    clean_mask = np.zeros_like(mask)

    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        ww = stats[i, cv2.CC_STAT_WIDTH]
        hh = stats[i, cv2.CC_STAT_HEIGHT]

        # Drop axes / sine curve / long text runs, plus dust and huge blocks.
        very_long_horizontal = ww > 120 and hh < 10
        very_long_vertical = hh > 120 and ww < 10
        too_small = area < 2
        too_large = area > 4000

        if not (very_long_horizontal or very_long_vertical or too_small or too_large):
            clean_mask[labels == i] = 1

    ch, cw = clean_mask.shape

    upper_left = int(np.sum(clean_mask[: ch // 2, : cw // 2]))
    upper_right = int(np.sum(clean_mask[: ch // 2, cw // 2 :]))
    lower_left = int(np.sum(clean_mask[ch // 2 :, : cw // 2]))
    lower_right = int(np.sum(clean_mask[ch // 2 :, cw // 2 :]))

    upper = upper_left + upper_right
    lower = lower_left + lower_right
    left = upper_left + lower_left
    right = upper_right + lower_right

    total_ul = upper + lower + 1e-6
    total_lr = left + right + 1e-6

    upper_ratio = upper / total_ul
    lower_ratio = lower / total_ul
    left_ratio = left / total_lr
    right_ratio = right / total_lr

    upper_lower_ok = upper_ratio >= 0.15 and lower_ratio >= 0.15
    left_right_ok = left_ratio >= 0.15 and right_ratio >= 0.15

    return {
        "ran": True,
        "internal_ok": bool(upper_lower_ok and left_right_ok),
        "upper_lower_ok": bool(upper_lower_ok),
        "left_right_ok": bool(left_right_ok),
        "upper_ratio": float(upper_ratio),
        "lower_ratio": float(lower_ratio),
        "left_ratio": float(left_ratio),
        "right_ratio": float(right_ratio),
        "total_points": int(upper + lower),
    }


# =========================================================================
# PRPD SCATTER EXTRACTION (for the browser canvas)
# =========================================================================
def extract_prpd_points(
    img_rgb: np.ndarray,
    x_left: int,
    x_right: int,
    y_top: int,
    y_bottom: int,
    max_points: int = 4000,
) -> list[dict[str, float]]:
    """Extract discharge points so the frontend can redraw the plot as a canvas
    overlay instead of shipping the raw bitmap for every interaction.

    Uses the same masking as the rule-based gap detector, so what the reviewer
    drags lines against is exactly what the detector measured.
    """
    crop = img_rgb[y_top:y_bottom, x_left:x_right]
    if crop.size == 0:
        return []

    crop_h, crop_w, _ = crop.shape
    hsv = cv2.cvtColor(crop, cv2.COLOR_RGB2HSV)
    gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)

    mask = (gray < 165) | ((hsv[:, :, 1] > 35) & (hsv[:, :, 2] < 250))

    border_x = max(3, int(0.02 * crop_w))
    border_y = max(3, int(0.02 * crop_h))
    mask[:, :border_x] = False
    mask[:, -border_x:] = False
    mask[:border_y, :] = False
    mask[-border_y:, :] = False

    y_mid = crop_h // 2
    axis_band = max(3, int(0.025 * crop_h))
    mask[max(0, y_mid - axis_band) : min(crop_h, y_mid + axis_band + 1), :] = False

    mask = clean_binary_mask(mask, 2, int(0.30 * crop_w * crop_h))

    ys, xs = np.where(mask)
    if len(xs) == 0:
        return []

    if len(xs) > max_points:
        idx = np.linspace(0, len(xs) - 1, max_points).astype(int)
        xs, ys = xs[idx], ys[idx]

    points = []
    for cx, cy in zip(xs.tolist(), ys.tolist()):
        abs_x = x_left + cx
        abs_y = y_top + cy
        points.append(
            {
                "x": int(abs_x),
                "y": int(abs_y),
                "phase": round(pixel_to_phase_deg(abs_x, x_left, x_right), 2),
                "half": "pos" if cy < y_mid else "neg",
            }
        )
    return points


# =========================================================================
# INPUT VALIDATION (CMD FINAL CODE `validate_input`)
# =========================================================================
def file_ext_ok(filename: str) -> bool:
    lowered = (filename or "").lower()
    return any(lowered.endswith(ext) for ext in settings.allowed_extensions)


def extract_case_key(filename: str) -> str:
    import os
    import re

    name = os.path.splitext(os.path.basename(filename or ""))[0].lower()
    name = re.sub(r"(prpd|tf|twmap|pattern)", "", name)
    name = re.sub(r"[^a-z0-9]+", "", name)
    return name


def filename_suggests_prpd(filename: str) -> bool | None:
    lowered = (filename or "").lower()
    if "prpd" in lowered or "pattern" in lowered:
        return True
    if "tf" in lowered or "twmap" in lowered:
        return False
    return None


def filename_suggests_tf(filename: str) -> bool | None:
    lowered = (filename or "").lower()
    if "tf" in lowered or "twmap" in lowered:
        return True
    if "prpd" in lowered or "pattern" in lowered:
        return False
    return None


def validate_input(
    prpd_filename: str,
    prpd_rgb: np.ndarray,
    tf_filename: str | None = None,
    tf_rgb: np.ndarray | None = None,
) -> dict[str, Any]:
    warnings: list[str] = []
    errors: list[str] = []

    if not file_ext_ok(prpd_filename):
        errors.append("PRPD file extension is not supported. Use jpg/jpeg/png/bmp.")

    if tf_filename and not file_ext_ok(tf_filename):
        errors.append("TF Map file extension is not supported. Use jpg/jpeg/png/bmp.")

    prpd_name_check = filename_suggests_prpd(prpd_filename)
    tf_name_check = None

    if prpd_name_check is False:
        warnings.append("PRPD filename appears inconsistent with PRPD input field.")
    if prpd_name_check is None:
        warnings.append("PRPD filename does not clearly indicate PRPD/Pattern.")

    pair_match = None
    if tf_filename:
        tf_name_check = filename_suggests_tf(tf_filename)
        if tf_name_check is False:
            warnings.append("TF Map filename appears inconsistent with TF input field.")
        if tf_name_check is None:
            warnings.append("TF Map filename does not clearly indicate TF/TWMap.")

        prpd_key = extract_case_key(prpd_filename)
        tf_key = extract_case_key(tf_filename)
        pair_match = prpd_key == tf_key
        if not pair_match:
            warnings.append(
                f"PRPD/TF filename pair may not match: PRPD key={prpd_key}, TF key={tf_key}"
            )

    h, w = prpd_rgb.shape[:2]
    img_bgr = cv2.cvtColor(prpd_rgb, cv2.COLOR_RGB2BGR)
    frame = detect_prpd_plot_frame(img_bgr)

    plot_frame_detected = frame["status"] == "auto_contour_detected"
    if not plot_frame_detected:
        warnings.append(
            "PRPD plot frame could not be reliably detected. Manual calibration may be required."
        )

    plot_area_ratio = frame["plot_area_ratio"]
    plot_area_status = "unknown"
    if not np.isnan(plot_area_ratio):
        if plot_area_ratio < 0.35:
            plot_area_status = "plot_area_too_small"
            warnings.append("PRPD plot area appears small. Direct exported image is recommended.")
        elif plot_area_ratio > 0.85:
            plot_area_status = "plot_area_too_large"
            warnings.append("PRPD plot area appears unusually large or cropped.")
        else:
            plot_area_status = "acceptable"

    default_size_match = (
        w == settings.default_image_width and h == settings.default_image_height
    )
    if not default_size_match:
        warnings.append(
            f"PRPD image size is {w}x{h}, not default "
            f"{settings.default_image_width}x{settings.default_image_height}. "
            "Calibration preset or manual calibration may be required."
        )

    status = "PASS"
    if errors:
        status = "FAIL"
    elif warnings:
        status = "WARNING"

    return {
        "input_check_status": status,
        "errors": errors,
        "warnings": warnings,
        "input_has_warning": len(warnings) > 0,
        "input_warning_count": len(warnings),
        "input_warnings": " | ".join(warnings),
        "prpd_filename_check": prpd_name_check,
        "tf_filename_check": tf_name_check,
        "pair_filename_match": pair_match,
        "image_width": int(w),
        "image_height": int(h),
        "default_size_match": bool(default_size_match),
        "plot_frame_detected": bool(plot_frame_detected),
        "plot_area_ratio": float(plot_area_ratio),
        "plot_area_status": plot_area_status,
        "detected_x_left": frame["x_left"],
        "detected_x_right": frame["x_right"],
        "detected_y_top": frame["y_top"],
        "detected_y_bottom": frame["y_bottom"],
        "detected_frame_status": frame["status"],
        "requires_manual_confirmation": len(warnings) > 0,
    }
