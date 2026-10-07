'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ModelEvaluation } from '@/components/training/ModelEvaluation';
import { NewModelWizard } from '@/components/training/NewModelWizard';
import { CheckIcon, DownloadIcon, FileNewIcon, RestoreIcon, TrainingIcon, TrashIcon } from '@/components/ui/icons';
import { Collapse, EmptyRow, FoldToggle, Readout, Spinner, fmtDate } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { TRASH_LINK, useApp } from '@/lib/app-context';
import { useI18n } from '@/lib/i18n';
import { serverText, stageText } from '@/lib/server-text';
import type { EditHistoryEntry, SharedModel, TrainedModel, TrainingStats, UsageEntry } from '@/lib/types';

function statusPill(status: TrainedModel['status']): string {
  if (status === 'completed') return 'pill-green';
  if (status === 'failed') return 'pill-red';
  if (status === 'draft') return 'pill-gray';
  return 'pill-amber';
}

export default function TrainingPage() {
  const { toast } = useApp();
  const { t, locale } = useI18n();

  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStats(await api.trainingStats());
    } catch {
      /* keep whatever is on screen */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const history = stats?.history ?? [];

  // Keep a selection; default to the newest run.
  useEffect(() => {
    if (history.length === 0) return;
    if (selectedId == null || !history.some((m) => m.id === selectedId)) setSelectedId(history[0].id);
  }, [history, selectedId]);

  // A run in flight keeps the page updating.
  useEffect(() => {
    if (!history.some((m) => m.status === 'queued' || m.status === 'running')) return;
    pollTimer.current = setTimeout(() => void refresh(), 2000);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [history, refresh]);

  async function activate(model: TrainedModel) {
    setBusy(true);
    try {
      await api.activateModel(model.id);
      await refresh();
      toast(
        model.kind === 'hybrid'
          ? t(`PRPD + TF cases will be analysed with ${model.name}`, `เคส PRPD + TF จะวิเคราะห์ด้วย ${model.name}`)
          : t(`PRPD-only cases will be analysed with ${model.name}`, `เคส PRPD อย่างเดียวจะวิเคราะห์ด้วย ${model.name}`),
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not select that model', 'เลือกโมเดลนี้ไม่สำเร็จ'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(model: TrainedModel) {
    if (
      !window.confirm(
        t(
          `Move model "${model.name}" and its dataset to the trash? You can restore it for 30 days from Trash (the bin icon at the top right).`,
          `ย้ายโมเดล "${model.name}" และชุดข้อมูลไปถังขยะ? กู้คืนได้ภายใน 30 วันที่ถังขยะ (ไอคอนถังขยะมุมขวาบน)`,
        ),
      )
    )
      return;
    setBusy(true);
    try {
      await api.deleteModel(model.id);
      setSelectedId(null);
      await refresh();
      toast(t(`Moved ${model.name} to the trash`, `ย้าย ${model.name} ไปถังขยะแล้ว`), TRASH_LINK);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not delete that model', 'ลบโมเดลไม่สำเร็จ'));
    } finally {
      setBusy(false);
    }
  }

  /** Retry a failed run on the dataset it already has. */
  async function trainAgain(model: TrainedModel) {
    setBusy(true);
    try {
      await api.startTraining(model.id);
      await refresh();
      toast(t(`Training ${model.name} again`, `เริ่มเทรน ${model.name} อีกครั้ง`));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not start training', 'เริ่มเทรนไม่สำเร็จ'));
    } finally {
      setBusy(false);
    }
  }

  async function downloadDataset(model: TrainedModel) {
    setBusy(true);
    try {
      await api.downloadDataset(model.id, model.name);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not download the dataset', 'ดาวน์โหลดชุดข้อมูลไม่สำเร็จ'));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  const selected = history.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head !mb-0">
          <div>
            <h2 className="card-title"><FoldToggle />
              <TrainingIcon />
              {t('Your models', 'โมเดลของคุณ')}
            </h2>
            <p className="card-sub">
              {t(
                'Train a classifier on your own labelled PRPD images (MobileNetV2 transfer learning). Models and datasets stay on your account.',
                'เทรนโมเดลจำแนกด้วยภาพ PRPD ที่ติดป้ายเอง (MobileNetV2 transfer learning) โมเดลและข้อมูลอยู่ในบัญชีของคุณเท่านั้น',
              )}
            </p>
          </div>
          <button className="btn btn-primary" type="button" onClick={() => setWizardOpen(true)}>
            <FileNewIcon />
            {t('New model', 'สร้างโมเดลใหม่')}
          </button>
        </div>
        {stats && !stats.tensorflow_available && (
          <p className="callout callout-amber mt-3 text-[14px]">
            <b>{t('TensorFlow is not installed on this server.', 'เซิร์ฟเวอร์นี้ไม่มี TensorFlow')}</b>{' '}
            {t(
              'Runs complete as a simulation only: the figures are estimates and no model file is produced. Use the Docker image to train for real.',
              'การเทรนจะเป็นแบบจำลองเท่านั้น ตัวเลขเป็นค่าประมาณและไม่มีไฟล์โมเดล ใช้ Docker image เพื่อเทรนจริง',
            )}
          </p>
        )}
      </section>

      <h2 className="section-title">
        {t('Training history', 'ประวัติการเทรน')} <span className="tag">{history.length}</span>
      </h2>

      {history.length === 0 ? (
        <section className="card empty">
          <p>
            <b>{t('No training history yet.', 'ยังไม่มีประวัติการเทรน')}</b>
          </p>
          <p className="hint mt-1">
            {t(
              'Start training with the "New model" button above, or here. Every run you start is listed in this section.',
              'เริ่มเทรนได้ที่ปุ่ม "สร้างโมเดลใหม่" ด้านบนหรือปุ่มนี้ ทุกการเทรนจะแสดงในส่วนนี้',
            )}
          </p>
          <button className="btn btn-primary mt-3" type="button" onClick={() => setWizardOpen(true)}>
            <FileNewIcon />
            {t('Create your first model', 'สร้างโมเดลแรก')}
          </button>
        </section>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <nav className="model-list" aria-label={t('Models', 'โมเดล')}>
            {history.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`model-row ${m.id === selectedId ? 'on' : ''}`}
                onClick={() => setSelectedId(m.id)}
              >
                <b title={m.name}>{m.name}</b>
                <span className="acc">{m.accuracy != null ? `${m.accuracy}%` : '-'}</span>
                <small>
                  <span className={`pill ${statusPill(m.status)} mr-1 !text-[12px] !leading-[18px]`}>
                    {m.status === 'running' || m.status === 'queued' ? `${m.progress}%` : statusLabel(m.status, t)}
                  </span>
                  {m.is_active && <span className="pill pill-blue mr-1 !text-[12px] !leading-[18px]">{t('In use', 'ใช้งานอยู่')}</span>}
                  {m.kind_label} · {fmtDate(m.finished_at ?? m.created_at, locale)}
                </small>
              </button>
            ))}
          </nav>

          {selected && (
            <section className="card min-w-0">
              <div className="card-head">
                <div className="min-w-0">
                  <h2 className="card-title text-[19px]"><FoldToggle />
                    {selected.name}
                    {selected.is_active && <span className="pill pill-blue">{t('In use', 'ใช้งานอยู่')}</span>}
                    {selected.engine_used === 'simulated' && <span className="pill pill-amber">{t('Simulated', 'จำลอง')}</span>}
                  </h2>
                  <p className="card-sub">
                    {selected.kind_label} · {selected.class_names.join(' / ')} ·{' '}
                    {selected.backbone === 'scratch' ? t('compact CNN (retired)', 'CNN ขนาดเล็ก (เลิกใช้แล้ว)') : 'MobileNetV2'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.status !== 'draft' && (
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      disabled={busy}
                      title={t('The images this model was trained on, as a zip', 'ภาพที่ใช้เทรนโมเดลนี้ เป็นไฟล์ zip')}
                      onClick={() => void downloadDataset(selected)}
                    >
                      <DownloadIcon />
                      {t('Download dataset', 'ดาวน์โหลดชุดข้อมูล')}
                    </button>
                  )}
                  {selected.can_activate && !selected.is_active && (
                    <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={() => void activate(selected)}>
                      <CheckIcon />
                      {selected.kind === 'hybrid'
                        ? t('Use for PRPD + TF cases', 'ใช้กับเคส PRPD + TF')
                        : t('Use for PRPD-only cases', 'ใช้กับเคส PRPD อย่างเดียว')}
                    </button>
                  )}
                  {selected.status === 'failed' && (
                    <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={() => void trainAgain(selected)}>
                      <RestoreIcon />
                      {t('Train again', 'เทรนอีกครั้ง')}
                    </button>
                  )}
                  {/* Always offered: a queued or stuck run can be deleted; the API
                      refuses only the run that is actually fitting right now. */}
                  <button className="btn btn-danger btn-sm" type="button" disabled={busy} onClick={() => void remove(selected)}>
                    <TrashIcon />
                    {t('Delete', 'ลบ')}
                  </button>
                </div>
              </div>

              {(selected.status === 'running' || selected.status === 'queued') && (
                <div className="mb-4">
                  <div className="mb-1 flex justify-between text-[14px] font-semibold">
                    <span>{stageText(selected.stage, t) || t('Starting…', 'กำลังเริ่ม…')}</span>
                    <span className="font-mono">{selected.progress}%</span>
                  </div>
                  <div className="progress">
                    <i style={{ width: `${Math.max(4, selected.progress)}%` }} />
                  </div>
                </div>
              )}

              {selected.status === 'failed' && (
                <p className="callout callout-red mb-4">
                  <b>{t('The run failed.', 'การเทรนล้มเหลว')}</b> {serverText(selected.error, t)}
                </p>
              )}

              <div className="readout-grid mb-4">
                <Readout label={t('Test accuracy', 'ความแม่นยำ (ทดสอบ)')} value={selected.accuracy != null ? `${selected.accuracy}%` : '-'} />
                <Readout label={t('Validation accuracy', 'ความแม่นยำ (ตรวจสอบ)')} value={selected.val_accuracy != null ? `${selected.val_accuracy}%` : '-'} />
                <Readout label="Loss" value={selected.loss ?? '-'} />
                <Readout label={t('Epochs run', 'จำนวน epoch')} value={`${selected.epochs}/${selected.max_epochs}`} />
                <Readout
                  label={t('Train / test / valid', 'ฝึก / ทดสอบ / ตรวจสอบ')}
                  value={`${selected.train_count}/${selected.test_count}/${selected.valid_count}`}
                />
              </div>

              {selected.note && selected.status === 'completed' && <p className="hint mb-4 text-[13.5px]">{serverText(selected.note, t)}</p>}

              {selected.status === 'completed' && <ModelEvaluation model={selected} />}
            </section>
          )}
        </div>
      )}

      {stats?.is_admin && <SharedDatasets />}

      <div>
        <Collapse title={t('Before you train: dataset checklist', 'ก่อนเทรน: รายการตรวจชุดข้อมูล')}>
          <ul className="bullets">
            <li>{t('Images are separated correctly by class, and every label has been checked.', 'แยกภาพตามคลาสถูกต้อง และตรวจป้ายกำกับทุกภาพแล้ว')}</li>
            <li>
              {t(
                `The split is close to ${stats?.recommended_split.train ?? 64}% train / ${stats?.recommended_split.test ?? 20}% test / ${stats?.recommended_split.valid ?? 16}% validation.`,
                `สัดส่วนใกล้ ${stats?.recommended_split.train ?? 64}% ฝึก / ${stats?.recommended_split.test ?? 20}% ทดสอบ / ${stats?.recommended_split.valid ?? 16}% ตรวจสอบ`,
              )}
            </li>
            <li>{t('Each class has enough images, and the counts are roughly balanced.', 'แต่ละคลาสมีภาพเพียงพอ และจำนวนใกล้เคียงกัน')}</li>
            <li>
              <b>
                {t(
                  'No image, or image from the same measurement, is in both the training and the test set.',
                  'ไม่มีภาพเดียวกันหรือภาพจากการวัดเดียวกันอยู่ทั้งในชุดฝึกและชุดทดสอบ',
                )}
              </b>{' '}
              {t('That leakage inflates the accuracy.', 'การรั่วไหลแบบนี้ทำให้ความแม่นยำสูงเกินจริง')}
            </li>
            <li>
              {t(
                'For Hybrid models, each PRPD is paired with the TF map from the same measurement (<case>_PRPD / <case>_TF).',
                'สำหรับโมเดล Hybrid ภาพ PRPD ต้องคู่กับ TF Map จากการวัดเดียวกัน (<case>_PRPD / <case>_TF)',
              )}
            </li>
          </ul>
        </Collapse>
        <ActivityLog />
      </div>

      {wizardOpen && (
        <NewModelWizard
          onClose={() => {
            setWizardOpen(false);
            void refresh();
          }}
          onFinished={() => void refresh()}
        />
      )}
    </div>
  );
}

function statusLabel(status: TrainedModel['status'], t: <V = string>(en: V, th: V) => V): string {
  switch (status) {
    case 'completed':
      return t('Completed', 'เสร็จแล้ว');
    case 'failed':
      return t('Failed', 'ล้มเหลว');
    case 'draft':
      return t('Draft', 'ร่าง');
    case 'queued':
      return t('Queued', 'รอคิว');
    default:
      return t('Training', 'กำลังเทรน');
  }
}

/** Edit history and usage log, loaded only when opened. */
function ActivityLog() {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'edits' | 'usage'>('edits');
  const [edits, setEdits] = useState<EditHistoryEntry[] | null>(null);
  const [usage, setUsage] = useState<UsageEntry[] | null>(null);

  useEffect(() => {
    if (!open || edits) return;
    Promise.all([api.editHistory(), api.usageLog(100)])
      .then(([e, u]) => {
        setEdits(e);
        setUsage(u);
      })
      .catch(() => {
        setEdits([]);
        setUsage([]);
      });
  }, [open, edits]);

  return (
    <details className="fold" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>
        <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {t('Activity: edit history and usage log', 'กิจกรรม: ประวัติการแก้ไขและการใช้งาน')}
      </summary>
      <div className="fold-body">
        <div className="tabs">
          <button type="button" className={tab === 'edits' ? 'on' : ''} onClick={() => setTab('edits')}>
            {t('Edit history', 'ประวัติการแก้ไข')}
          </button>
          <button type="button" className={tab === 'usage' ? 'on' : ''} onClick={() => setTab('usage')}>
            {t('Usage log', 'บันทึกการใช้งาน')}
          </button>
        </div>
        {edits === null ? (
          <Spinner />
        ) : tab === 'edits' ? (
          <div className="scroll-box">
            <table className="data compact">
              <thead>
                <tr>
                  <th>{t('Time', 'เวลา')}</th>
                  <th>{t('Case', 'เคส')}</th>
                  <th>{t('Field', 'ฟิลด์')}</th>
                  <th>{t('Old → new', 'เดิม → ใหม่')}</th>
                  <th>{t('By', 'โดย')}</th>
                </tr>
              </thead>
              <tbody>
                {edits.map((e, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap text-muted">{fmtDate(e.timestamp, locale)}</td>
                    <td>{e.case_base_name}</td>
                    <td>
                      <code>{e.changed_field}</code>
                    </td>
                    <td>
                      <span className="text-muted">{e.old_value || '-'}</span> → {e.new_value || '-'}
                    </td>
                    <td className="text-muted">{e.changed_by}</td>
                  </tr>
                ))}
                {edits.length === 0 && <EmptyRow colSpan={5}>{t('No edits recorded yet.', 'ยังไม่มีการแก้ไข')}</EmptyRow>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="scroll-box">
            <table className="data compact">
              <thead>
                <tr>
                  <th>{t('Time', 'เวลา')}</th>
                  <th>{t('Action', 'การกระทำ')}</th>
                  <th>{t('Details', 'รายละเอียด')}</th>
                </tr>
              </thead>
              <tbody>
                {(usage ?? []).map((u, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap text-muted">{fmtDate(u.timestamp, locale)}</td>
                    <td>
                      <code>{u.action}</code>
                    </td>
                    <td className="text-muted">{u.detail || ''}</td>
                  </tr>
                ))}
                {(usage ?? []).length === 0 && <EmptyRow colSpan={3}>{t('No activity yet.', 'ยังไม่มีกิจกรรม')}</EmptyRow>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}

/** Admins only: every dataset another account agreed to share, ready to download. */
function SharedDatasets() {
  const { toast } = useApp();
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<SharedModel[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    api
      .sharedDatasets()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  async function download(m: SharedModel) {
    setBusyId(m.id);
    try {
      await api.downloadDataset(m.id, `${m.owner}_${m.name}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not download the dataset', 'ดาวน์โหลดชุดข้อมูลไม่สำเร็จ'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card table-card">
      <div className="card-head">
        <div>
          <h2 className="card-title">
            <FoldToggle />
            {t('Shared datasets', 'ชุดข้อมูลที่แบ่งปัน')} <span className="tag">admin</span>
          </h2>
          <p className="card-sub">
            {t(
              'Datasets other accounts agreed to share with the developers. Only these can be downloaded here.',
              'ชุดข้อมูลที่บัญชีอื่นยินยอมแบ่งปันให้ผู้พัฒนา ดาวน์โหลดได้เฉพาะรายการเหล่านี้',
            )}
          </p>
        </div>
      </div>
      {rows === null ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t('Account', 'บัญชี')}</th>
                <th>{t('Model', 'โมเดล')}</th>
                <th>{t('Classes', 'คลาส')}</th>
                <th>{t('Images', 'ภาพ')}</th>
                <th>{t('Shared on', 'วันที่ยินยอม')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="row-hover">
                  <td>{m.owner}</td>
                  <td>
                    <b>{m.name}</b> <span className="text-[13px] text-muted">{m.kind_label}</span>
                  </td>
                  <td className="text-muted">{m.class_names.join(' / ')}</td>
                  <td className="num">{m.dataset_size}</td>
                  <td className="whitespace-nowrap text-muted">{fmtDate(m.consent_at, locale)}</td>
                  <td className="text-right">
                    <button type="button" className="btn btn-secondary btn-sm" disabled={busyId === m.id} onClick={() => void download(m)}>
                      <DownloadIcon />
                      {t('Download', 'ดาวน์โหลด')}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <EmptyRow colSpan={6}>{t('No account has shared a dataset yet.', 'ยังไม่มีบัญชีใดแบ่งปันชุดข้อมูล')}</EmptyRow>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
