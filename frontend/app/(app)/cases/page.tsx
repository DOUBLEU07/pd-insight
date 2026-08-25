'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import {
  ChartIcon,
  CheckIcon,
  DownloadIcon,
  ImageIcon,
  PlayIcon,
  RefreshIcon,
  RejectIcon,
} from '@/components/ui/icons';
import { Spinner, StatusBadge, fmtDate } from '@/components/ui/primitives';
import { api, fileUrl } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import type { BatchSummary, CalibrationPreset, PdCase } from '@/lib/types';

type UploadMode = 'single' | 'folder';

interface Slot {
  file: File | null;
  preview: string | null;
  rejected: string | null;
}

const EMPTY_SLOT: Slot = { file: null, preview: null, rejected: null };

export default function CaseWorkflowPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { options, toast } = useApp();

  const [mode, setMode] = useState<UploadMode>(
    searchParams.get('mode') === 'folder' ? 'folder' : 'single',
  );

  // ---- single upload state ----
  const [prpd, setPrpd] = useState<Slot>(EMPTY_SLOT);
  const [tf, setTf] = useState<Slot>(EMPTY_SLOT);
  const [uploading, setUploading] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [acceptedChecklist, setAcceptedChecklist] = useState(false);
  const prpdInput = useRef<HTMLInputElement>(null);
  const tfInput = useRef<HTMLInputElement>(null);

  // ---- folder/batch state ----
  const [cases, setCases] = useState<PdCase[]>([]);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [presets, setPresets] = useState<CalibrationPreset[]>([]);
  const [counts, setCounts] = useState({ reviewed_cases: 0, all_cases: 0, edit_history_entries: 0 });
  const [resumeMode, setResumeMode] = useState(true);
  const [defectFilter, setDefectFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const folderInput = useRef<HTMLInputElement>(null);

  const allowed = options?.constants.allowed_extensions ?? ['.jpg', '.jpeg', '.png', '.bmp'];

  const loadWorkspace = useCallback(async () => {
    try {
      const [c, b, p, n] = await Promise.all([
        api.listCases(),
        api.listBatches(),
        api.listPresets(),
        api.exportCounts(),
      ]);
      setCases(c);
      setBatches(b);
      setPresets(p);
      setCounts(n);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load workspace');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  // Deep link from the dashboard's Calibration Presets shortcut.
  useEffect(() => {
    if (mode === 'folder' && window.location.hash === '#presets') {
      setTimeout(
        () => document.getElementById('presets')?.scrollIntoView({ behavior: 'smooth' }),
        120,
      );
    }
  }, [mode, loading]);

  // ---------------------------------------------------------------- upload
  /**
   * Filename-only heuristic for the obvious mismatch: a file clearly named as
   * a TF map dropped into the PRPD slot, or vice versa. Mirrors the backend's
   * filename_suggests_prpd/tf so a wrong-slot upload is caught immediately
   * instead of only surfacing as an input-quality warning after Run.
   */
  function slotMismatch(slot: 'prpd' | 'tf', filename: string): string | null {
    const lower = filename.toLowerCase();
    const saysPrpd = /prpd|pattern/.test(lower);
    const saysTf = /tf|twmap/.test(lower);
    if (slot === 'prpd' && saysTf && !saysPrpd) {
      return `"${filename}" looks like a TF map, not a PRPD image. Upload it in the TF map slot instead.`;
    }
    if (slot === 'tf' && saysPrpd && !saysTf) {
      return `"${filename}" looks like a PRPD image, not a TF map. Upload it in the PRPD slot instead.`;
    }
    return null;
  }

  function acceptFile(slot: 'prpd' | 'tf', file: File | undefined) {
    if (!file) return;
    // A new file changes what "Before you run" would need to confirm.
    setShowChecklist(false);
    setAcceptedChecklist(false);

    const ext = `.${(file.name.split('.').pop() ?? '').toLowerCase()}`;
    const setter = slot === 'prpd' ? setPrpd : setTf;

    if (!allowed.includes(ext) || !file.type.startsWith('image/')) {
      setter({
        file: null,
        preview: null,
        rejected: `"${file.name}" (${ext || '?'}) is not a supported image type`,
      });
      toast(`Rejected "${file.name}": unsupported file type`);
      return;
    }

    const mismatch = slotMismatch(slot, file.name);
    if (mismatch) {
      setter({ file: null, preview: null, rejected: mismatch });
      toast(`Rejected "${file.name}": wrong upload slot`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () =>
      setter({ file, preview: reader.result as string, rejected: null });
    reader.readAsDataURL(file);
  }

  async function runAnalysis() {
    if (!prpd.file) {
      toast('Select a PRPD image first');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set('prpd', prpd.file);
      if (tf.file) form.set('tf', tf.file);

      const created = await api.uploadCase(form);
      const analysed = await api.analyze(created.id, undefined, true);
      toast(`Analysis complete for ${analysed.case_base_name}`);
      router.push(`/cases/${analysed.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function resetUpload() {
    setPrpd(EMPTY_SLOT);
    setTf(EMPTY_SLOT);
    setShowChecklist(false);
    setAcceptedChecklist(false);
    if (prpdInput.current) prpdInput.current.value = '';
    if (tfInput.current) tfInput.current.value = '';
  }

  async function importFolder(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const name =
        (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split('/')[0] ??
        `Folder import ${new Date().toLocaleDateString('en-GB')}`;

      const batch = await api.createBatch(name);
      const result = await api.uploadFolder(batch.id, Array.from(files));

      toast(
        `Imported ${result.created.length} case(s)` +
          (result.rejected.length ? `, ${result.rejected.length} rejected` : ''),
      );
      if (result.rejected.length) {
        console.warn('Rejected files:', result.rejected);
      }
      await loadWorkspace();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Folder import failed');
    } finally {
      setUploading(false);
      if (folderInput.current) folderInput.current.value = '';
    }
  }

  // ---------------------------------------------------------------- queue
  const defectNames = useMemo(
    () => [...new Set(cases.map((c) => c.defect_name).filter(Boolean))] as string[],
    [cases],
  );

  const queue = useMemo(() => {
    let rows = cases;
    if (defectFilter) rows = rows.filter((c) => c.defect_name === defectFilter);
    if (resumeMode) {
      // Unfinished cases first, so a reviewer picks up where they left off.
      rows = [...rows].sort(
        (a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0),
      );
    }
    return rows;
  }, [cases, defectFilter, resumeMode]);

  const doneCount = cases.filter((c) => c.status === 'done').length;
  const pct = cases.length ? Math.round((doneCount / cases.length) * 100) : 0;

  async function removeCase(id: number, name: string) {
    if (!window.confirm(`Delete case "${name}"? This cannot be undone.`)) return;
    await api.deleteCase(id);
    toast(`Deleted ${name}`);
    void loadWorkspace();
  }

  async function removePreset(id: number, name: string) {
    if (!window.confirm(`Delete calibration preset "${name}"?`)) return;
    await api.deletePreset(id);
    toast(`Deleted preset "${name}"`);
    void loadWorkspace();
  }

  const inferenceMode = tf.file ? 'Hybrid' : 'PRPD-only';
  const mlStatus = options?.ml_status;

  return (
    <>
      {/* ---------- Case Source ---------- */}
      <div className="card">
        <h2>Case Source</h2>
        <p className="hint">
          Upload a single PRPD case, or switch to Folder / Batch to import and work through a whole
          dataset as a queue.
        </p>
        <span className="opt-toggle">
          <button
            className={mode === 'single' ? 'active' : ''}
            onClick={() => setMode('single')}
            type="button"
          >
            Single Image
          </button>
          <button
            className={mode === 'folder' ? 'active' : ''}
            onClick={() => setMode('folder')}
            type="button"
          >
            Folder / Batch
          </button>
        </span>
      </div>

      {/* ================= SINGLE ================= */}
      {mode === 'single' && (
        <div className="card">
          <h2>Case Input</h2>
          <p className="hint">
            1 file (PRPD) runs the PRPD-only model · 2 files (PRPD + TF map) auto-switch to the
            Hybrid model. Click Run Analysis to move on to the review workflow. Accepted formats:{' '}
            {allowed.join(', ').toUpperCase()}.
          </p>

          <input
            ref={prpdInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => acceptFile('prpd', e.target.files?.[0])}
          />
          <input
            ref={tfInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => acceptFile('tf', e.target.files?.[0])}
          />

          <div className="my-[14px] flex flex-col gap-[10px]">
            <UploadBox
              slot={prpd}
              title="PRPD image"
              emptyDesc="Phase-Resolved Partial Discharge plot. Required."
              Icon={ChartIcon}
              onClick={() => prpdInput.current?.click()}
            />
            <UploadBox
              slot={tf}
              title="TF map (optional)"
              emptyDesc="Time-Frequency map. Upload a second image to enable the Hybrid model."
              Icon={ImageIcon}
              onClick={() => tfInput.current?.click()}
            />
          </div>

          <div className="inference-mode-row">
            <span>Inference mode</span>
            <span className="inference-badge">{inferenceMode}</span>
          </div>

          <div className="mt-[6px] flex items-center gap-2">
            <button
              className="btn btn-blue flex-1 justify-center"
              onClick={() => (showChecklist ? void runAnalysis() : setShowChecklist(true))}
              disabled={!prpd.file || uploading || (showChecklist && !acceptedChecklist)}
              type="button"
            >
              <PlayIcon className="btn-icon" />
              {uploading
                ? 'Running analysis…'
                : showChecklist
                  ? 'Confirm & Run Analysis'
                  : 'Run Analysis'}
            </button>
            <button
              className="btn btn-outline"
              onClick={resetUpload}
              title="Reset selection"
              type="button"
            >
              <RefreshIcon className="btn-icon" />
            </button>
          </div>

          {showChecklist && (
            <div className="callout callout-slate mt-[10px] mb-[14px]">
              <b className="mb-[6px] block text-slate-700">Before you run analysis, confirm</b>
              <ul className="help-bullets">
                <li>
                  The image is a <b>PRPD pattern</b> with interpretable discharge clusters, not
                  another type of graph or signal plot.
                </li>
                <li>
                  Discharge activity is present on <b>both polarities</b>; gap-time analysis needs
                  two clusters of opposite polarity.
                </li>
                <li>
                  The plot is not low-resolution, cropped, obscured by text or symbols, or heavily
                  noisy.
                </li>
                <li>
                  For Hybrid, the PRPD and the TF Map come from the <b>same measurement</b>.
                  Unrelated images must not be paired.
                </li>
              </ul>
              <label className="mt-[10px] flex items-center gap-2 text-[12.5px] font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={acceptedChecklist}
                  onChange={(e) => setAcceptedChecklist(e.target.checked)}
                  className="h-auto w-auto"
                />
                I confirm the uploaded image(s) meet the requirements above.
              </label>
            </div>
          )}

          {prpd.file && (
            <div className="mt-[10px]">
              <span className="pill pill-green">READY</span>{' '}
              <span className="text-[12px] text-slate-500">
                Detected <b>{tf.file ? 2 : 1}</b> file{tf.file ? 's' : ''}, will use the{' '}
                <b>{tf.file ? 'Hybrid classification system' : 'PRPD-only classification system'}</b>
                . Input quality checks run server-side on submit.
              </span>
            </div>
          )}

          {mlStatus && !mlStatus.tensorflow_available && (
            <div className="locked-banner mt-2 border-amber-200 bg-amber-50 text-amber-700">
              TensorFlow is not loaded, so classification will use the deterministic mock engine.
              Results are labelled <code>mock</code> and must not be used for diagnosis.
            </div>
          )}
          {mlStatus?.tensorflow_available &&
            !mlStatus.prpd_only_available &&
            !mlStatus.hybrid_available && (
              <div className="locked-banner mt-2 border-amber-200 bg-amber-50 text-amber-700">
                No .keras model files were found under <code>{mlStatus.models_dir}</code>. Set
                MODELS_HOST_DIR to enable real inference.
              </div>
            )}
        </div>
      )}

      {/* ================= FOLDER / BATCH ================= */}
      {mode === 'folder' && (
        <>
          <div className="card">
            <h2>Dataset Import</h2>
            <p className="hint">
              Select a folder of PRPD/TF images. Files are paired by case key.{' '}
              <code>&lt;case&gt;_PRPD.jpg</code> + <code>&lt;case&gt;_TF.jpg</code> become one
              Hybrid case; an unpaired PRPD becomes a PRPD-only case.
            </p>

            <input
              ref={folderInput}
              type="file"
              multiple
              className="hidden"
              // @ts-expect-error non-standard but supported in Chromium/Firefox/Safari
              webkitdirectory=""
              directory=""
              onChange={(e) => void importFolder(e.target.files)}
            />

            <div
              className="upload-box"
              onClick={() => folderInput.current?.click()}
              role="button"
              tabIndex={0}
            >
              <div className="upload-box-icon">
                <ImageIcon width={19} height={19} />
              </div>
              <div className="upload-box-title">
                {uploading ? 'Importing…' : 'Choose a dataset folder'}
              </div>
              <div className="upload-box-desc">
                Every supported image inside is imported as one batch.
              </div>
            </div>

            <table className="kv mt-4">
              <tbody>
                <tr>
                  <td className="k">Batches</td>
                  <td>{batches.length}</td>
                </tr>
                <tr>
                  <td className="k">Total cases</td>
                  <td>{cases.length}</td>
                </tr>
                <tr>
                  <td className="k">Completed</td>
                  <td>{doneCount}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>Case Queue</h2>
            <div className="topfilters">
              <div className="progress-wrap">
                <div className="progress-bar" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[12px] text-slate-500">
                {doneCount}/{cases.length} cases ({pct}%)
              </span>
              <label className="flex items-center gap-[6px]">
                <input
                  type="checkbox"
                  checked={resumeMode}
                  onChange={(e) => setResumeMode(e.target.checked)}
                  className="h-auto w-auto"
                />
                Resume Mode
              </label>
              <label className="flex items-center gap-[6px]">
                Filter defect:
                <select
                  value={defectFilter}
                  onChange={(e) => setDefectFilter(e.target.value)}
                  className="w-auto min-w-[180px]"
                >
                  <option value="">All</option>
                  {defectNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {loading ? (
              <Spinner />
            ) : (
              <div className="max-h-[520px] overflow-y-auto">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>Defect</th>
                      <th>Status</th>
                      <th>Reviewer</th>
                      <th>Updated</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {queue.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <b>{c.case_base_name}</b>
                        </td>
                        <td>{c.defect_name ?? '-'}</td>
                        <td>
                          <StatusBadge status={c.status} />
                        </td>
                        <td>{c.reviewer_name ?? '-'}</td>
                        <td className="text-[11.5px] text-slate-400">{fmtDate(c.updated_time)}</td>
                        <td className="whitespace-nowrap">
                          <span
                            className="small-link"
                            onClick={() => router.push(`/cases/${c.id}?from=queue`)}
                          >
                            Open case →
                          </span>
                          <span
                            className="small-link ml-[10px] text-internal"
                            onClick={() => void removeCase(c.id, c.case_base_name)}
                          >
                            Delete
                          </span>
                        </td>
                      </tr>
                    ))}
                    {queue.length === 0 && (
                      <tr>
                        <td colSpan={6} className="hint">
                          No cases yet. Import a folder above, or upload a single image.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ---------- Preset manager ---------- */}
          <div className="card" id="presets">
            <h2>Calibration Preset Manager</h2>
            <p className="hint">
              Presets are matched automatically when the image size is an exact match, ordered by
              most recently saved.
            </p>
            <table className="data">
              <thead>
                <tr>
                  <th>Preset name</th>
                  <th>Image size</th>
                  <th>X left / X right</th>
                  <th>Y top / Y bottom</th>
                  <th>Saved</th>
                  <th>Remark</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {presets.map((p) => (
                  <tr key={p.id}>
                    <td>{p.preset_name}</td>
                    <td>
                      {p.image_width}×{p.image_height}
                    </td>
                    <td>
                      {p.x_left_0deg} / {p.x_right_360deg}
                    </td>
                    <td>
                      {p.y_top_plot} / {p.y_bottom_plot}
                    </td>
                    <td className="text-[11.5px] text-slate-400">{fmtDate(p.saved_time)}</td>
                    <td className="text-[11.5px]">{p.remark ?? '-'}</td>
                    <td>
                      <span
                        className="small-link text-internal"
                        onClick={() => void removePreset(p.id, p.preset_name)}
                      >
                        Delete
                      </span>
                    </td>
                  </tr>
                ))}
                {presets.length === 0 && (
                  <tr>
                    <td colSpan={7} className="hint">
                      No presets saved yet. Save one from the Calibration step of any case.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ---------- Export center ---------- */}
          <div className="card">
            <h2>Export Center</h2>
            <p className="hint">
              Exports reviewed and saved cases ({counts.reviewed_cases} of {counts.all_cases}).
              The master export carries all 73 columns of the system schema.
            </p>
            <div className="flex flex-wrap gap-[10px]">
              <button
                className="btn btn-blue"
                onClick={() => void api.exportMaster(false)}
                type="button"
              >
                <DownloadIcon className="btn-icon" />
                final_summary.csv (73 columns)
              </button>
              <button
                className="btn btn-outline"
                onClick={() => void api.exportPrototypeWorkbook()}
                type="button"
              >
                <DownloadIcon className="btn-icon" />
                master_workbook.csv (41 columns)
              </button>
              <button
                className="btn btn-outline"
                onClick={() => void api.exportSummary()}
                type="button"
              >
                <DownloadIcon className="btn-icon" />
                final_summary_short.csv
              </button>
              <button
                className="btn btn-outline"
                onClick={() => void api.exportEditHistory()}
                type="button"
              >
                <DownloadIcon className="btn-icon" />
                edit_history.csv ({counts.edit_history_entries})
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function UploadBox({
  slot,
  title,
  emptyDesc,
  Icon,
  onClick,
}: {
  slot: Slot;
  title: string;
  emptyDesc: string;
  Icon: (p: { width?: number; height?: number }) => JSX.Element;
  onClick: () => void;
}) {
  const cls = slot.rejected ? 'upload-box invalid' : slot.file ? 'upload-box filled' : 'upload-box';

  return (
    <div className={cls} onClick={onClick} role="button" tabIndex={0}>
      {slot.rejected ? (
        <>
          <div className="upload-box-icon">
            <RejectIcon width={19} height={19} />
          </div>
          <div className="upload-box-title">Rejected</div>
          <div className="upload-box-desc">{slot.rejected}</div>
        </>
      ) : slot.file ? (
        <>
          {slot.preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="upload-box-thumb" src={slot.preview} alt="" />
          )}
          <div className="upload-box-title">
            {title} <CheckIcon width={12} height={12} className="inline align-[-1px]" />
          </div>
          <div className="upload-box-desc">{slot.file.name}</div>
        </>
      ) : (
        <>
          <div className="upload-box-icon">
            <Icon width={19} height={19} />
          </div>
          <div className="upload-box-title">{title}</div>
          <div className="upload-box-desc">{emptyDesc}</div>
        </>
      )}
    </div>
  );
}
