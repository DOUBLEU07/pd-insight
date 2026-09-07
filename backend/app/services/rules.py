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
# CLASS SCHEME
# =========================================================================
# The rules above were written against exactly three classes. An account that
# trains its own model may name a different set (add "Void", drop "Internal"),
# and the cascade still has to turn whatever wins into a PD source and a
# severity. A scheme carries that mapping, and `DEFAULT_SCHEME` reproduces
# CMD FINAL V2 exactly, so anything scored without one is unaffected.
DEFAULT_PD_SOURCES: dict[str, str] = {
    "Corona": "Floating / Corona / Bad contact",
    "Surface": "Outside surface discharge",
    "Internal": "Internal",
}

# Severity is keyed by PD source, not by class, because the reviewer may
# confirm a different source than the model suggested and the bands have to
# follow their answer.
#   1 = gap-time splits Initial / Moderate / High
#   2 = gap-time splits Moderate / High only
DEFAULT_SEVERITY_GROUPS: dict[str, int] = {
    "Floating / Corona / Bad contact": 1,
    "Outside surface discharge": 1,
    "Terminations / Joint": 2,
    "Internal": 2,
}

# The published wording for the two severity groups. A custom scheme derives
# its own labels from its class names.
DEFAULT_GROUP_LABELS: dict[int, str] = {
    1: "Group 1: Corona / Surface",
    2: "Group 2: Joint / Internal",
}

UNKNOWN_PD_SOURCE = "Manual confirmation required"
JOINT_PD_SOURCE = "Terminations / Joint"

# The pair rule and the quadrant sanity check name specific classes. They stay
# switched on for any scheme that still contains those classes, and switch
# themselves off for one that does not, rather than misfiring on a class that
# happens to sit in the same position.
DUAL_RULE_PAIR = ("Surface", "Internal")
SANITY_CHECK_CLASS = "Internal"


@dataclass
class ClassScheme:
    """What a model's output classes mean to the rule engine."""

    class_names: list[str]
    # class -> PD source label shown to the reviewer.
    pd_sources: dict[str, str]
    # PD source label -> severity group (1 or 2).
    severity_groups: dict[str, int]
    # severity group -> the wording shown on the dashboard.
    group_labels: dict[int, str]

    @classmethod
    def default(cls) -> ClassScheme:
        return cls(
            class_names=list(CLASS_NAMES),
            pd_sources=dict(DEFAULT_PD_SOURCES),
            severity_groups=dict(DEFAULT_SEVERITY_GROUPS),
            group_labels=dict(DEFAULT_GROUP_LABELS),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "class_names": list(self.class_names),
            "pd_sources": dict(self.pd_sources),
            "severity_groups": dict(self.severity_groups),
            "group_labels": {str(k): v for k, v in self.group_labels.items()},
        }

    @classmethod
    def from_dict(cls, raw: dict[str, Any] | None) -> ClassScheme:
        """Rebuild a scheme, falling back to the published one when absent."""
        if not raw or not raw.get("class_names"):
            return cls.default()
        names = [str(n) for n in raw["class_names"]]
        sources = {str(k): str(v) for k, v in (raw.get("pd_sources") or {}).items()}
        groups = {str(k): int(v) for k, v in (raw.get("severity_groups") or {}).items()}
        # A class with no mapping still has to produce something coherent.
        for name in names:
            sources.setdefault(name, DEFAULT_PD_SOURCES.get(name, UNKNOWN_PD_SOURCE))
        for source in sources.values():
            groups.setdefault(source, DEFAULT_SEVERITY_GROUPS.get(source, 1))
        groups.setdefault(JOINT_PD_SOURCE, DEFAULT_SEVERITY_GROUPS[JOINT_PD_SOURCE])

        labels = {int(k): str(v) for k, v in (raw.get("group_labels") or {}).items()}
        if not labels:
            labels = _derive_group_labels(names, sources, groups)

        return cls(
            class_names=names,
            pd_sources=sources,
            severity_groups=groups,
            group_labels=labels,
        )

    def source_for(self, class_name: str) -> str:
        return self.pd_sources.get(class_name, UNKNOWN_PD_SOURCE)

    @property
    def dual_pair(self) -> tuple[str, str] | None:
        """The two classes whose joint high confidence means Terminations / Joint."""
        first, second = DUAL_RULE_PAIR
        if first in self.class_names and second in self.class_names:
            return first, second
        return None

    @property
    def sanity_class(self) -> str | None:
        """The class the PRPD quadrant sanity check applies to, if present."""
        return SANITY_CHECK_CLASS if SANITY_CHECK_CLASS in self.class_names else None


