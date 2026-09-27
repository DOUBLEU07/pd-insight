'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ThresholdsPanel } from '@/components/settings/ThresholdsPanel';
import { CheckIcon, FolderIcon, ImageIcon, TrashIcon, XIcon } from '@/components/ui/icons';
import { Collapse, DoneBadge, UploadBanner } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { getDataConsent } from '@/lib/consent';
import { useI18n } from '@/lib/i18n';
import { serverText, stageText } from '@/lib/server-text';
import type { ClassSpec, DatasetSplit, DatasetSummary, ModelKind, TrainedModelDetail } from '@/lib/types';

const SPLIT_KEYS: DatasetSplit[] = ['train', 'test', 'valid'];

/** Folder names recognised when a whole dataset folder is uploaded. */
const SPLIT_ALIASES: Record<string, DatasetSplit> = {
  train: 'train',
  training: 'train',
  test: 'test',
  testing: 'test',
  valid: 'valid',
  val: 'valid',
  validation: 'valid',
};

const IMAGE_EXT = /\.(jpe?g|png|bmp)$/i;

/** The published classes, offered as the starting point. */
const PUBLISHED_CLASSES: ClassSpec[] = [
  { name: 'Corona', pd_source: 'Floating / Corona / Bad contact', severity_group: 1 },
  { name: 'Surface', pd_source: 'Outside surface discharge', severity_group: 1 },
  { name: 'Internal', pd_source: 'Internal', severity_group: 2 },
];

const POLL_MS = 1200;

type T = <V = string>(en: V, th: V) => V;

