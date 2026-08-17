'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { FileNewIcon, LayersIcon, SlidersIcon } from '@/components/ui/icons';
import {
  EmptyRow,
  Spinner,
  StatusBadge,
  fmtDate,
  severityBucket,
  severityPillClass,
} from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import type { DashboardData } from '@/lib/types';

const GROUP_ACCENT: Record<string, string> = {
  High: 'var(--internal)',
  Moderate: 'var(--corona)',
  Initial: 'var(--emerald-500)',
  Pending: 'var(--slate-400)',
};

const GROUP_PILL: Record<string, string> = {
  High: 'pill-red',
  Moderate: 'pill-amber',
  Initial: 'pill-green',
  Pending: 'pill-gray',
};

export default function DashboardPage() {
  const router = useRouter();
  const { toast } = useApp();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await api.dashboard());
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function removeBatch(id: number, name: string, count: number) {
    if (
      !window.confirm(
        `Delete the entire batch "${name}" (${count} case${count === 1 ? '' : 's'})? This cannot be undone.`,
      )
    )
      return;
    await api.deleteBatch(id);
    toast(`Deleted batch "${name}"`);
    void load();
  }

  async function removeCase(id: number, name: string) {
    if (
      !window.confirm(
        `Delete case "${name}"? Use this if it was uploaded by mistake. This cannot be undone.`,
      )
    )
      return;
    await api.deleteCase(id);
    toast(`Deleted ${name}`);
    void load();
  }

  if (loading) return <Spinner label="Loading dashboard…" />;
  if (!data) return <p className="hint">Dashboard unavailable.</p>;

  const { kpi } = data;

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-accent" style={{ background: '#1F4E79' }} />
          <div className="kpi-label">Total Cases</div>
          <div className="kpi-value">{kpi.total}</div>
          <div className="kpi-sub">in dataset</div>
        </div>
        <div className="kpi-card">
          <span className="kpi-accent" style={{ background: '#F59E0B' }} />
          <div className="kpi-label">Corona</div>
          <div className="kpi-value">{kpi.corona}</div>
          <div className="kpi-sub">{kpi.corona_pct}% of dataset</div>
        </div>
        <div className="kpi-card">
          <span className="kpi-accent" style={{ background: '#0EA5E9' }} />
          <div className="kpi-label">Surface</div>
          <div className="kpi-value">{kpi.surface}</div>
          <div className="kpi-sub">{kpi.surface_pct}% of dataset</div>
        </div>
        <div className="kpi-card">
          <span className="kpi-accent" style={{ background: '#EF4444' }} />
          <div className="kpi-label">Internal</div>
          <div className="kpi-value">{kpi.internal}</div>
          <div className="kpi-sub">{kpi.internal_pct}% of dataset</div>
        </div>
      </div>

      {/* ---------- Upload History ---------- */}
      <div className="dash-section">
        <div className="dash-section-head">
          <h2>Upload History</h2>
        </div>
        <p className="hint -mt-2 mb-[14px]">
          Every single-case or folder/batch upload, ordered by what needs attention first: not yet
          fully reviewed, then how many high-severity images it contains, then most recently
          uploaded.
        </p>

        {data.upload_history.length === 0 ? (
          <p className="hint">No uploads yet.</p>
        ) : (
          data.upload_history.map((b) => (
            <div
              key={b.id}
              className="card mb-[10px] flex flex-wrap items-center gap-4 px-5 py-[14px]"
            >
              <div className="min-w-[220px] flex-1">
                <div className="text-[13px] font-bold text-slate-900">
                  {b.name}
                  {!b.is_single && (
                    <span className="ml-1 text-[11.5px] font-medium text-slate-400">
                      (folder / batch)
                    </span>
                  )}
                </div>
                <div className="mt-[2px] text-[11.5px] text-slate-400">
                  Uploaded {fmtDate(b.upload_date)} · {b.total} image{b.total === 1 ? '' : 's'}
                </div>
              </div>
              <div>
                {b.high_severity > 0 ? (
                  <span className="pill pill-red">{b.high_severity} high severity</span>
                ) : (
                  <span className="pill pill-gray">No high severity</span>
                )}
              </div>
              <div>
                <StatusBadge status={b.overall_status} />
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() =>
                    b.is_single && b.first_case_id
                      ? router.push(`/cases/${b.first_case_id}`)
                      : router.push(`/batches/${b.id}`)
                  }
                >
                  Preview
                </button>
                <button
                  className="btn btn-outline border-red-200 text-internal"
                  type="button"
                  onClick={() => void removeBatch(b.id, b.name, b.total)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ---------- Cases by Severity ---------- */}
      <div className="dash-section">
        <div className="dash-section-head">
          <h2>Cases by Severity</h2>
          <span className="view-all-link" onClick={() => router.push('/cases?mode=folder')}>
            View all →
          </span>
        </div>
        <p className="hint -mt-2 mb-[14px]">
          Severity comes from the confirmed PD source group combined with the measured gap-time.
          Cases not yet measured are grouped separately below.
        </p>

        {data.severity_groups.map((g) => (
          <div
            key={g.key}
            className="card mb-[14px] overflow-hidden p-0"
            style={{ borderLeft: `4px solid ${GROUP_ACCENT[g.key]}` }}
          >
            <div className="flex items-center justify-between px-5 pt-[14px]">
              <span className="text-[12.5px] font-bold text-slate-700">{g.label}</span>
              <span className={`pill ${GROUP_PILL[g.key]}`}>
                {g.count} case{g.count === 1 ? '' : 's'}
              </span>
            </div>

            {g.cases.length === 0 ? (
              <p className="hint px-5 pb-4 pt-[10px]">No cases in this group.</p>
            ) : (
              <div className="max-h-[420px] overflow-y-auto">
                <table className="data mt-[6px]">
                  <thead>
                    <tr>
                      <th>Case ID</th>
                      <th>Defect</th>
                      <th>PD Source</th>
                      <th>Status</th>
                      <th>Reviewer</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {g.cases.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <b>{c.case_base_name}</b>
                        </td>
                        <td className="text-[12.5px] text-slate-500">{c.defect_name ?? '-'}</td>
                        <td className="text-[12.5px]">{c.confirmed_pd_source_type ?? '-'}</td>
                        <td>
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="text-[12.5px] text-slate-500">{c.reviewer_name ?? '-'}</td>
                        <td className="whitespace-nowrap">
                          <span
                            className="small-link"
                            onClick={() => router.push(`/cases/${c.id}`)}
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
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ---------- Quick Actions ---------- */}
      <div className="dash-section">
        <h2 className="m-0 mb-[14px] text-[16px] font-semibold text-slate-900">Quick Actions</h2>
        <div className="quick-actions-grid">
          <button
            className="quick-action-card"
            type="button"
            onClick={() => {
              const next =
                data.severity_groups
                  .flatMap((g) => g.cases)
                  .find((c) => c.status === 'pending') ??
                data.severity_groups.flatMap((g) => g.cases).find((c) => c.status === 'in_review');
              if (next) router.push(`/cases/${next.id}`);
              else router.push('/cases');
            }}
          >
            <span className="quick-action-icon" style={{ background: '#EEF3F8', color: '#1F4E79' }}>
              <FileNewIcon width={18} height={18} />
            </span>
            <div className="quick-action-title">New / Resume Case</div>
            <div className="quick-action-desc">Open the next pending case for review</div>
          </button>

          <button
            className="quick-action-card"
            type="button"
            onClick={() => router.push('/cases?mode=folder')}
          >
            <span className="quick-action-icon" style={{ background: '#ECFDF5', color: '#10B981' }}>
              <LayersIcon width={18} height={18} />
            </span>
            <div className="quick-action-title">Open Folder / Batch Queue</div>
            <div className="quick-action-desc">Process the full case queue</div>
          </button>

          <button
            className="quick-action-card"
            type="button"
            onClick={() => router.push('/cases?mode=folder#presets')}
          >
            <span className="quick-action-icon" style={{ background: '#FFFBEB', color: '#F59E0B' }}>
              <SlidersIcon width={18} height={18} />
            </span>
            <div className="quick-action-title">Calibration Presets</div>
            <div className="quick-action-desc">Manage saved frame calibrations</div>
          </button>
        </div>
      </div>
    </>
  );
}
