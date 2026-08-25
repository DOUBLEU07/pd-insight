'use client';

import { severityBucket, StatusBadge } from '@/components/ui/primitives';
import type { PdCase } from '@/lib/types';

export type SeverityKey = 'High' | 'Moderate' | 'Initial' | 'Pending';

export interface CaseSeverityGroup {
  key: SeverityKey;
  label: string;
  count: number;
  cases: PdCase[];
}

export const SEVERITY_ORDER: SeverityKey[] = ['High', 'Moderate', 'Initial', 'Pending'];

export const SEVERITY_LABEL: Record<SeverityKey, string> = {
  High: 'High severity',
  Moderate: 'Moderate severity',
  Initial: 'Initial severity',
  Pending: 'Awaiting gap-time measurement',
};

export const SEVERITY_ACCENT: Record<SeverityKey, string> = {
  High: 'var(--internal)',
  Moderate: 'var(--corona)',
  Initial: 'var(--emerald-500)',
  Pending: 'var(--slate-400)',
};

export const SEVERITY_PILL: Record<SeverityKey, string> = {
  High: 'pill-red',
  Moderate: 'pill-amber',
  Initial: 'pill-green',
  Pending: 'pill-gray',
};

/** Buckets a flat case list into the same High/Moderate/Initial/Pending groups the dashboard uses. */
export function groupCasesBySeverity(cases: PdCase[]): CaseSeverityGroup[] {
  return SEVERITY_ORDER.map((key) => {
    const members = cases.filter((c) => severityBucket(c.severity_by_gap_time) === key);
    return { key, label: SEVERITY_LABEL[key], count: members.length, cases: members };
  });
}

/** The severity-grouped case cards, shared between the dashboard and a folder's own preview page. */
export function SeverityGroupCards({
  groups,
  onOpenCase,
  onDeleteCase,
  emptyLabel = 'No cases in this group.',
}: {
  groups: CaseSeverityGroup[];
  onOpenCase: (id: number) => void;
  onDeleteCase?: (id: number, name: string) => void;
  emptyLabel?: string;
}) {
  return (
    <>
      {groups.map((g) => (
        <div
          key={g.key}
          className="card mb-[14px] overflow-hidden p-0"
          style={{ borderLeft: `4px solid ${SEVERITY_ACCENT[g.key]}` }}
        >
          <div className="flex items-center justify-between px-5 pt-[14px]">
            <span className="text-[12.5px] font-bold text-slate-700">{g.label}</span>
            <span className={`pill ${SEVERITY_PILL[g.key]}`}>
              {g.count} case{g.count === 1 ? '' : 's'}
            </span>
          </div>

          {g.cases.length === 0 ? (
            <p className="hint px-5 pb-4 pt-[10px]">{emptyLabel}</p>
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
                        <span className="small-link" onClick={() => onOpenCase(c.id)}>
                          Open case →
                        </span>
                        {onDeleteCase && (
                          <span
                            className="small-link ml-[10px] text-internal"
                            onClick={() => onDeleteCase(c.id, c.case_base_name)}
                          >
                            Delete
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
