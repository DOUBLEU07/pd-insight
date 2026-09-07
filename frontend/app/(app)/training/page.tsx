'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { NewModelWizard } from '@/components/training/NewModelWizard';
import { CheckIcon, FileNewIcon } from '@/components/ui/icons';
import { EmptyRow, Readout, Spinner, fmtDate } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import type { EditHistoryEntry, TrainedModel, TrainingStats, UsageEntry } from '@/lib/types';

/** Status colour for the model history table. */
function statusPill(status: TrainedModel['status']): string {
  if (status === 'completed') return 'pill-green';
  if (status === 'failed') return 'pill-red';
  if (status === 'draft') return 'pill-gray';
  return 'pill-amber';
}

export default function TrainingPage() {
  const { toast } = useApp();

  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [usage, setUsage] = useState<UsageEntry[]>([]);
  const [edits, setEdits] = useState<EditHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshStats = useCallback(async () => {
    try {
      setStats(await api.trainingStats());
    } catch {
      /* keep whatever is on screen rather than blanking the page */
    }
  }, []);

  useEffect(() => {
    Promise.all([api.trainingStats(), api.usageLog(50), api.editHistory()])
      .then(([s, u, e]) => {
        setStats(s);
        setUsage(u);
        setEdits(e);
      })
      .finally(() => setLoading(false));
  }, []);

  // A run started here, or in another tab, keeps updating the history table
  // while it is in flight.
  useEffect(() => {
    const inFlight = (stats?.history ?? []).some(
      (m) => m.status === 'queued' || m.status === 'running',
    );
    if (!inFlight) return;
    pollTimer.current = setTimeout(() => void refreshStats(), 2000);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [stats, refreshStats]);

  async function activate(model: TrainedModel) {
    setBusyId(model.id);
    try {
      await api.activateModel(model.id);
      await refreshStats();
      toast(`New cases will be analysed with ${model.name}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not select that model');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(model: TrainedModel) {
    setBusyId(model.id);
    try {
      await api.deleteModel(model.id);
      await refreshStats();
      toast(`Deleted ${model.name}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not delete that model');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <Spinner label="Loading training data…" />;

  const history = stats?.history ?? [];

  return (
    <>
      <div className="card">
        <h2 className="justify-between">
          <span>Model Training</span>
          <button className="btn btn-blue" type="button" onClick={() => setWizardOpen(true)}>
            <FileNewIcon className="btn-icon" />
            New model
          </button>
        </h2>
        <p className="hint">
          Train a classifier on your own labelled images. Everything below belongs to your account
          alone: your dataset, your runs, and the model your cases are analysed with.
        </p>
        <div className="readout-grid">
          <Readout label="Reviewed cases" value={stats?.reviewed_cases ?? 0} />
          <Readout label="Training runs" value={stats?.training_runs ?? 0} />
          <Readout label="Usage events (this account)" value={stats?.usage_events ?? 0} />
          <Readout label="Logged in as" value={stats?.username ?? '-'} valueClass="text-[14px]" />
        </div>

        {stats && !stats.tensorflow_available && (
          <div className="callout callout-amber mt-[14px]">
            <b className="mb-[6px] block">TensorFlow is not available in this build</b>
            A run started here still completes, but as a <b>simulation</b>: no network is fitted,
            the figures are derived from the dataset composition rather than measured, and no model
            file is produced, so the result cannot be selected as your analysis model. Run the
            backend with TensorFlow installed (the Docker image ships it) to train for real.
          </div>
        )}
      </div>

      <div className="card">
        <h2>Model History</h2>
        <p className="hint">
          Every run on this account. The one marked <b>In use</b> is what new analyses are scored
          with; with none selected, the published Colab models are used.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>Model</th>
              <th>Type</th>
              <th>Trained</th>
              <th>Dataset</th>
              <th>Accuracy</th>
              <th>Status</th>
              <th className="w-[170px]" />
            </tr>
          </thead>
          <tbody>
            {history.map((m) => (
              <tr key={m.id}>
                <td>
                  <b className="text-slate-900">{m.name}</b>
                  {m.is_active && <span className="pill pill-green ml-2">In use</span>}
                  {m.engine_used === 'simulated' && (
                    <span className="pill pill-amber ml-2">Simulated</span>
                  )}
                </td>
                <td className="text-[12px] text-slate-500">
                  {m.kind_label}
                  {!m.uses_published_classes && (
                    <span className="block text-[11px] text-slate-400">
                      {m.class_names.join(' / ')}
                    </span>
                  )}
                </td>
                <td className="text-[11.5px] text-slate-400">
                  {fmtDate(m.finished_at ?? m.created_at)}
                </td>
                <td className="text-[12px] text-slate-500">
                  {m.dataset_size} ({m.train_count}/{m.test_count}/{m.valid_count})
                </td>
                <td>
                  {m.accuracy != null ? (
                    <b className={m.engine_used === 'simulated' ? 'text-amber-700' : ''}>
                      {m.accuracy}%
                    </b>
                  ) : (
                    '-'
                  )}
                </td>
                <td>
                  <span className={`pill ${statusPill(m.status)}`}>
                    {m.status === 'running' || m.status === 'queued'
                      ? `${m.stage ?? 'Running'} ${m.progress}%`
                      : m.status}
                  </span>
                </td>
                <td>
                  <div className="flex justify-end gap-[6px]">
                    {m.can_activate && !m.is_active && (
                      <button
                        className="btn btn-outline px-[11px] py-[6px] text-[12px]"
                        type="button"
                        disabled={busyId === m.id}
                        onClick={() => void activate(m)}
                      >
                        <CheckIcon className="btn-icon" />
                        Use
                      </button>
                    )}
                    {m.status !== 'running' && m.status !== 'queued' && (
                      <button
                        className="btn btn-outline px-[11px] py-[6px] text-[12px] text-red-700"
                        type="button"
                        disabled={busyId === m.id}
                        onClick={() => void remove(m)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {history.length === 0 && (
              <EmptyRow colSpan={7}>
                No models yet. Press <b>New model</b> to build one from your own images.
              </EmptyRow>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Training Dataset</h2>
        <p className="hint">
          Data accumulated from reviewed and saved cases, kept as the dataset a training run would
          draw on.
        </p>
        <div className="readout-grid">
          <Readout label="Reviewed cases" value={stats?.reviewed_cases ?? 0} />
          <Readout
            label="Recommended split"
            value={
              stats
                ? `${stats.recommended_split.train}/${stats.recommended_split.test}/${stats.recommended_split.valid}`
                : '-'
            }
            valueClass="text-[14px]"
          />
          <Readout
            label="Default classes"
            value={(stats?.canonical_classes ?? []).join(', ') || '-'}
            valueClass="text-[13px]"
          />
        </div>
      </div>

      <div className="card">
        <h2>Pre-Training Checklist</h2>
        <p className="hint">
          Conditions a dataset must satisfy before a training run is meaningful. Work through these
          before preparing data. The last one is the difference between a real accuracy figure and
          an inflated one.
        </p>
        <ul className="help-checklist text-[12.5px] leading-[1.6] text-slate-600">
          <li>Data is arranged in the directory structure the system defines.</li>
          <li>Data is separated correctly by class: Corona, Surface, Internal.</li>
          <li>Every image label has been verified before training starts.</li>
          <li>
            The split is fixed at <b>64% training / 20% testing / 16% validation</b>.
          </li>
          <li>
            Each class holds enough samples, and class counts are not far out of balance with one
            another.
          </li>
          <li>
            <b>
              No image, and no image derived from the same measurement, appears in both the
              training and the testing set.
            </b>{' '}
            This is data leakage, and it inflates the evaluation scores.
          </li>
          <li>
            For the Hybrid model, each PRPD is paired with the TF Map{' '}
            <b>from the same measurement</b>. Unrelated PRPD/TF Map pairs must not be used.
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>
          Edit History <span className="text-[11px] font-medium text-slate-400">all reviewers</span>
        </h2>
        <p className="hint">
          Every field-level change made during review, exportable as edit_history.csv from the
          Export Center.
        </p>
        <div className="max-h-[320px] overflow-y-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Case</th>
                <th>Field</th>
                <th>Old</th>
                <th>New</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {edits.map((e, i) => (
                <tr key={i}>
                  <td className="text-[11.5px] text-slate-400">{fmtDate(e.timestamp)}</td>
                  <td>{e.case_base_name}</td>
                  <td>{e.changed_field}</td>
                  <td className="text-[11.5px] text-slate-500">{e.old_value || '-'}</td>
                  <td className="text-[11.5px]">{e.new_value || '-'}</td>
                  <td className="text-[11.5px] text-slate-500">{e.changed_by}</td>
                </tr>
              ))}
              {edits.length === 0 && <EmptyRow colSpan={6}>No edits recorded yet</EmptyRow>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>
          Usage Log <span className="text-[11px] font-medium text-slate-400">this account</span>
        </h2>
        <div className="max-h-[320px] overflow-y-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u, i) => (
                <tr key={i}>
                  <td className="text-[11.5px] text-slate-400">{fmtDate(u.timestamp)}</td>
                  <td>{u.action}</td>
                  <td className="text-[11.5px] text-slate-500">{u.detail || ''}</td>
                </tr>
              ))}
              {usage.length === 0 && <EmptyRow colSpan={3}>No usage data yet</EmptyRow>}
            </tbody>
          </table>
        </div>
      </div>

      {wizardOpen && (
        <NewModelWizard
          onClose={() => {
            setWizardOpen(false);
            void refreshStats();
          }}
          onFinished={() => void refreshStats()}
        />
      )}
    </>
  );
}
