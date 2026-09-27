'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AssessmentChoice } from '@/components/case/AssessmentChoice';
import { SeverityGroupCards, SEVERITY_PILL, type SeverityKey } from '@/components/case/SeverityGroups';
import { ArrowRightIcon, TrashIcon } from '@/components/ui/icons';
import { EmptyRow, Meter, Spinner, StatusBadge, fmtDate, severityBucket } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { withinDateFilter, type DateFilter } from '@/lib/filters';
import { useI18n } from '@/lib/i18n';
import type { DashboardData, PdCase } from '@/lib/types';

type SeverityFilter = 'all' | SeverityKey;
type Tab = 'history' | 'severity';

const HISTORY_PREVIEW = 8;
const SEVERITY_RANK: Record<string, number> = { High: 0, Moderate: 1, Initial: 2, Pending: 3 };

export default function DashboardPage() {
  const router = useRouter();
  const { toast, options } = useApp();
  const { t, locale } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('history');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [showAllHistory, setShowAllHistory] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.dashboard());
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not load the dashboard', 'โหลดแดชบอร์ดไม่สำเร็จ'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function removeBatch(id: number, name: string, count: number) {
    if (
      !window.confirm(
        t(
          `Delete "${name}" and its ${count} case(s)? This cannot be undone.`,
          `ลบ "${name}" และเคสทั้งหมด ${count} เคส? ไม่สามารถย้อนกลับได้`,
        ),
      )
    )
      return;
    try {
      await api.deleteBatch(id);
      toast(t(`Deleted "${name}"`, `ลบ "${name}" แล้ว`));
      void load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Delete failed', 'ลบไม่สำเร็จ'));
    }
  }

  async function removeCase(id: number, name: string) {
    if (!window.confirm(t(`Delete case "${name}"? This cannot be undone.`, `ลบเคส "${name}"? ไม่สามารถย้อนกลับได้`))) return;
    try {
      await api.deleteCase(id);
      toast(t(`Deleted ${name}`, `ลบ ${name} แล้ว`));
      void load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Delete failed', 'ลบไม่สำเร็จ'));
    }
  }

  const history = useMemo(
    () => (data?.upload_history ?? []).filter((b) => withinDateFilter(b.upload_date, dateFilter)),
    [data, dateFilter],
  );

  const groups = useMemo(
    () =>
      (data?.severity_groups ?? [])
        .filter((g) => severityFilter === 'all' || g.key === severityFilter)
        .map((g) => {
          const cases = g.cases.filter((c) => withinDateFilter(c.created_time, dateFilter));
          return { ...g, cases, count: cases.length };
        }),
    [data, severityFilter, dateFilter],
  );

  /** Unreviewed single-image cases, most severe first. */
  const nextUp: PdCase[] = useMemo(
    () =>
      (data?.severity_groups ?? [])
        .flatMap((g) => g.cases)
        .filter((c) => c.status !== 'done')
        .sort(
          (a, b) =>
            SEVERITY_RANK[severityBucket(a.severity_by_gap_time)] -
            SEVERITY_RANK[severityBucket(b.severity_by_gap_time)],
        )
        .slice(0, 5),
    [data],
  );

  if (loading) return <Spinner />;
  if (!data) return <p className="empty">{t('Dashboard unavailable.', 'ไม่สามารถแสดงแดชบอร์ดได้')}</p>;

  const { kpi } = data;
  const highMs = options?.constants.gap_time_high_ms ?? 4;
  const singleCount = data.severity_groups.reduce((n, g) => n + g.count, 0);
  const visibleHistory = showAllHistory ? history : history.slice(0, HISTORY_PREVIEW);
  const filtersActive = dateFilter !== 'all' || severityFilter !== 'all';

  return (
    <div className="stack">
      {/* ---------- KPIs ---------- */}
      <div className="kpi-grid">
        <div className="kpi" style={{ ['--accent' as string]: 'var(--navy)' }}>
          <div className="kpi-label">{t('Total cases', 'เคสทั้งหมด')}</div>
          <div className="kpi-value">{kpi.total}</div>
          <div className="kpi-sub">
            {t(`from ${kpi.batches ?? 0} upload(s)`, `จากการอัปโหลด ${kpi.batches ?? 0} ครั้ง`)}
          </div>
        </div>
        <div className="kpi" style={{ ['--accent' as string]: '#10b981' }}>
          <div className="kpi-label">{t('Reviewed', 'ตรวจแล้ว')}</div>
          <div className="kpi-value">{kpi.reviewed ?? 0}</div>
          <Meter value={kpi.reviewed_pct ?? 0} accent="#10b981" />
          <div className="kpi-sub">
            {t(`${kpi.reviewed_pct ?? 0}% of all cases`, `${kpi.reviewed_pct ?? 0}% ของเคสทั้งหมด`)}
          </div>
        </div>
        <div className="kpi" style={{ ['--accent' as string]: '#f59e0b' }}>
          <div className="kpi-label">{t('Waiting for review', 'รอตรวจ')}</div>
          <div className="kpi-value">{kpi.to_review ?? 0}</div>
          <div className="kpi-sub">{t('not signed off yet', 'ยังไม่ได้ยืนยันผล')}</div>
        </div>
        <div className="kpi" style={{ ['--accent' as string]: '#ef4444' }}>
          <div className="kpi-label">{t('High severity', 'ความรุนแรงสูง')}</div>
          <div className="kpi-value">{kpi.high_severity ?? 0}</div>
          <div className="kpi-sub">
            {t(`gap-time under ${highMs} ms`, `Gap-Time ต่ำกว่า ${highMs} ms`)}
          </div>
        </div>
      </div>

      {/* ---------- Start / continue ---------- */}
      <div className="split">
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">{t('Start an assessment', 'เริ่มการประเมิน')}</h2>
              <p className="card-sub">
                {t('Choose how many images you are assessing.', 'เลือกว่าจะประเมินภาพเดียวหรือทั้งโฟลเดอร์')}
              </p>
            </div>
          </div>
          <AssessmentChoice />
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">{t('Continue reviewing', 'ตรวจต่อ')}</h2>
              <p className="card-sub">
                {t('Single-image cases not signed off yet, most severe first.', 'เคสภาพเดี่ยวที่ยังไม่ยืนยัน เรียงจากรุนแรงที่สุด')}
              </p>
            </div>
          </div>
          {nextUp.length === 0 ? (
            <p className="empty">{t('Nothing waiting. Every single-image case is reviewed.', 'ไม่มีเคสค้าง เคสภาพเดี่ยวตรวจครบแล้ว')}</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {nextUp.map((c) => {
                const sev = severityBucket(c.severity_by_gap_time) as SeverityKey;
                return (
                  <li key={c.id} className="flex items-center gap-3 border-b border-line py-[7px] last:border-b-0">
                    <span className={`pill ${SEVERITY_PILL[sev]}`}>{sev === 'Pending' ? t('No gap-time', 'ยังไม่วัด') : sev}</span>
                    <b className="min-w-0 flex-1 truncate">{c.case_base_name}</b>
                    <StatusBadge status={c.status} />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => router.push(`/cases/${c.id}`)}>
                      {t('Open', 'เปิด')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* ---------- History / severity ---------- */}
      <section className="card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="tabs mb-0 flex-1 border-b-0" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>
              {t('Upload history', 'ประวัติการอัปโหลด')}
              <span className="count">{data.upload_history.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === 'severity'} className={tab === 'severity' ? 'on' : ''} onClick={() => setTab('severity')}>
              {t('Single-image cases by severity', 'เคสภาพเดี่ยวตามความรุนแรง')}
              <span className="count">{singleCount}</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilter)}
              className="w-auto"
              aria-label={t('Uploaded', 'วันที่อัปโหลด')}
            >
              <option value="all">{t('Any time', 'ทุกช่วงเวลา')}</option>
              <option value="today">{t('Today', 'วันนี้')}</option>
              <option value="3d">{t('Last 3 days', '3 วันล่าสุด')}</option>
              <option value="7d">{t('Last 7 days', '7 วันล่าสุด')}</option>
            </select>
            {tab === 'severity' && (
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
                className="w-auto"
                aria-label={t('Severity', 'ความรุนแรง')}
              >
                <option value="all">{t('All severities', 'ทุกระดับ')}</option>
                <option value="High">High</option>
                <option value="Moderate">Moderate</option>
                <option value="Initial">Initial</option>
                <option value="Pending">{t('No gap-time yet', 'ยังไม่วัด Gap-Time')}</option>
              </select>
            )}
            {filtersActive && (
              <button
                type="button"
                className="link text-[14px]"
                onClick={() => {
                  setDateFilter('all');
                  setSeverityFilter('all');
                }}
              >
                {t('Clear', 'ล้างตัวกรอง')}
              </button>
            )}
          </div>
        </div>
        <div className="-mx-5 mb-[14px] border-b border-line max-[720px]:-mx-[14px]" />

        {tab === 'history' ? (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t('Upload', 'การอัปโหลด')}</th>
                    <th>{t('Uploaded', 'วันที่')}</th>
                    <th>{t('Reviewed', 'ตรวจแล้ว')}</th>
                    <th>{t('High severity', 'รุนแรงสูง')}</th>
                    <th>{t('Status', 'สถานะ')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visibleHistory.map((b) => (
                    <tr key={b.id} className="row-hover">
                      <td>
                        <b>{b.name}</b>{' '}
                        <span className="tag">{b.is_single ? t('single', 'ภาพเดี่ยว') : t(`folder · ${b.total}`, `โฟลเดอร์ · ${b.total}`)}</span>
                      </td>
                      <td className="whitespace-nowrap text-muted">{fmtDate(b.upload_date, locale)}</td>
                      <td className="num">
                        {b.done}/{b.total}
                      </td>
                      <td>
                        {b.high_severity > 0 ? (
                          <span className="pill pill-red">{b.high_severity}</span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={b.overall_status} />
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          onClick={() =>
                            b.is_single && b.first_case_id
                              ? router.push(`/cases/${b.first_case_id}`)
                              : router.push(`/batches/${b.id}`)
                          }
                        >
                          {t('Open', 'เปิด')}
                        </button>
                        <button
                          className="icon-only ml-1"
                          type="button"
                          title={t('Delete upload', 'ลบการอัปโหลด')}
                          aria-label={t('Delete upload', 'ลบการอัปโหลด')}
                          onClick={() => void removeBatch(b.id, b.name, b.total)}
                        >
                          <TrashIcon />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <EmptyRow colSpan={6}>
                      {data.upload_history.length === 0
                        ? t('No uploads yet. Start an assessment above.', 'ยังไม่มีการอัปโหลด เริ่มการประเมินได้ด้านบน')
                        : t('No uploads match this filter.', 'ไม่พบการอัปโหลดที่ตรงกับตัวกรอง')}
                    </EmptyRow>
                  )}
                </tbody>
              </table>
            </div>
            {history.length > HISTORY_PREVIEW && (
              <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => setShowAllHistory((v) => !v)}>
                {showAllHistory
                  ? t('Show fewer', 'แสดงน้อยลง')
                  : t(`Show all ${history.length}`, `แสดงทั้งหมด ${history.length} รายการ`)}
                <ArrowRightIcon />
              </button>
            )}
          </>
        ) : (
          <>
            <p className="hint mb-3">
              {t(
                'Severity combines the confirmed PD source group with the measured gap-time. Folder uploads keep their own breakdown on the folder page.',
                'ความรุนแรงมาจากกลุ่มแหล่ง PD ที่ยืนยันร่วมกับ Gap-Time ที่วัดได้ การอัปโหลดแบบโฟลเดอร์ดูแยกได้ในหน้าของโฟลเดอร์นั้น',
              )}
            </p>
            <SeverityGroupCards
              groups={groups}
              onOpenCase={(id) => router.push(`/cases/${id}`)}
              onDeleteCase={(id, name) => void removeCase(id, name)}
              emptyLabel={filtersActive ? t('No cases match this filter.', 'ไม่พบเคสที่ตรงกับตัวกรอง') : undefined}
            />
          </>
        )}
      </section>
    </div>
  );
}