function relPath(f: File): string {
  return (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
}

/** Where a file from a dataset folder belongs, read from its folder names. */
function placeFile(path: string, classNames: string[]): { split: DatasetSplit; cls: string } | null {
  let split: DatasetSplit | null = null;
  let cls: string | null = null;
  for (const part of path.split('/').slice(0, -1)) {
    const lower = part.toLowerCase();
    if (SPLIT_ALIASES[lower]) split = SPLIT_ALIASES[lower];
    const match = classNames.find((c) => c.toLowerCase() === lower);
    if (match) cls = match;
  }
  return split && cls ? { split, cls } : null;
}

export function NewModelWizard({ onClose, onFinished }: { onClose: () => void; onFinished: () => void }) {
  const { toast } = useApp();
  const { t } = useI18n();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ModelKind>('prpd_only');
  const [classes, setClasses] = useState<ClassSpec[]>(PUBLISHED_CLASSES);
  const [newClass, setNewClass] = useState('');
  const [maxEpochs, setMaxEpochs] = useState('12');
  const [batchSize, setBatchSize] = useState('16');
  const [learningRate, setLearningRate] = useState('0.001');
  const [dataConsent, setDataConsent] = useState(() => getDataConsent());

  const [model, setModel] = useState<TrainedModelDetail | null>(null);
  const [dataset, setDataset] = useState<DatasetSummary | null>(null);
  const [blocking, setBlocking] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [rejected, setRejected] = useState<{ filename: string; reason: string }[]>([]);
  const [landed, setLanded] = useState<Record<string, number>>({});
  const [lastUpload, setLastUpload] = useState<{ count: number; detail: string; stamp: number } | null>(null);
  const [progress, setProgress] = useState<{ label: string; value: number } | null>(null);

  const [busy, setBusy] = useState(false);
  const [checklistConfirmed, setChecklistConfirmed] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);
  const datasetFolderInput = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    },
    [],
  );

  const splitLabel = (s: DatasetSplit) =>
    ({ train: t('Train', 'ฝึก (Train)'), test: t('Test', 'ทดสอบ (Test)'), valid: t('Validation', 'ตรวจสอบ (Valid)') })[s];

  const isCustomClasses =
    classes.length !== PUBLISHED_CLASSES.length || classes.some((c, i) => c.name !== PUBLISHED_CLASSES[i].name);

  function updateClass(index: number, patch: Partial<ClassSpec>) {
    setClasses((v) => v.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function applyResult(r: { dataset: DatasetSummary; blocking: string[]; warnings: string[] }) {
    setDataset(r.dataset);
    setBlocking(r.blocking);
    setWarnings(r.warnings);
  }

  // ------------------------------------------------------------ step 1 → 2
  async function createDraft() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const created = await api.createModel({
        name: name.trim(),
        kind,
        classes: classes.map((c) => ({ ...c, name: c.name.trim() })),
        max_epochs: Number(maxEpochs),
        batch_size: Number(batchSize),
        learning_rate: Number(learningRate),
        backbone: 'mobilenetv2',
        data_consent: dataConsent,
      });
      const detail = await api.getModel(created.id);
      setModel(detail);
      applyResult(detail);
      setStep(1);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not create the model', 'สร้างโมเดลไม่สำเร็จ'));
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------ step 2
  /** Upload one or more (split, class) groups in turn, with one progress bar. */
  async function uploadGroups(groups: { split: DatasetSplit; cls: string; files: File[] }[], skipped = 0) {
    if (!model || groups.length === 0) return;
    setBusy(true);
    const allRejected: { filename: string; reason: string }[] = [];
    let accepted = 0;
    try {
      for (let g = 0; g < groups.length; g += 1) {
        const { split, cls, files } = groups[g];
        const label = `${cls} · ${splitLabel(split)}`;
        setProgress({ label, value: g / groups.length });
        const r = await api.uploadTrainingData(model.id, split, cls, files, (f) =>
          setProgress({ label, value: (g + f) / groups.length }),
        );
        applyResult(r);
        allRejected.push(...r.rejected);
        accepted += r.accepted.length;
        setLanded((prev) => ({ ...prev, [`${split}/${cls}`]: (prev[`${split}/${cls}`] ?? 0) + 1 }));
      }
      setRejected(allRejected);
      setLastUpload((prev) => ({
        count: accepted,
        detail:
          groups.length === 1
            ? `${groups[0].cls} · ${splitLabel(groups[0].split)}`
            : t(`${groups.length} class/split folders`, `${groups.length} โฟลเดอร์ย่อย`) +
              (skipped ? t(` · ${skipped} file(s) not placed`, ` · ${skipped} ไฟล์ไม่ทราบตำแหน่ง`) : '') +
              (allRejected.length ? t(` · ${allRejected.length} rejected`, ` · ปฏิเสธ ${allRejected.length}`) : ''),
        stamp: (prev?.stamp ?? 0) + 1,
      }));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Upload failed', 'อัปโหลดไม่สำเร็จ'));
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  function uploadSlot(split: DatasetSplit, cls: string, list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => IMAGE_EXT.test(f.name));
    if (files.length === 0) {
      if (list && list.length) toast(t('No .jpg / .png / .bmp images in that selection.', 'ไม่พบภาพ .jpg / .png / .bmp ในที่เลือก'));
      return;
    }
    void uploadGroups([{ split, cls, files }]);
  }

  function uploadDatasetFolder(list: FileList | null) {
    if (!model) return;
    const buckets = new Map<string, { split: DatasetSplit; cls: string; files: File[] }>();
    let skipped = 0;
    for (const f of Array.from(list ?? [])) {
      if (!IMAGE_EXT.test(f.name)) continue;
      const place = placeFile(relPath(f), model.class_names);
      if (!place) {
        skipped += 1;
        continue;
      }
      const key = `${place.split}/${place.cls}`;
      if (!buckets.has(key)) buckets.set(key, { ...place, files: [] });
      buckets.get(key)!.files.push(f);
    }
    if (buckets.size === 0) {
      toast(
        t(
          'No images matched. The folder needs train / test / valid sub-folders, each holding one folder per class.',
          'ไม่พบภาพที่ตรงรูปแบบ โฟลเดอร์ต้องมีโฟลเดอร์ย่อย train / test / valid และในนั้นแยกโฟลเดอร์ตามคลาส',
        ),
      );
      return;
    }
    void uploadGroups([...buckets.values()], skipped);
  }

  async function clearSlot(split: DatasetSplit, cls: string) {
    if (!model) return;
    setBusy(true);
    try {
      applyResult(await api.clearTrainingData(model.id, split, cls));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not clear that folder', 'ล้างข้อมูลไม่สำเร็จ'));
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------ step 4
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
        /* a dropped poll is not a failed run */
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
      toast(e instanceof Error ? e.message : t('Could not start training', 'เริ่มเทรนไม่สำเร็จ'));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (model && model.status === 'draft') {
      try {
        await api.deleteModel(model.id);
      } catch {
        /* closing matters more than tidying up */
      }
    }
    onClose();
  }

  const running = model?.status === 'queued' || model?.status === 'running';
  const done = model?.status === 'completed' || model?.status === 'failed';
  const stepLabels = [t('Model', 'โมเดล'), t('Data', 'ข้อมูล'), t('Criteria', 'เกณฑ์'), t('Train', 'เทรน')];

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <div className="modal-card wide">
        <div className="modal-head">
          <h2 id="wizard-title">{t('New model', 'สร้างโมเดลใหม่')}</h2>
          <div className="stepper mb-0 mt-3">
            {stepLabels.map((label, i) => (
              <button key={label} type="button" className={`step-btn ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`} disabled>
                <span className="step-no">{i < step ? <CheckIcon width={13} height={13} /> : i + 1}</span>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-body">
          {/* ============================ STEP 1 ============================ */}
          {step === 0 && (
            <div className="stack">
              <div className="field">
                <label className="label" htmlFor="model-name">
                  {t('Model name', 'ชื่อโมเดล')}
                </label>
                <input
                  id="model-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('e.g. cable-termination-v1', 'เช่น cable-termination-v1')}
                  autoFocus
                />
              </div>

              <div>
                <span className="label">{t('Input', 'ข้อมูลนำเข้า')}</span>
                <div className="grid gap-2 md:grid-cols-2">
                  {(
                    [
                      ['prpd_only', 'PRPD-only', t('One PRPD image per sample.', 'ภาพ PRPD หนึ่งภาพต่อหนึ่งตัวอย่าง')],
                      ['hybrid', 'Hybrid (PRPD + TF map)', t('A PRPD paired with the TF map from the same measurement.', 'ภาพ PRPD คู่กับ TF Map จากการวัดเดียวกัน')],
                    ] as const
                  ).map(([key, label, desc]) => (
                    <label key={key} className={`option-card ${kind === key ? 'on' : ''}`}>
                      <input type="radio" name="kind" checked={kind === key} onChange={() => setKind(key)} />
                      <span>
                        <span className="lbl">{label}</span>
                        <span className="desc">{desc}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <span className="label">{t('Classes', 'คลาส')}</span>
                <p className="field-help !mt-0 mb-2">
                  {t(
                    'What the model tells apart, the PD source each class is reported as, and how its gap-time becomes a severity.',
                    'สิ่งที่โมเดลแยกแยะ แหล่ง PD ที่รายงานของแต่ละคลาส และวิธีแปลง Gap-Time เป็นความรุนแรง',
                  )}
                </p>
                <div className="table-wrap rounded-lg border border-line">
                  <table className="data compact">
                    <thead>
                      <tr>
                        <th className="w-[150px]">{t('Class', 'คลาส')}</th>
                        <th>{t('PD source reported', 'แหล่ง PD ที่รายงาน')}</th>
                        <th className="w-[220px]">{t('Severity group', 'กลุ่มความรุนแรง')}</th>
                        <th className="w-[40px]" />
                      </tr>
                    </thead>
                    <tbody>
                      {classes.map((c, i) => (
                        <tr key={i}>
                          <td>
                            <input type="text" value={c.name} aria-label={`${t('Class', 'คลาส')} ${i + 1}`} onChange={(e) => updateClass(i, { name: e.target.value })} />
                          </td>
                          <td>
                            <input type="text" value={c.pd_source} aria-label={t('PD source', 'แหล่ง PD')} onChange={(e) => updateClass(i, { pd_source: e.target.value })} />
                          </td>
                          <td>
                            <select
                              value={c.severity_group}
                              aria-label={t('Severity group', 'กลุ่มความรุนแรง')}
                              onChange={(e) => updateClass(i, { severity_group: Number(e.target.value) as 1 | 2 })}
                            >
                              <option value={1}>{t('1 — Initial / Moderate / High', '1 — Initial / Moderate / High')}</option>
                              <option value={2}>{t('2 — Moderate / High', '2 — Moderate / High')}</option>
                            </select>
                          </td>
                          <td>
                            {classes.length > 2 && (
                              <button
                                type="button"
                                className="icon-only"
                                aria-label={t(`Remove ${c.name}`, `ลบ ${c.name}`)}
                                onClick={() => setClasses((v) => v.filter((_, x) => x !== i))}
                              >
                                <XIcon />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="input-row mt-2 max-w-[420px]">
                  <input type="text" value={newClass} placeholder={t('Add another class', 'เพิ่มคลาส')} onChange={(e) => setNewClass(e.target.value)} />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!newClass.trim() || classes.some((c) => c.name === newClass.trim())}
                    onClick={() => {
                      setClasses((v) => [...v, { name: newClass.trim(), pd_source: `${newClass.trim()} discharge`, severity_group: 1 }]);
                      setNewClass('');
                    }}
                  >
                    {t('Add', 'เพิ่ม')}
                  </button>
                </div>
                {isCustomClasses && (
                  <p className="callout callout-amber mt-2 text-[13.5px]">
                    {t(
                      'Custom class set: the Terminations / Joint rule needs both Surface and Internal, and the Internal sanity check needs Internal. Without them those rules switch off.',
                      'ชุดคลาสกำหนดเอง: กฎ Terminations / Joint ต้องมีทั้ง Surface และ Internal และการตรวจสอบ Internal ต้องมี Internal ถ้าไม่มี กฎเหล่านั้นจะปิดไป',
                    )}
                  </p>
                )}
              </div>

              <Collapse title={t('Training settings', 'การตั้งค่าการเทรน')} meta={`${maxEpochs} epochs · batch ${batchSize} · lr ${learningRate}`} flat>
                <p className="field-help !mt-0 mb-3">
                  {t(
                    'MobileNetV2 (ImageNet) transfer learning. Early stopping keeps the best epoch, so a run may stop before the limit.',
                    'ใช้ MobileNetV2 (ImageNet) แบบ transfer learning มี early stopping เก็บ epoch ที่ดีที่สุด จึงอาจหยุดก่อนครบ',
                  )}
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="label" htmlFor="max-epochs">
                      {t('Epochs (1–200)', 'Epochs (1–200)')}
                    </label>
                    <input id="max-epochs" type="number" min={1} max={200} value={maxEpochs} onChange={(e) => setMaxEpochs(e.target.value)} />
                  </div>
                  <div>
                    <label className="label" htmlFor="batch-size">
                      {t('Batch size (1–128)', 'Batch size (1–128)')}
                    </label>
                    <input id="batch-size" type="number" min={1} max={128} value={batchSize} onChange={(e) => setBatchSize(e.target.value)} />
                  </div>
                  <div>
                    <label className="label" htmlFor="learning-rate">
                      {t('Learning rate', 'Learning rate')}
                    </label>
                    <input
                      id="learning-rate"
                      type="number"
                      step="0.0001"
                      min={0.00001}
                      max={1}
                      value={learningRate}
                      onChange={(e) => setLearningRate(e.target.value)}
                    />
                  </div>
                </div>
              </Collapse>

              <label className={`option-card ${dataConsent ? 'on' : ''}`}>
                <input type="checkbox" checked={dataConsent} onChange={(e) => setDataConsent(e.target.checked)} />
                <span>
                  <span className="lbl">
                    {t('Share this dataset with the PhasePulse developers', 'แบ่งปันชุดข้อมูลนี้ให้ผู้พัฒนา PhasePulse')}{' '}
                    <span className="tag">{t('optional', 'ไม่บังคับ')}</span>
                  </span>
                  <span className="desc">
                    {t(
                      'The images, their classes and this run’s accuracy, used to improve the published models. Declining changes nothing about training.',
                      'ภาพ คลาส และความแม่นยำของการเทรนนี้ ใช้เพื่อปรับปรุงโมเดลตั้งต้น หากไม่ยินยอมก็ยังเทรนได้ตามปกติ',
                    )}
                  </span>
                </span>
              </label>
            </div>
          )}

          {/* ============================ STEP 2 ============================ */}
          {step === 1 && dataset && model && (
            <div className="stack">
              <input
                ref={datasetFolderInput}
                type="file"
                className="hidden"
                multiple
                // @ts-expect-error non-standard attribute that turns the picker into a folder picker
                webkitdirectory=""
                directory=""
                onChange={(e) => {
                  uploadDatasetFolder(e.target.files);
                  e.target.value = '';
                }}
              />

              <div className="grid items-center gap-3 rounded-[10px] border border-primary-line bg-primary-soft p-4 md:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <b>{t('Upload the whole dataset folder at once', 'อัปโหลดทั้งโฟลเดอร์ชุดข้อมูลในครั้งเดียว')}</b>
                  <p className="hint text-[13.5px]">
                    {t(
                      `Structure: train / test / valid, each with one folder per class (${model.class_names.join(', ')}).`,
                      `โครงสร้าง: train / test / valid แต่ละโฟลเดอร์มีโฟลเดอร์ย่อยตามคลาส (${model.class_names.join(', ')})`,
                    )}
                    {kind === 'hybrid' &&
                      t(' Hybrid: put <case>_PRPD and <case>_TF side by side.', ' Hybrid: วาง <case>_PRPD และ <case>_TF ไว้ด้วยกัน')}
                  </p>
                </div>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => datasetFolderInput.current?.click()}>
                  <FolderIcon />
                  {t('Choose dataset folder', 'เลือกโฟลเดอร์ชุดข้อมูล')}
                </button>
              </div>

              {progress && (
                <div>
                  <div className="mb-1 flex justify-between text-[14px] font-semibold">
                    <span>
                      {t('Uploading', 'กำลังอัปโหลด')} {progress.label}…
                    </span>
                    <span className="font-mono">{Math.round(progress.value * 100)}%</span>
                  </div>
                  <div className="progress">
                    <i style={{ width: `${Math.round(progress.value * 100)}%` }} />
                  </div>
                </div>
              )}
              {!progress && lastUpload && (
                <div key={lastUpload.stamp}>
                  <UploadBanner
                    title={t(`${lastUpload.count} image(s) added`, `เพิ่มแล้ว ${lastUpload.count} ภาพ`)}
                    detail={lastUpload.detail}
                  />
                </div>
              )}

              <div className="readout-grid">
                {SPLIT_KEYS.map((key) => (
                  <div className="readout" key={key}>
                    <div className="lbl">
                      {splitLabel(key)} · {t('target', 'แนะนำ')} {dataset.recommended[key]}%
                    </div>
                    <div className="val">
                      {dataset.totals[key]} <span className="text-[13px] text-muted">({dataset.percentages[key]}%)</span>
                    </div>
                  </div>
                ))}
                <div className="readout">
                  <div className="lbl">{kind === 'hybrid' ? t('Total pairs', 'คู่ทั้งหมด') : t('Total images', 'ภาพทั้งหมด')}</div>
                  <div className="val">{dataset.total}</div>
                </div>
              </div>

              <div>
                <p className="hint mb-2 text-[13.5px]">
                  {t('Or fill one class and split at a time — pick a folder or individual files:', 'หรือเพิ่มทีละคลาสและชุด — เลือกเป็นโฟลเดอร์หรือเลือกไฟล์ก็ได้:')}
                </p>
                {model.class_names.map((cls) => (
                  <div className="dataset-row" key={cls}>
                    <div className="mb-2 flex items-center justify-between">
                      <b>{cls}</b>
                      <span className="text-[13px] text-muted">
                        {SPLIT_KEYS.reduce((sum, s) => sum + (dataset.per_class[cls]?.[s] ?? 0), 0)} {t('sample(s)', 'ตัวอย่าง')}
                      </span>
                    </div>
                    <div className="dataset-splits">
                      {SPLIT_KEYS.map((split) => (
                        <SplitSlot
                          key={split}
                          label={splitLabel(split)}
                          count={dataset.per_class[cls]?.[split] ?? 0}
                          files={dataset.raw_per_class[cls]?.[split] ?? 0}
                          hybrid={kind === 'hybrid'}
                          landed={landed[`${split}/${cls}`] ?? 0}
                          busy={busy}
                          onFiles={(list) => uploadSlot(split, cls, list)}
                          onClear={() => void clearSlot(split, cls)}
                          t={t}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {rejected.length > 0 && (
                <div className="callout callout-red">
                  <b>{t(`${rejected.length} file(s) not accepted`, `ไม่รับ ${rejected.length} ไฟล์`)}</b>
                  <ul className="bullets mt-1">
                    {rejected.slice(0, 6).map((r) => (
                      <li key={r.filename}>
                        <code>{r.filename}</code> — {serverText(r.reason, t)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {blocking.length > 0 && (
                <div className="callout callout-amber">
                  <b>{t('Still needed before training', 'ยังต้องเพิ่มก่อนเทรน')}</b>
                  <ul className="bullets mt-1">
                    {blocking.map((b) => (
                      <li key={b}>{serverText(b, t)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {warnings.length > 0 && (
                <div className="callout">
                  <b>{t('Worth checking', 'ควรตรวจสอบ')}</b>
                  <ul className="bullets mt-1">
                    {warnings.map((w) => (
                      <li key={w}>{serverText(w, t)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ============================ STEP 3 ============================ */}
          {step === 2 && (
            <div className="stack">
              <p className="hint">
                {t(
                  'These are the thresholds the rule engine compares this model’s scores against. Adjust them here if your data calls for it; changes apply to your account.',
                  'นี่คือเกณฑ์ที่ใช้เทียบกับคะแนนของโมเดล ปรับได้ที่นี่หากข้อมูลต้องการ การเปลี่ยนแปลงมีผลกับบัญชีของคุณ',
                )}
              </p>
              <ThresholdsPanel compact />
              <label className={`option-card ${checklistConfirmed ? 'on' : ''}`}>
                <input type="checkbox" checked={checklistConfirmed} onChange={(e) => setChecklistConfirmed(e.target.checked)} />
                <span>
                  <span className="lbl">
                    {t('The labels are checked and there is no leakage between splits', 'ตรวจป้ายกำกับแล้ว และไม่มีข้อมูลรั่วระหว่างชุด')}{' '}
                    <span className="text-danger">*</span>
                  </span>
                  <span className="desc">
                    {t(
                      'No image, or image from the same measurement, is in both the training and the test set.',
                      'ไม่มีภาพเดียวกันหรือภาพจากการวัดเดียวกันอยู่ทั้งในชุดฝึกและชุดทดสอบ',
                    )}
                  </span>
                </span>
              </label>
            </div>
          )}

          {/* ============================ STEP 4 ============================ */}
          {step === 3 && model && (
            <div className="stack">
              {running && (
                <div>
                  <div className="mb-1 flex justify-between text-[14.5px] font-semibold">
                    <span>{stageText(model.stage, t) || t('Starting…', 'กำลังเริ่ม…')}</span>
                    <span className="font-mono">{model.progress}%</span>
                  </div>
                  <div className="progress">
                    <i style={{ width: `${Math.max(4, model.progress)}%` }} />
                  </div>
                  <p className="hint mt-3">
                    {t('You can close this window; training continues on the server.', 'ปิดหน้าต่างนี้ได้ การเทรนจะทำต่อบนเซิร์ฟเวอร์')}
                  </p>
                </div>
              )}
              {model.status === 'completed' && (
                <>
                  <div className="flex items-center gap-3">
                    <DoneBadge />
                    <b className="text-[17px]">{t('Training finished', 'เทรนเสร็จแล้ว')}</b>
                  </div>
                  <div className="readout-grid">
                    <div className="readout">
                      <div className="lbl">{t('Test accuracy', 'ความแม่นยำ (ทดสอบ)')}</div>
                      <div className="val">{model.accuracy != null ? `${model.accuracy}%` : '-'}</div>
                    </div>
                    <div className="readout">
                      <div className="lbl">{t('Validation accuracy', 'ความแม่นยำ (ตรวจสอบ)')}</div>
                      <div className="val">{model.val_accuracy != null ? `${model.val_accuracy}%` : '-'}</div>
                    </div>
                    <div className="readout">
                      <div className="lbl">Loss</div>
                      <div className="val">{model.loss ?? '-'}</div>
                    </div>
                    <div className="readout">
                      <div className="lbl">{t('Epochs', 'Epochs')}</div>
                      <div className="val">{model.epochs}</div>
                    </div>
                  </div>
                  <p className={`callout ${model.engine_used === 'simulated' ? 'callout-amber' : ''}`}>
                    {model.engine_used === 'simulated'
                      ? t('Simulated run — these figures are not a measured accuracy.', 'การเทรนแบบจำลอง — ตัวเลขนี้ไม่ใช่ความแม่นยำที่วัดจริง')
                      : t(
                          'Close this window to see the learning curve, the confusion matrix and the test images the model got wrong.',
                          'ปิดหน้าต่างนี้เพื่อดูกราฟการเรียนรู้ confusion matrix และภาพทดสอบที่โมเดลทายผิด',
                        )}
                  </p>
                </>
              )}
              {model.status === 'failed' && (
                <p className="callout callout-red">
                  <b>{t('The run failed.', 'การเทรนล้มเหลว')}</b> {serverText(model.error, t)}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" type="button" onClick={() => (done || running ? onClose() : void cancel())}>
            {done || running ? t('Close', 'ปิด') : t('Cancel', 'ยกเลิก')}
          </button>
          <div className="flex items-center gap-2">
            {step === 0 && (
              <button className="btn btn-primary" type="button" disabled={busy || !name.trim()} onClick={() => void createDraft()}>
                {t('Next: add data', 'ถัดไป: เพิ่มข้อมูล')}
              </button>
            )}
            {step === 1 && (
              <button className="btn btn-primary" type="button" disabled={busy || blocking.length > 0} onClick={() => setStep(2)}>
                {t('Next: check criteria', 'ถัดไป: ตรวจเกณฑ์')}
              </button>
            )}
            {step === 2 && (
              <>
                <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => setStep(1)}>
                  {t('Back to data', 'กลับไปที่ข้อมูล')}
                </button>
                <button
                  className="btn btn-success"
                  type="button"
                  disabled={busy || !checklistConfirmed || blocking.length > 0}
                  onClick={() => void train()}
                >
                  <CheckIcon />
                  {t('Start training', 'เริ่มเทรน')}
                </button>
              </>
            )}
            {step === 3 && done && (
              <button className="btn btn-primary" type="button" onClick={onClose}>
                {t('View results', 'ดูผลลัพธ์')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SplitSlot({
  label,
  count,
  files,
  hybrid,
  landed,
  busy,
  onFiles,
  onClear,
  t,
}: {
  label: string;
  count: number;
  files: number;
  hybrid: boolean;
  landed: number;
  busy: boolean;
  onFiles: (list: FileList | null) => void;
  onClear: () => void;
  t: T;
}) {
  const folderInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className={`split-slot ${count ? 'filled' : ''}`}>
      <input
        ref={folderInput}
        type="file"
        className="hidden"
        multiple
        // @ts-expect-error non-standard attribute that turns the picker into a folder picker
        webkitdirectory=""
        directory=""
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        multiple
        accept=".jpg,.jpeg,.png,.bmp"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <div className="top">
        <span className="lbl">{label}</span>
        {landed > 0 && <DoneBadge small key={landed} />}
      </div>
      <div className="val">{count}</div>
      <div className="sub">
        {hybrid && files !== count * 2
          ? t(`${files} file(s), ${count} pair(s)`, `${files} ไฟล์ ${count} คู่`)
          : hybrid
            ? t('pairs', 'คู่')
            : t('images', 'ภาพ')}
      </div>
      <div className="actions">
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => folderInput.current?.click()}>
          <FolderIcon />
          {t('Folder', 'โฟลเดอร์')}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => fileInput.current?.click()}>
          <ImageIcon />
          {t('Files', 'ไฟล์')}
        </button>
        {files > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onClear} title={t('Remove these images', 'ลบภาพเหล่านี้')}>
            <TrashIcon />
            {t('Clear', 'ล้าง')}
          </button>
        )}
      </div>
    </div>
  );
}
