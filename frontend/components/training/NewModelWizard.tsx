'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ThresholdsPanel } from '@/components/settings/ThresholdsPanel';
import { CheckIcon, FolderIcon, ImageIcon, TrashIcon, XIcon } from '@/components/ui/icons';
import { Collapse, DoneBadge, UploadBanner } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
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

/** Hybrid first: when both are trained, its pair counts are the ones shown. */
const KINDS: ModelKind[] = ['hybrid', 'prpd_only'];

const POLL_MS = 1200;

type T = <V = string>(en: V, th: V) => V;

type PerKind<V> = Partial<Record<ModelKind, V>>;

interface DatasetState {
  dataset: DatasetSummary;
  blocking: string[];
  warnings: string[];
}

function relPath(f: File): string {
  return (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
}

/** Mirrors backend detect.filename_suggests_tf, which pairs Hybrid samples. */
function isTfMap(f: File): boolean {
  const lower = f.name.toLowerCase();
  return lower.includes('tf') || lower.includes('twmap');
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
  // Nothing is ticked up front: the account picks which model(s) to build.
  const [kinds, setKinds] = useState<Record<ModelKind, boolean>>({ prpd_only: false, hybrid: false });
  const [names, setNames] = useState<Record<ModelKind, string>>({ prpd_only: '', hybrid: '' });
  const [classes, setClasses] = useState<ClassSpec[]>(PUBLISHED_CLASSES);
  const [newClass, setNewClass] = useState('');
  const [maxEpochs, setMaxEpochs] = useState('12');
  const [batchSize, setBatchSize] = useState('16');
  const [learningRate, setLearningRate] = useState('0.001');

  const [drafts, setDrafts] = useState<PerKind<TrainedModelDetail>>({});
  const [data, setData] = useState<PerKind<DatasetState>>({});
  const [rejected, setRejected] = useState<{ filename: string; reason: string }[]>([]);
  const [landed, setLanded] = useState<Record<string, number>>({});
  const [lastUpload, setLastUpload] = useState<{ count: number; detail: string; stamp: number } | null>(null);
  const [progress, setProgress] = useState<{ label: string; value: number } | null>(null);

  const [busy, setBusy] = useState(false);
  const [checklistConfirmed, setChecklistConfirmed] = useState(false);
  const [askConsent, setAskConsent] = useState(false);
  const [runs, setRuns] = useState<TrainedModelDetail[]>([]);
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
  const kindLabel = (k: ModelKind) => (k === 'hybrid' ? 'Hybrid (PRPD + TF map)' : 'PRPD-only');

  const isCustomClasses =
    classes.length !== PUBLISHED_CLASSES.length || classes.some((c, i) => c.name !== PUBLISHED_CLASSES[i].name);

  const chosenKinds = KINDS.filter((k) => kinds[k]);
  const draftKinds = KINDS.filter((k) => drafts[k]);
  const primary = draftKinds[0];
  const primaryData = primary ? data[primary] : undefined;
  const classNames = primary ? drafts[primary]!.class_names : [];
  const both = draftKinds.length === 2;
  const withHybrid = !!drafts.hybrid;
  const readyKinds = draftKinds.filter((k) => (data[k]?.blocking.length ?? 1) === 0);

  function updateClass(index: number, patch: Partial<ClassSpec>) {
    setClasses((v) => v.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function applyResult(kind: ModelKind, r: DatasetState) {
    setData((prev) => ({ ...prev, [kind]: { dataset: r.dataset, blocking: r.blocking, warnings: r.warnings } }));
  }

  async function discardDrafts(list: PerKind<TrainedModelDetail>) {
    for (const d of Object.values(list)) {
      if (d && d.status === 'draft') {
        try {
          await api.deleteModel(d.id);
        } catch {
          /* closing matters more than tidying up */
        }
      }
    }
  }

  // ------------------------------------------------------------ step 1 → 2
  async function createDrafts() {
    if (chosenKinds.length === 0) return;
    setBusy(true);
    const created: PerKind<TrainedModelDetail> = {};
    try {
      for (const kind of chosenKinds) {
        const draft = await api.createModel({
          name: names[kind].trim(),
          kind,
          classes: classes.map((c) => ({ ...c, name: c.name.trim() })),
          max_epochs: Number(maxEpochs),
          batch_size: Number(batchSize),
          learning_rate: Number(learningRate),
          backbone: 'mobilenetv2',
          // Asked in a dialog when training starts, not here.
          data_consent: false,
        });
        created[kind] = await api.getModel(draft.id);
      }
      setDrafts(created);
      for (const kind of chosenKinds) applyResult(kind, created[kind]!);
      setStep(1);
    } catch (e) {
      // Both drafts or neither: a name clash on the second must not leave the first behind.
      await discardDrafts(created);
      toast(e instanceof Error ? e.message : t('Could not create the model', 'สร้างโมเดลไม่สำเร็จ'));
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------ step 2
  /**
   * Upload one or more (split, class) groups in turn, with one progress bar.
   * Each group goes to every draft: all of it to Hybrid, and only the PRPD
   * images to PRPD-only.
   */
  async function uploadGroups(groups: { split: DatasetSplit; cls: string; files: File[] }[], skipped = 0) {
    if (draftKinds.length === 0 || groups.length === 0) return;
    const jobs = groups.flatMap((g) =>
      draftKinds
        .map((kind) => ({ ...g, kind, files: kind === 'prpd_only' ? g.files.filter((f) => !isTfMap(f)) : g.files }))
        .filter((job) => job.files.length > 0),
    );
    if (jobs.length === 0) {
      toast(t('Those were all TF maps. Add the PRPD images too.', 'ไฟล์ที่เลือกเป็น TF Map ทั้งหมด กรุณาเพิ่มภาพ PRPD ด้วย'));
      return;
    }

    setBusy(true);
    const allRejected = new Map<string, { filename: string; reason: string }>();
    const accepted = new Set<string>();
    try {
      for (let j = 0; j < jobs.length; j += 1) {
        const { split, cls, files, kind } = jobs[j];
        const label = `${cls} · ${splitLabel(split)}`;
        setProgress({ label, value: j / jobs.length });
        const r = await api.uploadTrainingData(drafts[kind]!.id, split, cls, files, (f) =>
          setProgress({ label, value: (j + f) / jobs.length }),
        );
        applyResult(kind, r);
        r.rejected.forEach((x) => allRejected.set(x.filename, x));
        r.accepted.forEach((name) => accepted.add(`${split}/${cls}/${name}`));
        setLanded((prev) => ({ ...prev, [`${split}/${cls}`]: (prev[`${split}/${cls}`] ?? 0) + 1 }));
      }
      setRejected([...allRejected.values()]);
      setLastUpload((prev) => ({
        count: accepted.size,
        detail:
          groups.length === 1
            ? `${groups[0].cls} · ${splitLabel(groups[0].split)}`
            : t(`${groups.length} class/split folders`, `${groups.length} โฟลเดอร์ย่อย`) +
              (skipped ? t(` · ${skipped} file(s) not placed`, ` · ${skipped} ไฟล์ไม่ทราบตำแหน่ง`) : '') +
              (allRejected.size ? t(` · ${allRejected.size} rejected`, ` · ปฏิเสธ ${allRejected.size}`) : ''),
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
    if (!primary) return;
    const buckets = new Map<string, { split: DatasetSplit; cls: string; files: File[] }>();
    let skipped = 0;
    for (const f of Array.from(list ?? [])) {
      if (!IMAGE_EXT.test(f.name)) continue;
      const place = placeFile(relPath(f), classNames);
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
    setBusy(true);
    try {
      for (const kind of draftKinds) applyResult(kind, await api.clearTrainingData(drafts[kind]!.id, split, cls));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not clear that folder', 'ล้างข้อมูลไม่สำเร็จ'));
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------ step 4
  const poll = useCallback(
    async (ids: number[]) => {
      try {
        const next = await Promise.all(ids.map((id) => api.getModel(id)));
        setRuns(next);
        if (next.every((m) => m.status === 'completed' || m.status === 'failed')) {
          if (!finishedRef.current) {
            finishedRef.current = true;
            onFinished();
          }
          return;
        }
      } catch {
        /* a dropped poll is not a failed run */
      }
      pollTimer.current = setTimeout(() => void poll(ids), POLL_MS);
    },
    [onFinished],
  );

  /** Runs once the share dialog is answered; either answer trains. */
  async function train(share: boolean) {
    setAskConsent(false);
    setBusy(true);
    const started: TrainedModelDetail[] = [];
    try {
      for (const kind of draftKinds) {
        const draft = drafts[kind]!;
        if (!readyKinds.includes(kind)) {
          // Not enough data for this one (e.g. Hybrid with no TF maps): drop it.
          await api.deleteModel(draft.id).catch(() => undefined);
          continue;
        }
        await api.setModelConsent(draft.id, share);
        started.push(await api.startTraining(draft.id));
      }
      setDrafts({});
      setRuns(started);
      setStep(3);
      finishedRef.current = false;
      pollTimer.current = setTimeout(() => void poll(started.map((m) => m.id)), POLL_MS);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not start training', 'เริ่มเทรนไม่สำเร็จ'));
      if (started.length) {
        setDrafts({});
        setRuns(started);
        setStep(3);
        pollTimer.current = setTimeout(() => void poll(started.map((m) => m.id)), POLL_MS);
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    await discardDrafts(drafts);
    onClose();
  }

  const running = runs.some((m) => m.status === 'queued' || m.status === 'running');
  const done = runs.length > 0 && !running;
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
              <div>
                <span className="label">{t('Which model(s) to train', 'โมเดลที่จะเทรน')}</span>
                <p className="field-help !mt-0 mb-2">
                  {t(
                    'Tick one or both. Both are trained from the same upload: PRPD-only uses the PRPD images, Hybrid pairs each PRPD with its TF map. Leave a name blank to have one chosen for you.',
                    'เลือกหนึ่งหรือทั้งสองแบบ ทั้งคู่เทรนจากการอัปโหลดชุดเดียวกัน PRPD-only ใช้ภาพ PRPD ส่วน Hybrid จับคู่ภาพ PRPD กับ TF Map เว้นชื่อว่างไว้เพื่อให้ระบบตั้งให้',
                  )}
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {(
                    [
                      ['prpd_only', 'PRPD-only', t('One PRPD image per sample.', 'ภาพ PRPD หนึ่งภาพต่อหนึ่งตัวอย่าง')],
                      ['hybrid', 'Hybrid (PRPD + TF map)', t('A PRPD paired with the TF map from the same measurement.', 'ภาพ PRPD คู่กับ TF Map จากการวัดเดียวกัน')],
                    ] as const
                  ).map(([key, label, desc]) => (
                    <div key={key} className={`option-card flex-col !items-stretch ${kinds[key] ? 'on' : ''}`}>
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={kinds[key]}
                          onChange={(e) => setKinds((v) => ({ ...v, [key]: e.target.checked }))}
                        />
                        <span>
                          <span className="lbl">{label}</span>
                          <span className="desc">{desc}</span>
                        </span>
                      </label>
                      {kinds[key] && (
                        <input
                          type="text"
                          className="mt-2"
                          value={names[key]}
                          aria-label={t(`${label} model name`, `ชื่อโมเดล ${label}`)}
                          placeholder={t(
                            `Name (optional), e.g. ${key === 'hybrid' ? 'cable-hybrid-v1' : 'cable-prpd-v1'}`,
                            `ชื่อ (ไม่บังคับ) เช่น ${key === 'hybrid' ? 'cable-hybrid-v1' : 'cable-prpd-v1'}`,
                          )}
                          onChange={(e) => setNames((v) => ({ ...v, [key]: e.target.value }))}
                        />
                      )}
                    </div>
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
            </div>
          )}

          {/* ============================ STEP 2 ============================ */}
          {step === 1 && primaryData && (
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
                      `Structure: train / test / valid, each with one folder per class (${classNames.join(', ')}).`,
                      `โครงสร้าง: train / test / valid แต่ละโฟลเดอร์มีโฟลเดอร์ย่อยตามคลาส (${classNames.join(', ')})`,
                    )}
                    {withHybrid
                      ? t(
                          ' Put each <case>_PRPD next to its <case>_TF map.',
                          ' วาง <case>_PRPD คู่กับ <case>_TF ไว้ในโฟลเดอร์เดียวกัน',
                        )
                      : t(' PRPD images only.', ' ใช้ภาพ PRPD เท่านั้น')}
                  </p>
                  {both && (
                    <p className="hint mt-1 text-[13.5px]">
                      {t(
                        'Training both: PRPD images go to both models, TF maps to Hybrid only. If you upload no TF maps, only the PRPD-only model is trained.',
                        'เทรนทั้งสองแบบ: ภาพ PRPD ใช้กับทั้งสองโมเดล ส่วน TF Map ใช้กับ Hybrid เท่านั้น ถ้าไม่อัปโหลด TF Map จะเทรนเฉพาะโมเดล PRPD-only',
                      )}
                    </p>
                  )}
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
                      {splitLabel(key)} · {t('target', 'แนะนำ')} {primaryData.dataset.recommended[key]}%
                    </div>
                    <div className="val">
                      {primaryData.dataset.totals[key]}{' '}
                      <span className="text-[13px] text-muted">({primaryData.dataset.percentages[key]}%)</span>
                    </div>
                  </div>
                ))}
                <div className="readout">
                  <div className="lbl">{withHybrid ? t('Total pairs', 'คู่ทั้งหมด') : t('Total images', 'ภาพทั้งหมด')}</div>
                  <div className="val">{primaryData.dataset.total}</div>
                </div>
              </div>

              <div>
                <p className="hint mb-2 text-[13.5px]">
                  {t('Or fill one class and split at a time — pick a folder or individual files:', 'หรือเพิ่มทีละคลาสและชุด — เลือกเป็นโฟลเดอร์หรือเลือกไฟล์ก็ได้:')}
                </p>
                {classNames.map((cls) => (
                  <div className="dataset-row" key={cls}>
                    <div className="mb-2 flex items-center justify-between">
                      <b>{cls}</b>
                      <span className="text-[13px] text-muted">
                        {SPLIT_KEYS.reduce((sum, s) => sum + (primaryData.dataset.per_class[cls]?.[s] ?? 0), 0)} {t('sample(s)', 'ตัวอย่าง')}
                      </span>
                    </div>
                    <div className="dataset-splits">
                      {SPLIT_KEYS.map((split) => (
                        <SplitSlot
                          key={split}
                          label={splitLabel(split)}
                          count={primaryData.dataset.per_class[cls]?.[split] ?? 0}
                          files={primaryData.dataset.raw_per_class[cls]?.[split] ?? 0}
                          prpdImages={both ? data.prpd_only?.dataset.per_class[cls]?.[split] ?? 0 : null}
                          hybrid={withHybrid}
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
              {draftKinds.map((kind) => {
                const d = data[kind];
                if (!d || (d.blocking.length === 0 && d.warnings.length === 0)) return null;
                return (
                  <div key={kind} className="stack !gap-2">
                    {d.blocking.length > 0 && (
                      <div className="callout callout-amber">
                        <b>
                          {both ? `${drafts[kind]!.name}: ` : ''}
                          {t('Still needed before training', 'ยังต้องเพิ่มก่อนเทรน')}
                        </b>
                        <ul className="bullets mt-1">
                          {d.blocking.map((b) => (
                            <li key={b}>{serverText(b, t)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {d.warnings.length > 0 && (
                      <div className="callout">
                        <b>
                          {both ? `${drafts[kind]!.name}: ` : ''}
                          {t('Worth checking', 'ควรตรวจสอบ')}
                        </b>
                        <ul className="bullets mt-1">
                          {d.warnings.map((w) => (
                            <li key={w}>{serverText(w, t)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ============================ STEP 3 ============================ */}
          {step === 2 && (
            <div className="stack">
              <div>
                <span className="label">{t('Models to train', 'โมเดลที่จะเทรน')}</span>
                <ul className="space-y-1">
                  {draftKinds.map((kind) => {
                    const ready = readyKinds.includes(kind);
                    return (
                      <li key={kind} className="flex flex-wrap items-center gap-2 text-[14.5px]">
                        <span className={`pill ${ready ? 'pill-green' : 'pill-gray'}`}>
                          {ready ? t('Will train', 'จะเทรน') : t('Skipped', 'ข้าม')}
                        </span>
                        <b>{drafts[kind]!.name}</b>
                        <span className="text-muted">· {kindLabel(kind)}</span>
                        {!ready && (
                          <span className="text-[13px] text-muted">
                            — {serverText(data[kind]?.blocking[0] ?? '', t)}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
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
          {step === 3 && (
            <div className="stack">
              {runs.map((model) => (
                <div key={model.id} className="rounded-[10px] border border-line p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {model.status === 'completed' && <DoneBadge />}
                    <b className="text-[16px]">{model.name}</b>
                    <span className="text-[13.5px] text-muted">{model.kind_label}</span>
                  </div>
                  {(model.status === 'queued' || model.status === 'running') && (
                    <div>
                      <div className="mb-1 flex justify-between text-[14.5px] font-semibold">
                        <span>{stageText(model.stage, t) || t('Starting…', 'กำลังเริ่ม…')}</span>
                        <span className="font-mono">{model.progress}%</span>
                      </div>
                      <div className="progress">
                        <i style={{ width: `${Math.max(4, model.progress)}%` }} />
                      </div>
                    </div>
                  )}
                  {model.status === 'completed' && (
                    <>
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
                      {model.engine_used === 'simulated' && (
                        <p className="callout callout-amber mt-3">
                          {t('Simulated run — these figures are not a measured accuracy.', 'การเทรนแบบจำลอง — ตัวเลขนี้ไม่ใช่ความแม่นยำที่วัดจริง')}
                        </p>
                      )}
                    </>
                  )}
                  {model.status === 'failed' && (
                    <p className="callout callout-red">
                      <b>{t('The run failed.', 'การเทรนล้มเหลว')}</b> {serverText(model.error, t)}
                    </p>
                  )}
                </div>
              ))}
              {running && (
                <p className="hint">
                  {t('You can close this window; training continues on the server.', 'ปิดหน้าต่างนี้ได้ การเทรนจะทำต่อบนเซิร์ฟเวอร์')}
                </p>
              )}
              {done && (
                <p className="hint">
                  {t(
                    'Close this window to see the learning curve, the confusion matrix and the test images each model got wrong.',
                    'ปิดหน้าต่างนี้เพื่อดูกราฟการเรียนรู้ confusion matrix และภาพทดสอบที่แต่ละโมเดลทายผิด',
                  )}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" type="button" onClick={() => (step === 3 ? onClose() : void cancel())}>
            {step === 3 ? t('Close', 'ปิด') : t('Cancel', 'ยกเลิก')}
          </button>
          <div className="flex items-center gap-2">
            {step === 0 && (
              <button className="btn btn-primary" type="button" disabled={busy || chosenKinds.length === 0} onClick={() => void createDrafts()}>
                {t('Next: add data', 'ถัดไป: เพิ่มข้อมูล')}
              </button>
            )}
            {step === 1 && (
              <button className="btn btn-primary" type="button" disabled={busy || readyKinds.length === 0} onClick={() => setStep(2)}>
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
                  disabled={busy || !checklistConfirmed || readyKinds.length === 0}
                  onClick={() => setAskConsent(true)}
                >
                  <CheckIcon />
                  {readyKinds.length > 1
                    ? t(`Start training ${readyKinds.length} models`, `เริ่มเทรน ${readyKinds.length} โมเดล`)
                    : t('Start training', 'เริ่มเทรน')}
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

      {askConsent && <ShareDialog onAnswer={(share) => void train(share)} onCancel={() => setAskConsent(false)} t={t} />}
    </div>
  );
}

/** Asked once, when training starts: may the developers have this dataset? */
function ShareDialog({ onAnswer, onCancel, t }: { onAnswer: (share: boolean) => void; onCancel: () => void; t: T }) {
  return (
    <div className="modal-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="share-title">
      <div className="modal-card">
        <div className="modal-head">
          <h2 id="share-title">{t('Share this dataset with the PhasePulse developers?', 'แบ่งปันชุดข้อมูลนี้ให้ผู้พัฒนา PhasePulse หรือไม่?')}</h2>
        </div>
        <div className="modal-body">
          <p>
            {t(
              'If you accept, the images, their classes and this run’s accuracy may be used to improve the published models. Your answer applies to every model in this run.',
              'หากยอมรับ ภาพ คลาส และความแม่นยำของการเทรนนี้อาจถูกใช้เพื่อปรับปรุงโมเดลตั้งต้น คำตอบนี้ใช้กับทุกโมเดลในการเทรนครั้งนี้',
            )}
          </p>
          <p className="hint mt-2">
            {t('Declining changes nothing about training. Either way, training starts now.', 'หากไม่ยอมรับ การเทรนก็ทำได้ตามปกติ ไม่ว่าเลือกแบบใดการเทรนจะเริ่มทันที')}
          </p>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" type="button" onClick={onCancel}>
            {t('Back', 'ย้อนกลับ')}
          </button>
          <div className="flex items-center gap-2">
            <button className="btn btn-secondary" type="button" onClick={() => onAnswer(false)}>
              {t('Decline', 'ไม่ยอมรับ')}
            </button>
            <button className="btn btn-primary" type="button" onClick={() => onAnswer(true)}>
              <CheckIcon />
              {t('Accept', 'ยอมรับ')}
            </button>
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
  prpdImages,
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
  /** PRPD-only image count, shown alongside the pairs when both models are built. */
  prpdImages: number | null;
  hybrid: boolean;
  landed: number;
  busy: boolean;
  onFiles: (list: FileList | null) => void;
  onClear: () => void;
  t: T;
}) {
  const folderInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const filled = count > 0 || (prpdImages ?? 0) > 0;

  return (
    <div className={`split-slot ${filled ? 'filled' : ''}`}>
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
        {prpdImages != null && t(` · ${prpdImages} PRPD`, ` · PRPD ${prpdImages}`)}
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
        {(files > 0 || (prpdImages ?? 0) > 0) && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onClear} title={t('Remove these images', 'ลบภาพเหล่านี้')}>
            <TrashIcon />
            {t('Clear', 'ล้าง')}
          </button>
        )}
      </div>
    </div>
  );
}
