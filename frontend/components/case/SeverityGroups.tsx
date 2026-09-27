'use client';

import { TrashIcon } from '@/components/ui/icons';
import { Collapse, severityBucket, StatusBadge } from '@/components/ui/primitives';
import { useI18n } from '@/lib/i18n';
import type { PdCase } from '@/lib/types';

export type SeverityKey = 'High' | 'Moderate' | 'Initial' | 'Pending';

export interface CaseSeverityGroup {
  key: SeverityKey;
  label: string;
  count: number;
  cases: PdCase[];
}

export const SEVERITY_ORDER: SeverityKey[] = ['High', 'Moderate', 'Initial', 'Pending'];

export const SEVERITY_PILL: Record<SeverityKey, string> = {
  High: 'pill-red',
  Moderate: 'pill-amber',
  Initial: 'pill-green',
  Pending: 'pill-gray',
};

export function useSeverityLabel() {
  const { t } = useI18n();
  return (key: SeverityKey): string =>
    ({
      High: t('High severity', 'ความรุนแรงสูง (High)'),
      Moderate: t('Moderate severity', 'ความรุนแรงปานกลาง (Moderate)'),
      Initial: t('Initial severity', 'ความรุนแรงเริ่มต้น (Initial)'),
      Pending: t('Awaiting gap-time measurement', 'รอวัด Gap-Time'),
    })[key];
}

/** Buckets a flat case list into the High/Moderate/Initial/Pending groups the dashboard uses. */
export function groupCasesBySeverity(cases: PdCase[]): CaseSeverityGroup[] {
  return SEVERITY_ORDER.map((key) => {
    const members = cases.filter((c) => severityBucket(c.severity_by_gap_time) === key);
    return { key, label: key, count: members.length, cases: members };
  });
}

/**
 * Severity groups as folded sections: only the first group that has cases
 * starts open, so a long list does not push everything else off the page.
 */
export function SeverityGroupCards({
  groups,
  onOpenCase,
  onDeleteCase,
  emptyLabel,
}: {
  groups: CaseSeverityGroup[];
  onOpenCase: (id: number) => void;
  onDeleteCase?: (id: number, name: string) => void;
  emptyLabel?: string;
}) {
  const { t } = useI18n();
  const label = useSeverityLabel();
  const firstFilled = groups.find((g) => g.count > 0)?.key;

  return (
    <div>
      {groups.map((g) => (
        <Collapse
          key={g.key}
          defaultOpen={g.key === firstFilled}
          title={
            <span className="inline-flex items-center gap-2">
              <span className={`pill ${SEVERITY_PILL[g.key]}`}>{g.count}</span>
              {label(g.key)}
            </span>
          }
        >
          {g.cases.length === 0 ? (
            <p className="empty">{emptyLabel ?? t('No cases in this group.', 'ไม่มีเคสในกลุ่มนี้')}</p>
          ) : (
            <div className="table-wrap max-h-[380px] overflow-y-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t('Case', 'เคส')}</th>
                    <th>{t('AI result', 'ผล AI')}</th>
                    <th>{t('PD source', 'แหล่ง PD')}</th>
                    <th>{t('Status', 'สถานะ')}</th>
                    <th>{t('Reviewer', 'ผู้ตรวจ')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {g.cases.map((c) => (
                    <tr key={c.id} className="row-hover">
                      <td>
                        <b>{c.case_base_name}</b>
                      </td>
                      <td>{c.ai_final_result ?? '-'}</td>
                      <td>{c.confirmed_pd_source_type ?? '-'}</td>
                      <td>
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="text-muted">{c.reviewer_name ?? '-'}</td>
                      <td className="whitespace-nowrap text-right">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenCase(c.id)}>
                          {t('Open', 'เปิด')}
                        </button>
                        {onDeleteCase && (
                          <button
                            type="button"
                            className="icon-only ml-1"
                            title={t('Delete case', 'ลบเคส')}
                            aria-label={t('Delete case', 'ลบเคส')}
                            onClick={() => onDeleteCase(c.id, c.case_base_name)}
                          >
                            <TrashIcon />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Collapse>
      ))}
    </div>
  );
}
