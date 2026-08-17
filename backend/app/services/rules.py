"""Decision rules.

Every function here is a direct port of the Colab source:

  * `select_pd_source_by_confidence`, `map_class_to_pd_source`, `build_ai_result`
    from PRPD_4_Gap Time.md → PART3 CMD FINAL CODE
  * `gap_angle_to_ms`, `gap_time_band`, `severity_from_gap_time_and_source`
    from PRPD_4_Gap Time.md → PART2 / PART3
  * the Strict-85 / Loose-30 / SMART-Hybrid variants from the PD_Insight
    prototype and PRPD_2_Only.md / PRPD_3_Hybrid.md Part 5

The numbers are not re-derived anywhere else in the codebase.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, fields
from typing import Any

from app.core.config import settings

CLASS_NAMES = list(settings.class_names)
TOPCLASS_THRESHOLD = settings.topclass_threshold
CONFIDENCE_THRESHOLD = settings.confidence_threshold
INTERNAL_HIGH_CONFIDENCE = settings.internal_high_confidence
CYCLE_TIME_MS = settings.cycle_time_ms


# =========================================================================
# TUNABLE THRESHOLDS
# =========================================================================
@dataclass(frozen=True)
class Thresholds:
    """The numbers a reviewer is allowed to tune for their own account.

    Defaults reproduce CMD FINAL V2 exactly, so an account that never touches
    the settings page is scored by the published method. Every rule function
    below takes these explicitly rather than reading globals, so one request
    can never be scored with another account's values.
    """

    # Classification: all classes at or below this are Non-identified.
    topclass_threshold: float = TOPCLASS_THRESHOLD
    # PD source cascade: Surface and Internal both above this mean Joint.
    joint_dual_threshold: float = 60.0
    # PD source cascade: a single class above this is a strong rule.
    strong_rule_threshold: float = 80.0
    # Legacy prototype modes.
    confidence_threshold: float = CONFIDENCE_THRESHOLD
    internal_high_confidence: float = INTERNAL_HIGH_CONFIDENCE
    # Severity bands, in milliseconds.
    gap_time_high_ms: float = 4.0
    gap_time_moderate_ms: float = 7.0
    # One mains cycle: 20 ms at 50 Hz, 16.667 ms at 60 Hz.
    cycle_time_ms: float = CYCLE_TIME_MS

    @classmethod
    def field_names(cls) -> list[str]:
        return [f.name for f in fields(cls)]


DEFAULT_THRESHOLDS = Thresholds()


def _t(thresholds: Thresholds | None) -> Thresholds:
    return thresholds or DEFAULT_THRESHOLDS


# =========================================================================
# PD SOURCE
# =========================================================================
def map_class_to_pd_source(class_name: str) -> str:
    if class_name == "Corona":
        return "Floating / Corona / Bad contact"
    if class_name == "Surface":
        return "Outside surface discharge"
    if class_name == "Internal":
        return "Internal"
    return "Manual confirmation required"


def select_pd_source_by_confidence(
    corona_pct: float,
    surface_pct: float,
    internal_pct: float,
    thresholds: Thresholds | None = None,
) -> dict[str, Any]:
    """Five-rule priority cascade (CMD FINAL CODE)."""
    t = _t(thresholds)
    dual = t.joint_dual_threshold
    strong = t.strong_rule_threshold

    scores = {
        "Corona": float(corona_pct),
        "Surface": float(surface_pct),
        "Internal": float(internal_pct),
    }

    if scores["Surface"] > dual and scores["Internal"] > dual:
        return {
            "pd_rule_class": "Joint",
            "pd_source_type": "Terminations / Joint",
            "pd_selection_rule": f"surface_gt_{dual:g}_and_internal_gt_{dual:g}",
            "is_strong_rule": True,
            "requires_manual_confirmation": False,
            "rule_no": 1,
        }

    if scores["Corona"] > strong:
        return {
            "pd_rule_class": "Corona",
            "pd_source_type": "Floating / Corona / Bad contact",
            "pd_selection_rule": f"corona_gt_{strong:g}",
            "is_strong_rule": True,
            "requires_manual_confirmation": False,
            "rule_no": 2,
        }

    if scores["Surface"] > strong:
        return {
            "pd_rule_class": "Surface",
            "pd_source_type": "Outside surface discharge",
            "pd_selection_rule": f"surface_gt_{strong:g}",
            "is_strong_rule": True,
            "requires_manual_confirmation": False,
            "rule_no": 3,
        }

    if scores["Internal"] > strong:
        return {
            "pd_rule_class": "Internal",
            "pd_source_type": "Internal",
            "pd_selection_rule": f"internal_gt_{strong:g}",
            "is_strong_rule": True,
            "requires_manual_confirmation": False,
            "rule_no": 4,
        }

    top_class = max(scores, key=lambda k: scores[k])
    top_score = scores[top_class]

    return {
        "pd_rule_class": top_class,
        "pd_source_type": map_class_to_pd_source(top_class),
        "pd_selection_rule": (
            f"top_class_fallback_{top_class.lower()}_{top_score:.2f}_manual_confirm"
        ),
        "is_strong_rule": False,
        "requires_manual_confirmation": True,
        "rule_no": 5,
    }


_NON_IDENTIFIED_PD_RULE = {
    "pd_rule_class": "Non-identified",
    "pd_source_type": "Manual confirmation required",
    "pd_selection_rule": "all_classes_le_30_manual_confirmation_required",
    "is_strong_rule": False,
    "requires_manual_confirmation": True,
    "rule_no": 0,
}


# =========================================================================
# CLASSIFICATION DECISION
# =========================================================================
def _decide_topclass30(scores: dict[str, float], t: Thresholds) -> dict[str, Any]:
    """CMD FINAL CODE `build_ai_result`, the production rule.

    All three classes <= 30% => Non-identified; otherwise the top class wins.
    """
    corona, surface, internal = scores["Corona"], scores["Surface"], scores["Internal"]
    top_class = max(scores, key=lambda k: scores[k])
    top_score = scores[top_class]

    all_low = (
        corona <= t.topclass_threshold
        and surface <= t.topclass_threshold
        and internal <= t.topclass_threshold
    )

    if all_low:
        return {
            "final_result": "Non-identified",
            "final_score": top_score,
            "status": f"non_identified_all_classes_le_{t.topclass_threshold:g}",
            "non_identified_percent": 100.0,
            "high_conf_count": 0,
            "pd_rule": dict(_NON_IDENTIFIED_PD_RULE),
            "decision_rule": f"top_class_gt_{t.topclass_threshold:g}_else_non_identified",
            "threshold": t.topclass_threshold,
        }

    return {
        "final_result": top_class,
        "final_score": top_score,
        "status": f"identified_by_top_class_gt_{t.topclass_threshold:g}",
        "non_identified_percent": 0.0,
        "high_conf_count": sum(1 for v in scores.values() if v > t.topclass_threshold),
        "pd_rule": select_pd_source_by_confidence(corona, surface, internal, t),
        "decision_rule": f"top_class_gt_{t.topclass_threshold:g}_else_non_identified",
        "threshold": t.topclass_threshold,
    }


def _decide_strict85(scores: dict[str, float], t: Thresholds) -> dict[str, Any]:
    """Prototype Mode A / PRPD_2_Only Part 5.

    Exactly one class must reach 85%. Zero or two-plus => Non-identified, and
    the Non-identified percentage is the shortfall against the threshold rather
    than `100 - top`.
    """
    top_class = max(scores, key=lambda k: scores[k])
    top_score = scores[top_class]
    high_conf = [c for c, v in scores.items() if v >= t.confidence_threshold]

    if len(high_conf) == 1:
        corona, surface, internal = scores["Corona"], scores["Surface"], scores["Internal"]
        return {
            "final_result": high_conf[0],
            "final_score": scores[high_conf[0]],
            "status": "identified",
            "non_identified_percent": 0.0,
            "high_conf_count": 1,
            "pd_rule": select_pd_source_by_confidence(corona, surface, internal, t),
            "decision_rule": f"exactly_one_class_ge_{t.confidence_threshold:.0f}",
            "threshold": t.confidence_threshold,
        }

    shortfall = max(0.0, t.confidence_threshold - top_score)
    non_id_pct = 100.0 if len(high_conf) > 1 else (shortfall / t.confidence_threshold) * 100.0
    return {
        "final_result": "Non-identified",
        "final_score": 100.0,
        "status": "low_confidence_or_mixed",
        "non_identified_percent": non_id_pct,
        "high_conf_count": len(high_conf),
        "pd_rule": dict(_NON_IDENTIFIED_PD_RULE),
        "decision_rule": f"low_confidence_or_mixed_at_{t.confidence_threshold:.0f}",
        "threshold": t.confidence_threshold,
    }


def _decide_loose30(scores: dict[str, float], t: Thresholds) -> dict[str, Any]:
    """Prototype Mode B: top class only needs to exceed 30%."""
    top_class = max(scores, key=lambda k: scores[k])
    top_score = scores[top_class]

    if top_score <= t.topclass_threshold:
        return {
            "final_result": "Non-identified",
            "final_score": top_score,
            "status": "below_threshold_loose",
            "non_identified_percent": round(100.0 - top_score, 1),
            "high_conf_count": 0,
            "pd_rule": dict(_NON_IDENTIFIED_PD_RULE),
            "decision_rule": f"every_class_le_{t.topclass_threshold:.0f}",
            "threshold": t.topclass_threshold,
        }

    corona, surface, internal = scores["Corona"], scores["Surface"], scores["Internal"]
    return {
        "final_result": top_class,
        "final_score": top_score,
        "status": "identified_loose",
        "non_identified_percent": 0.0,
        "high_conf_count": sum(1 for v in scores.values() if v > t.topclass_threshold),
        "pd_rule": select_pd_source_by_confidence(corona, surface, internal, t),
        "decision_rule": f"top_class_gt_{t.topclass_threshold:.0f}_threshold_85_not_enforced",
        "threshold": t.topclass_threshold,
    }


def _decide_smart_hybrid(scores: dict[str, float], t: Thresholds) -> dict[str, Any]:
    """Prototype Mode C / PRPD_3_Hybrid Part 6 SMART FINAL RESULT.

    0 classes over 85% => Inconclusive, 1 => that class, 2+ => Mixed PD Suspected.
    """
    over = [c for c, v in scores.items() if v > t.confidence_threshold]
    corona, surface, internal = scores["Corona"], scores["Surface"], scores["Internal"]

    if len(over) == 0:
        return {
            "final_result": "Inconclusive",
            "final_score": max(scores.values()),
            "status": "hybrid_inconclusive",
            "non_identified_percent": 100.0,
            "high_conf_count": 0,
            "pd_rule": dict(_NON_IDENTIFIED_PD_RULE),
            "decision_rule": f"smart_final_result_no_class_gt_{t.confidence_threshold:.0f}",
            "threshold": t.confidence_threshold,
        }

    if len(over) == 1:
        return {
            "final_result": over[0],
            "final_score": scores[over[0]],
            "status": "hybrid_identified",
            "non_identified_percent": 0.0,
            "high_conf_count": 1,
            "pd_rule": select_pd_source_by_confidence(corona, surface, internal, t),
            "decision_rule": f"smart_final_result_single_class_gt_{t.confidence_threshold:.0f}",
            "threshold": t.confidence_threshold,
        }

    return {
        "final_result": "Mixed PD Suspected",
        "final_score": max(scores.values()),
        "status": "hybrid_mixed",
        "non_identified_percent": 100.0,
        "high_conf_count": len(over),
        "pd_rule": dict(_NON_IDENTIFIED_PD_RULE),
        "decision_rule": (
            f"smart_final_result_{len(over)}_classes_gt_{t.confidence_threshold:.0f}"
        ),
        "threshold": t.confidence_threshold,
    }


_DECIDERS = {
    "topclass30": _decide_topclass30,
    "strict85": _decide_strict85,
    "loose30": _decide_loose30,
    "smart_hybrid": _decide_smart_hybrid,
}


def build_ai_result(
    scores_percent: list[float] | tuple[float, ...],
    input_mode: str,
    model_used: str,
    model_path: str,
    decision_mode: str = "topclass30",
    thresholds: Thresholds | None = None,
) -> dict[str, Any]:
    """Assemble the full AI result block for one case.

    `scores_percent` is ordered as CLASS_NAMES = [Corona, Surface, Internal],
    already scaled to percent.
    """
    if decision_mode not in _DECIDERS:
        raise ValueError(f"unknown decision_mode: {decision_mode}")

    t = _t(thresholds)

    values = [float(v) for v in scores_percent]
    scores = {CLASS_NAMES[i]: values[i] for i in range(3)}

    top_class = max(scores, key=lambda k: scores[k])
    top_score = scores[top_class]

    decision = _DECIDERS[decision_mode](scores, t)
    pd_rule = decision["pd_rule"]

    return {
        "input_mode": input_mode,
        "model_used": model_used,
        "model_path_used": model_path,
        "decision_mode": decision_mode,
        "scores_percent": values,
        "confidence_dict": scores,
        "top_class": top_class,
        "top_score": top_score,
        "final_result": decision["final_result"],
        "final_score": float(decision["final_score"]),
        "non_identified_percent": float(decision["non_identified_percent"]),
        "status": decision["status"],
        "high_conf_count": int(decision["high_conf_count"]),
        "ai_decision_rule": decision["decision_rule"],
        "ai_threshold_percent": decision["threshold"],
        "pd_rule_class": pd_rule["pd_rule_class"],
        "pd_selection_rule": pd_rule["pd_selection_rule"],
        "suggested_pd_source": pd_rule["pd_source_type"],
        "is_strong_pd_rule": pd_rule["is_strong_rule"],
        "requires_manual_confirmation": pd_rule["requires_manual_confirmation"],
        "pd_rule_no": pd_rule.get("rule_no", 5),
    }


def apply_internal_sanity_override(
    ai: dict[str, Any], sanity: dict[str, Any] | None
) -> dict[str, Any]:
    """Internal safety rule from PRPD_2_Only.md Part 5.

    Runs only when the top class is Internal and its score sits in the
    85-95% band. A failed quadrant check forces Non-identified at 100%.
    Scores above 95% are trusted and only carry a TF recommendation.
    """
    if sanity is None or not sanity.get("ran"):
        return ai

    if ai["top_class"] != "Internal":
        return ai

    if sanity.get("internal_ok"):
        return ai

    overridden = dict(ai)
    overridden["final_result"] = "Non-identified"
    overridden["final_score"] = 100.0
    overridden["status"] = "rule_rejected_internal"
    overridden["non_identified_percent"] = 100.0
    overridden["ai_decision_rule"] = (
        "internal_sanity_check_failed (quadrant ratio < 0.15) "
        "-> overridden to Non-identified"
    )
    overridden["pd_rule_class"] = _NON_IDENTIFIED_PD_RULE["pd_rule_class"]
    overridden["pd_selection_rule"] = "internal_sanity_check_failed_manual_confirmation_required"
    overridden["suggested_pd_source"] = _NON_IDENTIFIED_PD_RULE["pd_source_type"]
    overridden["is_strong_pd_rule"] = False
    overridden["requires_manual_confirmation"] = True
    return overridden


def should_run_internal_sanity_check(
    scores_percent: list[float], thresholds: Thresholds | None = None
) -> bool:
    """True when top class is Internal with confidence inside the sanity band."""
    t = _t(thresholds)
    scores = {CLASS_NAMES[i]: float(scores_percent[i]) for i in range(3)}
    top_class = max(scores, key=lambda k: scores[k])
    top_score = scores[top_class]
    return (
        top_class == "Internal"
        and t.confidence_threshold <= top_score < t.internal_high_confidence
    )


# =========================================================================
# GAP-TIME / SEVERITY
# =========================================================================
def pixel_to_phase_deg(x_pixel: float, x_left: float, x_right: float) -> float:
    return (x_pixel - x_left) / (x_right - x_left) * 360.0


def phase_deg_to_pixel(phase_deg: float, x_left: float, x_right: float) -> float:
    return x_left + (phase_deg / 360.0) * (x_right - x_left)


def gap_angle_to_ms(gap_angle_deg: float, thresholds: Thresholds | None = None) -> float:
    return gap_angle_deg * _t(thresholds).cycle_time_ms / 360.0


def gap_time_band(gap_time_ms: float | None, thresholds: Thresholds | None = None) -> str:
    t = _t(thresholds)
    if gap_time_ms is None or (isinstance(gap_time_ms, float) and math.isnan(gap_time_ms)):
        return "Not measurable"
    if gap_time_ms > t.gap_time_moderate_ms:
        return f"> {t.gap_time_moderate_ms:g} ms"
    if t.gap_time_high_ms <= gap_time_ms <= t.gap_time_moderate_ms:
        return f"{t.gap_time_high_ms:g}-{t.gap_time_moderate_ms:g} ms"
    return f"< {t.gap_time_high_ms:g} ms"


SEVERITY_GROUP_1 = ["Floating / Corona / Bad contact", "Outside surface discharge"]
SEVERITY_GROUP_2 = ["Terminations / Joint", "Internal"]


def severity_from_gap_time_and_source(
    gap_time_ms: float | None,
    pd_source_type: str | None,
    thresholds: Thresholds | None = None,
) -> str:
    t = _t(thresholds)
    if gap_time_ms is None or (isinstance(gap_time_ms, float) and math.isnan(gap_time_ms)):
        return "Not measurable"

    if pd_source_type in SEVERITY_GROUP_1:
        if gap_time_ms > t.gap_time_moderate_ms:
            return "Initial"
        if t.gap_time_high_ms <= gap_time_ms <= t.gap_time_moderate_ms:
            return "Moderate"
        return "High"

    if pd_source_type in SEVERITY_GROUP_2:
        if gap_time_ms > t.gap_time_moderate_ms:
            return "Moderate"
        return "High"

    return "Unknown"


def severity_group_label(pd_source_type: str | None) -> str:
    if pd_source_type in SEVERITY_GROUP_1:
        return "Group 1: Corona / Surface"
    if pd_source_type in SEVERITY_GROUP_2:
        return "Group 2: Joint / Internal"
    return "Unknown group"


def compute_gap_metrics(
    left_x: float | None,
    right_x: float | None,
    x_left: float,
    x_right: float,
    pd_source_type: str | None,
    not_measurable: bool = False,
    thresholds: Thresholds | None = None,
) -> dict[str, Any]:
    """Port of `compute_current_result` (CMD FINAL CODE), minus widget access."""
    if not_measurable or left_x is None or right_x is None:
        return {
            "left_phase_deg": None,
            "right_phase_deg": None,
            "gap_angle_deg": None,
            "gap_time_ms": None,
            "gap_time_band": "Not measurable",
            "severity": "Not measurable",
        }

    left_phase = pixel_to_phase_deg(min(left_x, right_x), x_left, x_right)
    right_phase = pixel_to_phase_deg(max(left_x, right_x), x_left, x_right)
    gap_angle = right_phase - left_phase

    if gap_angle <= 0:
        return {
            "left_phase_deg": round(left_phase, 4),
            "right_phase_deg": round(right_phase, 4),
            "gap_angle_deg": round(gap_angle, 4),
            "gap_time_ms": None,
            "gap_time_band": "Invalid",
            "severity": "Invalid lines",
        }

    gap_ms = gap_angle_to_ms(gap_angle, thresholds)
    band = gap_time_band(gap_ms, thresholds)
    return {
        "left_phase_deg": round(left_phase, 4),
        "right_phase_deg": round(right_phase, 4),
        "gap_angle_deg": round(gap_angle, 4),
        "gap_time_ms": round(gap_ms, 4),
        "gap_time_band": band,
        "severity": severity_from_gap_time_and_source(gap_ms, pd_source_type, thresholds),
    }


def validate_gap_time_result(
    result: dict[str, Any],
    x_left: float,
    x_right: float,
    y_top: float,
    y_bottom: float,
    left_x: float | None,
    right_x: float | None,
    not_measurable_recommended: bool = False,
    thresholds: Thresholds | None = None,
) -> tuple[bool, str]:
    """Port of `validate_gap_time_result` (CMD FINAL CODE)."""
    t = _t(thresholds)
    if not result:
        return False, "Invalid calibration or missing result."

    if not_measurable_recommended:
        return (
            False,
            "Gap-time is not measurable because only one discharge cluster was "
            "detected. Please use the Not Measurable button.",
        )

    messages: list[str] = []

    if x_right <= x_left:
        messages.append("x_right_360deg must be greater than x_left_0deg.")
    if y_bottom <= y_top:
        messages.append("y_bottom must be greater than y_top.")

    if left_x is None or right_x is None:
        messages.append("Gap lines have not been placed yet.")
    else:
        if left_x >= right_x:
            messages.append("left_line must be less than right_line.")
        if not (x_left <= left_x <= x_right):
            messages.append("left_line is outside plot frame.")
        if not (x_left <= right_x <= x_right):
            messages.append("right_line is outside plot frame.")

    gap_angle = result.get("gap_angle_deg")
    if gap_angle is None or gap_angle <= 0:
        messages.append("gap_angle must be positive.")

    gap_ms = result.get("gap_time_ms")
    if gap_ms is None or gap_ms <= 0 or gap_ms > t.cycle_time_ms:
        messages.append(f"gap_time_ms must be within 0-{t.cycle_time_ms:.0f} ms.")

    if messages:
        return False, " | ".join(messages)

    return True, "OK"
