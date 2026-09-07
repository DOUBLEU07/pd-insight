'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ThresholdsPanel } from '@/components/settings/ThresholdsPanel';
import { CheckIcon, XIcon } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { getDataConsent } from '@/lib/consent';
import type {
  Backbone,
  ClassSpec,
  DatasetSplit,
  DatasetSummary,
  ModelKind,
  TrainedModelDetail,
} from '@/lib/types';

const SPLITS: { key: DatasetSplit; label: string; help: string }[] = [
  { key: 'train', label: 'Train', help: 'Fits the weights' },
  { key: 'test', label: 'Test', help: 'Measures the accuracy' },
  { key: 'valid', label: 'Valid', help: 'Watches for overfitting' },
];

const KINDS: { key: ModelKind; label: string; desc: string }[] = [
  {
    key: 'prpd_only',
    label: 'PRPD-only',
    desc: 'One PRPD image per sample. The same input mode as Model 2 (PRPD_2_Only).',
  },
  {
    key: 'hybrid',
    label: 'Hybrid (PRPD & T-F map)',
    desc: 'A PRPD paired with the T-F map from the same measurement, as Model 3 does.',
  },
];

const STEPS = ['Model', 'Data', 'Criteria', 'Train'] as const;

/**
 * The published classes, offered as the starting point. Each carries the PD
 * source the rule engine reports when it wins, and the severity group that
 * decides how gap-time is banded. A model may add to this or drop from it.
 */
const PUBLISHED_CLASSES: ClassSpec[] = [
  { name: 'Corona', pd_source: 'Floating / Corona / Bad contact', severity_group: 1 },
  { name: 'Surface', pd_source: 'Outside surface discharge', severity_group: 1 },
  { name: 'Internal', pd_source: 'Internal', severity_group: 2 },
];

const SEVERITY_GROUPS: { value: 1 | 2; label: string }[] = [
  { value: 1, label: '1 — Initial / Moderate / High' },
  { value: 2, label: '2 — Moderate / High' },
];

const BACKBONES: { key: Backbone; label: string; desc: string }[] = [
  {
    key: 'scratch',
    label: 'Compact CNN, trained from scratch',
    desc: 'Four convolution blocks fitted from random weights. No download, works offline.',
  },
  {
    key: 'mobilenetv2',
    label: 'MobileNetV2, fine-tuned',
    desc:
      'ImageNet backbone with a new head. Usually stronger on small datasets, but the ' +
      'weights are a download — without internet the run falls back to the compact CNN.',
  },
];

/** How long between status polls while a run is in flight. */
const POLL_MS = 1200;