def _derive_group_labels(
    class_names: list[str], sources: dict[str, str], groups: dict[str, int]
) -> dict[int, str]:
    """Name each severity group after the classes that land in it."""
    labels: dict[int, str] = {}
    for group in sorted({g for g in groups.values()}):
        members = [name for name in class_names if groups.get(sources.get(name, "")) == group]
        if group == 2 and groups.get(JOINT_PD_SOURCE) == 2:
            members = ["Joint", *members]
        labels[group] = f"Group {group}: {' / '.join(members)}" if members else f"Group {group}"
    return labels


DEFAULT_SCHEME = ClassScheme.default()


def _s(scheme: ClassScheme | None) -> ClassScheme:
    return scheme or DEFAULT_SCHEME


# =========================================================================
# PD SOURCE
# =========================================================================
def map_class_to_pd_source(class_name: str, scheme: ClassScheme | None = None) -> str:
    return _s(scheme).source_for(class_name)


def select_pd_source_by_confidence(
    scores: dict[str, float],
    thresholds: Thresholds | None = None,
    scheme: ClassScheme | None = None,
) -> dict[str, Any]:
    """Priority cascade (CMD FINAL CODE), generalised over a scheme's classes.

    With the published three classes this is the original five rules in the
    original order: the Surface+Internal pair rule, then Corona, Surface and
    Internal each against the strong threshold, then the top-class fallback.
    A scheme with different classes keeps the same shape — pair rule first if
    it still applies, then every class in the scheme's own order.
    """
    t = _t(thresholds)
    sch = _s(scheme)
    dual = t.joint_dual_threshold
    strong = t.strong_rule_threshold

    values = {name: float(scores.get(name, 0.0)) for name in sch.class_names}

    pair = sch.dual_pair
    if pair and values[pair[0]] > dual and values[pair[1]] > dual:
        return {
            "pd_rule_class": "Joint",
            "pd_source_type": JOINT_PD_SOURCE,
            "pd_selection_rule": (
                f"{pair[0].lower()}_gt_{dual:g}_and_{pair[1].lower()}_gt_{dual:g}"
            ),
            "is_strong_rule": True,
            "requires_manual_confirmation": False,
            "rule_no": 1,
        }

    for index, name in enumerate(sch.class_names):
        if values[name] > strong:
            return {
                "pd_rule_class": name,
                "pd_source_type": sch.source_for(name),
                "pd_selection_rule": f"{name.lower()}_gt_{strong:g}",
                "is_strong_rule": True,
                "requires_manual_confirmation": False,
                "rule_no": index + 2,
            }

    top_class = max(values, key=lambda k: values[k])
    top_score = values[top_class]

    return {
        "pd_rule_class": top_class,
        "pd_source_type": sch.source_for(top_class),
        "pd_selection_rule": (
            f"top_class_fallback_{top_class.lower()}_{top_score:.2f}_manual_confirm"
        ),
        "is_strong_rule": False,
        "requires_manual_confirmation": True,
        "rule_no": len(sch.class_names) + 2,
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
def _decide_topclass30(
    scores: dict[str, float], t: Thresholds, sch: ClassScheme
) -> dict[str, Any]:
    """CMD FINAL CODE `build_ai_result`, the production rule.

    Every class <= 30% => Non-identified; otherwise the top class wins.
    """
    top_class = max(scores, key=lambda k: scores[k])
    top_score = scores[top_class]

    all_low = all(v <= t.topclass_threshold for v in scores.values())

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
        "pd_rule": select_pd_source_by_confidence(scores, t, sch),
        "decision_rule": f"top_class_gt_{t.topclass_threshold:g}_else_non_identified",
        "threshold": t.topclass_threshold,
    }


