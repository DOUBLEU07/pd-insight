'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { groupCasesBySeverity, SeverityGroupCards, type SeverityKey } from '@/components/case/SeverityGroups';
import { ArrowLeftIcon, PlayIcon } from '@/components/ui/icons';
import { FoldToggle, Meter, Spinner, fmtDate } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { TRASH_LINK, useApp } from '@/lib/app-context';
import { useI18n } from '@/lib/i18n';
import type { BatchSummary } from '@/lib/types';

type SeverityFilter = 'all' | SeverityKey;

export default function BatchPreviewPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const batchId = Number(params.id);
  const { toast } = useApp();
  const { t, locale } = useI18n();

  const [batch, setBatch] = useState<BatchSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');

  const load = useCallback(async () => {
    try {
      setBatch(await api.getBatch(batchId));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not load this folder', 'โหลดโฟลเดอร์นี้ไม่สำเร็จ'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, toast]);

  useEffect(() => {
    if (Number.isFinite(batchId)) void load();
  }, [batchId, load]);

  async function removeCase(id: number, name: string) {
    if (
      !window.confirm(
        t(`Move case "${name}" to the trash? You can restore it for 30 days from Trash (the bin icon at the top right).`, `ย้ายเคส "${name}" ไปถังขยะ? กู้คืนได้ภายใน 30 วันที่ถังขยะ (ไอคอนถังขยะมุมขวาบน)`),
      )
    )
      return;
    try {
      await api.deleteCase(id);
      toast(t(`Moved ${name} to the trash`, `ย้าย ${name} ไปถังขยะแล้ว`), TRASH_LINK);
      void load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Delete failed', 'ลบไม่สำเร็จ'));
    }
  }

  const groups = useMemo(
    () =>
      groupCasesBySeverity(batch?.cases ?? []).filter((g) => severityFilter === 'all' || g.key === severityFilter),
    [batch, severityFilter],
  );

  if (loading) return <Spinner />;
  if (!batch) return <p className="empty">{t('Folder not found.', 'ไม่พบโฟลเดอร์นี้')}</p>;

  const cases = batch.cases ?? [];
  const reviewed = cases.filter((c) => c.status === 'done').length;
  const pct = cases.length ? Math.round((reviewed / cases.length) * 100) : 0;
  const firstOpen = cases.find((c) => c.status !== 'done');
  const openCase = (id: number) => router.push(`/cases/${id}?from=batch&batch=${batch.id}`);

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head !mb-0">
          <div className="min-w-0">
            <button type="button" className="btn btn-ghost btn-sm -ml-2 mb-1" onClick={() => router.push('/cases?mode=folder')}>
              <ArrowLeftIcon />
              {t('Folders', 'โฟลเดอร์ทั้งหมด')}
            </button>
            <h2 className="card-title text-[20px]"><FoldToggle />{batch.name}</h2>
            <p className="card-sub">
              {t(
                `Uploaded ${fmtDate(batch.upload_date, locale)} · ${batch.total} case(s) · ${reviewed} reviewed`,
                `อัปโหลด ${fmtDate(batch.upload_date, locale)} · ${batch.total} เคส · ตรวจแล้ว ${reviewed}`,
              )}
            </p>
            <div className="max-w-[360px]">
              <Meter value={pct} accent="#10b981" />
            </div>
          </div>
          {firstOpen && (
            <button type="button" className="btn btn-primary btn-lg" onClick={() => openCase(firstOpen.id)}>
              <PlayIcon />
              {reviewed === 0 ? t('Start reviewing', 'เริ่มตรวจ') : t('Continue reviewing', 'ตรวจต่อ')}
            </button>
          )}
        </div>
        {reviewed === 0 && cases.length > 1 && (
          <p className="callout callout-blue mt-4 text-[14px]">
            {t(
              'Tip: fit the plot axes on the first case, then use "Copy axes to the rest of this folder" so you only do it once.',
              'แนะนำ: ปรับแกนกราฟที่เคสแรก แล้วกด "คัดลอกแกนไปยังเคสที่เหลือในโฟลเดอร์นี้" เพื่อทำเพียงครั้งเดียว',
            )}
          </p>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title"><FoldToggle />{t('Cases by severity', 'เคสตามความรุนแรง')}</h2>
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
        </div>
        {cases.length === 0 ? (
          <p className="empty">{t('This folder has no cases left.', 'โฟลเดอร์นี้ไม่มีเคสเหลืออยู่')}</p>
        ) : (
          <SeverityGroupCards groups={groups} onOpenCase={openCase} onDeleteCase={(id, name) => void removeCase(id, name)} />
        )}
      </section>
    </div>
  );
}