export function NewModelWizard({
  onClose,
  onFinished,
}: {
  onClose: () => void;
  /** Called once a run reaches a terminal state, so the page can refresh. */
  onFinished: () => void;
}) {
  const { toast } = useApp();

  const [step, setStep] = useState(0);

  // ---- step 1 ----
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ModelKind>('prpd_only');
  const [classes, setClasses] = useState<ClassSpec[]>(PUBLISHED_CLASSES);
  const [newClass, setNewClass] = useState('');

  // ---- training settings ----
  const [maxEpochs, setMaxEpochs] = useState('12');
  const [batchSize, setBatchSize] = useState('16');
  const [learningRate, setLearningRate] = useState('0.001');
  const [backbone, setBackbone] = useState<Backbone>('scratch');
  // Pre-filled from the answer given at the consent gate, still asked again
  // here because this step uploads a whole dataset, not one case.
  const [dataConsent, setDataConsent] = useState(() => getDataConsent());

  // ---- created draft ----
  const [model, setModel] = useState<TrainedModelDetail | null>(null);
  const [dataset, setDataset] = useState<DatasetSummary | null>(null);
  const [blocking, setBlocking] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [rejected, setRejected] = useState<{ filename: string; reason: string }[]>([]);

  const [busy, setBusy] = useState(false);
  const [checklistConfirmed, setChecklistConfirmed] = useState(false);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);

  useEffect(
    () => () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    },
    [],
  );

  const isCustomClasses =
    classes.length !== PUBLISHED_CLASSES.length ||
    classes.some((c, i) => c.name !== PUBLISHED_CLASSES[i].name);

  const hasInternal = classes.some((c) => c.name === 'Internal');
  const hasSurface = classes.some((c) => c.name === 'Surface');

  function updateClass(index: number, patch: Partial<ClassSpec>) {
    setClasses((v) => v.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  // =====================================================================
  // STEP 1 -> 2 : create the draft the dataset attaches to
  // =====================================================================
  async function createDraft() {
    if (!name.trim()) {
      toast('Give the model a name first');
      return;
    }
    setBusy(true);
    try {
      const created = await api.createModel({
        name: name.trim(),
        kind,
        classes: classes.map((c) => ({ ...c, name: c.name.trim() })),
        max_epochs: Number(maxEpochs),
        batch_size: Number(batchSize),
        learning_rate: Number(learningRate),
        backbone,
        data_consent: dataConsent,
      });
      setModel(created);
      const detail = await api.getModel(created.id);
      setModel(detail);
      setDataset(detail.dataset);
      setBlocking(detail.blocking);
      setWarnings(detail.warnings);
      setStep(1);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create the model');
    } finally {
      setBusy(false);
    }
  }

  // =====================================================================
  // STEP 2 : dataset
  // =====================================================================
  async function pickFiles(split: DatasetSplit, className: string, files: FileList | null) {
    if (!model || !files || files.length === 0) return;
    setBusy(true);
    try {
      const result = await api.uploadTrainingData(model.id, split, className, Array.from(files));
      setDataset(result.dataset);
      setBlocking(result.blocking);
      setWarnings(result.warnings);
      setRejected(result.rejected);
      toast(
        `${result.accepted.length} file(s) added to ${split} / ${className}` +
          (result.rejected.length ? `, ${result.rejected.length} rejected` : ''),
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function clearSlot(split: DatasetSplit, className: string) {
    if (!model) return;
    setBusy(true);
    try {
      const result = await api.clearTrainingData(model.id, split, className);
      setDataset(result.dataset);
      setBlocking(result.blocking);
      setWarnings(result.warnings);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not clear that folder');
    } finally {
      setBusy(false);
    }
  }

  // =====================================================================
  // STEP 4 : train and poll
  // =====================================================================
  const poll = useCallback(
    async (id: number) => {
      try {
        const next = await api.getModel(id);
        setModel(next);
        if (next.status === 'completed' || next.status === 'failed') {
          if (!finishedRef.current) {
            finishedRef.current = true;
            onFinished();
          }
          return;
        }
      } catch {
        /* a dropped poll is not a failed run; try again on the next tick */
      }
      pollTimer.current = setTimeout(() => void poll(id), POLL_MS);
    },
    [onFinished],
  );

  async function train() {
    if (!model) return;
    setBusy(true);
    try {
      const started = await api.startTraining(model.id);
      setModel(started);
      setStep(3);
      finishedRef.current = false;
      pollTimer.current = setTimeout(() => void poll(started.id), POLL_MS);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not start training');
    } finally {
      setBusy(false);
    }
  }

  /** Abandoning a draft should not leave its staged images behind. */
  async function cancel() {
    if (model && model.status === 'draft') {
      try {
        await api.deleteModel(model.id);
      } catch {
        /* closing the dialog matters more than tidying up */
      }
    }
    onClose();
  }

  const running = model?.status === 'queued' || model?.status === 'running';
  const done = model?.status === 'completed' || model?.status === 'failed';

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <div className="modal-card modal-card-wide">
        <div className="modal-head">
          <h2 id="wizard-title">New Model</h2>
          <p className="m-0 mt-[3px] text-[12px] text-slate-400">
            Train a classifier on your own labelled images. The model, its dataset and its result
            stay on your account.
          </p>
        </div>

        <div className="modal-body">
          <div className="wizard-nav">
            {STEPS.map((label, i) => (
              <button
                key={label}
                type="button"
                className={`wizard-step-btn ${i === step ? 'active' : ''} ${
                  i < step ? 'done' : ''
                }`}
                disabled
              >
                <span className="wizard-step-no">{i < step ? '✓' : i + 1}</span>
                {label}
              </button>
            ))}
          </div>

          {/* ============================ STEP 1 ============================ */}
          {step === 0 && (
            <>
              <div className="field">
                <label className="field-label" htmlFor="model-name">
                  Model name
                </label>
                <input
                  id="model-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="model3"
                />
              </div>

              <div className="field">
                <label className="field-label">What type</label>
                <div className="space-y-[10px]">
                  {KINDS.map((k) => (
                    <label
                      key={k.key}
                      className={`consent-item ${kind === k.key ? 'checked' : ''}`}
                    >
                      <input
                        type="radio"
                        name="kind"
                        checked={kind === k.key}
                        onChange={() => setKind(k.key)}
                      />
                      <span>
                        <span className="lbl">{k.label}</span>
                        <span className="desc">{k.desc}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="field">
                <label className="field-label">Classes</label>
                <p className="mb-[10px] mt-0 text-[11.5px] text-slate-400">
                  The labels the model learns to tell apart, and what each one means once it
                  wins. <b>PD source</b> is what the case gets reported as; the{' '}
                  <b>severity group</b> decides how a measured gap-time becomes a severity.
                </p>

                <table className="data">
                  <thead>
                    <tr>
                      <th className="w-[150px]">Class</th>
                      <th>PD source reported</th>
                      <th className="w-[240px]">Severity from gap-time</th>
                      <th className="w-[36px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map((c, i) => (
                      <tr key={i}>
                        <td>
                          <input
                            type="text"
                            value={c.name}
                            aria-label={`Class ${i + 1} name`}
                            onChange={(e) => updateClass(i, { name: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={c.pd_source}
                            aria-label={`PD source for ${c.name}`}
                            placeholder="e.g. Void / cavity discharge"
                            onChange={(e) => updateClass(i, { pd_source: e.target.value })}
                          />
                        </td>
                        <td>
                          <select
                            value={c.severity_group}
                            aria-label={`Severity group for ${c.name}`}
                            onChange={(e) =>
                              updateClass(i, {
                                severity_group: Number(e.target.value) as 1 | 2,
                              })
                            }
                          >
                            {SEVERITY_GROUPS.map((g) => (
                              <option key={g.value} value={g.value}>
                                {g.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {classes.length > 2 && (
                            <button
                              type="button"
                              aria-label={`Remove ${c.name}`}
                              className="cursor-pointer border-none bg-transparent p-0 text-slate-400 hover:text-red-600"
                              onClick={() => setClasses((v) => v.filter((_, x) => x !== i))}
                            >
                              <XIcon width={13} height={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-[10px] flex gap-[8px]">
                  <input
                    type="text"
                    value={newClass}
                    placeholder="Add another class"
                    onChange={(e) => setNewClass(e.target.value)}
                    className="max-w-[240px]"
                  />
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={!newClass.trim() || classes.some((c) => c.name === newClass.trim())}
                    onClick={() => {
                      setClasses((v) => [
                        ...v,
                        {
                          name: newClass.trim(),
                          pd_source: `${newClass.trim()} discharge`,
                          severity_group: 1,
                        },
                      ]);
                      setNewClass('');
                    }}
                  >
                    + Add class
                  </button>
                </div>

                {isCustomClasses && (
                  <div className="callout callout-amber mt-[12px]">
                    <b className="mb-[6px] block">This model uses its own class set</b>
                    It can still be selected as your analysis model: cases scored by it are read
                    through the mapping above rather than the published one. Two rules key off
                    specific class names, and switch themselves off when those are gone:
                    <ul className="help-bullets mt-[6px]">
                      <li>
                        The <b>Terminations / Joint</b> pair rule needs both <b>Surface</b> and{' '}
                        <b>Internal</b> —{' '}
                        {hasSurface && hasInternal ? 'still active.' : 'not active for this set.'}
                      </li>
                      <li>
                        The <b>Internal quadrant sanity check</b> needs <b>Internal</b> —{' '}
                        {hasInternal ? 'still active.' : 'not active for this set.'}
                      </li>
                    </ul>
                  </div>
                )}
              </div>

              <div className="field">
                <label className="field-label">Training settings</label>
                <p className="mb-[10px] mt-0 text-[11.5px] text-slate-400">
                  How the run is fitted. The defaults suit a few hundred images per class: raise
                  the epochs for a larger dataset, and lower the learning rate if accuracy swings
                  between runs.
                </p>

                <div className="grid2 mb-[12px]">
                  <div>
                    <label className="field-label" htmlFor="max-epochs">
                      Epochs (1-200)
                    </label>
                    <input
                      id="max-epochs"
                      type="number"
                      min={1}
                      max={200}
                      value={maxEpochs}
                      onChange={(e) => setMaxEpochs(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="batch-size">
                      Batch size (1-128)
                    </label>
                    <input
                      id="batch-size"
                      type="number"
                      min={1}
                      max={128}
                      value={batchSize}
                      onChange={(e) => setBatchSize(e.target.value)}
                    />
                  </div>
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="learning-rate">
                    Learning rate (0.00001 - 1)
                  </label>
                  <input
                    id="learning-rate"
                    type="number"
                    step="0.0001"
                    min={0.00001}
                    max={1}
                    value={learningRate}
                    onChange={(e) => setLearningRate(e.target.value)}
                    className="max-w-[200px]"
                  />
                </div>

                <div className="space-y-[10px]">
                  {BACKBONES.map((b) => (
                    <label
                      key={b.key}
                      className={`consent-item ${backbone === b.key ? 'checked' : ''}`}
                    >
                      <input
                        type="radio"
                        name="backbone"
                        checked={backbone === b.key}
                        onChange={() => setBackbone(b.key)}
                      />
                      <span>
                        <span className="lbl">{b.label}</span>
                        <span className="desc">{b.desc}</span>
                      </span>
                    </label>
                  ))}
                </div>

                <p className="mt-[8px] text-[11.5px] text-slate-400">
                  Early stopping watches the validation loss and restores the best weights, so a
                  run may finish before it reaches the epoch count you set.
                </p>
              </div>

              <div className="field">
                <label className="field-label">Data collection</label>
                <label className={`consent-item ${dataConsent ? 'checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={dataConsent}
                    onChange={(e) => setDataConsent(e.target.checked)}
                  />
                  <span>
                    <span className="lbl">
                      I allow this dataset to be sent to the PD Insight developers{' '}
                      <span className="text-[11px] font-medium text-slate-400">optional</span>
                    </span>
                    <span className="desc">
                      Shared for this purpose: the images you upload here, the class each was
                      filed under, and the accuracy this run reports — used to improve the
                      published models. No case data, review note or account detail beyond your
                      username goes with it.{' '}
                      <b>
                        Declining changes nothing about this run: it still trains, and the
                        dataset still stays on your account for you to retrain from.
                      </b>{' '}
                      Your answer is recorded next to the data, and can be changed by deleting
                      the model.
                    </span>
                  </span>
                </label>
              </div>
            </>
          )}

          {/* ============================ STEP 2 ============================ */}
          {step === 1 && dataset && model && (
            <>
              <p className="hint mt-0">
                Upload one folder per class, per split. Recommended split{' '}
                <b>
                  train {dataset.recommended.train}% : test {dataset.recommended.test}% : valid{' '}
                  {dataset.recommended.valid}%
                </b>
                .{' '}
                {kind === 'hybrid' && (
                  <>
                    Each PRPD needs the T-F map from the same measurement, named{' '}
                    <code>&lt;case&gt;_PRPD</code> and <code>&lt;case&gt;_TF</code>.
                  </>
                )}
              </p>

              <div className="readout-grid mb-[14px]">
                {SPLITS.map(({ key, label }) => (
                  <div className="readout-box" key={key}>
                    <div className="lbl">{label}</div>
                    <div className="val">
                      {dataset.totals[key]}{' '}
                      <span className="text-[12px] font-semibold text-slate-400">
                        {dataset.percentages[key]}%
                      </span>
                    </div>
                  </div>
                ))}
                <div className="readout-box">
                  <div className="lbl">Total samples</div>
                  <div className="val">{dataset.total}</div>
                </div>
              </div>

              {model.class_names.map((className) => (
                <div className="dataset-row" key={className}>
                  <div className="dataset-row-head">
                    <b className="text-[13px] text-slate-900">{className}</b>
                    <span className="text-[11.5px] text-slate-400">
                      {SPLITS.reduce(
                        (sum, s) => sum + (dataset.per_class[className]?.[s.key] ?? 0),
                        0,
                      )}{' '}
                      sample(s)
                    </span>
                  </div>
                  <div className="dataset-splits">
                    {SPLITS.map(({ key, label, help }) => {
                      const count = dataset.per_class[className]?.[key] ?? 0;
                      const files = dataset.raw_per_class[className]?.[key] ?? 0;
                      // In Hybrid mode a slot can hold files that form no pair
                      // yet, so Clear follows the file count, not the samples.
                      return (
                        <div key={key}>
                          <label className={`split-slot block ${count ? 'filled' : ''}`}>
                            <input
                              type="file"
                              multiple
                              accept=".jpg,.jpeg,.png,.bmp"
                              className="hidden"
                              disabled={busy}
                              onChange={(e) => {
                                void pickFiles(key, className, e.target.files);
                                e.target.value = '';
                              }}
                            />
                            <span className="lbl">+ {label}</span>
                            <span className="val block">{count}</span>
                            <span className="sub block">
                              {kind === 'hybrid' && files !== count * 2
                                ? `${files} file(s), ${count} pair(s)`
                                : help}
                            </span>
                          </label>
                          {files > 0 && (
                            <button
                              type="button"
                              className="small-link mt-[4px] text-[11px] text-slate-400"
                              disabled={busy}
                              onClick={() => void clearSlot(key, className)}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {rejected.length > 0 && (
                <div className="callout callout-red mt-[12px]">
                  <b className="mb-[6px] block">{rejected.length} file(s) were not accepted</b>
                  <ul className="help-bullets">
                    {rejected.slice(0, 6).map((r) => (
                      <li key={r.filename}>
                        <code>{r.filename}</code> — {r.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {blocking.length > 0 && (
                <div className="callout callout-red mt-[12px]">
                  <b className="mb-[6px] block">Still needed before this run can start</b>
                  <ul className="help-bullets">
                    {blocking.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                  {dataset.unpaired.length > 0 && (
                    <p className="mb-0 mt-[8px] text-[11.5px] text-slate-500">
                      Unpaired:{' '}
                      {dataset.unpaired.map((f) => (
                        <code key={f} className="mr-[6px]">
                          {f}
                        </code>
                      ))}
                      {dataset.unpaired_count > dataset.unpaired.length &&
                        `and ${dataset.unpaired_count - dataset.unpaired.length} more`}
                    </p>
                  )}
                </div>
              )}

              {warnings.length > 0 && (
                <div className="callout callout-amber mt-[12px]">
                  <b className="mb-[6px] block">Worth checking, but not blocking</b>
                  <ul className="help-bullets">
                    {warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* ============================ STEP 3 ============================ */}
          {step === 2 && (
            <>
              <p className="hint mt-0">
                These are the numbers the rule engine will compare this model&apos;s scores
                against. Confirm them now, and adjust here if the dataset you just prepared calls
                for different bands. Changes apply to your account.
              </p>
              <ThresholdsPanel compact />

              <div className="mt-[18px]">
                <label
                  className={`consent-item ${checklistConfirmed ? 'checked' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checklistConfirmed}
                    onChange={(e) => setChecklistConfirmed(e.target.checked)}
                  />
                  <span>
                    <span className="lbl">
                      I have worked through the Pre-Training Checklist{' '}
                      <span className="text-red-700">*</span>
                    </span>
                    <span className="desc">
                      Labels verified, classes separated correctly, and{' '}
                      <b>
                        no image, and no image derived from the same measurement, in both the
                        training and the testing set
                      </b>
                      . Leakage between the splits inflates the accuracy this run will report.
                    </span>
                  </span>
                </label>
              </div>
            </>
          )}

          {/* ============================ STEP 4 ============================ */}
          {step === 3 && model && (
            <>
              {running && (
                <>
                  <div className="mb-[14px] flex items-center justify-between text-[13px]">
                    <b className="text-slate-900">{model.stage ?? 'Starting…'}</b>
                    <span className="text-slate-400">{model.progress}%</span>
                  </div>
                  <div className="train-progress-bg mb-[16px]">
                    <div
                      className="train-progress-fill"
                      style={{ width: `${Math.max(4, model.progress)}%` }}
                    />
                  </div>
                  <Spinner label="Training. You can leave this open; the run continues on the server." />
                </>
              )}

              {model.status === 'completed' && (
                <>
                  <div className="readout-grid mb-[14px]">
                    <div className="readout-box">
                      <div className="lbl">Accuracy</div>
                      <div className="val text-emerald-700">
                        {model.accuracy != null ? `${model.accuracy}%` : '-'}
                      </div>
                    </div>
                    <div className="readout-box">
                      <div className="lbl">Validation</div>
                      <div className="val">
                        {model.val_accuracy != null ? `${model.val_accuracy}%` : '-'}
                      </div>
                    </div>
                    <div className="readout-box">
                      <div className="lbl">Loss</div>
                      <div className="val">{model.loss ?? '-'}</div>
                    </div>
                    <div className="readout-box">
                      <div className="lbl">Epochs</div>
                      <div className="val">{model.epochs}</div>
                    </div>
                  </div>

                  <div
                    className={`callout ${
                      model.engine_used === 'simulated' ? 'callout-amber' : 'callout-slate'
                    }`}
                  >
                    <b className="mb-[6px] block">
                      {model.engine_used === 'simulated'
                        ? 'Simulated run — this is not a measured accuracy'
                        : 'Run completed'}
                    </b>
                    {model.note}
                  </div>

                  {model.can_activate ? (
                    <p className="mt-[12px] text-[12.5px] text-slate-500">
                      <b>{model.name}</b> is now in your model list. Select it under{' '}
                      <b>Settings → Analysis Model</b> to score new cases with it
                      {!model.uses_published_classes && (
                        <>
                          , where its results are read through the class mapping you defined
                        </>
                      )}
                      .
                    </p>
                  ) : (
                    <p className="mt-[12px] text-[12.5px] text-slate-500">
                      This run is recorded in your model history, but it cannot be selected as
                      your analysis model, because no model file was produced.
                    </p>
                  )}

                  <p className="mt-[10px] text-[11.5px] text-slate-400">
                    {model.data_consent
                      ? 'You allowed this dataset to be sent to the developers. It stays on your account, and is marked as shareable.'
                      : 'You declined to share this dataset with the developers. It stays on your account and will not be collected.'}
                  </p>
                </>
              )}

              {model.status === 'failed' && (
                <div className="callout callout-red">
                  <b className="mb-[6px] block">The run failed</b>
                  {model.error}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-foot">
          <button className="small-link" type="button" onClick={() => void cancel()}>
            {done ? 'Close' : 'Cancel'}
          </button>

          <div className="flex items-center gap-[10px]">
            {step === 0 && (
              <button
                className="btn btn-blue"
                type="button"
                disabled={busy || !name.trim()}
                onClick={() => void createDraft()}
              >
                Continue
              </button>
            )}

            {step === 1 && (
              <button
                className="btn btn-blue"
                type="button"
                disabled={busy || blocking.length > 0}
                onClick={() => setStep(2)}
              >
                Check criteria
              </button>
            )}

            {step === 2 && (
              <>
                <button
                  className="btn btn-outline"
                  type="button"
                  disabled={busy}
                  onClick={() => setStep(1)}
                >
                  Back to data
                </button>
                <button
                  className="btn btn-green"
                  type="button"
                  disabled={busy || !checklistConfirmed || blocking.length > 0}
                  onClick={() => void train()}
                >
                  <CheckIcon className="btn-icon" />
                  Train model
                </button>
              </>
            )}

            {step === 3 && done && (
              <button className="btn btn-blue" type="button" onClick={onClose}>
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
