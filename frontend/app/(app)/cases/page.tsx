'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { PrpdCanvas, NudgeRow, type Frame, type Handle } from '@/components/case/PrpdCanvas';
import {
  ActivityIcon,
  ChartIcon,
  CheckIcon,
  DownloadIcon,
  FileTextIcon,
  FolderIcon,
  ImageIcon,
  PlayIcon,
  RefreshIcon,
  RejectIcon,
} from '@/components/ui/icons';
import { Spinner, StatusBadge, fmtDate } from '@/components/ui/primitives';
import { api, fileUrl } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useI18n } from '@/lib/i18n';
import type { BatchSummary, CalibrationPreset, PdCase } from '@/lib/types';

type UploadMode = 'single' | 'folder' | 'results';

interface Slot {
  file: File | null;
  preview: string | null;
  rejected: string | null;
}

const EMPTY_SLOT: Slot = { file: null, preview: null, rejected: null };

function CaseWorkflowPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { options, toast } = useApp();
  const { lang, t } = useI18n();

  const urlMode = searchParams.get('mode');
  const [mode, setModeState] = useState<UploadMode>(
    urlMode === 'folder' ? 'folder' : urlMode === 'results' ? 'results' : 'single'
  );

  const setMode = (m: UploadMode) => {
    setModeState(m);
    router.replace(`/cases?mode=${m}`, { scroll: false });
  };

  useEffect(() => {
    if (urlMode === 'folder' || urlMode === 'results' || urlMode === 'single') {
      setModeState(urlMode);
    }
  }, [urlMode]);

  // ---- Single upload state ----
  const [prpd, setPrpd] = useState<Slot>(EMPTY_SLOT);
  const [tf, setTf] = useState<Slot>(EMPTY_SLOT);
  const [uploading, setUploading] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [acceptedChecklist, setAcceptedChecklist] = useState(false);
  const prpdInput = useRef<HTMLInputElement>(null);
  const tfInput = useRef<HTMLInputElement>(null);

  // ---- Folder / Batch local preview & staging state ----
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [rejectedCount, setRejectedCount] = useState<number>(0);
  const [firstPreviewUrl, setFirstPreviewUrl] = useState<string | null>(null);
  const [firstPreviewName, setFirstPreviewName] = useState<string>('');
  const [batchCalibFrame, setBatchCalibFrame] = useState<Frame>({
    x_left: 20,
    x_right: 380,
    y_top: 20,
    y_bottom: 280,
  });
  const [batchCalibLock, setBatchCalibLock] = useState<boolean>(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  // ---- Workspace state ----
  const [cases, setCases] = useState<PdCase[]>([]);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [presets, setPresets] = useState<CalibrationPreset[]>([]);
  const [counts, setCounts] = useState({ reviewed_cases: 0, all_cases: 0, edit_history_entries: 0 });
  const [resumeMode, setResumeMode] = useState(true);
  const [defectFilter, setDefectFilter] = useState('');
  const [loading, setLoading] = useState(true);

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

  // Deep link from presets
  useEffect(() => {
    if (window.location.hash === '#presets') {
      setTimeout(() => {
        document.getElementById('presets')?.scrollIntoView({ behavior: 'smooth' });
      }, 120);
    }
  }, [mode, loading]);

  // ---------------------------------------------------------------- Single Upload
  function slotMismatch(slot: 'prpd' | 'tf', filename: string): string | null {
    const lower = filename.toLowerCase();
    const saysPrpd = /prpd|pattern/.test(lower);
    const saysTf = /tf|tfmap|twmap/.test(lower);
    if (slot === 'prpd' && saysTf && !saysPrpd) {
      return t(
        `"${filename}" looks like a TF map, not a PRPD image. Upload it in the TF map slot instead.`,
        `"${filename}" ดูเหมือนภาพ TF Map มากกว่า PRPD กรุณาใส่ในช่อง TF Map`
      );
    }
    if (slot === 'tf' && saysPrpd && !saysTf) {
      return t(
        `"${filename}" looks like a PRPD image, not a TF map. Upload it in the PRPD slot instead.`,
        `"${filename}" ดูเหมือนภาพ PRPD มากกว่า TF Map กรุณาใส่ในช่อง PRPD`
      );
    }
    return null;
  }

  function acceptFile(slot: 'prpd' | 'tf', file: File | undefined) {
    if (!file) return;
    setShowChecklist(false);
    setAcceptedChecklist(false);

    const ext = `.${(file.name.split('.').pop() ?? '').toLowerCase()}`;
    const setter = slot === 'prpd' ? setPrpd : setTf;

    if (!allowed.includes(ext)) {
      setter({
        file: null,
        preview: null,
        rejected: t(
          `"${ext}" is not supported. Use ${allowed.join(', ')}.`,
          `ไฟล์ "${ext}" ไม่รองรับ กรุณาใช้ ${allowed.join(', ')}`
        ),
      });
      toast(t(`Rejected "${file.name}": unsupported extension`, `ปฏิเสธ "${file.name}": ไม่รองรับนามสกุลไฟล์`));
      return;
    }

    const mismatch = slotMismatch(slot, file.name);
    if (mismatch) {
      setter({ file: null, preview: null, rejected: mismatch });
      toast(t(`Rejected "${file.name}": wrong upload slot`, `ปฏิเสธ "${file.name}": ช่องอัพโหลดไม่ถูกต้อง`));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setter({ file, preview: reader.result as string, rejected: null });
    };
    reader.readAsDataURL(file);
  }

  async function runAnalysis() {
    if (!prpd.file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('prpd_file', prpd.file);
      if (tf.file) form.append('tf_file', tf.file);
      const created = await api.uploadCase(form);
      toast(t(`Created case ${created.case_base_name}`, `สร้างเคส ${created.case_base_name} สำเร็จ`));
      router.push(`/cases/${created.id}?from=upload`);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Upload failed', 'การอัปโหลดล้มเหลว'));
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

  // ---------------------------------------------------------------- Folder / Batch Staging
  const isImageFile = (file: File) => {
    const ext = `.${(file.name.split('.').pop() ?? '').toLowerCase()}`;
    return allowed.includes(ext) || file.type.startsWith('image/');
  };

  const isTfFilename = (name: string) => {
    const lower = name.toLowerCase();
    return /(?:^|[_ /\\.-])(?:tf|tfmap|twmap)(?:[_ /\\.-]|$)/i.test(lower);
  };

  const getBaseCaseKey = (name: string) => {
    return name
      .split(/[/\\]/)
      .pop()!
      .replace(/\.[^.]+$/, '')
      .replace(/[_ -](?:prpd|tf|tfmap|twmap|pattern)$/i, '')
      .toLowerCase();
  };

  function handleBatchFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const rawFiles = Array.from(fileList);
    const valid = rawFiles.filter(isImageFile).slice(0, 500);
    const rejected = rawFiles.length - valid.length;

    setBatchFiles(valid);
    setRejectedCount(rejected);

    // Pick first PRPD-like image for immediate preview
    const firstPrpd =
      valid.find((f) => /prpd/i.test(f.name)) ||
      valid.find((f) => !isTfFilename(f.name)) ||
      valid[0];

    if (firstPrpd) {
      setFirstPreviewName(firstPrpd.name);
      const reader = new FileReader();
      reader.onload = () => setFirstPreviewUrl(reader.result as string);
      reader.onerror = () =>
        toast(t('The first image could not be previewed', 'ไม่สามารถแสดงตัวอย่างภาพแรกได้'));
      reader.readAsDataURL(firstPrpd);
    } else {
      setFirstPreviewUrl(null);
      setFirstPreviewName('');
    }

    toast(
      valid.length
        ? t(`${valid.length} images added to queue`, `เพิ่ม ${valid.length} ภาพเข้าคิวแล้ว`)
        : t('No supported images found', 'ไม่พบไฟล์รูปที่รองรับ')
    );
  }

  // Real-time batch pairing statistics
  const batchStats = useMemo(() => {
    const prpds = batchFiles.filter((f) => !isTfFilename(f.webkitRelativePath || f.name));
    const tfs = batchFiles.filter((f) => isTfFilename(f.webkitRelativePath || f.name));

    const prpdKeys = new Set(prpds.map((f) => getBaseCaseKey(f.name)));
    const tfKeys = new Set(tfs.map((f) => getBaseCaseKey(f.name)));

    const validPairs = prpds.filter((f) => tfKeys.has(getBaseCaseKey(f.name))).length;
    const unmatched =
      prpds.filter((f) => !tfKeys.has(getBaseCaseKey(f.name))).length +
      tfs.filter((f) => !prpdKeys.has(getBaseCaseKey(f.name))).length;

    return {
      prpdCount: prpds.length,
      tfCount: tfs.length,
      validPairs,
      unmatched,
      rejected: rejectedCount,
    };
  }, [batchFiles, rejectedCount]);

  async function submitBatchImport() {
    if (batchFiles.length === 0) return;
    setUploading(true);
    try {
      const folderName =
        (batchFiles[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split('/')[0] ||
        `Batch ${new Date().toLocaleDateString('en-GB')}`;

      const batch = await api.createBatch(folderName);
      const result = await api.uploadFolder(batch.id, batchFiles);

      toast(
        t(
          `Imported ${result.created.length} case(s)` +
            (result.rejected.length ? `, ${result.rejected.length} rejected` : ''),
          `นำเข้า ${result.created.length} เคสสำเร็จ` +
            (result.rejected.length ? `, ไม่ผ่าน ${result.rejected.length} ไฟล์` : '')
        )
      );

      await loadWorkspace();
      // Navigate to batch review
      router.push(`/batches/${batch.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Batch import failed', 'การนำเข้าชุดข้อมูลล้มเหลว'));
    } finally {
      setUploading(false);
      setBatchFiles([]);
      setFirstPreviewUrl(null);
    }
  }

  // ---------------------------------------------------------------- Queue & Filters
  const defectNames = useMemo(
    () => [...new Set(cases.map((c) => c.defect_name).filter(Boolean))] as string[],
    [cases]
  );

  const queue = useMemo(() => {
    let rows = cases;
    if (defectFilter) rows = rows.filter((c) => c.defect_name === defectFilter);
    if (resumeMode) {
      rows = [...rows].sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0));
    }
    return rows;
  }, [cases, defectFilter, resumeMode]);

  const doneCount = cases.filter((c) => c.status === 'done').length;
  const pct = cases.length ? Math.round((doneCount / cases.length) * 100) : 0;

  async function removeCase(id: number, name: string) {
    if (
      !window.confirm(
        t(`Delete case "${name}"? This cannot be undone.`, `ยืนยันลบเคส "${name}"? การดำเนินการนี้ไม่สามารถย้อนกลับได้`)
      )
    )
      return;
    await api.deleteCase(id);
    toast(t(`Deleted ${name}`, `ลบเคส ${name} สำเร็จ`));
    void loadWorkspace();
  }

  async function removePreset(id: number, name: string) {
    if (!window.confirm(t(`Delete preset "${name}"?`, `ยืนยันลบ Preset "${name}"?`))) return;
    await api.deletePreset(id);
    toast(t(`Deleted ${name}`, `ลบ Preset ${name} สำเร็จ`));
    void loadWorkspace();
  }

  return (
    <>
      {/* ---------- Mode Switcher Tabs ---------- */}
      <div className="card mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold m-0">{t('PD Assessment Workflow', 'ขั้นตอนการประเมิน Partial Discharge')}</h2>
            <p className="hint mb-0 mt-1">
              {t(
                'Upload individual cases, process entire folders in batch, or inspect stored assessment results.',
                'อัปโหลดประเมินภาพเดี่ยว, ตรวจสอบชุดข้อมูลโฟลเดอร์ หรือดูผลลัพธ์การประเมินย้อนหลัง'
              )}
            </p>
          </div>

          <div className="auth-tabs w-auto min-w-[340px] m-0">
            <button
              className={mode === 'single' ? 'active' : ''}
              onClick={() => setMode('single')}
              type="button"
            >
              {t('Single Image', 'ภาพเดี่ยว')}
            </button>
            <button
              className={mode === 'folder' ? 'active' : ''}
              onClick={() => setMode('folder')}
              type="button"
            >
              {t('Folder / Batch', 'โฟลเดอร์ / ชุดข้อมูล')}
            </button>
            <button
              className={mode === 'results' ? 'active' : ''}
              onClick={() => setMode('results')}
              type="button"
            >
              {t('Results', 'ผลลัพธ์')}
            </button>
          </div>
        </div>
      </div>

      {/* ================= MODE 1: SINGLE IMAGE ================= */}
      {mode === 'single' && (
        <div className="card">
          <div className="head mb-4">
            <h3 className="text-lg font-bold">{t('Single Image Assessment', 'การประเมินภาพเดี่ยว')}</h3>
            <p className="hint">
              {t(
                '1 file (PRPD) runs the PRPD-only model. Adding a TF Map auto-switches to the Hybrid model.',
                'อัปโหลด 1 ภาพ (PRPD) ใช้โมเดล PRPD-only หากเพิ่มภาพ TF Map จะเปลี่ยนเป็นโมเดล Hybrid โดยอัตโนมัติ'
              )}
            </p>
          </div>

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

          <div className="single-upload-grid my-4">
            <UploadBox
              slot={prpd}
              title={t('PRPD image', 'ภาพ PRPD')}
              emptyDesc={t('Required • PNG, JPG, or TIFF', 'จำเป็น • PNG, JPG หรือ TIFF')}
              Icon={ChartIcon}
              onClick={() => prpdInput.current?.click()}
            />
            <UploadBox
              slot={tf}
              title={t('TF Map image', 'ภาพ TF Map')}
              emptyDesc={t('Optional • enables Hybrid model', 'ไม่บังคับ • ใช้โมเดล Hybrid เมื่อเพิ่มภาพ')}
              Icon={ImageIcon}
              onClick={() => tfInput.current?.click()}
            />

            <div className="card before-card m-0 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold mb-2">{t('Before analysis', 'ก่อนวิเคราะห์')}</h3>
                <p className="text-xs text-slate-500 mb-3">
                  {t('The model is selected from the uploaded inputs.', 'ระบบเลือกโมเดลตามรูปที่อัปโหลด')}
                </p>
                <ul className="text-xs space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckIcon width={14} height={14} className="text-emerald-600" />
                    <span>{t('Cable criteria: Published Default', 'เกณฑ์สายเคเบิล: ค่าเริ่มต้น')}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon width={14} height={14} className="text-emerald-600" />
                    <span>
                      {tf.file
                        ? t('Hybrid model: PRPD + TF Map', 'โมเดล Hybrid: PRPD + TF Map')
                        : t('PRPD-only model', 'โมเดล PRPD-only')}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon width={14} height={14} className="text-emerald-600" />
                    <span>{t('Classes: Corona, Surface, Internal', 'ประเภท: Corona, Surface, Internal')}</span>
                  </li>
                </ul>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">{t('Inference Mode', 'โหมดวิเคราะห์')}</span>
                <span className="pill pill-blue font-bold">
                  {tf.file ? 'HYBRID' : 'PRPD ONLY'}
                </span>
              </div>
            </div>
          </div>

          <div className="flow-buttons mt-4">
            <button
              className="btn btn-outline"
              onClick={resetUpload}
              title={t('Reset selection', 'ล้างการเลือก')}
              type="button"
            >
              <RefreshIcon className="btn-icon" />
              {t('Reset', 'ล้างข้อมูล')}
            </button>

            <button
              className="primary"
              onClick={() => (showChecklist ? void runAnalysis() : setShowChecklist(true))}
              disabled={!prpd.file || uploading || (showChecklist && !acceptedChecklist)}
              type="button"
            >
              <PlayIcon className="btn-icon" />
              {uploading
                ? t('Running analysis…', 'กำลังวิเคราะห์…')
                : showChecklist
                ? t('Confirm & Run Analysis', 'ยืนยันและเริ่มวิเคราะห์')
                : t('Next: Run Analysis', 'ถัดไป: เริ่มวิเคราะห์')}
            </button>
          </div>

          {showChecklist && (
            <div className="notice mt-4">
              <ActivityIcon width={20} height={20} className="flex-shrink-0 text-sky-600" />
              <div>
                <b>{t('Before you run analysis, confirm:', 'ข้อควรตรวจสอบก่อนเริ่มวิเคราะห์:')}</b>
                <ul className="help-bullets mt-1 text-xs">
                  <li>
                    {t(
                      'The image is a valid PRPD pattern with interpretable discharge clusters.',
                      'ภาพเป็นรูปแบบ PRPD ที่มีกลุ่มการดิสชาร์จที่สามารถแปลผลได้'
                    )}
                  </li>
                  <li>
                    {t(
                      'PRPD and TF Map must come from the same measurement.',
                      'ภาพ PRPD และ TF Map ต้องมาจากการตรวจวัดชุดเดียวกัน'
                    )}
                  </li>
                </ul>
                <label className="mt-2 flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptedChecklist}
                    onChange={(e) => setAcceptedChecklist(e.target.checked)}
                  />
                  {t(
                    'I confirm the uploaded image(s) meet the requirements above.',
                    'ฉันยืนยันว่าภาพที่อัปโหลดมีคุณสมบัติถูกต้องครบถ้วน'
                  )}
                </label>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= MODE 2: FOLDER / BATCH ================= */}
      {mode === 'folder' && (
        <div className="space-y-5">
          {/* Preset hint notice */}
          <div className="notice">
            <ActivityIcon width={20} height={20} className="text-sky-600 flex-shrink-0" />
            <div>
              <b>{t('Calibration preset', 'ค่าปรับแกนที่บันทึกไว้')}</b>
              <p>
                {t(
                  'Calibrate the first image once. The setting is copied forward; save immediately when no adjustment is needed.',
                  'ปรับแกนภาพแรกหนึ่งครั้ง ระบบจะนำค่าไปใช้กับภาพถัดไป หากไม่ต้องแก้สามารถบันทึกได้ทันที'
                )}
              </p>
            </div>
          </div>

          {/* Dual upload cards: Drop & Stats */}
          <div className="cols">
            <article className="card drop">
              <input
                ref={folderInputRef}
                id="folder-file"
                className="file-input"
                type="file"
                accept="image/*"
                multiple
                // @ts-expect-error Chromium/Firefox folder upload attribute
                webkitdirectory=""
                directory=""
                onChange={(e) => handleBatchFiles(e.target.files)}
              />
              <input
                ref={multiFileInputRef}
                id="multi-file"
                className="file-input"
                type="file"
                accept="image/png,image/jpeg,image/tiff,image/bmp"
                multiple
                onChange={(e) => handleBatchFiles(e.target.files)}
              />

              <FolderIcon width={42} height={42} className="text-sky-500 mb-3" />
              <h3>{t('Upload a PRPD / TF Map batch', 'อัปโหลดชุดภาพ PRPD / TF Map')}</h3>
              <p className="hint">
                {t(
                  'Up to 500 images per batch. Chrome and Edge can select a complete folder.',
                  'สูงสุด 500 ภาพต่อชุด Chrome และ Edge สามารถเลือกทั้งโฟลเดอร์ได้'
                )}
              </p>

              <div className="flex flex-wrap gap-2 justify-center mt-2">
                <label className="button-like primary-like" htmlFor="folder-file">
                  <FolderIcon width={16} height={16} className="inline mr-1" />
                  {t('Choose folder', 'เลือกโฟลเดอร์')}
                </label>
                <label className="button-like" htmlFor="multi-file">
                  <ImageIcon width={16} height={16} className="inline mr-1" />
                  {t('Choose multiple files', 'เลือกหลายไฟล์')}
                </label>
              </div>
            </article>

            <article className="card count">
              <div>
                <h3>{t('Batch status', 'สถานะชุดข้อมูล')}</h3>
                <p className="hint">
                  {batchFiles.length
                    ? t('Files loaded and checked in this browser', 'โหลดและตรวจไฟล์ในเบราว์เซอร์แล้ว')
                    : t('No folder selected', 'ยังไม่ได้เลือกโฟลเดอร์')}
                </p>
              </div>

              <b>
                {batchFiles.length} <small>/ 500 {t('images', 'ภาพ')}</small>
              </b>

              <div className="batch-stats">
                <span>
                  <b>{batchStats.prpdCount}</b> PRPD
                </span>
                <span>
                  <b>{batchStats.tfCount}</b> TF Map
                </span>
                <span>
                  <b>{batchStats.validPairs}</b> {t('Valid pairs', 'คู่ที่ถูกต้อง')}
                </span>
                <span className={batchStats.unmatched ? 'warn' : ''}>
                  <b>{batchStats.unmatched}</b> {t('Unmatched', 'ไม่เข้าคู่')}
                </span>
                <span className={batchStats.rejected ? 'warn' : ''}>
                  <b>{batchStats.rejected}</b> {t('Rejected', 'ไม่รองรับ')}
                </span>
              </div>

              {batchFiles.length > 0 && (
                <div className="batch-list">
                  {batchFiles.slice(0, 8).map((f, i) => (
                    <span key={f.name + i}>
                      {i + 1}. {f.name}
                    </span>
                  ))}
                  {batchFiles.length > 8 && (
                    <span>
                      + {batchFiles.length - 8} {t('more', 'ไฟล์เพิ่มเติม')}
                    </span>
                  )}
                </div>
              )}
            </article>
          </div>

          {/* First image interactive calibration preview */}
          {batchFiles.length > 0 && firstPreviewUrl && (
            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-lg font-bold m-0">
                    {t('Review first image calibration', 'ตรวจภาพแรกและปรับตั้งแกน')}
                  </h3>
                  <p className="hint mb-0 mt-1">
                    {t('Previewing:', 'กำลังแสดงภาพตัวอย่าง:')} <b>{firstPreviewName}</b>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={`btn ${batchCalibLock ? 'primary' : 'btn-outline'} text-xs`}
                    onClick={() => setBatchCalibLock((v) => !v)}
                  >
                    ⟷ {t('Adjust Both Lines (Lock Span)', 'ปรับสองเส้นพร้อมกัน')}:{' '}
                    <b>{batchCalibLock ? t('ON', 'เปิด') : t('OFF', 'ปิด')}</b>
                  </button>

                  <button
                    className="primary"
                    type="button"
                    disabled={uploading}
                    onClick={submitBatchImport}
                  >
                    {uploading
                      ? t('Importing…', 'กำลังนำเข้า…')
                      : t('Confirm & Import All Cases', 'ยืนยันและนำเข้าทุกเคส')}
                  </button>
                </div>
              </div>

              <PrpdCanvas
                imageUrl={firstPreviewUrl}
                imageWidth={400}
                imageHeight={300}
                frame={batchCalibFrame}
                mode="calibration"
                lockSpan={batchCalibLock}
                onDrag={(h, v) => setBatchCalibFrame((f) => ({ ...f, [h]: v }))}
                displayWidth={720}
              />
              <NudgeRow
                items={[
                  { label: '0°', handle: 'x_left' },
                  { label: '360°', handle: 'x_right' },
                  { label: 'Top', handle: 'y_top' },
                  { label: 'Bottom', handle: 'y_bottom' },
                ]}
                onNudge={(h, d) =>
                  setBatchCalibFrame((f) => ({ ...f, [h]: (f as any)[h] + d }))
                }
                onNudgePair={(type, delta) => {
                  if (type === 'frame') {
                    setBatchCalibFrame((f) => ({
                      ...f,
                      x_left: f.x_left + delta,
                      x_right: f.x_right + delta,
                    }));
                  }
                }}
              />
            </div>
          )}

          {/* Existing Batches List */}
          <div className="card">
            <h3 className="text-base font-bold mb-3">{t('Imported Batches', 'ชุดข้อมูลที่นำเข้าแล้ว')}</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('Batch Name', 'ชื่อชุดข้อมูล')}</th>
                    <th>{t('Uploaded', 'วันที่อัปโหลด')}</th>
                    <th>{t('Total Cases', 'จำนวนเคส')}</th>
                    <th>{t('Reviewed', 'ตรวจแล้ว')}</th>
                    <th>{t('Action', 'จัดการ')}</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <b>{b.name}</b>
                      </td>
                      <td className="text-xs text-slate-500">{fmtDate(b.upload_date)}</td>
                      <td>{b.total}</td>
                      <td>
                        {b.cases?.filter((c) => c.status === 'done').length ?? 0} / {b.total}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-outline py-1 px-3 text-xs"
                          onClick={() => router.push(`/batches/${b.id}`)}
                        >
                          {t('Open Batch →', 'เปิดชุดข้อมูล →')}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {batches.length === 0 && (
                    <tr>
                      <td colSpan={5} className="hint text-center py-4">
                        {t('No batches uploaded yet.', 'ยังไม่มีชุดข้อมูลที่นำเข้า')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODE 3: ASSESSMENT RESULTS ================= */}
      {mode === 'results' && (
        <div className="space-y-5">
          <div className="card table-card">
            <div className="head flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">{t('Assessment Cases', 'รายการเคสผลการประเมิน')}</h3>
                <p className="hint">
                  {t(
                    'Five essential fields stay visible; inspect or export full case details.',
                    'แสดงข้อมูลสำคัญ 5 ช่อง สามารถเปิดดูรายละเอียดหรือส่งออกเป็นไฟล์ Excel/CSV ได้'
                  )}
                </p>
              </div>

              <div className="actions flex items-center gap-2">
                <button
                  className="primary"
                  type="button"
                  onClick={() => void api.exportMaster(false)}
                >
                  <DownloadIcon className="btn-icon" />
                  {t('Export Excel / CSV', 'ส่งออก Excel / CSV')}
                </button>
              </div>
            </div>

            <div className="filters mt-4 flex flex-wrap gap-3 items-center">
              <input
                type="text"
                placeholder={t('Search case name…', 'ค้นหาชื่อเคส…')}
                value={defectFilter}
                onChange={(e) => setDefectFilter(e.target.value)}
                className="w-auto min-w-[240px]"
              />
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={resumeMode}
                  onChange={(e) => setResumeMode(e.target.checked)}
                />
                {t('Show pending reviews first', 'แสดงเคสที่ยังไม่ได้ตรวจก่อน')}
              </label>
            </div>

            {loading ? (
              <Spinner />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('Case', 'เคส')}</th>
                      <th>{t('Defect / AI Prediction', 'ความผิดปกติ / ผลวิเคราะห์')}</th>
                      <th>{t('Status', 'สถานะ')}</th>
                      <th>{t('Confirmed PD Source', 'แหล่ง PD ที่ยืนยัน')}</th>
                      <th>{t('Reviewer', 'ผู้ตรวจ')}</th>
                      <th>{t('Updated', 'แก้ไขล่าสุด')}</th>
                      <th>{t('Action', 'จัดการ')}</th>
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
                        <td>
                          <span className="font-semibold text-slate-700">
                            {c.confirmed_pd_source_type ?? c.suggested_pd_source_type ?? '-'}
                          </span>
                        </td>
                        <td>{c.reviewer_name ?? '-'}</td>
                        <td className="text-xs text-slate-400">{fmtDate(c.updated_time)}</td>
                        <td className="whitespace-nowrap space-x-2">
                          <button
                            type="button"
                            className="btn btn-outline py-1 px-3 text-xs"
                            onClick={() => router.push(`/cases/${c.id}?from=results`)}
                          >
                            {t('Open →', 'เปิดดู →')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline py-1 px-2 text-xs text-red-600 hover:bg-red-50"
                            onClick={() => void removeCase(c.id, c.case_base_name)}
                          >
                            {t('Delete', 'ลบ')}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {queue.length === 0 && (
                      <tr>
                        <td colSpan={7} className="hint text-center py-4">
                          {t('No cases match the filter.', 'ไม่พบเคสที่ตรงกับเงื่อนไข')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Calibration Preset Manager */}
          <div className="card" id="presets">
            <h3 className="text-base font-bold mb-2">
              {t('Calibration Preset Manager', 'ระบบจัดการค่าปรับแกน (Calibration Presets)')}
            </h3>
            <p className="hint">
              {t(
                'Presets are automatically matched when image dimensions match.',
                'ระบบจะจับคู่พรีเซ็ตอัตโนมัติเมื่อขนาดภาพตรงกัน'
              )}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('Preset Name', 'ชื่อพรีเซ็ต')}</th>
                    <th>{t('Image Size', 'ขนาดภาพ')}</th>
                    <th>{t('X 0° / 360°', 'แกน X (0° / 360°)')}</th>
                    <th>{t('Y Top / Bottom', 'แกน Y (บน / ล่าง)')}</th>
                    <th>{t('Saved', 'วันที่บันทึก')}</th>
                    <th>{t('Action', 'จัดการ')}</th>
                  </tr>
                </thead>
                <tbody>
                  {presets.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <b>{p.preset_name}</b>
                      </td>
                      <td>
                        {p.image_width}×{p.image_height}
                      </td>
                      <td>
                        {p.x_left_0deg} / {p.x_right_360deg}
                      </td>
                      <td>
                        {p.y_top_plot} / {p.y_bottom_plot}
                      </td>
                      <td className="text-xs text-slate-400">{fmtDate(p.saved_time)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-outline text-xs text-red-600 py-1 px-2"
                          onClick={() => void removePreset(p.id, p.preset_name)}
                        >
                          {t('Delete', 'ลบ')}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {presets.length === 0 && (
                    <tr>
                      <td colSpan={6} className="hint text-center py-3">
                        {t('No presets saved yet.', 'ยังไม่มี Preset ที่บันทึกไว้')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
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
  Icon: (p: { width?: number; height?: number; className?: string }) => JSX.Element;
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
            {title} <CheckIcon width={12} height={12} className="inline align-[-1px] text-emerald-600" />
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


export default function CaseWorkflowPageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400"><Spinner label="Loading workflow…" /></div>}>
      <CaseWorkflowPage />
    </Suspense>
  );
}
