'use client';

import { useEffect, useState } from 'react';

import { Readout, Spinner, fmtDate } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import type { EditHistoryEntry, TrainingStats, UsageEntry } from '@/lib/types';

export default function TrainingPage() {
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [usage, setUsage] = useState<UsageEntry[]>([]);
  const [edits, setEdits] = useState<EditHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.trainingStats(), api.usageLog(50), api.editHistory()])
      .then(([s, u, e]) => {
        setStats(s);
        setUsage(u);
        setEdits(e);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label="Loading training data…" />;

  return (
    <>
      <div className="card">
        <h2>Training Dataset</h2>
        <p className="hint">
          Data accumulated from reviewed and saved cases, kept as the dataset a future training run
          would draw on.
        </p>
        <div className="readout-grid">
          <Readout label="Reviewed cases" value={stats?.reviewed_cases ?? 0} />
          <Readout label="Training runs so far" value={stats?.training_runs ?? 0} />
          <Readout label="Usage events (this account)" value={stats?.usage_events ?? 0} />
          <Readout
            label="Logged in as"
            value={stats?.username ?? '-'}
            valueClass="text-[14px]"
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
            <b>No image, and no image derived from the same measurement, appears in both the
            training and the testing set.</b>{' '}
            This is data leakage, and it inflates the evaluation scores.
          </li>
          <li>
            For the Hybrid model, each PRPD is paired with the TF Map{' '}
            <b>from the same measurement</b>. Unrelated PRPD/TF Map pairs must not be used.
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>Train Model</h2>
        <div className="locked-banner border-amber-200 bg-amber-50 text-amber-700">
          <b>Not enabled in this build.</b> Retraining is deliberately left out for now. The
          classification and gap-time models are the ones exported from Colab
          (PRPD_2_Only, PRPD_TF_1_sigmoid, auto_gap_time_abstract). This page tracks the dataset
          and the usage history that a training run would consume.
        </div>
        <button className="btn btn-blue" disabled type="button">
          Train Model
        </button>
      </div>

      <div className="card">
        <h2>Training History</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Trained by</th>
              <th>Dataset size</th>
              <th>Accuracy</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {(stats?.history ?? []).map((h, i) => (
              <tr key={i}>
                <td className="text-[11.5px] text-slate-400">{fmtDate(h.started_at)}</td>
                <td>{h.username}</td>
                <td>{h.dataset_size}</td>
                <td>{h.accuracy != null ? `${h.accuracy}%` : '-'}</td>
                <td className="text-[11.5px] text-slate-500">{h.note ?? '-'}</td>
              </tr>
            ))}
            {(stats?.history ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="text-slate-400">
                  No training history yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>
          Edit History{' '}
          <span className="text-[11px] font-medium text-slate-400">all reviewers</span>
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
              {edits.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-slate-400">
                    No edits recorded yet
                  </td>
                </tr>
              )}
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
              {usage.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-slate-400">
                    No usage data yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
