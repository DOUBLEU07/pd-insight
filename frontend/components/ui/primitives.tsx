import type { ReactNode } from 'react';

import type { CaseStatus } from '@/lib/types';

/** Colour mapping for the three severity levels, matching the prototype. */
export function severityPillClass(severity: string | null | undefined): string {
  if (severity === 'High') return 'pill-red';
  if (severity === 'Moderate') return 'pill-amber';
  if (severity === 'Initial') return 'pill-green';
  return 'pill-gray';
}

export function resultPillClass(result: string | null | undefined): string {
  if (result === 'Non-identified' || result === 'Inconclusive') return 'pill-amber';
  if (result === 'Mixed PD Suspected') return 'pill-red';
  if (!result) return 'pill-gray';
  return 'pill-green';
}

export function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: CaseStatus }) {
  const label = status === 'done' ? 'Done' : status === 'in_review' ? 'In review' : 'Pending';
  return (
    <span className={`status-${status} status-badge`}>
      <span className="status-dot" />
      {label}
    </span>
  );
}

/** Severity display name for cases with no measurement yet. */
export function severityBucket(severity: string | null | undefined): string {
  if (severity === 'High' || severity === 'Moderate' || severity === 'Initial') return severity;
  return 'Pending';
}

export function fmt(value: number | null | undefined, digits = 2, suffix = ''): string {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(digits)}${suffix}`;
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Card({
  title,
  hint,
  right,
  children,
  className = '',
  bodyClassName = '',
}: {
  title?: ReactNode;
  hint?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={`card ${className}`}>
      {title && (
        <h2 className="justify-between">
          <span className="flex items-center gap-[10px]">{title}</span>
          {right}
        </h2>
      )}
      {hint && <p className="hint">{hint}</p>}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <table className="kv">
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={i}>
            <td className="k">{k}</td>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Readout({
  label,
  value,
  valueClass = '',
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="readout-box">
      <div className="lbl">{label}</div>
      <div className={`val ${valueClass}`}>{value}</div>
    </div>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-slate-400">
        {children}
      </td>
    </tr>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-[13px] text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500" />
      {label}
    </div>
  );
}
