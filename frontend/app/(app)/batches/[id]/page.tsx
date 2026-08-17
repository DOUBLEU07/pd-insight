'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import {
  Spinner,
  StatusBadge,
  fmtDate,
  severityBucket,
  severityPillClass,
} from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import type { BatchSummary } from '@/lib/types';

export default function BatchPreviewPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const batchId = Number(params.id);
  const { toast } = useApp();

  const [batch, setBatch] = useState<BatchSummary | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <Spinner label="Loading batch…" />;
  if (!batch) return <p className="hint">Batch not found.</p>;

  const reviewed = batch.cases?.filter((c) => c.status === 'done').length ?? 0;

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

      <div className="card">
        <h2>Images in this batch</h2>
        <p className="hint">
          Click Preview to open a single image in the case review workflow. &quot;← Back&quot;
          returns here.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>Case</th>
              <th>Defect</th>
              <th>PD Source</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Reviewer</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(batch.cases ?? []).map((c) => {
              const bucket = severityBucket(c.severity_by_gap_time);
              return (
                <tr key={c.id}>
                  <td>
                    <b>{c.case_base_name}</b>
                  </td>
                  <td className="text-[12.5px] text-slate-500">{c.defect_name ?? '-'}</td>
                  <td className="text-[12.5px]">{c.confirmed_pd_source_type ?? '-'}</td>
                  <td>
                    <span className={`pill ${severityPillClass(c.severity_by_gap_time)}`}>
                      {bucket}
                    </span>
                  </td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="text-[12.5px] text-slate-500">{c.reviewer_name ?? '-'}</td>
                  <td className="whitespace-nowrap">
                    <span
                      className="small-link"
                      onClick={() => router.push(`/cases/${c.id}?from=batch&batch=${batch.id}`)}
                    >
                      Preview →
                    </span>
                    <span
                      className="small-link ml-[10px] text-internal"
                      onClick={() => void removeCase(c.id, c.case_base_name)}
                    >
                      Delete
                    </span>
                  </td>
                </tr>
              );
            })}
            {(batch.cases ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="hint">
                  This batch no longer has any cases (they may have been deleted).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
