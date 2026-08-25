'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import {
  groupCasesBySeverity,
  SeverityGroupCards,
  type SeverityKey,
} from '@/components/case/SeverityGroups';
import { Spinner, fmtDate } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { withinDateFilter, type DateFilter } from '@/lib/filters';
import type { BatchSummary } from '@/lib/types';

type SeverityFilter = 'all' | SeverityKey;

export default function BatchPreviewPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const batchId = Number(params.id);
  const { toast } = useApp();

  const [batch, setBatch] = useState<BatchSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');

  const load = useCallback(async () => {
    try {
      setBatch(await api.getBatch(batchId));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load batch');
    } finally {
      setLoading(false);
    }
  }, [batchId, toast]);

  useEffect(() => {
    if (Number.isFinite(batchId)) void load();
  }, [batchId, load]);

  async function removeCase(id: number, name: string) {
    if (!window.confirm(`Delete case "${name}"? This cannot be undone.`)) return;
    await api.deleteCase(id);
    toast(`Deleted ${name}`);
    void load();
  }

  const groups = useMemo(() => {
    const cases = (batch?.cases ?? []).filter((c) => withinDateFilter(c.created_time, dateFilter));
    return groupCasesBySeverity(cases).filter(
      (g) => severityFilter === 'all' || g.key === severityFilter,
    );
  }, [batch, dateFilter, severityFilter]);

  if (loading) return <Spinner label="Loading batch…" />;
  if (!batch) return <p className="hint">Batch not found.</p>;

  const reviewed = batch.cases?.filter((c) => c.status === 'done').length ?? 0;
  const filtersActive = dateFilter !== 'all' || severityFilter !== 'all';

  return (
    <>
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-[10px]">
          <div>
            <h2 className="m-0 border-none p-0">{batch.name}</h2>
            <p className="hint mb-0 mt-[6px]">
              Uploaded {fmtDate(batch.upload_date)} · {batch.total} image
              {batch.total === 1 ? '' : 's'} · {reviewed}/{batch.total} reviewed
            </p>
          </div>
          <span className="small-link" onClick={() => router.push('/dashboard')}>
            ← Back to Dashboard
          </span>
        </div>
      </div>

      {(batch.cases ?? []).length > 0 && (
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
      )}

      <div className="dash-section">
        <div className="dash-section-head">
          <h2>Images in this folder, by severity</h2>
        </div>
        <p className="hint -mt-2 mb-[14px]">
          Severity comes from the confirmed PD source group combined with the measured gap-time.
          Click Open case to open a single image in the case review workflow. &quot;← Back&quot;
          returns here.
        </p>

        {(batch.cases ?? []).length === 0 ? (
          <p className="hint">This batch no longer has any cases (they may have been deleted).</p>
        ) : (
          <SeverityGroupCards
            groups={groups}
            onOpenCase={(id) => router.push(`/cases/${id}?from=batch&batch=${batch.id}`)}
            onDeleteCase={(id, name) => void removeCase(id, name)}
            emptyLabel={filtersActive ? 'No cases match this filter.' : 'No cases in this group.'}
          />
        )}
      </div>
    </>
  );
}
