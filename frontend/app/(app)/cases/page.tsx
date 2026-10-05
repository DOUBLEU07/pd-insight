'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { AssessmentChoice } from '@/components/case/AssessmentChoice';
import {
  ChartIcon,
  CheckIcon,
  ChevronRightIcon,
  DownloadIcon,
  FolderIcon,
  ImageIcon,
  PlayIcon,
  RejectIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from '@/components/ui/icons';
import { DoneBadge, EmptyRow, FoldToggle, Spinner, StatusBadge, UploadBanner, fmt, fmtDate, resultPillClass, severityPillClass } from '@/components/ui/primitives';
import { api, fileUrl } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useI18n } from '@/lib/i18n';
import type { BatchSummary, CalibrationPreset, PdCase } from '@/lib/types';

type Mode = 'single' | 'folder' | 'results';

const MAX_BATCH = 500;

// ---------------------------------------------------------------------------
// Filename rules, mirrored from backend/app/services/cv/detect.py so the
// preview counts match exactly what the import will do.
// ---------------------------------------------------------------------------
function baseName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}
function suggestsTf(filename: string): boolean {
  const lower = baseName(filename).toLowerCase();
  if (lower.includes('tf') || lower.includes('twmap')) return true;
  return false;
}
function caseKey(filename: string): string {
  return baseName(filename)
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/(prpd|tf|twmap|pattern)/g, '')
    .replace(/[^a-z0-9]+/g, '');
}
function extOf(name: string): string {
  return `.${(name.split('.').pop() ?? '').toLowerCase()}`;
}

/** Every file under a dropped folder (drag and drop gives entries, not a FileList). */
async function filesFromDrop(
  dt: DataTransfer,
): Promise<{ files: File[]; paths: string[]; folder: string | null }> {
  const entries = Array.from(dt.items ?? [])
    .map((item) => item.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e);
  if (entries.length === 0) {
    const files = Array.from(dt.files);
    return { files, paths: files.map((f) => f.name), folder: null };
  }

  const out: File[] = [];
  const paths: string[] = [];
  async function walk(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      out.push(await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej)));
      paths.push(entry.fullPath.replace(/^\//, ''));
      return;
    }
    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries hands back at most ~100 entries per call.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (batch.length === 0) break;
        for (const child of batch) await walk(child);
      }
    }
  }
  for (const entry of entries) await walk(entry);
  const folder = entries.length === 1 && entries[0].isDirectory ? entries[0].name : null;
  return { files: out, paths, folder };
}

/** The folder a staged file came from, as shown in the staged-folder list. */
function dirOf(path: string, fallback: string): string {
  const cut = path.lastIndexOf('/');
  return cut > 0 ? path.slice(0, cut) : fallback;
}

function CaseWorkflowPage() {
  const searchParams = useSearchParams();
  const urlMode = searchParams.get('mode');
  const mode: Mode = urlMode === 'folder' ? 'folder' : urlMode === 'results' ? 'results' : 'single';

  if (mode === 'results') return <ResultsView />;

  return (
    <div className="stack">
      <AssessmentChoice active={mode} />
      {mode === 'single' ? <SingleUpload /> : <FolderUpload />}
    </div>
  );
}

// ===========================================================================
// SINGLE IMAGE
// ===========================================================================
interface Slot {
  file: File | null;
  preview: string | null;
  error: string | null;
  warning: string | null;
  /** Bumped on every accepted file so the confirmation animation replays. */
  stamp: number;
}

const EMPTY_SLOT: Slot = { file: null, preview: null, error: null, warning: null, stamp: 0 };

