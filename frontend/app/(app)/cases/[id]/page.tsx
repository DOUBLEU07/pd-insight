'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { PrpdCanvas, NudgeRow, type Frame, type Handle } from '@/components/case/PrpdCanvas';
import { SummaryChart, downloadSummaryImage } from '@/components/case/SummaryChart';
import {
  CheckIcon,
  DownloadIcon,
  GearDetectIcon,
  RefreshIcon,
  SaveIcon,
  SparkleIcon,
  XIcon,
} from '@/components/ui/icons';
import {
  KV,
  Readout,
  Spinner,
  fmt,
  fmtDate,
  resultPillClass,
  severityPillClass,
} from '@/components/ui/primitives';
import { api, fileUrl } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import type { CalibrationPreset, PdCase, ReviewStatus } from '@/lib/types';

const STEPS = [
  { key: 'classification', label: 'Classification' },
  { key: 'calibration', label: 'Calibration' },
  { key: 'gap', label: 'Gap-Time' },
  { key: 'summary', label: 'Summary' },
  { key: 'signoff', label: 'Sign-off' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

/**
 * Why a case ended up with its result, in plain language. The raw rule id the
 * backend recorded is kept as a tooltip on the row, so the reading stays human
 * without losing the traceable value.
 */
const AI_STATUS_LABELS: Record<string, string> = {
  identified_by_top_class_gt_30: 'The highest-scoring class passed the 30% threshold.',
  non_identified_all_classes_le_30:
    'No class reached 30%, so the case is reported as Non-identified.',
  rule_rejected_internal:
    'Internal scored high but failed the quadrant sanity check, so the result was overridden to Non-identified.',
  identified: 'One class passed the confidence threshold.',
  low_confidence_or_mixed: 'No single class stood out clearly enough to be identified.',
  identified_loose: 'The highest-scoring class passed the threshold.',
  below_threshold_loose: 'The highest-scoring class stayed below the threshold.',
  hybrid_inconclusive: 'No class reached 85%, so the result is inconclusive.',
  hybrid_identified: 'Exactly one class passed 85%.',
  hybrid_mixed: 'More than one class passed 85%, which suggests mixed PD.',
};

/** How the case was analysed, written out rather than shown as an engine id. */
function describeModel(modelUsed: string | null, inputMode: string | null): string {
  const hybrid = (inputMode ?? '').toUpperCase().includes('HYBRID');
  const base = hybrid
    ? 'Hybrid model, using PRPD paired with TF Map'
    : 'PRPD-only model, using a single PRPD image';
  return /mock/i.test(modelUsed ?? '') ? `${base} (mock engine, not a real prediction)` : base;
}

export default function CaseWizardPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const caseId = Number(params.id);
  const { options, toast, user } = useApp();

  const [pdCase, setPdCase] = useState<PdCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<StepKey>('classification');
  const [saving, setSaving] = useState(false);
  const [matchedPreset, setMatchedPreset] = useState<CalibrationPreset | null>(null);
  /** The other cases in this case's queue, for position and next-case hand-off. */
  const [siblings, setSiblings] = useState<PdCase[]>([]);

  // Local mirrors so dragging stays smooth; committed to the API on release.
  const [frame, setFrame] = useState<Frame | null>(null);
  const [gapLines, setGapLines] = useState<{ left: number | null; right: number | null }>({
    left: null,
    right: null,
  });

  // Sign-off form
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>('user_confirmed');
  const [reviewNote, setReviewNote] = useState('');
  const [notMeasurableReason, setNotMeasurableReason] = useState('single_discharge_cluster');

  const returnTo = searchParams.get('from');
  const batchParam = searchParams.get('batch');

  // ---------------------------------------------------------------- loading
  const applyCase = useCallback((c: PdCase) => {
    setPdCase(c);
    setFrame({
      x_left: c.calibration.x_left_0deg ?? 0,
      x_right: c.calibration.x_right_360deg ?? (c.image_width ?? 400),
      y_top: c.calibration.y_top_plot ?? 0,
      y_bottom: c.calibration.y_bottom_plot ?? (c.image_height ?? 300),
    });
    setGapLines({ left: c.gap.left_line_pixel, right: c.gap.right_line_pixel });
    setReviewStatus(c.review_status);
    setReviewNote(c.review_note ?? '');
    if (c.not_measurable_reason) setNotMeasurableReason(c.not_measurable_reason);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setStep('classification');
    try {
      let c = await api.getCase(caseId);
      // Opening an un-analysed case runs the pipeline, matching the prototype's
      // behaviour when a case is opened straight from the queue.
      if (!c.analysis_run) c = await api.analyze(c.id);
      applyCase(c);
      const { preset } = await api.matchingPreset(caseId);
      setMatchedPreset(preset);
      // Siblings drive the queue position and the "next case" hand-off. A case
      // imported from a folder is scoped to its batch; a single upload falls
      // back to the whole workspace.
      setSiblings(await api.listCases(c.batch_id != null ? { batch_id: c.batch_id } : {}));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load case');
    } finally {
      setLoading(false);
    }
  }, [caseId, applyCase, toast]);

  useEffect(() => {
    if (Number.isFinite(caseId)) void load();
  }, [caseId, load]);

  // ------------------------------------------------------------------ queue
  // Position of this case in its queue, and where "next" leads. Declared
  // before the loading guard so the action handlers below can close over them.
  const queueIndex = siblings.findIndex((s) => s.id === caseId);
  const queueTotal = siblings.length;
  const queueDone = siblings.filter((s) => s.status === 'done').length;
  const prevCase = queueIndex > 0 ? siblings[queueIndex - 1] : null;
  const nextCase = queueIndex >= 0 && queueIndex < queueTotal - 1 ? siblings[queueIndex + 1] : null;

  /**
   * The next case still awaiting review, searching forward from this one and
   * wrapping around, so a reviewer working a folder never has to return to the
   * queue to find what is left.
   */
  const nextPending = useMemo(() => {
    if (queueIndex < 0) return null;
    for (let i = 1; i <= queueTotal; i += 1) {
      const candidate = siblings[(queueIndex + i) % queueTotal];
      if (candidate && candidate.id !== caseId && candidate.status !== 'done') return candidate;
    }
    return null;
  }, [siblings, queueIndex, queueTotal, caseId]);

  function goToCase(id: number) {
    const q = new URLSearchParams();
    if (returnTo) q.set('from', returnTo);
    if (batchParam) q.set('batch', batchParam);
    const qs = q.toString();
    router.push(`/cases/${id}${qs ? `?${qs}` : ''}`);
  }

  function goBack() {
    if (returnTo === 'batch' && batchParam) router.push(`/batches/${batchParam}`);
    else if (returnTo === 'queue') router.push('/cases?mode=folder');
    else router.push('/cases');
  }

  // ---------------------------------------------------------------- actions
  async function commitCalibration(next: Frame, source = 'manual_axis_adjusted') {
    if (!pdCase) return;
    try {
      const updated = await api.updateCalibration(pdCase.id, {
        x_left_0deg: next.x_left,
        x_right_360deg: next.x_right,
        y_top_plot: next.y_top,
        y_bottom_plot: next.y_bottom,
        calibration_source: source,
        calibration_mode: 'Manual calibration',
      });
      applyCase(updated);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Calibration update failed');
      void load();
    }
  }

  async function commitGap(left: number, right: number) {
    if (!pdCase) return;
    try {
      applyCase(await api.updateGap(pdCase.id, left, right));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gap update failed');
      void load();
    }
  }

  function onCalibDrag(handle: Handle, value: number) {
    setFrame((f) => (f ? { ...f, [handle]: value } : f));
  }

  function onCalibDragEnd(handle: Handle, value: number) {
    if (!frame) return;
    void commitCalibration({ ...frame, [handle]: value } as Frame);
  }

  function onGapDrag(handle: Handle, value: number) {
    setGapLines((g) => (handle === 'gapLeft' ? { ...g, left: value } : { ...g, right: value }));
  }

  function onGapDragEnd(handle: Handle, value: number) {
    const next =
      handle === 'gapLeft'
        ? { left: value, right: gapLines.right }
        : { left: gapLines.left, right: value };
    if (next.left == null || next.right == null) return;
    void commitGap(next.left, next.right);
  }

  function nudgeCalib(handle: Handle, delta: number) {
    if (!frame) return;
    const next = { ...frame, [handle]: (frame as any)[handle] + delta } as Frame;
    setFrame(next);
    void commitCalibration(next);
  }

  function nudgeGap(handle: Handle, delta: number) {
    if (gapLines.left == null || gapLines.right == null) return;
    const next =
      handle === 'gapLeft'
        ? { left: gapLines.left + delta, right: gapLines.right }
        : { left: gapLines.left, right: gapLines.right + delta };
    setGapLines(next);
    void commitGap(next.left, next.right);
  }

  async function detectGap(method: 'rule' | 'model') {
    if (!pdCase) return;
    try {
      const updated = await api.detectGap(pdCase.id, method);
      applyCase(updated);
      const d = updated.detection;
      if (d?.single_cluster) {
        toast('Only one discharge cluster found, so gap-time is not measurable');
      } else if (d) {
        toast(`Gap lines placed via ${d.source === 'ai_auto' ? 'regression model' : 'rule-based detection'}`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gap detection failed');
    }
  }

  async function changePdSource(value: string) {
    if (!pdCase) return;
    try {
      applyCase(await api.confirmPdSource(pdCase.id, value));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to update PD source');
    }
  }

  async function savePreset() {
    if (!pdCase || !frame) return;
    try {
      await api.createPreset({
        preset_name: `${pdCase.case_base_name}_preset`,
        image_width: pdCase.image_width ?? 0,
        image_height: pdCase.image_height ?? 0,
        x_left_0deg: frame.x_left,
        x_right_360deg: frame.x_right,
        y_top_plot: frame.y_top,
        y_bottom_plot: frame.y_bottom,
        example_prpd_filename: pdCase.prpd_filename,
        example_tf_filename: pdCase.tf_filename,
        remark: 'Saved from this case',
      });
      toast('Calibration preset saved');
      const { preset } = await api.matchingPreset(pdCase.id);
      setMatchedPreset(preset);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save preset');
    }
  }

  /** Saves the review. Returns true only when the save actually landed. */
  async function submitReview(statusOverride?: ReviewStatus): Promise<boolean> {
    if (!pdCase) return false;
    const status = statusOverride ?? reviewStatus;
    setSaving(true);
    try {
      const updated = await api.saveReview(pdCase.id, {
        review_status: status,
        review_note: reviewNote,
        not_measurable_reason: status === 'not_measurable' ? notMeasurableReason : '',
        confirmed_pd_source_type: pdCase.confirmed_pd_source_type ?? undefined,
      });
      applyCase(updated);
      // Keep the queue counters honest after this case flips to done.
      setSiblings((rows) => rows.map((r) => (r.id === updated.id ? updated : r)));
      toast(`Saved results for ${updated.case_base_name} (${updated.review_status})`);
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed');
      return false;
    } finally {
      setSaving(false);
    }
  }

  /** Move to the next unreviewed case, or leave the queue when none is left. */
  function advance() {
    const next = nextPending;
    if (!next) {
      toast('All cases in this queue are reviewed');
      goBack();
      return;
    }
    goToCase(next.id);
  }

  /**
   * Save, then move straight on. A case that is already signed off skips the
   * save so a second click never rewrites a stored review.
   */
  async function saveAndAdvance(statusOverride?: ReviewStatus) {
    if (pdCase?.status === 'done' && statusOverride === undefined) {
      advance();
      return;
    }
    if (await submitReview(statusOverride)) advance();
  }

  // ---------------------------------------------------------------- render
  if (loading || !pdCase || !frame) return <Spinner label="Loading case…" />;

  const c = pdCase;
  const conf = c.confidence;
  const gap = c.gap;
  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const prpdUrl = fileUrl(c.prpd_url);

  const backLabel =
    returnTo === 'queue'
      ? '← Back to case queue'
      : returnTo === 'batch'
        ? '← Back to Preview'
        : '← Back to Case Workflow';

  // The decision rule is no longer switchable per case, so this reads back the
  // stored mode purely as a record of how the result was reached.
  const decisionMode = options?.decision_modes.find((m) => m.key === c.decision_mode);
  const decisionModeLabel = decisionMode?.label ?? c.decision_mode;
  const decisionModeDescription = decisionMode?.description ?? '';

  const singleCluster = gap.auto_not_measurable_recommended === true;
  const alreadySaved = c.status === 'done';
  // The API rejects a measurable status on a single-cluster case, so offering
  // "Save and Next" there would only produce a failed save.
  const advanceBlocked = singleCluster && !alreadySaved && reviewStatus !== 'not_measurable';

  return (
    <>
      <div className="case-nav-bar">
        <div>
          Case <b>{c.case_base_name}</b>
          {c.defect_name && <span className="text-slate-500"> · {c.defect_name}</span>}
          {c.inference_engine === 'mock' && (
            <span className="pill pill-amber ml-2">mock inference</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-[14px]">
          {queueTotal > 1 && queueIndex >= 0 && (
            <div className="flex items-center gap-[10px]">
              <span className="text-[12px] text-brand-700/70">
                Case <b>{queueIndex + 1}</b> of {queueTotal} · {queueDone} done
              </span>
              <div className="queue-step-grp">
                <button
                  type="button"
                  disabled={!prevCase}
                  title={prevCase ? `Previous: ${prevCase.case_base_name}` : 'First case'}
                  onClick={() => prevCase && goToCase(prevCase.id)}
                >
                  ←
                </button>
                <button
                  type="button"
                  disabled={!nextCase}
                  title={nextCase ? `Next: ${nextCase.case_base_name}` : 'Last case'}
                  onClick={() => nextCase && goToCase(nextCase.id)}
                >
                  →
                </button>
              </div>
            </div>
          )}
          <span className="small-link" onClick={goBack}>
            {backLabel}
          </span>
        </div>
      </div>

      <div className="wizard-nav">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            className={`wizard-step-btn ${step === s.key ? 'active' : ''} ${
              i < stepIndex ? 'done' : ''
            }`}
            onClick={() => setStep(s.key)}
            type="button"
          >
            <span className="wizard-step-no">{i + 1}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* ================= STEP 1: CLASSIFICATION ================= */}
      {step === 'classification' && (
        <div className="wizard-2col">
          <div className="card mb-0">
            <h2>
              Classification Result{' '}
              <span className="text-[11px] font-medium text-slate-400">read-only</span>
            </h2>
            <div className="callout callout-red mb-[10px]">
              <b>Preliminary assessment, not a diagnosis.</b> The model recognises Corona, Surface
              and Internal only; mixed or multiple PD sources may be classified incorrectly, and a
              confidence score is not proof that the class is correct. Review against the
              measurement data before signing off.
            </div>
            <div className="locked-banner">
              This is the raw output of the model and decision rules and cannot be edited here, so
              it always remains traceable. Confirm the PD source on the right, then sign off at the
              end of this workflow.
            </div>

            {/* Input quality sits with the result it qualifies: a size mismatch
                means auto-calibration cannot be trusted, which propagates all
                the way to gap-time and severity. */}
            {c.input_quality && c.input_quality.input_warning_count > 0 && (
              <div className="locked-banner border-amber-200 bg-amber-50 text-amber-700">
                <b>
                  Input check: {c.input_quality.input_check_status} (
                  {c.input_quality.input_warning_count} warning
                  {c.input_quality.input_warning_count === 1 ? '' : 's'})
                </b>
                <ul className="mt-1 list-disc pl-4">
                  {c.input_quality.input_warnings.map((wmsg, i) => (
                    <li key={i}>{wmsg}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="row">
              <div className="col">
                {([
                  ['Corona', conf.corona, 'fill-corona'],
                  ['Surface', conf.surface, 'fill-surface'],
                  ['Internal', conf.internal, 'fill-internal'],
                ] as const).map(([label, value, fill]) => (
                  <div className="conf-row" key={label}>
                    <div className="conf-label">{label}</div>
                    <div className="conf-bar-bg">
                      <div
                        className={`conf-bar-fill ${fill}`}
                        style={{ width: `${Math.min(100, value ?? 0)}%` }}
                      />
                    </div>
                    <div className="conf-val">{fmt(value, 2, '%')}</div>
                  </div>
                ))}
                <p className="hint mt-[6px]">
                  Independent per-class scores (sigmoid), not softmax. The three values are not
                  required to sum to 100%.
                </p>
              </div>

              <div className="col">
                <KV
                  rows={[
                    [
                      'Result',
                      <span className={`pill ${resultPillClass(c.ai_final_result)}`} key="r">
                        {c.ai_final_result ?? '-'}
                      </span>,
                    ],
                    // Only worth a row when the reported result is not simply the
                    // highest score. An override is exactly what a reviewer needs
                    // to notice.
                    ...(c.ai_top_class && c.ai_top_class !== c.ai_final_result
                      ? ([
                          [
                            'Highest score was',
                            `${c.ai_top_class} (${fmt(c.ai_top_score_percent, 2, '%')})`,
                          ],
                        ] as [ReactNode, ReactNode][])
                      : []),
                    [
                      'Why this result',
                      <span key="w" title={c.ai_decision_rule ?? undefined}>
                        {AI_STATUS_LABELS[c.ai_status ?? ''] ?? c.ai_status ?? '-'}
                      </span>,
                    ],
                    ...((c.ai_non_identified_percent ?? 0) > 0
                      ? ([
                          [
                            'Non-identified score',
                            fmt(c.ai_non_identified_percent, 1, '%'),
                          ],
                        ] as [ReactNode, ReactNode][])
                      : []),
                    [
                      'Analysed with',
                      <span key="m" title={`${c.ai_model_used ?? ''} · ${c.ai_input_mode ?? ''}`}>
                        {describeModel(c.ai_model_used, c.ai_input_mode)}
                      </span>,
                    ],
                  ]}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="field-label mb-[6px]">Imported PRPD plot</label>
              {prpdUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={prpdUrl}
                  alt="PRPD plot"
                  className="max-h-[300px] rounded-lg border-[1.5px] border-slate-200 bg-white"
                />
              ) : (
                <p className="hint">No PRPD image stored for this case.</p>
              )}
            </div>
          </div>

          <div className="wizard-2col-side">
            {/* ---- PD Source ---- */}
            <div className="card mb-0">
              <h2>PD Source</h2>
              <p className="hint">
                Rule-based suggestion from the confidence scores. Confirm or override it: the
                confirmed value feeds the Gap-Time severity determination.
              </p>
              <KV
                rows={[
                  ['Rule class', c.pd_rule_class ?? '-'],
                  [
                    'Suggested PD source',
                    <b key="s">{c.suggested_pd_source_type ?? '-'}</b>,
                  ],
                  [
                    'Matched condition',
                    <span className="text-[11.5px] text-slate-500" key="m">
                      {c.pd_selection_rule ?? '-'}
                    </span>,
                  ],
                ]}
              />
              <div
                className="strong-rule-flag mt-[10px] rounded-md px-[13px] py-[9px] text-[12.5px]"
                style={{ background: c.is_strong_pd_rule ? '#ECFDF5' : '#FFFBEB' }}
              >
                <span className={`pill ${c.is_strong_pd_rule ? 'pill-green' : 'pill-amber'}`}>
                  {c.is_strong_pd_rule
                    ? 'Strong rule: suggested result can be trusted'
                    : 'Weak rule: requires human confirmation'}
                </span>
              </div>

              <div className="field mt-[10px]">
                <label className="field-label">PD source (confirmed by reviewer)</label>
                <select
                  value={c.confirmed_pd_source_type ?? ''}
                  onChange={(e) => void changePdSource(e.target.value)}
                >
                  {(options?.pd_source_options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* ---- Decision criteria ---- */}
            <div className="card mb-0">
              <h2>
                Decision Criteria{' '}
                <span className="text-[11px] font-medium text-slate-400">read-only</span>
              </h2>
              <p className="hint">
                The threshold applied to reach the Final Result above, and why. The rule is fixed
                to the published method so every case is scored identically.
              </p>

              <div className="readout-grid mt-0">
                <Readout
                  label="Threshold applied"
                  value={fmt(c.ai_threshold_percent, 0, '%')}
                  valueClass="text-[15px]"
                />
                <Readout
                  label="Classes over threshold"
                  value={c.ai_high_conf_count ?? '-'}
                  valueClass="text-[15px]"
                />
              </div>

              <label className="field-label mb-[6px] mt-[10px] block">
                Decision rule for this case
              </label>
              <div className="locked-banner mb-0">
                <b className="text-slate-900">{decisionModeLabel}</b>
                <br />
                {decisionModeDescription}
              </div>

              {/* ---- Internal sanity check ---- */}
              {c.sanity_check?.ran && (
                <div
                  className="locked-banner mt-[10px]"
                  style={{
                    background: c.sanity_check.passed ? '#ECFDF5' : '#FEF2F2',
                    borderColor: c.sanity_check.passed ? '#A7F3D0' : '#FECACA',
                    color: c.sanity_check.passed ? '#047857' : '#B91C1C',
                  }}
                >
                  Internal Sanity Check (confidence 85-95%): quadrant ratio (upper{' '}
                  {fmt((c.sanity_check.upper_ratio ?? 0) * 100, 0, '%')} / lower{' '}
                  {fmt((c.sanity_check.lower_ratio ?? 0) * 100, 0, '%')} / left{' '}
                  {fmt((c.sanity_check.left_ratio ?? 0) * 100, 0, '%')} / right{' '}
                  {fmt((c.sanity_check.right_ratio ?? 0) * 100, 0, '%')}) →{' '}
                  <b>
                    {c.sanity_check.passed
                      ? 'Passed: Internal result confirmed'
                      : 'Failed: overridden to Non-identified, needs review'}
                  </b>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ================= STEP 2: CALIBRATION ================= */}
      {step === 'calibration' && (
        <div className="card">
          <h2>Plot Calibration</h2>
          <p className="hint">
            Drag all 4 frame lines (left / right / top / bottom) to fit the PRPD plot before
            measuring gap-time. Coordinates are in the original image&apos;s pixel space.
          </p>

          {matchedPreset ? (
            <div className="locked-banner border-brand-100 bg-brand-50 text-brand-600">
              Found a calibration preset matching this image size ({c.image_width}×{c.image_height}
              ): <b>{matchedPreset.preset_name}</b> (saved {fmtDate(matchedPreset.saved_time)}).{' '}
              <span
                className="small-link"
                onClick={async () => {
                  applyCase(await api.applyPreset(c.id, matchedPreset.id));
                  toast('Preset applied');
                }}
              >
                Apply
              </span>
            </div>
          ) : (
            <div className="locked-banner border-red-200 bg-red-50 text-red-700">
              No preset found matching this image size ({c.image_width}×{c.image_height}). Using
              auto-detect or manual adjustment.
            </div>
          )}

          <div className="row">
            <div className="col min-w-[380px] flex-[2]">
              <PrpdCanvas
                imageUrl={prpdUrl}
                imageWidth={c.image_width ?? 400}
                imageHeight={c.image_height ?? 300}
                frame={frame}
                mode="calibration"
                onDrag={onCalibDrag}
                onDragEnd={onCalibDragEnd}
                displayWidth={720}
              />
              <NudgeRow
                items={[
                  { label: 'Left', handle: 'x_left' },
                  { label: 'Right', handle: 'x_right' },
                  { label: 'Top', handle: 'y_top' },
                  { label: 'Bottom', handle: 'y_bottom' },
                ]}
                onNudge={nudgeCalib}
              />
            </div>

            <div className="col">
              <div className="field">
                <label className="field-label">Calibration source</label>
                <div className="locked-banner mb-0">
                  {c.calibration.calibration_source ?? '-'}
                  <br />
                  <span className="text-[11.5px] text-slate-400">
                    auto-detect status: {c.calibration.auto_calibration_status ?? '-'}
                  </span>
                </div>
              </div>

              <div className="readout-grid">
                {(
                  [
                    ['Left (0°), px', 'x_left'],
                    ['Right (360°), px', 'x_right'],
                    ['Top, px', 'y_top'],
                    ['Bottom, px', 'y_bottom'],
                  ] as const
                ).map(([label, key]) => (
                  <div className="readout-box" key={key}>
                    <div className="lbl">{label}</div>
                    <input
                      type="number"
                      value={frame[key]}
                      className="w-full border-transparent bg-transparent px-[6px] py-[3px] text-[14px] font-bold"
                      onChange={(e) =>
                        setFrame((f) => (f ? { ...f, [key]: Number(e.target.value) } : f))
                      }
                      onBlur={() => void commitCalibration(frame)}
                    />
                  </div>
                ))}
                <Readout
                  label="Plot width"
                  value={`${frame.x_right - frame.x_left} px`}
                  valueClass="text-[14px]"
                />
                <Readout
                  label="Plot height"
                  value={`${frame.y_bottom - frame.y_top} px`}
                  valueClass="text-[14px]"
                />
              </div>

              <div className="mt-[10px] flex flex-wrap gap-2">
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={async () => {
                    applyCase(await api.autoDetectCalibration(c.id));
                    toast('Re-ran auto-detect calibration');
                  }}
                >
                  <RefreshIcon className="btn-icon" />
                  Re-run auto-detect
                </button>
                <button className="btn btn-outline" type="button" onClick={() => void savePreset()}>
                  <SaveIcon className="btn-icon" />
                  Save Preset
                </button>
                <button
                  className="btn btn-outline"
                  type="button"
                  title="Reset the frame to the default. Does not touch any saved preset."
                  onClick={async () => {
                    applyCase(await api.resetCalibration(c.id));
                    toast('Calibration reset to default frame');
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= STEP 3: GAP-TIME ================= */}
      {step === 'gap' && (
        <div className="card">
          <h2>Gap-Time Detection</h2>
          <p className="hint">
            Drag the gap lines (yellow = left, green = right) to the edges of the signal clusters.
            Gap-time, band and severity update as the lines move. The regression model only
            suggests starting positions. The saved value always comes from the confirmed lines.
          </p>

          <div className="row">
            <div className="col min-w-[380px] flex-[2]">
              <div className="mb-2 flex flex-wrap gap-2">
                <button
                  className="btn btn-blue"
                  type="button"
                  onClick={() => void detectGap('rule')}
                >
                  <GearDetectIcon className="btn-icon" />
                  Auto-detect (rule-based)
                </button>
                <button
                  className="btn btn-outline"
                  type="button"
                  disabled={!gap.auto_gap_model_available}
                  title={
                    gap.auto_gap_model_available
                      ? `Model: ${gap.auto_gap_model_version}`
                      : 'Auto Gap-time model not loaded'
                  }
                  onClick={() => void detectGap('model')}
                >
                  <SparkleIcon className="btn-icon" />
                  Auto-Suggest (Regression)
                </button>
              </div>

              <PrpdCanvas
                imageUrl={prpdUrl}
                imageWidth={c.image_width ?? 400}
                imageHeight={c.image_height ?? 300}
                frame={frame}
                mode="gap"
                gapLeft={gapLines.left}
                gapRight={gapLines.right}
                onDrag={onGapDrag}
                onDragEnd={onGapDragEnd}
                displayWidth={720}
              />
              <NudgeRow
                items={[
                  { label: 'Left', handle: 'gapLeft' },
                  { label: 'Right', handle: 'gapRight' },
                ]}
                onNudge={nudgeGap}
                disabled={gapLines.left == null}
              />

              <div className="mt-2">
                {singleCluster ? (
                  <>
                    <span className="pill pill-red">Single discharge cluster</span>{' '}
                    <span className="hint">
                      Only one discharge cluster was detected ({gap.cluster_detection_status}).
                      Gap-time is not measurable. Use the Not Measurable button on the Sign-off
                      step.
                    </span>
                  </>
                ) : gapLines.left != null ? (
                  <>
                    <span className="pill pill-green">
                      {gap.gap_line_source === 'ai_auto'
                        ? 'Detected (regression model)'
                        : gap.gap_line_source === 'manual'
                          ? 'Manual'
                          : 'Detected (rule-based)'}
                    </span>{' '}
                    <span className="hint">
                      {gap.detected_case ? `Cluster order: ${gap.detected_case}. ` : ''}
                      {gap.manual_adjustment_detected
                        ? 'Manually adjusted from the auto suggestion.'
                        : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="pill pill-gray">Not detected</span>{' '}
                    <span className="hint">
                      Click Auto-detect or Auto-Suggest, or drag the lines by hand.
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="col">
              <div className="readout-grid">
                <Readout label="Gap angle" value={fmt(gap.gap_angle_deg, 4, '°')} />
                <Readout label="Gap time" value={fmt(gap.gap_time_ms, 4, ' ms')} />
                <Readout
                  label="Band"
                  value={gap.gap_time_band ?? '-'}
                  valueClass="text-[12.5px]"
                />
                <Readout
                  label="Severity"
                  value={
                    <span className={`pill ${severityPillClass(c.severity_by_gap_time)}`}>
                      {c.severity_by_gap_time ?? '-'}
                    </span>
                  }
                />
                <Readout
                  label="Left / Right px"
                  value={`${fmt(gap.left_line_pixel, 0)} / ${fmt(gap.right_line_pixel, 0)}`}
                  valueClass="text-[13px]"
                />
                <Readout
                  label="Left / Right °"
                  value={`${fmt(gap.left_phase_deg, 1)} / ${fmt(gap.right_phase_deg, 1)}`}
                  valueClass="text-[13px]"
                />
              </div>

              <div className="mt-4 border-t border-slate-100 pt-[14px]">
                <label className="field-label mb-2">Severity combination</label>
                <SeverityMatrix pdCase={c} />
                <div className="callout callout-amber mt-[12px]">
                  <b>Initial / Moderate / High are this framework&apos;s criteria, not an
                  international standard.</b>{' '}
                  A gap time under 4 ms does not by itself prove a defect is severe, and one over
                  7 ms does not prove it is safe. If the two clusters are not clearly separated,
                  record the case as Not Measurable instead of accepting the computed band.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= STEP 4: SUMMARY ================= */}
      {step === 'summary' && (
        <div className="card">
          <h2>Case Summary</h2>
          <p className="hint">
            A single combined chart summarising this case, with a full data table covering every
            step.
          </p>
          <div className="row">
            <div className="col flex-none">
              <SummaryChart pdCase={c} imageUrl={prpdUrl} />
              <div className="mt-[10px] flex gap-2">
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => downloadSummaryImage(c.case_base_name)}
                >
                  <DownloadIcon className="btn-icon" />
                  Download summary image (.png)
                </button>
                {c.annotated_image_url && (
                  <a
                    className="btn btn-outline"
                    href={fileUrl(c.annotated_image_url) ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <DownloadIcon className="btn-icon" />
                    Annotated gap-time image
                  </a>
                )}
              </div>
            </div>

            <div className="col">
              <div className="readout-grid">
                <Readout
                  label="Final Result"
                  value={c.ai_final_result ?? '-'}
                  valueClass="text-[15px]"
                />
                <Readout
                  label="Confirmed PD Source"
                  value={c.confirmed_pd_source_type ?? '-'}
                  valueClass="text-[13px]"
                />
                <Readout
                  label="Gap time / band"
                  value={`${fmt(gap.gap_time_ms, 4)} ms (${gap.gap_time_band ?? '-'})`}
                  valueClass="text-[13px]"
                />
                <Readout label="Severity" value={c.severity_by_gap_time ?? '-'} />
                <Readout
                  label="Review status"
                  value={c.review_status}
                  valueClass="text-[13px]"
                />
                <Readout
                  label="Reviewer"
                  value={c.reviewer_name ?? '-'}
                  valueClass="text-[13px]"
                />
              </div>

              <div className="scroll-table-wrap mt-[14px]">
                <FullSummaryTable pdCase={c} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= STEP 5: SIGN-OFF ================= */}
      {step === 'signoff' && (
        <div className="card">
          <h2>Reviewer &amp; Sign-off</h2>
          <p className="hint">
            Signed in as the reviewer of record below. Complete the review status and save once
            Classification, PD Source, Calibration, Gap-Time and Summary have been checked.
          </p>

          <div className="row">
            <div className="col">
              <div className="field">
                <label className="field-label">Reviewer</label>
                <div className="locked-banner mb-0">
                  <b>{user?.username}</b>{' '}
                  <span className="capitalize text-slate-500">({user?.role})</span>
                </div>
              </div>

              <div className="field">
                <label className="field-label">Review status</label>
                <select
                  value={reviewStatus}
                  onChange={(e) => setReviewStatus(e.target.value as ReviewStatus)}
                >
                  <option value="user_confirmed">Confirmed as-is</option>
                  <option value="expert_corrected">Corrected by expert</option>
                  <option value="not_measurable">Not measurable</option>
                </select>
              </div>

              {reviewStatus === 'not_measurable' && (
                <div className="field">
                  <label className="field-label">Reason not measurable</label>
                  <select
                    value={notMeasurableReason}
                    onChange={(e) => setNotMeasurableReason(e.target.value)}
                  >
                    {(options?.not_measurable_reasons ?? []).map((r) => (
                      <option key={r} value={r}>
                        {r.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="col">
              <div className="field">
                <label className="field-label">Review note</label>
                <textarea
                  value={reviewNote}
                  placeholder="Additional notes (optional)"
                  className="min-h-[110px]"
                  onChange={(e) => setReviewNote(e.target.value)}
                />
              </div>
            </div>
          </div>

          {singleCluster && reviewStatus !== 'not_measurable' && (
            <div className="locked-banner border-amber-200 bg-amber-50 text-amber-700">
              The detector found only one discharge cluster, so gap-time cannot be measured.
              Saving with a measurable status will be rejected. Use <b>Not Measurable</b>.
            </div>
          )}

          <div className="flex flex-wrap gap-[10px]">
            <button
              className="btn btn-green"
              type="button"
              disabled={saving}
              onClick={() => void submitReview()}
            >
              <CheckIcon className="btn-icon" />
              Accept and Save
            </button>
            <button
              className="btn btn-red"
              type="button"
              disabled={saving}
              onClick={() => {
                setReviewStatus('not_measurable');
                void submitReview('not_measurable');
              }}
            >
              <XIcon className="btn-icon" />
              Not Measurable
            </button>

            {queueTotal > 1 && (
              <button
                className="btn btn-blue ml-auto"
                type="button"
                disabled={saving || advanceBlocked}
                title={
                  advanceBlocked
                    ? 'Gap-time is not measurable for this case. Use Not Measurable first'
                    : nextPending
                      ? `${alreadySaved ? 'Open' : 'Save, then open'} ${nextPending.case_base_name}`
                      : 'Finish here and return to the queue'
                }
                onClick={() => void saveAndAdvance()}
              >
                {alreadySaved ? '' : 'Save and '}
                {nextPending ? 'Next Case →' : 'Finish Queue →'}
              </button>
            )}
          </div>

          {queueTotal > 1 && (
            <p className="hint mb-0 mt-[10px]">
              {advanceBlocked ? (
                <>
                  Mark this case <b>Not Measurable</b> to sign it off, then continue to the next
                  one.
                </>
              ) : nextPending ? (
                <>
                  {queueTotal - queueDone} case{queueTotal - queueDone === 1 ? '' : 's'} left to
                  review in this queue · next up <b>{nextPending.case_base_name}</b>
                </>
              ) : (
                <>Every other case in this queue is reviewed.</>
              )}
            </p>
          )}
        </div>
      )}

      <div className="wizard-footer">
        <button
          className="btn btn-outline"
          type="button"
          style={{ visibility: stepIndex === 0 ? 'hidden' : 'visible' }}
          onClick={() => setStep(STEPS[stepIndex - 1].key)}
        >
          ← Back
        </button>
        <button
          className="btn btn-blue"
          type="button"
          style={{ visibility: stepIndex === STEPS.length - 1 ? 'hidden' : 'visible' }}
          onClick={() => setStep(STEPS[stepIndex + 1].key)}
        >
          Next →
        </button>
      </div>
    </>
  );
}

/** Full PD-source-group × gap-time-band matrix, so severity is explainable. */
function SeverityMatrix({ pdCase }: { pdCase: PdCase }) {
  const { options } = useApp();
  const group1 = ['Floating / Corona / Bad contact', 'Outside surface discharge'];
  const group2 = ['Terminations / Joint', 'Internal'];
  const source = pdCase.confirmed_pd_source_type ?? '';

  // Bands follow the account's own thresholds, so the table always explains
  // the severity this case was actually given.
  const high = options?.constants.gap_time_high_ms ?? 4;
  const mod = options?.constants.gap_time_moderate_ms ?? 7;
  const cycle = options?.constants.cycle_time_ms ?? 20;
  const deg = (ms: number) => Math.round((ms * 360) / cycle);

  const rows: [string, string, string][] = group1.includes(source)
    ? [
        [`> ${mod} ms`, `> ${deg(mod)}°`, 'Initial'],
        [`${high}-${mod} ms`, `${deg(high)}° - ${deg(mod)}°`, 'Moderate'],
        [`< ${high} ms`, `< ${deg(high)}°`, 'High'],
      ]
    : group2.includes(source)
      ? [
          [`> ${mod} ms`, `> ${deg(mod)}°`, 'Moderate'],
          [`${high}-${mod} ms`, `${deg(high)}° - ${deg(mod)}°`, 'High'],
          [`< ${high} ms`, `< ${deg(high)}°`, 'High'],
        ]
      : [];

  return (
    <>
      <div className="readout-grid mt-0">
        <Readout
          label="PD source group"
          value={pdCase.severity_group}
          valueClass="text-[13px]"
        />
        <Readout label="Measured gap time" value={fmt(pdCase.gap.gap_time_ms, 4, ' ms')} />
        <Readout label="Measured gap angle" value={fmt(pdCase.gap.gap_angle_deg, 4, '°')} />
        <Readout
          label="Resulting severity"
          value={
            <span className={`pill ${severityPillClass(pdCase.severity_by_gap_time)}`}>
              {pdCase.severity_by_gap_time ?? '-'}
            </span>
          }
        />
      </div>

      {rows.length > 0 ? (
        <table className="data mt-3">
          <thead>
            <tr>
              <th>Gap time</th>
              <th>Gap angle</th>
              <th>Severity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([band, deg, sev]) => (
              <tr
                key={band}
                style={{
                  background: pdCase.gap.gap_time_band === band ? 'var(--slate-50)' : undefined,
                }}
              >
                <td>{band}</td>
                <td>{deg}</td>
                <td>
                  <span className={`pill ${severityPillClass(sev)}`}>{sev}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="hint mt-[10px]">
          Confirm a PD source above to see the applicable severity table.
        </p>
      )}
    </>
  );
}

function FullSummaryTable({ pdCase: c }: { pdCase: PdCase }) {
  const groupHead = (label: string) => (
    <tr>
      <td
        colSpan={2}
        className="border-b-2 border-slate-200 bg-slate-50 font-bold text-slate-700"
      >
        {label}
      </td>
    </tr>
  );

  const kv = (rows: [string, React.ReactNode][]) =>
    rows.map(([k, v]) => (
      <tr key={k}>
        <td className="k">{k}</td>
        <td>{v}</td>
      </tr>
    ));

  return (
    <table className="kv">
      <tbody>
        {groupHead('Case Info')}
        {kv([
          ['Case', c.case_base_name],
          ['PRPD file', c.prpd_filename ?? '-'],
          ['TF file', c.tf_filename ?? '-'],
          ['Inference mode', c.n_files === 2 ? 'Hybrid' : 'PRPD-only'],
          ['Engine', c.inference_engine],
          ['Image size', `${c.image_width}×${c.image_height}`],
          ['Updated', fmtDate(c.updated_time)],
        ])}

        {groupHead('Classification Result')}
        {kv([
          [
            'Corona / Surface / Internal',
            `${fmt(c.confidence.corona)}% / ${fmt(c.confidence.surface)}% / ${fmt(
              c.confidence.internal,
            )}%`,
          ],
          ['Top class', `${c.ai_top_class ?? '-'} (${fmt(c.ai_top_score_percent)}%)`],
          ['Final result', c.ai_final_result ?? '-'],
          ['Status', c.ai_status ?? '-'],
          ['Decision rule', c.ai_decision_rule ?? '-'],
          ['Threshold', fmt(c.ai_threshold_percent, 0, '%')],
          ['Non-identified score', fmt(c.ai_non_identified_percent, 1, '%')],
        ])}

        {groupHead('Calibration')}
        {kv([
          [
            'Frame (L / R / T / B)',
            `${c.calibration.x_left_0deg} / ${c.calibration.x_right_360deg} / ${c.calibration.y_top_plot} / ${c.calibration.y_bottom_plot}`,
          ],
          ['Mode', c.calibration.calibration_mode ?? '-'],
          ['Source', c.calibration.calibration_source ?? '-'],
          ['Preset loaded', c.calibration.calibration_preset_loaded ? 'Yes' : 'No'],
        ])}

        {groupHead('Gap-Time & Severity')}
        {kv([
          ['Gap angle', fmt(c.gap.gap_angle_deg, 4, ' deg')],
          ['Gap time', fmt(c.gap.gap_time_ms, 4, ' ms')],
          ['Band', c.gap.gap_time_band ?? '-'],
          ['Line source / status', `${c.gap.gap_line_source ?? '-'} / ${c.gap.gap_measurement_status ?? '-'}`],
          ['Auto-gap status', c.gap.auto_gap_status ?? '-'],
          ['Cluster detection', c.gap.cluster_detection_status ?? '-'],
          ['Severity', c.severity_by_gap_time ?? '-'],
        ])}

        {groupHead('PD Source')}
        {kv([
          ['Suggested', c.suggested_pd_source_type ?? '-'],
          ['Confirmed by reviewer', c.confirmed_pd_source_type ?? '-'],
          ['Rule', c.pd_selection_rule ?? '-'],
          ['Strong rule?', c.is_strong_pd_rule ? 'Yes' : 'No, needs human confirmation'],
        ])}

        {groupHead('Reviewer Sign-off')}
        {kv([
          ['Reviewer', `${c.reviewer_name ?? '-'} (${c.reviewer_role ?? '-'})`],
          ['Status', c.review_status],
          ['Note', c.review_note || '-'],
          ['Not measurable reason', c.not_measurable_reason || '-'],
        ])}
      </tbody>
    </table>
  );
}
