'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { SeverityGroupCards, type SeverityKey } from '@/components/case/SeverityGroups';
import { FileNewIcon, LayersIcon, SlidersIcon } from '@/components/ui/icons';
import { Spinner, StatusBadge, fmtDate } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { withinDateFilter, type DateFilter } from '@/lib/filters';
import type { DashboardData } from '@/lib/types';

type SeverityFilter = 'all' | SeverityKey;

export default function DashboardPage() {
  const router = useRouter();
  const { toast } = useApp();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');

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

  const filteredHistory = useMemo(
    () => (data?.upload_history ?? []).filter((b) => withinDateFilter(b.upload_date, dateFilter)),
    [data, dateFilter],
  );

  const filteredGroups = useMemo(
    () =>
      (data?.severity_groups ?? [])
        .filter((g) => severityFilter === 'all' || g.key === severityFilter)
        .map((g) => {
          const cases = g.cases.filter((c) => withinDateFilter(c.created_time, dateFilter));
          return { ...g, cases, count: cases.length };
        }),
    [data, severityFilter, dateFilter],
  );

  if (loading) return <Spinner label="Loading dashboard…" />;
  if (!data) return <p className="hint">Dashboard unavailable.</p>;

  const { kpi } = data;
  const filtersActive = dateFilter !== 'all' || severityFilter !== 'all';

  return (
    <>
      {/* ---------- Filters ---------- */}
      <div className="topfilters">
        <label className="flex items-center gap-[6px]">
          Uploaded:
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            className="w-auto min-w-[150px]"
          >
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="3d">Last 3 days</option>
            <option value="7d">Last 7 days</option>
          </select>
        </label>
        <label className="flex items-center gap-[6px]">
          Severity:
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
            className="w-auto min-w-[150px]"
          >
            <option value="all">All severities</option>
            <option value="High">High</option>
            <option value="Moderate">Moderate</option>
            <option value="Initial">Initial</option>
            <option value="Pending">Pending</option>
          </select>
        </label>
        {filtersActive && (
          <span
            className="small-link"
            onClick={() => {
              setDateFilter('all');
              setSeverityFilter('all');
            }}
          >
            Clear filters
          </span>
        )}
      </div>

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
          uploaded. The severity filter above does not apply here since a folder holds many
          severities at once. Open a folder to see its own breakdown.
        </p>

        {filteredHistory.length === 0 ? (
          <p className="hint">
            {data.upload_history.length === 0 ? 'No uploads yet.' : 'No uploads match this filter.'}
          </p>
        ) : (
          filteredHistory.map((b) => (
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
          Cases not yet measured are grouped separately below. This shows single-case uploads
          only. Folder/batch uploads keep their own severity breakdown on the folder&apos;s page
          (open one from Upload History above).
        </p>

        <SeverityGroupCards
          groups={filteredGroups}
          onOpenCase={(id) => router.push(`/cases/${id}`)}
          onDeleteCase={(id, name) => void removeCase(id, name)}
          emptyLabel={filtersActive ? 'No cases match this filter.' : 'No cases in this group.'}
        />
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