function SingleUpload() {
  const router = useRouter();
  const { options, toast } = useApp();
  const { t } = useI18n();

  const [prpd, setPrpd] = useState<Slot>(EMPTY_SLOT);
  const [tf, setTf] = useState<Slot>(EMPTY_SLOT);
  const [running, setRunning] = useState(false);

  const allowed = options?.constants.allowed_extensions ?? ['.jpg', '.jpeg', '.png', '.bmp'];
  const allowedLabel = allowed.map((e) => e.replace('.', '').toUpperCase()).join(', ');

  function accept(slot: 'prpd' | 'tf', file: File | undefined) {
    if (!file) return;
    const setter = slot === 'prpd' ? setPrpd : setTf;

    if (!allowed.includes(extOf(file.name))) {
      setter({
        ...EMPTY_SLOT,
        error: t(`"${file.name}" is not a supported image. Use ${allowedLabel}.`, `"${file.name}" ไม่ใช่ไฟล์ภาพที่รองรับ ใช้ได้เฉพาะ ${allowedLabel}`),
      });
      return;
    }

    // A name that points at the other slot is worth flagging, not blocking:
    // plenty of real file names contain "tf" by accident.
    const looksTf = suggestsTf(file.name) && !/prpd|pattern/i.test(file.name);
    const looksPrpd = /prpd|pattern/i.test(file.name);
    const warning =
      slot === 'prpd' && looksTf
        ? t('The file name looks like a TF map. Check it is the PRPD image.', 'ชื่อไฟล์ดูเหมือน TF Map ตรวจสอบว่าเป็นภาพ PRPD')
        : slot === 'tf' && looksPrpd
          ? t('The file name looks like a PRPD image. Check it is the TF map.', 'ชื่อไฟล์ดูเหมือนภาพ PRPD ตรวจสอบว่าเป็น TF Map')
          : null;

    const reader = new FileReader();
    reader.onload = () =>
      setter((prev) => ({ file, preview: reader.result as string, error: null, warning, stamp: prev.stamp + 1 }));
    reader.onerror = () =>
      setter({ ...EMPTY_SLOT, error: t('The image could not be read.', 'ไม่สามารถอ่านไฟล์ภาพได้') });
    reader.readAsDataURL(file);
  }

  async function runAnalysis() {
    if (!prpd.file) return;
    setRunning(true);
    try {
      const form = new FormData();
      form.append('prpd', prpd.file);
      if (tf.file) form.append('tf', tf.file);
      const created = await api.uploadCase(form);
      toast(t(`Case ${created.case_base_name} created. Running analysis…`, `สร้างเคส ${created.case_base_name} แล้ว กำลังวิเคราะห์…`));
      router.push(`/cases/${created.id}?from=upload`);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Upload failed', 'อัปโหลดไม่สำเร็จ'));
      setRunning(false);
    }
  }

  const hybrid = !!tf.file;

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2 className="card-title"><FoldToggle />{t('Upload the images', 'อัปโหลดภาพ')}</h2>
          <p className="card-sub">
            {t(
              'A PRPD image alone runs the PRPD-only model. Add the TF map from the same measurement to use the Hybrid model.',
              'ภาพ PRPD อย่างเดียวใช้โมเดล PRPD-only หากเพิ่ม TF Map จากการวัดเดียวกันจะใช้โมเดล Hybrid',
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_minmax(260px,0.9fr)]">
        <DropZone
          slot={prpd}
          title={t('PRPD image', 'ภาพ PRPD')}
          required
          emptyDesc={t(`Required · ${allowedLabel}`, `จำเป็น · ${allowedLabel}`)}
          icon={<ChartIcon />}
          onFile={(f) => accept('prpd', f)}
          onClear={() => setPrpd(EMPTY_SLOT)}
        />
        <DropZone
          slot={tf}
          title={t('TF map image', 'ภาพ TF Map')}
          emptyDesc={t('Optional · switches to the Hybrid model', 'ไม่บังคับ · ใช้โมเดล Hybrid')}
          icon={<ImageIcon />}
          onFile={(f) => accept('tf', f)}
          onClear={() => setTf(EMPTY_SLOT)}
        />

        <div className="flex flex-col rounded-[10px] border border-line bg-surface-2 p-4">
          <h3 className="section-title">{t('Analysis setup', 'การตั้งค่าการวิเคราะห์')}</h3>
          <ul className="checks text-[14px]">
            <li>
              <CheckIcon />
              <span>
                {t('Model', 'โมเดล')}: <b>{hybrid ? 'Hybrid (PRPD + TF map)' : 'PRPD-only'}</b>
              </span>
            </li>
            <li>
              <CheckIcon />
              <span>{t('Classes: Corona, Surface, Internal', 'ประเภท: Corona, Surface, Internal')}</span>
            </li>
            <li>
              <CheckIcon />
              <span>{t('Your account’s decision thresholds', 'เกณฑ์ตัดสินของบัญชีคุณ')}</span>
            </li>
          </ul>
          <p className="hint mt-3 text-[13px]">
            {t(
              'Use a PRPD plot with readable discharge clusters. A TF map must come from the same measurement.',
              'ใช้ภาพ PRPD ที่เห็นกลุ่มการคายประจุชัดเจน และ TF Map ต้องมาจากการวัดเดียวกัน',
            )}
          </p>
          <div className="mt-auto pt-4">
            <button
              className="btn btn-primary btn-lg w-full"
              onClick={() => void runAnalysis()}
              disabled={!prpd.file || running}
              type="button"
            >
              {running ? <span className="spinner !border-white/40 !border-t-white" /> : <PlayIcon />}
              {running ? t('Analysing…', 'กำลังวิเคราะห์…') : t('Run analysis', 'เริ่มวิเคราะห์')}
            </button>
            {!prpd.file && (
              <p className="field-help text-center">{t('Add a PRPD image to continue.', 'เพิ่มภาพ PRPD เพื่อดำเนินการต่อ')}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function DropZone({
  slot,
  title,
  emptyDesc,
  icon,
  onFile,
  onClear,
  required = false,
}: {
  slot: Slot;
  title: string;
  emptyDesc: string;
  icon: ReactNode;
  onFile: (file: File | undefined) => void;
  onClear: () => void;
  required?: boolean;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const cls = slot.error ? 'invalid' : slot.file ? 'filled' : drag ? 'drag' : '';

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    onFile(e.dataTransfer.files?.[0]);
  }

  return (
    <div
      className={`dropzone ${cls}`}
      role="button"
      tabIndex={0}
      aria-label={title}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {slot.file && (
        <button
          type="button"
          className="icon-only dropzone-remove"
          title={t('Remove', 'นำออก')}
          aria-label={t('Remove', 'นำออก')}
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
        >
          <XIcon />
        </button>
      )}

      {slot.error ? (
        <>
          <span className="dropzone-icon">
            <RejectIcon />
          </span>
          <div className="dropzone-title">{t('File not accepted', 'ไม่รับไฟล์นี้')}</div>
          <div className="dropzone-desc">{slot.error}</div>
        </>
      ) : slot.file ? (
        <>
          {slot.preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="dropzone-thumb" src={slot.preview} alt="" />
          )}
          <div className="dropzone-file" key={slot.stamp}>
            <DoneBadge small />
            <span>
              {title} · {slot.file.name}
            </span>
          </div>
          <div className="text-[13px] font-semibold text-success">{t('Uploaded — click to replace', 'อัปโหลดแล้ว — คลิกเพื่อเปลี่ยน')}</div>
          {slot.warning && <div className="text-[13px] font-semibold text-warning">{slot.warning}</div>}
        </>
      ) : (
        <>
          <span className="dropzone-icon">{icon}</span>
          <div className="dropzone-title">
            {title} {required && <span className="text-danger">*</span>}
          </div>
          <div className="dropzone-desc">{emptyDesc}</div>
          <div className="mt-1 text-[13px] font-semibold text-primary-ink">
            {t('Click to choose, or drop the file here', 'คลิกเพื่อเลือก หรือลากไฟล์มาวาง')}
          </div>
        </>
      )}
    </div>
  );
}

// ===========================================================================
// FOLDER / BATCH
// ===========================================================================
interface Staged {
  files: File[];
  /** Folder of each entry in `files`, same order. */
  dirs: string[];
  skipped: number;
  folder: string | null;
  stamp: number;
}

function FolderUpload() {
  const router = useRouter();
  const { options, toast } = useApp();
  const { t, locale } = useI18n();

  const [staged, setStaged] = useState<Staged | null>(null);
  const [batchName, setBatchName] = useState('');
  const [presets, setPresets] = useState<CalibrationPreset[]>([]);
  const [presetId, setPresetId] = useState<string>('auto');
  const [progress, setProgress] = useState<number | null>(null);
  const [batches, setBatches] = useState<BatchSummary[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [drag, setDrag] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);

  const allowed = options?.constants.allowed_extensions ?? ['.jpg', '.jpeg', '.png', '.bmp'];

  const loadLists = useCallback(async () => {
    try {
      const [b, p] = await Promise.all([api.listBatches(), api.listPresets()]);
      setBatches(b.filter((x) => !x.is_single));
      setPresets(p);
    } catch {
      setBatches([]);
    }
  }, []);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  function stage(raw: File[], folder: string | null, paths?: string[]) {
    if (raw.length === 0) return;
    const rel = (f: File, i: number) =>
      paths?.[i] || (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const images = raw.map((f, i) => ({ f, path: rel(f, i) })).filter(({ f }) => allowed.includes(extOf(f.name)));
    const kept = images.slice(0, MAX_BATCH);
    const skipped = raw.length - images.length;
    const first = rel(raw[0], 0);
    const name = folder ?? (first.includes('/') ? first.split('/')[0] : null);
    const loose = t('Selected files', 'ไฟล์ที่เลือก');
    setStaged((prev) => ({
      files: kept.map(({ f }) => f),
      dirs: kept.map(({ path }) => dirOf(path, name ?? loose)),
      skipped,
      folder: name,
      stamp: (prev?.stamp ?? 0) + 1,
    }));
    setBatchName(name || `Batch ${new Date().toLocaleDateString(locale)}`);
    if (images.length > MAX_BATCH) {
      toast(
        t(
          `Only the first ${MAX_BATCH} of ${images.length} images were kept.`,
          `เก็บไว้เฉพาะ ${MAX_BATCH} ภาพแรกจาก ${images.length} ภาพ`,
        ),
      );
    }
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    const { files, paths, folder } = await filesFromDrop(e.dataTransfer);
    stage(files, folder, paths);
  }

  const stats = useMemo(() => {
    const files = staged?.files ?? [];
    const prpds = files.filter((f) => !suggestsTf(f.name));
    const tfs = files.filter((f) => suggestsTf(f.name));
    const tfKeys = new Set(tfs.map((f) => caseKey(f.name)));
    const prpdKeys = new Set(prpds.map((f) => caseKey(f.name)));
    const pairs = prpds.filter((f) => tfKeys.has(caseKey(f.name))).length;
    return {
      cases: prpdKeys.size,
      pairs,
      prpdOnly: prpdKeys.size - pairs,
      orphanTf: tfs.filter((f) => !prpdKeys.has(caseKey(f.name))).length,
    };
  }, [staged]);

  async function importBatch() {
    if (!staged || staged.files.length === 0) return;
    setProgress(0);
    try {
      const batch = await api.createBatch(batchName.trim() || staged.folder || 'Batch');
      const result = await api.uploadFolder(batch.id, staged.files, {
        presetId: presetId === 'auto' ? null : Number(presetId),
        onProgress: (f) => setProgress(f),
      });
      toast(
        t(
          `Imported ${result.created.length} case(s)` + (result.rejected.length ? `, ${result.rejected.length} file(s) skipped` : ''),
          `นำเข้า ${result.created.length} เคส` + (result.rejected.length ? ` ข้าม ${result.rejected.length} ไฟล์` : ''),
        ),
      );
      router.push(`/batches/${batch.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Import failed', 'นำเข้าไม่สำเร็จ'));
      setProgress(null);
    }
  }

  /** Staged sub-folders and how many images each holds, in first-seen order. */
  const stagedDirs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of staged?.dirs ?? []) counts.set(d, (counts.get(d) ?? 0) + 1);
    return [...counts.entries()];
  }, [staged]);

  function unstageDir(dir: string) {
    setStaged((prev) => {
      if (!prev) return prev;
      const keep = prev.dirs.map((d) => d !== dir);
      const files = prev.files.filter((_, i) => keep[i]);
      if (files.length === 0) return null;
      return { ...prev, files, dirs: prev.dirs.filter((_, i) => keep[i]) };
    });
  }

  async function removeBatch(b: BatchSummary) {
    if (
      !window.confirm(
        t(
          `Move folder "${b.name}" and its ${b.total} case(s) to the trash? You can restore it for 30 days.`,
          `ย้ายโฟลเดอร์ "${b.name}" และ ${b.total} เคสไปถังขยะ? กู้คืนได้ภายใน 30 วัน`,
        ),
      )
    )
      return;
    try {
      await api.deleteBatch(b.id);
      toast(t(`Moved ${b.name} to the trash`, `ย้าย ${b.name} ไปถังขยะแล้ว`));
      void loadLists();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Delete failed', 'ลบไม่สำเร็จ'));
    }
  }

  const uploading = progress !== null;
  const visibleBatches = showAll ? batches ?? [] : (batches ?? []).slice(0, 6);

  return (
    <>
      <section className="card">
        <input
          ref={folderInput}
          type="file"
          className="hidden"
          multiple
          // @ts-expect-error non-standard attribute that turns the picker into a folder picker
          webkitdirectory=""
          directory=""
          onChange={(e) => {
            stage(Array.from(e.target.files ?? []), null);
            e.target.value = '';
          }}
        />
        <input
          ref={filesInput}
          type="file"
          className="hidden"
          multiple
          accept="image/*"
          onChange={(e) => {
            stage(Array.from(e.target.files ?? []), null);
            e.target.value = '';
          }}
        />

        <div className="card-head">
          <div>
            <h2 className="card-title"><FoldToggle />{t('Upload a folder', 'อัปโหลดโฟลเดอร์')}</h2>
            <p className="card-sub">
              {t(
                `Up to ${MAX_BATCH} images. PRPD and TF map files are paired by name (<case>_PRPD / <case>_TF); a PRPD without a TF map is analysed on its own.`,
                `สูงสุด ${MAX_BATCH} ภาพ ระบบจับคู่ PRPD กับ TF Map ตามชื่อไฟล์ (<case>_PRPD / <case>_TF) ภาพ PRPD ที่ไม่มีคู่จะวิเคราะห์แบบ PRPD-only`,
              )}
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div
            className={`dropzone ${drag ? 'drag' : staged ? 'filled' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => void onDrop(e)}
            onClick={() => !uploading && folderInput.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && folderInput.current?.click()}
          >
            <span className="dropzone-icon">
              <FolderIcon />
            </span>
            <div className="dropzone-title">
              {staged ? t('Choose a different folder', 'เลือกโฟลเดอร์อื่น') : t('Choose a folder', 'เลือกโฟลเดอร์')}
            </div>
            <div className="dropzone-desc">
              {t('Click to pick a folder, or drop a folder here.', 'คลิกเพื่อเลือกโฟลเดอร์ หรือลากโฟลเดอร์มาวาง')}
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={uploading}
                onClick={(e) => {
                  e.stopPropagation();
                  folderInput.current?.click();
                }}
              >
                <FolderIcon />
                {t('Choose folder', 'เลือกโฟลเดอร์')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={uploading}
                onClick={(e) => {
                  e.stopPropagation();
                  filesInput.current?.click();
                }}
              >
                <ImageIcon />
                {t('Select image files instead', 'เลือกเป็นไฟล์ภาพแทน')}
              </button>
            </div>
          </div>

          <div className="min-w-0">
            {!staged ? (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-[10px] border border-line bg-surface-2 p-5 text-center text-muted">
                <UploadIcon width={26} height={26} />
                <p className="mt-2">{t('No folder selected yet.', 'ยังไม่ได้เลือกโฟลเดอร์')}</p>
              </div>
            ) : (
              <div className="space-y-3" key={staged.stamp}>
                <UploadBanner
                  title={t(`${staged.files.length} images loaded`, `โหลดแล้ว ${staged.files.length} ภาพ`)}
                  detail={
                    (staged.folder ? `${staged.folder} · ` : '') +
                    t(`${stats.cases} case(s) will be created`, `จะสร้าง ${stats.cases} เคส`)
                  }
                />
                <div className="stat-chips">
                  <div>
                    <b>{stats.pairs}</b>
                    <span>{t('PRPD + TF pairs', 'คู่ PRPD + TF')}</span>
                  </div>
                  <div>
                    <b>{stats.prpdOnly}</b>
                    <span>{t('PRPD only', 'PRPD อย่างเดียว')}</span>
                  </div>
                  <div className={stats.orphanTf ? 'warn' : ''}>
                    <b>{stats.orphanTf}</b>
                    <span>{t('TF without PRPD', 'TF ไม่มีคู่')}</span>
                  </div>
                  <div className={staged.skipped ? 'warn' : ''}>
                    <b>{staged.skipped}</b>
                    <span>{t('Not images', 'ไม่ใช่ภาพ')}</span>
                  </div>
                </div>
                <div>
                  <span className="label">{t('Folders in this upload', 'โฟลเดอร์ที่จะอัปโหลด')}</span>
                  <ul className="folder-chips">
                    {stagedDirs.map(([dir, count]) => (
                      <li key={dir} title={dir}>
                        <FolderIcon />
                        <span>{dir}</span>
                        <small>{count}</small>
                        <button
                          type="button"
                          className="icon-only"
                          disabled={uploading}
                          aria-label={t(`Remove ${dir}`, `เอา ${dir} ออก`)}
                          title={t('Remove this folder from the upload', 'เอาโฟลเดอร์นี้ออกจากการอัปโหลด')}
                          onClick={() => unstageDir(dir)}
                        >
                          <XIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="file-list" aria-label={t('Selected files', 'ไฟล์ที่เลือก')}>
                  {staged.files.slice(0, 60).map((f, i) => (
                    <div key={`${f.name}-${i}`} title={f.name}>
                      <span>{f.name}</span>
                      <small>{suggestsTf(f.name) ? 'TF' : 'PRPD'}</small>
                    </div>
                  ))}
                  {staged.files.length > 60 && (
                    <div className="text-muted">
                      <span>{t(`+ ${staged.files.length - 60} more`, `และอีก ${staged.files.length - 60} ไฟล์`)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {staged && (
          <div className="mt-4 grid gap-4 border-t border-line pt-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div>
              <label className="label" htmlFor="batch-name">
                {t('Folder name', 'ชื่อชุดข้อมูล')}
              </label>
              <input id="batch-name" type="text" value={batchName} onChange={(e) => setBatchName(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="batch-preset">
                {t('Plot axes', 'แกนของกราฟ')}
              </label>
              <select id="batch-preset" value={presetId} onChange={(e) => setPresetId(e.target.value)}>
                <option value="auto">{t('Automatic — saved preset for the image size, else auto-detect', 'อัตโนมัติ — ใช้ค่าที่บันทึกไว้ตามขนาดภาพ หรือตรวจจับเอง')}</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.preset_name} ({p.image_width}×{p.image_height})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary" disabled={uploading} onClick={() => setStaged(null)}>
                {t('Clear', 'ล้าง')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={uploading || stats.cases === 0}
                onClick={() => void importBatch()}
              >
                <UploadIcon />
                {t(`Import ${stats.cases} case(s)`, `นำเข้า ${stats.cases} เคส`)}
              </button>
            </div>
          </div>
        )}

        {uploading && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[14px] font-semibold">
              <span>
                {progress !== null && progress >= 1
                  ? t('Upload complete — creating cases…', 'อัปโหลดครบแล้ว — กำลังสร้างเคส…')
                  : t('Uploading images…', 'กำลังอัปโหลดภาพ…')}
              </span>
              <span className="font-mono">{Math.round((progress ?? 0) * 100)}%</span>
            </div>
            <div className={`progress ${progress !== null && progress >= 1 ? 'indeterminate' : ''}`}>
              <i style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
            </div>
          </div>
        )}

        <p className="hint mt-3 text-[13px]">
          {t(
            'Axes are checked once in the first case: after adjusting them there, use "Copy axes to the rest of this folder".',
            'ปรับแกนเพียงครั้งเดียวที่เคสแรก แล้วกด "คัดลอกแกนไปยังเคสที่เหลือในโฟลเดอร์นี้"',
          )}
        </p>
      </section>

      <section className="card table-card">
        <div className="card-head">
          <h2 className="card-title"><FoldToggle />{t('Imported folders', 'โฟลเดอร์ที่นำเข้าแล้ว')}</h2>
        </div>
        {batches === null ? (
          <Spinner />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t('Folder', 'โฟลเดอร์')}</th>
                  <th>{t('Uploaded', 'วันที่')}</th>
                  <th>{t('Reviewed', 'ตรวจแล้ว')}</th>
                  <th>{t('Status', 'สถานะ')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleBatches.map((b) => (
                  <tr key={b.id} className="row-hover">
                    <td>
                      <b>{b.name}</b>
                    </td>
                    <td className="whitespace-nowrap text-muted">{fmtDate(b.upload_date, locale)}</td>
                    <td className="num">
                      {b.done}/{b.total}
                    </td>
                    <td>
                      <StatusBadge status={b.overall_status} />
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => router.push(`/batches/${b.id}`)}>
                        {t('Open', 'เปิด')}
                      </button>
                      <button
                        type="button"
                        className="icon-only ml-1 align-middle text-muted hover:text-danger"
                        aria-label={t(`Delete folder ${b.name}`, `ลบโฟลเดอร์ ${b.name}`)}
                        title={t('Move this folder to the trash', 'ย้ายโฟลเดอร์นี้ไปถังขยะ')}
                        onClick={() => void removeBatch(b)}
                      >
                        <XIcon />
                      </button>
                    </td>
                  </tr>
                ))}
                {batches.length === 0 && <EmptyRow colSpan={5}>{t('No folders imported yet.', 'ยังไม่มีโฟลเดอร์ที่นำเข้า')}</EmptyRow>}
              </tbody>
            </table>
          </div>
        )}
        {(batches?.length ?? 0) > 6 && (
          <div className="px-5 pb-3">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? t('Show fewer', 'แสดงน้อยลง') : t(`Show all ${batches?.length}`, `แสดงทั้งหมด ${batches?.length}`)}
            </button>
          </div>
        )}
      </section>
    </>
  );
}

// ===========================================================================
// RESULTS
// ===========================================================================
const PAGE = 50;

function ResultsView() {
  const router = useRouter();
  const { toast } = useApp();
  const { t, locale } = useI18n();

  const [cases, setCases] = useState<PdCase[] | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'open' | 'done'>('all');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [includePending, setIncludePending] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      setCases(await api.listCases());
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not load cases', 'โหลดเคสไม่สำเร็จ'));
      setCases([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (cases ?? [])
      .filter((c) => (status === 'all' ? true : status === 'done' ? c.status === 'done' : c.status !== 'done'))
      .filter(
        (c) =>
          !q ||
          [c.case_base_name, c.ai_final_result, c.confirmed_pd_source_type, c.defect_name, c.severity_by_gap_time]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
      )
      .sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0));
  }, [cases, query, status]);

  async function removeCase(c: PdCase) {
    if (
      !window.confirm(
        t(
          `Move case "${c.case_base_name}" to the trash? You can restore it for 30 days.`,
          `ย้ายเคส "${c.case_base_name}" ไปถังขยะ? กู้คืนได้ภายใน 30 วัน`,
        ),
      )
    )
      return;
    try {
      await api.deleteCase(c.id);
      toast(t(`Moved ${c.case_base_name} to the trash`, `ย้าย ${c.case_base_name} ไปถังขยะแล้ว`));
      void load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Delete failed', 'ลบไม่สำเร็จ'));
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      await api.exportMaster(includePending);
      toast(t('Export downloaded', 'ดาวน์โหลดไฟล์แล้ว'));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Export failed', 'ส่งออกไม่สำเร็จ'));
    } finally {
      setExporting(false);
    }
  }

  const doneCount = (cases ?? []).filter((c) => c.status === 'done').length;

  return (
    <section className="card table-card">
      <div className="card-head">
        <div>
          <h2 className="card-title"><FoldToggle />{t('Assessment cases', 'รายการเคส')}</h2>
          <p className="card-sub">
            {t(
              `${cases?.length ?? 0} cases · ${doneCount} reviewed. Click a row to show its full data.`,
              `${cases?.length ?? 0} เคส · ตรวจแล้ว ${doneCount} คลิกแถวเพื่อดูข้อมูลทั้งหมด`,
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[14px] text-muted">
            <input type="checkbox" checked={includePending} onChange={(e) => setIncludePending(e.target.checked)} />
            {t('Include unreviewed', 'รวมเคสที่ยังไม่ตรวจ')}
          </label>
          <button className="btn btn-primary" type="button" disabled={exporting} onClick={() => void exportCsv()}>
            <DownloadIcon />
            {t('Export to Excel (CSV)', 'ส่งออก Excel (CSV)')}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-5 pb-3">
        <div className="relative min-w-[240px] flex-1 max-w-[420px]">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            className="!pl-9"
            placeholder={t('Search case, result, PD source…', 'ค้นหาเคส ผลลัพธ์ แหล่ง PD…')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
          />
        </div>
        <div className="seg" role="group" aria-label={t('Status', 'สถานะ')}>
          {(
            [
              ['all', t('All', 'ทั้งหมด')],
              ['open', t('To review', 'รอตรวจ')],
              ['done', t('Reviewed', 'ตรวจแล้ว')],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" className={status === key ? 'on' : ''} onClick={() => setStatus(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {cases === null ? (
        <div className="px-5">
          <Spinner />
        </div>
      ) : (
        <div className="table-wrap border-t border-line">
          <table className="data">
            <thead>
              <tr>
                <th className="w-[36px]" />
                <th>{t('Case', 'เคส')}</th>
                <th>{t('AI result', 'ผล AI')}</th>
                <th>{t('PD source', 'แหล่ง PD')}</th>
                <th>Gap-Time</th>
                <th>{t('Severity', 'ความรุนแรง')}</th>
                <th>{t('Status', 'สถานะ')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((c) => {
                const open = expanded === c.id;
                return (
                  <FragmentRow
                    key={c.id}
                    open={open}
                    onToggle={() => setExpanded(open ? null : c.id)}
                    row={
                      <>
                        <td>
                          <ChevronRightIcon
                            className="h-4 w-4 text-muted transition-transform"
                            style={{ transform: open ? 'rotate(90deg)' : undefined }}
                          />
                        </td>
                        <td>
                          <b>{c.case_base_name}</b>
                          <div className="text-[13px] text-muted">{fmtDate(c.updated_time, locale)}</div>
                        </td>
                        <td>
                          {c.ai_final_result ? (
                            <span className={`pill ${resultPillClass(c.ai_final_result)}`}>{c.ai_final_result}</span>
                          ) : (
                            <span className="text-muted">{t('Not analysed', 'ยังไม่วิเคราะห์')}</span>
                          )}
                        </td>
                        <td>{c.confirmed_pd_source_type ?? c.suggested_pd_source_type ?? '-'}</td>
                        <td className="num">{fmt(c.gap.gap_time_ms, 2, ' ms')}</td>
                        <td>
                          {c.severity_by_gap_time ? (
                            <span className={`pill ${severityPillClass(c.severity_by_gap_time)}`}>{c.severity_by_gap_time}</span>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td>
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => router.push(`/cases/${c.id}?from=results`)}
                          >
                            {c.status === 'done' ? t('Open', 'เปิด') : t('Review', 'ตรวจ')}
                          </button>
                          <button
                            type="button"
                            className="icon-only ml-1"
                            title={t('Delete case', 'ลบเคส')}
                            aria-label={t('Delete case', 'ลบเคส')}
                            onClick={() => void removeCase(c)}
                          >
                            <TrashIcon />
                          </button>
                        </td>
                      </>
                    }
                    detail={<CaseDetails c={c} />}
                  />
                );
              })}
              {rows.length === 0 && (
                <EmptyRow colSpan={8}>
                  {(cases?.length ?? 0) === 0
                    ? t('No cases yet. Upload a single image or a folder to begin.', 'ยังไม่มีเคส อัปโหลดภาพเดี่ยวหรือโฟลเดอร์เพื่อเริ่มต้น')
                    : t('No cases match this search.', 'ไม่พบเคสที่ตรงกับการค้นหา')}
                </EmptyRow>
              )}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > limit && (
        <div className="border-t border-line px-5 py-3">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLimit((n) => n + PAGE)}>
            {t(`Show ${Math.min(PAGE, rows.length - limit)} more of ${rows.length - limit}`, `แสดงเพิ่มอีก ${Math.min(PAGE, rows.length - limit)} จาก ${rows.length - limit}`)}
          </button>
        </div>
      )}
    </section>
  );
}

function FragmentRow({
  open,
  onToggle,
  row,
  detail,
}: {
  open: boolean;
  onToggle: () => void;
  row: ReactNode;
  detail: ReactNode;
}) {
  return (
    <>
      <tr
        className={`row-hover clickable ${open ? 'expanded' : ''}`}
        onClick={onToggle}
        aria-expanded={open}
      >
        {row}
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={8}>{detail}</td>
        </tr>
      )}
    </>
  );
}

/** The export columns for one case, folded under its row. */
function CaseDetails({ c }: { c: PdCase }) {
  const { t, locale } = useI18n();
  const img = fileUrl(c.annotated_image_url) ?? fileUrl(c.prpd_url);

  const groups: [string, [string, ReactNode][]][] = [
    [
      t('Case', 'เคส'),
      [
        [t('PRPD file', 'ไฟล์ PRPD'), c.prpd_filename ?? '-'],
        [t('TF map file', 'ไฟล์ TF Map'), c.tf_filename ?? '-'],
        [t('Model', 'โมเดล'), c.n_files === 2 ? 'Hybrid' : 'PRPD-only'],
        [t('Image size', 'ขนาดภาพ'), c.image_width ? `${c.image_width}×${c.image_height}` : '-'],
        [t('Created', 'สร้างเมื่อ'), fmtDate(c.created_time, locale)],
      ],
    ],
    [
      t('Classification', 'การจำแนก'),
      [
        ['Corona / Surface / Internal', `${fmt(c.confidence.corona, 1)} / ${fmt(c.confidence.surface, 1)} / ${fmt(c.confidence.internal, 1)} %`],
        [t('Top class', 'คลาสสูงสุด'), `${c.ai_top_class ?? '-'} (${fmt(c.ai_top_score_percent, 1, '%')})`],
        [t('Suggested PD source', 'แหล่ง PD ที่แนะนำ'), c.suggested_pd_source_type ?? '-'],
        [t('Rule strength', 'ความแข็งของกฎ'), c.is_strong_pd_rule ? t('Strong', 'แข็ง') : t('Needs confirmation', 'ต้องยืนยัน')],
      ],
    ],
    [
      t('Axes & gap-time', 'แกนและ Gap-Time'),
      [
        [t('Frame L / R / T / B (px)', 'กรอบ ซ้าย/ขวา/บน/ล่าง (px)'), `${c.calibration.x_left_0deg ?? '-'} / ${c.calibration.x_right_360deg ?? '-'} / ${c.calibration.y_top_plot ?? '-'} / ${c.calibration.y_bottom_plot ?? '-'}`],
        [t('Gap angle', 'มุม Gap'), fmt(c.gap.gap_angle_deg, 2, '°')],
        [t('Gap-time / band', 'Gap-Time / ช่วง'), `${fmt(c.gap.gap_time_ms, 3, ' ms')} (${c.gap.gap_time_band ?? '-'})`],
        [t('Line source', 'ที่มาของเส้น'), c.gap.gap_line_source ?? '-'],
      ],
    ],
    [
      t('Review', 'การตรวจ'),
      [
        [t('Reviewer', 'ผู้ตรวจ'), c.reviewer_name ? `${c.reviewer_name} (${c.reviewer_role ?? '-'})` : '-'],
        [t('Review status', 'สถานะการตรวจ'), c.review_status],
        [t('Not measurable reason', 'เหตุผลวัดไม่ได้'), c.not_measurable_reason || '-'],
        [t('Note', 'หมายเหตุ'), c.review_note || '-'],
      ],
    ],
  ];

  return (
    <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={c.case_base_name} className="image-frame w-full" />
        ) : (
          <div className="empty rounded-lg border border-line">{t('No image', 'ไม่มีภาพ')}</div>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map(([title, items]) => (
          <div key={title}>
            <div className="mb-1 text-[13px] font-bold uppercase tracking-[.4px] text-primary-ink">{title}</div>
            <dl className="dl !grid-cols-1">
              {items.map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <dt className="w-[45%] flex-none">{k}</dt>
                  <dd className="!mt-0">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CaseWorkflowPageWrapper() {
  return (
    <Suspense fallback={<Spinner />}>
      <CaseWorkflowPage />
    </Suspense>
  );
}
