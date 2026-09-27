'use client';

import type { CSSProperties, ReactNode } from 'react';

import { CheckIcon, ChevronRightIcon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n';
import type { CaseStatus } from '@/lib/types';

/** Colour mapping for the three severity levels. */
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
  return 'pill-blue';
}

export function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: CaseStatus }) {
  const { t } = useI18n();
  const label =
    status === 'done'
      ? t('Reviewed', 'ตรวจแล้ว')
      : status === 'in_review'
        ? t('In review', 'กำลังตรวจ')
        : t('Pending', 'รอตรวจ');
  return (
    <span className={`status-badge status-${status}`}>
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

export function fmtDate(value: string | null | undefined, locale = 'en-GB'): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  text = false,
}: {
  label: ReactNode;
  value: ReactNode;
  /** Set for words rather than measured numbers, so they are not set in mono. */
  text?: boolean;
}) {
  return (
    <div className="readout">
      <div className="lbl">{label}</div>
      <div className={`val ${text ? 'text' : ''}`}>{value}</div>
    </div>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="empty">
        {children}
      </td>
    </tr>
  );
}

export function Spinner({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 py-10 text-[14.5px] text-muted">
      <span className="spinner" />
      {label ?? t('Loading…', 'กำลังโหลด…')}
    </div>
  );
}

/** A native <details> section, so long reference data stays folded away. */
export function Collapse({
  title,
  meta,
  children,
  defaultOpen = false,
  flat = false,
  id,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  flat?: boolean;
  id?: string;
}) {
  return (
    <details className={`fold ${flat ? 'flat' : ''}`} open={defaultOpen} id={id}>
      <summary>
        <ChevronRightIcon className="chev" />
        <span>{title}</span>
        {meta && <span className="summary-meta">{meta}</span>}
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

/** The green check that pops in when a file lands. Re-keyed by the caller to replay. */
export function DoneBadge({ small = false, animate = true }: { small?: boolean; animate?: boolean }) {
  return (
    <span className={`done-badge ${small ? 'sm' : ''} ${animate ? 'animate' : ''}`} aria-hidden="true">
      <CheckIcon />
    </span>
  );
}

/**
 * Confirmation strip shown once images have been read in: a PD pulse trace
 * draws itself, then the count. The only decorative motion in the app.
 */
export function UploadBanner({ title, detail }: { title: ReactNode; detail?: ReactNode }) {
  return (
    <div className="upload-banner" role="status">
      <svg className="pulse-trace" viewBox="0 0 56 22" aria-hidden="true">
        <path
          d="M1 11 H14 L18 3 L23 19 L28 7 L32 15 L35 11 H43 L46 14 L49 5 L55 11"
          style={{ ['--len' as string]: 120 }}
        />
      </svg>
      <DoneBadge small />
      <span>
        {title}
        {detail && <small>{detail}</small>}
      </span>
    </div>
  );
}

export function Meter({ value, accent }: { value: number; accent?: string }) {
  return (
    <div className="meter" style={accent ? ({ ['--accent' as string]: accent } as CSSProperties) : undefined}>
      <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