def _decide_strict85(
    scores: dict[str, float], t: Thresholds, sch: ClassScheme
) -> dict[str, Any]:
    """Prototype Mode A / PRPD_2_Only Part 5.

    Exactly one class must reach 85%. Zero or two-plus => Non-identified, and
    the Non-identified percentage is the shortfall against the threshold rather
    than `100 - top`.
    """
    top_class = max(scores, key=lambda k: scores[k])
    top_score = scores[top_class]
    high_conf = [c for c, v in scores.items() if v >= t.confidence_threshold]

    if len(high_conf) == 1:
        return {
            "final_result": high_conf[0],
            "final_score": scores[high_conf[0]],
            "status": "identified",
            "non_identified_percent": 0.0,
            "high_conf_count": 1,
            "pd_rule": select_pd_source_by_confidence(scores, t, sch),
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


def _decide_loose30(
    scores: dict[str, float], t: Thresholds, sch: ClassScheme
) -> dict[str, Any]:
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

    return {
        "final_result": top_class,
        "final_score": top_score,
        "status": "identified_loose",
        "non_identified_percent": 0.0,
        "high_conf_count": sum(1 for v in scores.values() if v > t.topclass_threshold),
        "pd_rule": select_pd_source_by_confidence(scores, t, sch),
        "decision_rule": f"top_class_gt_{t.topclass_threshold:.0f}_threshold_85_not_enforced",
        "threshold": t.topclass_threshold,
    }


def _decide_smart_hybrid(
    scores: dict[str, float], t: Thresholds, sch: ClassScheme
) -> dict[str, Any]:
    """Prototype Mode C / PRPD_3_Hybrid Part 6 SMART FINAL RESULT.

    0 classes over 85% => Inconclusive, 1 => that class, 2+ => Mixed PD Suspected.
    """
    over = [c for c, v in scores.items() if v > t.confidence_threshold]

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
            "pd_rule": select_pd_source_by_confidence(scores, t, sch),
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
    scheme: ClassScheme | None = None,
) -> dict[str, Any]:
    """Assemble the full AI result block for one case.

    `scores_percent` is ordered as the scheme's `class_names`, which defaults
    to CLASS_NAMES = [Corona, Surface, Internal], already scaled to percent.
    """
    if decision_mode not in _DECIDERS:
        raise ValueError(f"unknown decision_mode: {decision_mode}")

    t = _t(thresholds)
    sch = _s(scheme)

    values = [float(v) for v in scores_percent]
    if len(values) != len(sch.class_names):
        raise ValueError(
            f"got {len(values)} scores for {len(sch.class_names)} classes "
            f"({', '.join(sch.class_names)})"
        )
    scores = {name: values[i] for i, name in enumerate(sch.class_names)}

    top_class = max(scores, key=lambda k: scores[k])
    top_score = scores[top_class]

    decision = _DECIDERS[decision_mode](scores, t, sch)
    pd_rule = decision["pd_rule"]

    return {
        "class_names": list(sch.class_names),
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
    ai: dict[str, Any],
    sanity: dict[str, Any] | None,
    scheme: ClassScheme | None = None,
) -> dict[str, Any]:
    """Internal safety rule from PRPD_2_Only.md Part 5.

    Runs only when the top class is Internal and its score sits in the
    85-95% band. A failed quadrant check forces Non-identified at 100%.
    Scores above 95% are trusted and only carry a TF recommendation.

    A scheme without an Internal class never reaches the override, because
    the quadrant ratios were derived for internal discharge specifically.
    """
    if sanity is None or not sanity.get("ran"):
        return ai

    sanity_class = _s(scheme).sanity_class
    if sanity_class is None or ai["top_class"] != sanity_class:
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
    scores_percent: list[float],
    thresholds: Thresholds | None = None,
    scheme: ClassScheme | None = None,
) -> bool:
    """True when top class is Internal with confidence inside the sanity band."""
    t = _t(thresholds)
    sch = _s(scheme)
    sanity_class = sch.sanity_class
    if sanity_class is None:
        return False

    scores = {name: float(scores_percent[i]) for i, name in enumerate(sch.class_names)}
    top_class = max(scores, key=lambda k: scores[k])
    top_score = scores[top_class]
    return (
        top_class == sanity_class
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


# Kept as the published lists so existing imports and the CSV exports read the
# same. A custom scheme carries its own mapping in `severity_groups`.
SEVERITY_GROUP_1 = [
    source for source, group in DEFAULT_SEVERITY_GROUPS.items() if group == 1
]
SEVERITY_GROUP_2 = [
    source for source, group in DEFAULT_SEVERITY_GROUPS.items() if group == 2
]


def severity_from_gap_time_and_source(
    gap_time_ms: float | None,
    pd_source_type: str | None,
    thresholds: Thresholds | None = None,
    scheme: ClassScheme | None = None,
) -> str:
    t = _t(thresholds)
    if gap_time_ms is None or (isinstance(gap_time_ms, float) and math.isnan(gap_time_ms)):
        return "Not measurable"

    group = _s(scheme).severity_groups.get(pd_source_type or "")

    if group == 1:
        if gap_time_ms > t.gap_time_moderate_ms:
            return "Initial"
        if t.gap_time_high_ms <= gap_time_ms <= t.gap_time_moderate_ms:
            return "Moderate"
        return "High"

    if group == 2:
        if gap_time_ms > t.gap_time_moderate_ms:
            return "Moderate"
        return "High"

    return "Unknown"


def severity_group_label(
    pd_source_type: str | None, scheme: ClassScheme | None = None
) -> str:
    sch = _s(scheme)
    group = sch.severity_groups.get(pd_source_type or "")
    if group is None:
        return "Unknown group"
    return sch.group_labels.get(group, f"Group {group}")


def compute_gap_metrics(
    left_x: float | None,
    right_x: float | None,
    x_left: float,
    x_right: float,
    pd_source_type: str | None,
    not_measurable: bool = False,
    thresholds: Thresholds | None = None,
    scheme: ClassScheme | None = None,
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
        "severity": severity_from_gap_time_and_source(
            gap_ms, pd_source_type, thresholds, scheme
        ),
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
