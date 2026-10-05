'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { NudgeRow, PrpdCanvas, type Frame, type Handle } from '@/components/case/PrpdCanvas';
import { SummaryChart, downloadSummaryImage } from '@/components/case/SummaryChart';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  GearDetectIcon,
  RefreshIcon,
  SaveIcon,
  SparkleIcon,
  XIcon,
} from '@/components/ui/icons';
import { Collapse, FoldToggle, KV, Readout, Spinner, StatusBadge, fmt, fmtDate, resultPillClass, severityPillClass } from '@/components/ui/primitives';
import { api, fileUrl } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useI18n } from '@/lib/i18n';
import { serverText } from '@/lib/server-text';
import type { CalibrationPreset, PdCase, ReviewStatus } from '@/lib/types';

type StepKey = 'classification' | 'calibration' | 'gap' | 'summary' | 'signoff';
const STEP_KEYS: StepKey[] = ['classification', 'calibration', 'gap', 'summary', 'signoff'];

type T = <V = string>(en: V, th: V) => V;

/** Why a case ended up with its result, in plain language. */
function aiStatusLabel(status: string | null, t: T): string | null {
  const labels: Record<string, string> = {
    identified_by_top_class_gt_30: t('The highest-scoring class passed the threshold.', 'คลาสที่คะแนนสูงสุดผ่านเกณฑ์'),
    non_identified_all_classes_le_30: t(
      'No class reached the threshold, so the case is reported as Non-identified.',
      'ไม่มีคลาสใดถึงเกณฑ์ จึงรายงานเป็น Non-identified',
    ),
    rule_rejected_internal: t(
      'Internal scored high but failed the quadrant sanity check, so it was overridden to Non-identified.',
      'Internal ได้คะแนนสูงแต่ไม่ผ่านการตรวจสอบจตุภาค จึงถูกเปลี่ยนเป็น Non-identified',
    ),
    identified: t('One class passed the confidence threshold.', 'มีหนึ่งคลาสผ่านเกณฑ์ความมั่นใจ'),
    low_confidence_or_mixed: t('No single class stood out clearly enough.', 'ไม่มีคลาสใดโดดเด่นพอ'),
    identified_loose: t('The highest-scoring class passed the threshold.', 'คลาสที่คะแนนสูงสุดผ่านเกณฑ์'),
    below_threshold_loose: t('The highest-scoring class stayed below the threshold.', 'คลาสที่คะแนนสูงสุดยังต่ำกว่าเกณฑ์'),
    hybrid_inconclusive: t('No class reached 85%, so the result is inconclusive.', 'ไม่มีคลาสใดถึง 85% ผลจึงสรุปไม่ได้'),
    hybrid_identified: t('Exactly one class passed 85%.', 'มีหนึ่งคลาสที่ผ่าน 85%'),
    hybrid_mixed: t('More than one class passed 85%, which suggests mixed PD.', 'มีมากกว่าหนึ่งคลาสผ่าน 85% อาจเป็น PD แบบผสม'),
  };
  return status ? labels[status] ?? status : null;
}

function describeModel(modelUsed: string | null, inputMode: string | null, t: T): string {
  const hybrid = (inputMode ?? '').toUpperCase().includes('HYBRID');
  const base = hybrid
    ? t('Hybrid model (PRPD + TF map)', 'โมเดล Hybrid (PRPD + TF Map)')
    : t('PRPD-only model', 'โมเดล PRPD-only');
  return /mock/i.test(modelUsed ?? '') ? `${base} · ${t('mock engine, not a real prediction', 'โหมดจำลอง ไม่ใช่ผลทำนายจริง')}` : base;
}

function CaseWizardPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const caseId = Number(params.id);
  const { options, toast, user } = useApp();
  const { t } = useI18n();

  const [pdCase, setPdCase] = useState<PdCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<StepKey>('classification');
  const [saving, setSaving] = useState(false);
  const [presets, setPresets] = useState<CalibrationPreset[]>([]);
  const [siblings, setSiblings] = useState<PdCase[]>([]);

  // Local mirrors so dragging stays smooth; committed to the API on release.
  const [frame, setFrame] = useState<Frame | null>(null);
  const [gapLines, setGapLines] = useState<{ left: number | null; right: number | null }>({ left: null, right: null });
  const [axesSaved, setAxesSaved] = useState<'idle' | 'saving' | 'saved'>('idle');

  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>('user_confirmed');
  const [reviewNote, setReviewNote] = useState('');
  const [notMeasurableReason, setNotMeasurableReason] = useState('single_discharge_cluster');

  const returnTo = searchParams.get('from');
  const batchParam = searchParams.get('batch');

  const applyCase = useCallback((c: PdCase) => {
    setPdCase(c);
    setFrame({
      x_left: c.calibration.x_left_0deg ?? 0,
      x_right: c.calibration.x_right_360deg ?? c.image_width ?? 400,
      y_top: c.calibration.y_top_plot ?? 0,
      y_bottom: c.calibration.y_bottom_plot ?? c.image_height ?? 300,
    });
    setGapLines({ left: c.gap.left_line_pixel, right: c.gap.right_line_pixel });
    setReviewStatus(c.review_status);
    setReviewNote(c.review_note ?? '');
    if (c.not_measurable_reason) setNotMeasurableReason(c.not_measurable_reason);
  }, []);

  const loadPresets = useCallback(async () => {
    try {
      setPresets(await api.listPresets());
    } catch {
      setPresets([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setStep('classification');
    try {
      let c = await api.getCase(caseId);
      if (!c.analysis_run) c = await api.analyze(c.id);
      applyCase(c);
      void loadPresets();
      setSiblings(await api.listCases(c.batch_id != null ? { batch_id: c.batch_id } : {}));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not load this case', 'โหลดเคสนี้ไม่สำเร็จ'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, applyCase, toast, loadPresets]);

  useEffect(() => {
    if (Number.isFinite(caseId)) void load();
  }, [caseId, load]);

  // ------------------------------------------------------------------ queue
  const queueIndex = siblings.findIndex((s) => s.id === caseId);
  const queueTotal = siblings.length;
  const queueDone = siblings.filter((s) => s.status === 'done').length;
  const prevCase = queueIndex > 0 ? siblings[queueIndex - 1] : null;
  const nextCase = queueIndex >= 0 && queueIndex < queueTotal - 1 ? siblings[queueIndex + 1] : null;

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
    else if (pdCase?.batch_id != null && returnTo !== 'results') router.push(`/batches/${pdCase.batch_id}`);
    else router.push('/cases?mode=results');
  }

  // ---------------------------------------------------------------- actions
  async function commitCalibration(next: Frame) {
    if (!pdCase) return;
    setAxesSaved('saving');
    try {
      const updated = await api.updateCalibration(pdCase.id, {
        x_left_0deg: next.x_left,
        x_right_360deg: next.x_right,
        y_top_plot: next.y_top,
        y_bottom_plot: next.y_bottom,
        calibration_source: 'manual_axis_adjusted',
        calibration_mode: 'Manual calibration',
      });
      applyCase(updated);
      setAxesSaved('saved');
    } catch (e) {
      setAxesSaved('idle');
      toast(e instanceof Error ? e.message : t('Could not save the axes', 'บันทึกแกนไม่สำเร็จ'));
      void load();
    }
  }

  async function commitGap(left: number, right: number) {
    if (!pdCase) return;
    try {
      applyCase(await api.updateGap(pdCase.id, left, right));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not save the gap lines', 'บันทึกเส้น Gap ไม่สำเร็จ'));
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

  function nudgeCalib(handle: Handle, delta: number) {
    if (!frame) return;
    const key = handle as keyof Frame;
    const next = { ...frame, [key]: frame[key] + delta };
    setFrame(next);
    void commitCalibration(next);
  }

  function onGapDrag(handle: Handle, value: number) {
    setGapLines((g) => (handle === 'gapLeft' ? { ...g, left: value } : { ...g, right: value }));
  }

  function onGapDragEnd(handle: Handle, value: number) {
    const next = handle === 'gapLeft' ? { left: value, right: gapLines.right } : { left: gapLines.left, right: value };
    if (next.left == null || next.right == null) return;
    void commitGap(next.left, next.right);
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

  /** Drop both lines inside the frame so they can be dragged into place. */
  function placeGapLines() {
    if (!frame) return;
    const width = frame.x_right - frame.x_left;
    const left = Math.round(frame.x_left + width * 0.3);
    const right = Math.round(frame.x_left + width * 0.6);
    setGapLines({ left, right });
    void commitGap(left, right);
  }

  async function detectGap(method: 'rule' | 'model') {
    if (!pdCase) return;
    try {
      const updated = await api.detectGap(pdCase.id, method);
      applyCase(updated);
      const d = updated.detection;
      if (d?.single_cluster) {
        toast(t('Only one discharge cluster found, so gap-time is not measurable.', 'พบกลุ่มการคายประจุเพียงกลุ่มเดียว จึงวัด Gap-Time ไม่ได้'));
      } else if (d) {
        toast(
          d.source === 'ai_auto'
            ? t('Gap lines placed by the regression model', 'วางเส้น Gap ด้วยโมเดล Regression แล้ว')
            : t('Gap lines placed by rule-based detection', 'วางเส้น Gap ด้วยการตรวจจับตามกฎแล้ว'),
        );
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Gap detection failed', 'ตรวจจับ Gap ไม่สำเร็จ'));
    }
  }

  async function changePdSource(value: string) {
    if (!pdCase) return;
    try {
      applyCase(await api.confirmPdSource(pdCase.id, value));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not update the PD source', 'เปลี่ยนแหล่ง PD ไม่สำเร็จ'));
    }
  }

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
      setSiblings((rows) => rows.map((r) => (r.id === updated.id ? updated : r)));
      toast(t(`Saved the review of ${updated.case_base_name}`, `บันทึกผลตรวจ ${updated.case_base_name} แล้ว`));
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Save failed', 'บันทึกไม่สำเร็จ'));
      return false;
    } finally {
      setSaving(false);
    }
  }

  function advance() {
    if (!nextPending) {
      toast(t('Every case in this folder is reviewed', 'ตรวจครบทุกเคสในโฟลเดอร์นี้แล้ว'));
      goBack();
      return;
    }
    goToCase(nextPending.id);
  }

  async function saveAndAdvance() {
    if (pdCase?.status === 'done') {
      advance();
      return;
    }
    if (await submitReview()) advance();
  }

  // ---------------------------------------------------------------- render
  if (loading || !pdCase || !frame) return <Spinner label={t('Loading case…', 'กำลังโหลดเคส…')} />;

  const c = pdCase;
  const conf = c.confidence;
  const gap = c.gap;
  const stepIndex = STEP_KEYS.indexOf(step);
  const prpdUrl = fileUrl(c.prpd_url);

  const stepLabels: Record<StepKey, string> = {
    classification: t('Classification', 'ผลการจำแนก'),
    calibration: t('Plot axes', 'ปรับแกนกราฟ'),
    gap: 'Gap-Time',
    summary: t('Summary', 'สรุปผล'),
    signoff: t('Sign-off', 'ยืนยันผล'),
  };

  const decisionMode = options?.decision_modes.find((m) => m.key === c.decision_mode);
  const singleCluster = gap.auto_not_measurable_recommended === true;
  const alreadySaved = c.status === 'done';
  const inFolder = c.batch_id != null && queueTotal > 1;

  return (
    <>
      <div className="case-bar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={goBack}>
          <ArrowLeftIcon />
          {inFolder ? t('Folder', 'โฟลเดอร์') : t('Results', 'ผลการประเมิน')}
        </button>
        <span className="case-name">{c.case_base_name}</span>
        <StatusBadge status={c.status} />
        {c.inference_engine === 'mock' && <span className="pill pill-amber">{t('mock inference', 'ผลจำลอง')}</span>}
        {queueTotal > 1 && queueIndex >= 0 && (
          <div className="ml-auto flex items-center gap-2 text-[14px] text-muted">
            <span>
              {t(`Case ${queueIndex + 1} of ${queueTotal} · ${queueDone} reviewed`, `เคส ${queueIndex + 1} จาก ${queueTotal} · ตรวจแล้ว ${queueDone}`)}
            </span>
            <button
              type="button"
              className="icon-only"
              disabled={!prevCase}
              title={prevCase ? prevCase.case_base_name : ''}
              aria-label={t('Previous case', 'เคสก่อนหน้า')}
              onClick={() => prevCase && goToCase(prevCase.id)}
            >
              <ArrowLeftIcon />
            </button>
            <button
              type="button"
              className="icon-only"
              disabled={!nextCase}
              title={nextCase ? nextCase.case_base_name : ''}
              aria-label={t('Next case', 'เคสถัดไป')}
              onClick={() => nextCase && goToCase(nextCase.id)}
            >
              <ArrowRightIcon />
            </button>
          </div>
        )}
      </div>

      <div className="stepper" role="tablist">
        {STEP_KEYS.map((key, i) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={step === key}
            className={`step-btn ${step === key ? 'on' : ''} ${i < stepIndex ? 'done' : ''}`}
            onClick={() => setStep(key)}
          >
            <span className="step-no">{i < stepIndex ? <CheckIcon width={13} height={13} /> : i + 1}</span>
            {stepLabels[key]}
          </button>
        ))}
      </div>

      {/* ================= STEP 1: CLASSIFICATION ================= */}
      {step === 'classification' && (
        <div className="split">
          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title"><FoldToggle />
                  {t('Classification result', 'ผลการจำแนก')} <span className="tag">{t('read-only', 'อ่านอย่างเดียว')}</span>
                </h2>
                <p className="card-sub">{describeModel(c.ai_model_used, c.ai_input_mode, t)}</p>
              </div>
              <span className={`pill ${resultPillClass(c.ai_final_result)} !text-[15px]`}>{c.ai_final_result ?? '-'}</span>
            </div>

            {c.input_quality && c.input_quality.input_warning_count > 0 && (
              <div className="callout callout-amber mb-3">
                <b>
                  {t(
                    `Input check: ${c.input_quality.input_warning_count} warning(s)`,
                    `ตรวจสอบข้อมูลนำเข้า: ${c.input_quality.input_warning_count} คำเตือน`,
                  )}
                </b>
                <ul className="bullets mt-1">
                  {c.input_quality.input_warnings.map((w, i) => (
                    <li key={i}>{serverText(w, t)}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                {(
                  [
                    ['Corona', conf.corona, 'fill-corona'],
                    ['Surface', conf.surface, 'fill-surface'],
                    ['Internal', conf.internal, 'fill-internal'],
                  ] as const
                ).map(([label, value, fill]) => (
                  <div className="conf-row" key={label}>
                    <div className="conf-label">{label}</div>
                    <div className="conf-track">
                      <div className={`conf-fill ${fill}`} style={{ width: `${Math.min(100, value ?? 0)}%` }} />
                    </div>
                    <div className="conf-val">{fmt(value, 1, '%')}</div>
                  </div>
                ))}
                <p className="hint mt-3 text-[13px]">
                  {t(
                    'Each class is scored independently (sigmoid), so the three values need not add up to 100%.',
                    'แต่ละคลาสให้คะแนนแยกกัน (Sigmoid) ผลรวมจึงไม่จำเป็นต้องเท่ากับ 100%',
                  )}
                </p>
              </div>
              <KV
                rows={[
                  ...(c.ai_top_class && c.ai_top_class !== c.ai_final_result
                    ? ([[t('Highest score', 'คะแนนสูงสุด'), `${c.ai_top_class} (${fmt(c.ai_top_score_percent, 1, '%')})`]] as [ReactNode, ReactNode][])
                    : []),
                  [
                    t('Why this result', 'เหตุผลของผลนี้'),
                    <span key="w" title={c.ai_decision_rule ?? undefined}>
                      {aiStatusLabel(c.ai_status, t) ?? '-'}
                    </span>,
                  ],
                  [t('Threshold applied', 'เกณฑ์ที่ใช้'), fmt(c.ai_threshold_percent, 0, '%')],
                  [t('Classes over threshold', 'คลาสที่ผ่านเกณฑ์'), c.ai_high_conf_count ?? '-'],
                ]}
              />
            </div>

            {prpdUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={prpdUrl} alt="PRPD" className="image-frame mt-4 max-h-[260px]" />
            )}

            <p className="callout callout-red mt-4 text-[13.5px]">
              <b>{t('Preliminary assessment, not a diagnosis.', 'เป็นการประเมินเบื้องต้น ไม่ใช่การวินิจฉัย')}</b>{' '}
              {t(
                'The model knows Corona, Surface and Internal only; mixed PD may be misclassified.',
                'โมเดลรู้จักเฉพาะ Corona, Surface และ Internal ส่วน PD แบบผสมอาจจำแนกผิด',
              )}
            </p>
          </section>

          <div className="stack">
            <section className="card">
              <h2 className="card-title mb-1"><FoldToggle />{t('PD source', 'แหล่งกำเนิด PD')}</h2>
              <p className="card-sub mb-3">
                {t(
                  'Suggested from the scores. Confirm or change it: the confirmed source decides the severity table.',
                  'ระบบแนะนำจากคะแนน ยืนยันหรือเปลี่ยนได้ แหล่งที่ยืนยันจะใช้กำหนดตารางความรุนแรง',
                )}
              </p>
              <KV
                rows={[
                  [t('Suggested', 'ที่แนะนำ'), <b key="s">{c.suggested_pd_source_type ?? '-'}</b>],
                  [t('Matched rule', 'กฎที่ตรง'), <span key="m" className="text-[13.5px] text-muted">{c.pd_selection_rule ?? '-'}</span>],
                ]}
              />
              <div className="mt-3">
                <span className={`pill ${c.is_strong_pd_rule ? 'pill-green' : 'pill-amber'}`}>
                  {c.is_strong_pd_rule
                    ? t('Strong rule — suggestion can be trusted', 'กฎแข็ง — เชื่อถือผลที่แนะนำได้')
                    : t('Weak rule — needs your confirmation', 'กฎอ่อน — ต้องให้ผู้ตรวจยืนยัน')}
                </span>
              </div>
              <div className="field mt-3">
                <label className="label" htmlFor="pd-source">
                  {t('Confirmed PD source', 'แหล่ง PD ที่ยืนยัน')}
                </label>
                <select id="pd-source" value={c.confirmed_pd_source_type ?? ''} onChange={(e) => void changePdSource(e.target.value)}>
                  {(options?.pd_source_options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <Collapse title={t('Decision rule details', 'รายละเอียดกฎการตัดสิน')}>
              <p className="mb-2">
                <b>{decisionMode?.label ?? c.decision_mode}</b>
                <br />
                <span className="text-muted">{decisionMode?.description}</span>
              </p>
              {c.sanity_check?.ran && (
                <div className={`callout ${c.sanity_check.passed ? 'callout-green' : 'callout-red'}`}>
                  {t('Internal sanity check (quadrant ratios)', 'ตรวจสอบ Internal (สัดส่วนจตุภาค)')}: {t('upper', 'บน')}{' '}
                  {fmt((c.sanity_check.upper_ratio ?? 0) * 100, 0, '%')} · {t('lower', 'ล่าง')}{' '}
                  {fmt((c.sanity_check.lower_ratio ?? 0) * 100, 0, '%')} · {t('left', 'ซ้าย')}{' '}
                  {fmt((c.sanity_check.left_ratio ?? 0) * 100, 0, '%')} · {t('right', 'ขวา')}{' '}
                  {fmt((c.sanity_check.right_ratio ?? 0) * 100, 0, '%')} →{' '}
                  <b>
                    {c.sanity_check.passed
                      ? t('passed', 'ผ่าน')
                      : t('failed, overridden to Non-identified', 'ไม่ผ่าน เปลี่ยนเป็น Non-identified')}
                  </b>
                </div>
              )}
            </Collapse>
          </div>
        </div>
      )}

      {/* ================= STEP 2: PLOT AXES ================= */}
      {step === 'calibration' && (
        <div className="split">
          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title"><FoldToggle />{t('Fit the axes to the plot', 'ปรับแกนให้ตรงกับกราฟ')}</h2>
                <p className="card-sub">
                  {t(
                    'Drag the blue lines onto 0° and 360°, and the orange lines onto the top and bottom of the plot.',
                    'ลากเส้นสีน้ำเงินให้ตรง 0° และ 360° และเส้นสีส้มให้ตรงขอบบนและล่างของกราฟ',
                  )}
                </p>
              </div>
              <span className={`pill ${axesSaved === 'saving' ? 'pill-gray' : 'pill-green'}`}>
                {axesSaved === 'saving' ? t('Saving…', 'กำลังบันทึก…') : t('Saved automatically', 'บันทึกอัตโนมัติ')}
              </span>
            </div>
            <PrpdCanvas
              imageUrl={prpdUrl}
              imageWidth={c.image_width ?? 400}
              imageHeight={c.image_height ?? 300}
              frame={frame}
              mode="calibration"
              onDrag={onCalibDrag}
              onDragEnd={onCalibDragEnd}
            />
            <NudgeRow
              items={[
                { label: '0°', handle: 'x_left' },
                { label: '360°', handle: 'x_right' },
                { label: t('Top', 'บน'), handle: 'y_top' },
                { label: t('Bottom', 'ล่าง'), handle: 'y_bottom' },
              ]}
              onNudge={nudgeCalib}
            />
          </section>

          <AxesPanel
            pdCase={c}
            frame={frame}
            setFrame={setFrame}
            commit={(f) => void commitCalibration(f)}
            presets={presets}
            inFolder={inFolder}
            onApplied={(updated) => {
              applyCase(updated);
              setAxesSaved('saved');
            }}
            onPresetsChanged={() => void loadPresets()}
            onCopied={() => api.listCases({ batch_id: c.batch_id ?? undefined }).then(setSiblings).catch(() => undefined)}
          />
        </div>
      )}

      {/* ================= STEP 3: GAP-TIME ================= */}
      {step === 'gap' && (
        <div className="split">
          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title"><FoldToggle />{t('Measure the gap-time', 'วัด Gap-Time')}</h2>
                <p className="card-sub">
                  {t(
                    'Place the lines on the facing edges of the two discharge clusters. The saved value always comes from these lines.',
                    'วางเส้นที่ขอบด้านในของกลุ่มการคายประจุทั้งสอง ค่าที่บันทึกมาจากตำแหน่งเส้นนี้เสมอ',
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => void detectGap('rule')}>
                  <GearDetectIcon />
                  {t('Detect (rule-based)', 'ตรวจจับ (ตามกฎ)')}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  disabled={!gap.auto_gap_model_available}
                  title={gap.auto_gap_model_available ? gap.auto_gap_model_version ?? '' : t('Gap-time model not loaded', 'ไม่ได้โหลดโมเดล Gap-Time')}
                  onClick={() => void detectGap('model')}
                >
                  <SparkleIcon />
                  {t('Suggest (model)', 'แนะนำ (โมเดล)')}
                </button>
              </div>
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
            />
            <NudgeRow
              items={[
                { label: t('Left', 'ซ้าย'), handle: 'gapLeft' },
                { label: t('Right', 'ขวา'), handle: 'gapRight' },
              ]}
              onNudge={nudgeGap}
              disabled={gapLines.left == null}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[14px]">
              {singleCluster && (
                <>
                  <span className="pill pill-amber">{t('Single discharge cluster', 'มีกลุ่มการคายประจุกลุ่มเดียว')}</span>
                  <span className="text-muted">
                    {t(
                      'Gap-time may not be measurable. You can still place the lines; if the clusters cannot be separated, choose Not measurable at sign-off.',
                      'อาจวัด Gap-Time ไม่ได้ ยังวางเส้นได้ตามปกติ ถ้าแยกกลุ่มไม่ได้ ให้เลือก "วัดไม่ได้" ในขั้นยืนยันผล',
                    )}
                  </span>
                </>
              )}
              {gapLines.left != null ? (
                <>
                  <span className="pill pill-green">
                    {gap.gap_line_source === 'ai_auto'
                      ? t('From the regression model', 'จากโมเดล Regression')
                      : gap.gap_line_source === 'manual'
                        ? t('Placed by hand', 'ปรับด้วยมือ')
                        : t('From rule-based detection', 'จากการตรวจจับตามกฎ')}
                  </span>
                  {gap.manual_adjustment_detected && (
                    <span className="text-muted">{t('Adjusted from the suggestion.', 'ปรับจากค่าที่แนะนำแล้ว')}</span>
                  )}
                </>
              ) : (
                <>
                  <span className="pill pill-gray">{t('No lines yet', 'ยังไม่มีเส้น')}</span>
                  <span className="text-muted">{t('Use Detect or Suggest above, or', 'กดตรวจจับหรือแนะนำด้านบน หรือ')}</span>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!frame} onClick={placeGapLines}>
                    {t('Place lines by hand', 'วางเส้นเอง')}
                  </button>
                </>
              )}
            </div>
          </section>

          <div className="stack">
            <section className="card">
              <h2 className="card-title mb-3"><FoldToggle />{t('Measurement', 'ค่าที่วัดได้')}</h2>
              <div className="readout-grid">
                <Readout label={t('Gap angle', 'มุม Gap')} value={fmt(gap.gap_angle_deg, 2, '°')} />
                <Readout label="Gap-Time" value={fmt(gap.gap_time_ms, 3, ' ms')} />
                <Readout label={t('Band', 'ช่วง')} value={gap.gap_time_band ?? '-'} text />
                <Readout
                  label={t('Severity', 'ความรุนแรง')}
                  value={<span className={`pill ${severityPillClass(c.severity_by_gap_time)}`}>{c.severity_by_gap_time ?? '-'}</span>}
                  text
                />
              </div>
            </section>
            <section className="card">
              <h2 className="card-title mb-3"><FoldToggle />{t('How severity is decided', 'วิธีกำหนดความรุนแรง')}</h2>
              <SeverityMatrix pdCase={c} />
              <p className="callout callout-amber mt-3 text-[13.5px]">
                {t(
                  'Initial / Moderate / High are this framework’s criteria, not an international standard. If the clusters are not clearly separated, record the case as Not measurable.',
                  'Initial / Moderate / High เป็นเกณฑ์ของระบบนี้ ไม่ใช่มาตรฐานสากล หากแยกกลุ่มไม่ชัดให้บันทึกเป็น "วัดไม่ได้"',
                )}
              </p>
            </section>
          </div>
        </div>
      )}

      {/* ================= STEP 4: SUMMARY ================= */}
      {step === 'summary' && (
        <div className="split">
          <section className="card">
            <div className="card-head">
              <h2 className="card-title"><FoldToggle />{t('Case summary', 'สรุปเคส')}</h2>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => downloadSummaryImage(c.case_base_name)}>
                  <DownloadIcon />
                  {t('Summary image (.png)', 'ภาพสรุป (.png)')}
                </button>
                {c.annotated_image_url && (
                  <a className="btn btn-secondary btn-sm" href={fileUrl(c.annotated_image_url) ?? '#'} target="_blank" rel="noreferrer">
                    <DownloadIcon />
                    {t('Annotated image', 'ภาพพร้อมเส้น Gap')}
                  </a>
                )}
              </div>
            </div>
            <SummaryChart pdCase={c} imageUrl={prpdUrl} />
          </section>

          <div className="stack">
            <section className="card">
              <div className="readout-grid">
                <Readout label={t('AI result', 'ผล AI')} value={c.ai_final_result ?? '-'} text />
                <Readout label={t('Confirmed PD source', 'แหล่ง PD ที่ยืนยัน')} value={c.confirmed_pd_source_type ?? '-'} text />
                <Readout label="Gap-Time" value={`${fmt(gap.gap_time_ms, 3)} ms`} />
                <Readout
                  label={t('Severity', 'ความรุนแรง')}
                  value={<span className={`pill ${severityPillClass(c.severity_by_gap_time)}`}>{c.severity_by_gap_time ?? '-'}</span>}
                  text
                />
              </div>
            </section>
            <FullSummary pdCase={c} />
          </div>
        </div>
      )}

      {/* ================= STEP 5: SIGN-OFF ================= */}
      {step === 'signoff' && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title"><FoldToggle />{t('Reviewer sign-off', 'ผู้ตรวจยืนยันผล')}</h2>
              <p className="card-sub">
                {t(
                  'Saving records you as the reviewer of this case.',
                  'เมื่อบันทึก ระบบจะบันทึกคุณเป็นผู้ตรวจของเคสนี้',
                )}
              </p>
            </div>
            <div className="text-right text-[14px]">
              <b>{user?.username}</b> <span className="capitalize text-muted">({user?.role})</span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="field">
                <label className="label" htmlFor="review-status">
                  {t('Review status', 'สถานะการตรวจ')}
                </label>
                <select id="review-status" value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value as ReviewStatus)}>
                  <option value="user_confirmed">{t('Confirmed as suggested', 'ยืนยันตามที่ระบบเสนอ')}</option>
                  <option value="expert_corrected">{t('Corrected by an expert', 'แก้ไขโดยผู้เชี่ยวชาญ')}</option>
                  <option value="not_measurable">{t('Not measurable', 'วัดไม่ได้')}</option>
                </select>
              </div>
              {reviewStatus === 'not_measurable' && (
                <div className="field">
                  <label className="label" htmlFor="nm-reason">
                    {t('Why it is not measurable', 'เหตุผลที่วัดไม่ได้')}
                  </label>
                  <select id="nm-reason" value={notMeasurableReason} onChange={(e) => setNotMeasurableReason(e.target.value)}>
                    {(options?.not_measurable_reasons ?? []).map((r) => (
                      <option key={r} value={r}>
                        {r.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="field">
              <label className="label" htmlFor="review-note">
                {t('Note', 'หมายเหตุ')} <span className="tag">{t('optional', 'ไม่บังคับ')}</span>
              </label>
              <textarea
                id="review-note"
                value={reviewNote}
                placeholder={t('Anything the next reader should know', 'ข้อมูลที่ผู้อ่านต่อควรรู้')}
                onChange={(e) => setReviewNote(e.target.value)}
              />
            </div>
          </div>

          {singleCluster && reviewStatus !== 'not_measurable' && (
            <div className="callout callout-amber mt-3">
              {t(
                'Only one discharge cluster was found. Check the gap lines before saving a measured value, or choose Not measurable.',
                'พบกลุ่มการคายประจุเพียงกลุ่มเดียว ตรวจเส้น Gap ก่อนบันทึกค่าที่วัดได้ หรือเลือก "วัดไม่ได้"',
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className="btn btn-success" type="button" disabled={saving} onClick={() => void submitReview()}>
              <CheckIcon />
              {t('Save review', 'บันทึกผลตรวจ')}
            </button>
            <button
              className="btn btn-danger"
              type="button"
              disabled={saving}
              onClick={() => {
                setReviewStatus('not_measurable');
                void submitReview('not_measurable');
              }}
            >
              <XIcon />
              {t('Save as not measurable', 'บันทึกว่าวัดไม่ได้')}
            </button>
            {queueTotal > 1 && (
              <button
                className="btn btn-primary ml-auto"
                type="button"
                disabled={saving}
                onClick={() => void saveAndAdvance()}
              >
                {alreadySaved ? '' : t('Save and ', 'บันทึกแล้ว')}
                {nextPending ? t('next case', 'ไปเคสถัดไป') : t('finish folder', 'จบโฟลเดอร์')}
                <ArrowRightIcon />
              </button>
            )}
          </div>
          {queueTotal > 1 && (
            <p className="hint mt-2 text-[13.5px]">
              {nextPending
                ? t(
                    `${queueTotal - queueDone} case(s) left · next: ${nextPending.case_base_name}`,
                    `เหลือ ${queueTotal - queueDone} เคส · ถัดไป: ${nextPending.case_base_name}`,
                  )
                : t('Every other case in this folder is reviewed.', 'เคสอื่นในโฟลเดอร์นี้ตรวจครบแล้ว')}
            </p>
          )}
        </section>
      )}

      <div className="step-footer">
        <button
          className="btn btn-secondary"
          type="button"
          style={{ visibility: stepIndex === 0 ? 'hidden' : 'visible' }}
          onClick={() => setStep(STEP_KEYS[stepIndex - 1])}
        >
          <ArrowLeftIcon />
          {t('Back', 'ย้อนกลับ')}
        </button>
        <button
          className="btn btn-primary"
          type="button"
          style={{ visibility: stepIndex === STEP_KEYS.length - 1 ? 'hidden' : 'visible' }}
          onClick={() => setStep(STEP_KEYS[stepIndex + 1])}
        >
          {t('Next', 'ถัดไป')}: {stepIndex < STEP_KEYS.length - 1 ? stepLabels[STEP_KEYS[stepIndex + 1]] : ''}
          <ArrowRightIcon />
        </button>
      </div>
    </>
  );
}

/**
 * Everything about the axes in one place: the values (auto-saved to this
 * case), saved presets to load or create, and copying to the rest of the
 * folder.
 */
function AxesPanel({
  pdCase: c,
  frame,
  setFrame,
  commit,
  presets,
  inFolder,
  onApplied,
  onPresetsChanged,
  onCopied,
}: {
  pdCase: PdCase;
  frame: Frame;
  setFrame: (f: Frame) => void;
  commit: (f: Frame) => void;
  presets: CalibrationPreset[];
  inFolder: boolean;
  onApplied: (c: PdCase) => void;
  onPresetsChanged: () => void;
  onCopied: () => void;
}) {
  const { toast } = useApp();
  const { t, locale } = useI18n();
  const matching = presets.filter((p) => p.image_width === c.image_width && p.image_height === c.image_height);
  const others = presets.filter((p) => !matching.includes(p));
  const [presetId, setPresetId] = useState<string>(matching[0] ? String(matching[0].id) : '');
  const [presetName, setPresetName] = useState(`${c.image_width}x${c.image_height} ${new Date().toLocaleDateString(locale)}`);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!presetId && matching[0]) setPresetId(String(matching[0].id));
  }, [matching, presetId]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('That did not work', 'ดำเนินการไม่สำเร็จ'));
    } finally {
      setBusy(false);
    }
  }

  const fields: [keyof Frame, string][] = [
    ['x_left', t('0° (left), px', '0° (ซ้าย), px')],
    ['x_right', t('360° (right), px', '360° (ขวา), px')],
    ['y_top', t('Top, px', 'บน, px')],
    ['y_bottom', t('Bottom, px', 'ล่าง, px')],
  ];

  const selected = presets.find((p) => String(p.id) === presetId);
  const sizeMismatch = selected && (selected.image_width !== c.image_width || selected.image_height !== c.image_height);

  return (
    <div className="stack">
      <section className="card">
        <h2 className="card-title mb-3"><FoldToggle />{t('Axis values', 'ค่าแกน')}</h2>
        <div className="readout-grid !grid-cols-2">
          {fields.map(([key, label]) => (
            <label className="readout" key={key}>
              <span className="lbl">{label}</span>
              <input
                type="number"
                value={frame[key]}
                onChange={(e) => setFrame({ ...frame, [key]: Number(e.target.value) })}
                onBlur={() => commit(frame)}
                onKeyDown={(e) => e.key === 'Enter' && commit(frame)}
              />
            </label>
          ))}
        </div>
        <p className="hint mt-2 text-[13px]">
          {t('Image', 'ภาพ')} {c.image_width}×{c.image_height} px · {t('source', 'ที่มา')}: {c.calibration.calibration_source ?? '-'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                onApplied(await api.autoDetectCalibration(c.id));
                toast(t('Axes detected from the image', 'ตรวจจับแกนจากภาพแล้ว'));
              })
            }
          >
            <RefreshIcon />
            {t('Auto-detect', 'ตรวจจับอัตโนมัติ')}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                onApplied(await api.resetCalibration(c.id));
                toast(t('Axes reset to the default frame', 'รีเซ็ตแกนเป็นค่าเริ่มต้นแล้ว'));
              })
            }
          >
            {t('Reset', 'รีเซ็ต')}
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title mb-1"><FoldToggle />{t('Saved axis presets', 'ค่าแกนที่บันทึกไว้')}</h2>
        <p className="card-sub mb-3">
          {t('Presets load automatically for new images of the same size.', 'ค่าที่บันทึกจะถูกใช้อัตโนมัติกับภาพใหม่ที่มีขนาดเท่ากัน')}
        </p>
        <div className="input-row">
          <select value={presetId} onChange={(e) => setPresetId(e.target.value)} aria-label={t('Preset', 'ค่าแกน')}>
            <option value="">{presets.length ? t('Choose a preset…', 'เลือกค่าแกน…') : t('No presets saved yet', 'ยังไม่มีค่าที่บันทึก')}</option>
            {matching.length > 0 && (
              <optgroup label={t('Same image size', 'ขนาดภาพเท่ากัน')}>
                {matching.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.preset_name}
                  </option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label={t('Other sizes', 'ขนาดอื่น')}>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.preset_name} ({p.image_width}×{p.image_height})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={busy || !selected}
            onClick={() =>
              selected &&
              void run(async () => {
                onApplied(await api.applyPreset(c.id, selected.id));
                toast(t(`Loaded "${selected.preset_name}"`, `ใช้ "${selected.preset_name}" แล้ว`));
              })
            }
          >
            {t('Load', 'ใช้ค่านี้')}
          </button>
        </div>
        {sizeMismatch && (
          <p className="field-error">{t('This preset was saved for a different image size.', 'ค่านี้บันทึกไว้สำหรับภาพขนาดอื่น')}</p>
        )}

        <label className="label mt-4" htmlFor="preset-name">
          {t('Save the current axes as a preset', 'บันทึกแกนปัจจุบันเป็นค่าที่บันทึกไว้')}
        </label>
        <div className="input-row">
          <input id="preset-name" type="text" value={presetName} onChange={(e) => setPresetName(e.target.value)} />
          <button
            className="btn btn-secondary"
            type="button"
            disabled={busy || !presetName.trim()}
            onClick={() =>
              void run(async () => {
                const saved = await api.createPreset({
                  preset_name: presetName.trim(),
                  image_width: c.image_width ?? 0,
                  image_height: c.image_height ?? 0,
                  x_left_0deg: frame.x_left,
                  x_right_360deg: frame.x_right,
                  y_top_plot: frame.y_top,
                  y_bottom_plot: frame.y_bottom,
                  example_prpd_filename: c.prpd_filename,
                  example_tf_filename: c.tf_filename,
                  remark: `Saved from ${c.case_base_name}`,
                });
                setPresetId(String(saved.id));
                onPresetsChanged();
                toast(t(`Saved preset "${saved.preset_name}"`, `บันทึก "${saved.preset_name}" แล้ว`));
              })
            }
          >
            <SaveIcon />
            {t('Save', 'บันทึก')}
          </button>
        </div>
        <p className="field-help">{t('Using an existing name updates that preset.', 'ถ้าใช้ชื่อเดิม ระบบจะอัปเดตค่านั้น')}</p>
      </section>

      {inFolder && (
        <section className="card">
          <h2 className="card-title mb-1"><FoldToggle />{t('Rest of this folder', 'เคสที่เหลือในโฟลเดอร์')}</h2>
          <p className="card-sub mb-3">
            {t(
              'Copy these axes to every case in the folder that has the same image size and is not signed off yet.',
              'คัดลอกแกนนี้ไปยังทุกเคสในโฟลเดอร์ที่ภาพขนาดเท่ากันและยังไม่ได้ยืนยันผล',
            )}
          </p>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await api.applyCalibrationToBatch(c.id);
                onCopied();
                toast(
                  t(
                    `Axes copied to ${r.updated} case(s)` +
                      (r.skipped_size ? ` · ${r.skipped_size} skipped (other size)` : '') +
                      (r.skipped_done ? ` · ${r.skipped_done} already signed off` : ''),
                    `คัดลอกแกนไป ${r.updated} เคส` +
                      (r.skipped_size ? ` · ข้าม ${r.skipped_size} (ขนาดต่างกัน)` : '') +
                      (r.skipped_done ? ` · ${r.skipped_done} ยืนยันแล้ว` : ''),
                  ),
                );
              })
            }
          >
            <CopyIcon />
            {t('Copy axes to the rest of this folder', 'คัดลอกแกนไปยังเคสที่เหลือในโฟลเดอร์นี้')}
          </button>
        </section>
      )}
    </div>
  );
}

/** The PD-source-group × gap-time-band table, so severity is explainable. */
function SeverityMatrix({ pdCase }: { pdCase: PdCase }) {
  const { options } = useApp();
  const { t } = useI18n();
  const group1 = ['Floating / Corona / Bad contact', 'Outside surface discharge'];
  const group2 = ['Terminations / Joint', 'Internal'];
  const source = pdCase.confirmed_pd_source_type ?? '';

  const high = options?.constants.gap_time_high_ms ?? 4;
  const mod = options?.constants.gap_time_moderate_ms ?? 7;
  const cycle = options?.constants.cycle_time_ms ?? 20;
  const deg = (ms: number) => Math.round((ms * 360) / cycle);

  const isGroup1 = group1.includes(source) || pdCase.severity_group?.includes('1');
  const isGroup2 = group2.includes(source) || pdCase.severity_group?.includes('2');

  const rows: [string, string, string][] = isGroup1
    ? [
        [`> ${mod} ms`, `> ${deg(mod)}°`, 'Initial'],
        [`${high}–${mod} ms`, `${deg(high)}°–${deg(mod)}°`, 'Moderate'],
        [`< ${high} ms`, `< ${deg(high)}°`, 'High'],
      ]
    : isGroup2
      ? [
          [`> ${mod} ms`, `> ${deg(mod)}°`, 'Moderate'],
          [`${high}–${mod} ms`, `${deg(high)}°–${deg(mod)}°`, 'High'],
          [`< ${high} ms`, `< ${deg(high)}°`, 'High'],
        ]
      : [];

  return (
    <>
      <p className="mb-2 text-[14px]">
        {t('PD source group', 'กลุ่มแหล่ง PD')}: <b>{pdCase.severity_group || '-'}</b>
      </p>
      {rows.length > 0 ? (
        <table className="data compact">
          <thead>
            <tr>
              <th>Gap-Time</th>
              <th>{t('Gap angle', 'มุม Gap')}</th>
              <th>{t('Severity', 'ความรุนแรง')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([band, angle, sev]) => {
              const current = pdCase.severity_by_gap_time === sev && (pdCase.gap.gap_time_band ?? '').replace('-', '–') === band;
              return (
                <tr key={band} style={current ? { background: 'var(--primary-soft)' } : undefined}>
                  <td className="num">{band}</td>
                  <td className="num">{angle}</td>
                  <td>
                    <span className={`pill ${severityPillClass(sev)}`}>{sev}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="hint">{t('Confirm a PD source to see its severity table.', 'ยืนยันแหล่ง PD เพื่อดูตารางความรุนแรง')}</p>
      )}
    </>
  );
}

/** The full record, folded by section so only what is needed is open. */
function FullSummary({ pdCase: c }: { pdCase: PdCase }) {
  const { t, locale } = useI18n();

  const groups: [string, [string, ReactNode][]][] = [
    [
      t('Case information', 'ข้อมูลเคส'),
      [
        [t('Case', 'เคส'), c.case_base_name],
        [t('PRPD file', 'ไฟล์ PRPD'), c.prpd_filename ?? '-'],
        [t('TF map file', 'ไฟล์ TF Map'), c.tf_filename ?? '-'],
        [t('Model', 'โมเดล'), c.n_files === 2 ? 'Hybrid' : 'PRPD-only'],
        [t('Image size', 'ขนาดภาพ'), `${c.image_width}×${c.image_height}`],
        [t('Updated', 'แก้ไขล่าสุด'), fmtDate(c.updated_time, locale)],
      ],
    ],
    [
      t('Classification', 'การจำแนก'),
      [
        ['Corona / Surface / Internal', `${fmt(c.confidence.corona)} / ${fmt(c.confidence.surface)} / ${fmt(c.confidence.internal)} %`],
        [t('Top class', 'คลาสสูงสุด'), `${c.ai_top_class ?? '-'} (${fmt(c.ai_top_score_percent)}%)`],
        [t('Final result', 'ผลสุดท้าย'), c.ai_final_result ?? '-'],
        [t('Status', 'สถานะ'), c.ai_status ?? '-'],
        [t('Decision rule', 'กฎการตัดสิน'), c.ai_decision_rule ?? '-'],
        [t('Threshold', 'เกณฑ์'), fmt(c.ai_threshold_percent, 0, '%')],
      ],
    ],
    [
      t('Plot axes', 'แกนกราฟ'),
      [
        [
          t('Frame L / R / T / B', 'กรอบ ซ้าย/ขวา/บน/ล่าง'),
          `${c.calibration.x_left_0deg} / ${c.calibration.x_right_360deg} / ${c.calibration.y_top_plot} / ${c.calibration.y_bottom_plot}`,
        ],
        [t('Mode', 'โหมด'), c.calibration.calibration_mode ?? '-'],
        [t('Source', 'ที่มา'), c.calibration.calibration_source ?? '-'],
        [t('Preset loaded', 'ใช้ค่าที่บันทึก'), c.calibration.calibration_preset_loaded ? t('Yes', 'ใช่') : t('No', 'ไม่')],
      ],
    ],
    [
      t('Gap-time & severity', 'Gap-Time และความรุนแรง'),
      [
        [t('Gap angle', 'มุม Gap'), fmt(c.gap.gap_angle_deg, 4, '°')],
        ['Gap-Time', fmt(c.gap.gap_time_ms, 4, ' ms')],
        [t('Band', 'ช่วง'), c.gap.gap_time_band ?? '-'],
        [t('Lines', 'เส้น'), `${c.gap.gap_line_source ?? '-'} / ${c.gap.gap_measurement_status ?? '-'}`],
        [t('Cluster detection', 'การตรวจจับกลุ่ม'), c.gap.cluster_detection_status ?? '-'],
        [t('Severity', 'ความรุนแรง'), c.severity_by_gap_time ?? '-'],
      ],
    ],
    [
      t('PD source & review', 'แหล่ง PD และการตรวจ'),
      [
        [t('Suggested', 'ที่แนะนำ'), c.suggested_pd_source_type ?? '-'],
        [t('Confirmed', 'ที่ยืนยัน'), c.confirmed_pd_source_type ?? '-'],
        [t('Rule', 'กฎ'), c.pd_selection_rule ?? '-'],
        [t('Reviewer', 'ผู้ตรวจ'), `${c.reviewer_name ?? '-'} (${c.reviewer_role ?? '-'})`],
        [t('Review status', 'สถานะการตรวจ'), c.review_status],
        [t('Note', 'หมายเหตุ'), c.review_note || '-'],
      ],
    ],
  ];

  return (
    <div>
      {groups.map(([title, rows], i) => (
        <Collapse key={title} title={title} defaultOpen={i === 0} meta={t(`${rows.length} fields`, `${rows.length} รายการ`)}>
          <KV rows={rows} />
        </Collapse>
      ))}
    </div>
  );
}

export default function CaseWizardPageWrapper() {
  return (
    <Suspense fallback={<Spinner />}>
      <CaseWizardPage />
    </Suspense>
  );
}
