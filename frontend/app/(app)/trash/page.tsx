'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { RestoreIcon, TrashIcon } from '@/components/ui/icons';
import { EmptyRow, FoldToggle, Spinner, fmtDate } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useI18n } from '@/lib/i18n';
import type { TrashItem, TrashKind } from '@/lib/types';

type Filter = 'all' | TrashKind;

const DAY_MS = 24 * 60 * 60 * 1000;

export default function TrashPage() {
  const { toast } = useApp();
  const { t, locale } = useI18n();

  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [retention, setRetention] = useState(30);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.listTrash();
      setItems(r.items);
      setRetention(r.retention_days);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not load the trash', 'โหลดถังขยะไม่สำเร็จ'));
      setItems([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const kindLabel = (k: TrashKind) =>
    ({
      batch: t('Folder', 'โฟลเดอร์'),
      case: t('Case', 'เคส'),
      model: t('Model', 'โมเดล'),
      preset: t('Axis preset', 'ค่าแกน'),
    })[k];

  const rows = useMemo(() => (items ?? []).filter((i) => filter === 'all' || i.kind === filter), [items, filter]);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast(done);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('That did not work', 'ทำรายการไม่สำเร็จ'));
    } finally {
      setBusy(false);
    }
  }

  function restore(item: TrashItem) {
    void run(() => api.restoreTrash(item.kind, item.id), t(`Restored ${item.name}`, `กู้คืน ${item.name} แล้ว`));
  }

  function purge(item: TrashItem) {
    if (
      !window.confirm(
        t(`Delete "${item.name}" permanently? This cannot be undone.`, `ลบ "${item.name}" ถาวร? ไม่สามารถย้อนกลับได้`),
      )
    )
      return;
    void run(() => api.purgeTrash(item.kind, item.id), t(`Deleted ${item.name} permanently`, `ลบ ${item.name} ถาวรแล้ว`));
  }

  function emptyAll() {
    if (
      !window.confirm(
        t(
          `Permanently delete all ${items?.length ?? 0} item(s) in the trash? This cannot be undone.`,
          `ลบทั้งหมด ${items?.length ?? 0} รายการในถังขยะถาวร? ไม่สามารถย้อนกลับได้`,
        ),
      )
    )
      return;
    void run(() => api.emptyTrash(), t('Trash emptied', 'ล้างถังขยะแล้ว'));
  }

  if (items === null) return <Spinner />;

  return (
    <section className="card table-card">
      <div className="card-head">
        <div>
          <h2 className="card-title">
            <FoldToggle />
            <TrashIcon />
            {t('Trash', 'ถังขยะ')}
          </h2>
          <p className="card-sub">
            {t(
              `Deleted folders, cases, models and axis presets stay here for ${retention} days. Restore them any time before then; after that they are removed for good.`,
              `โฟลเดอร์ เคส โมเดล และค่าแกนที่ลบจะอยู่ที่นี่ ${retention} วัน กู้คืนได้ตลอดช่วงนั้น หลังจากนั้นจะถูกลบถาวร`,
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="w-auto" aria-label={t('Type', 'ประเภท')}>
            <option value="all">{t('Everything', 'ทั้งหมด')}</option>
            <option value="batch">{kindLabel('batch')}</option>
            <option value="case">{kindLabel('case')}</option>
            <option value="model">{kindLabel('model')}</option>
            <option value="preset">{kindLabel('preset')}</option>
          </select>
          <button type="button" className="btn btn-danger btn-sm" disabled={busy || items.length === 0} onClick={emptyAll}>
            <TrashIcon />
            {t('Empty trash', 'ล้างถังขยะ')}
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>{t('Type', 'ประเภท')}</th>
              <th>{t('Name', 'ชื่อ')}</th>
              <th>{t('Deleted', 'ลบเมื่อ')}</th>
              <th>{t('Removed for good in', 'ลบถาวรในอีก')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const daysLeft = Math.max(0, Math.ceil((new Date(item.expires_at).getTime() - Date.now()) / DAY_MS));
              return (
                <tr key={`${item.kind}-${item.id}`} className="row-hover">
                  <td>
                    <span className="pill pill-gray">{kindLabel(item.kind)}</span>
                  </td>
                  <td className="min-w-0">
                    <b>{item.name}</b>
                    {item.detail && <span className="ml-2 text-[13px] text-muted">{item.detail}</span>}
                  </td>
                  <td className="whitespace-nowrap text-muted">{fmtDate(item.deleted_at, locale)}</td>
                  <td className={`whitespace-nowrap ${daysLeft <= 3 ? 'text-danger' : 'text-muted'}`}>
                    {t(`${daysLeft} day(s)`, `${daysLeft} วัน`)}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => restore(item)}>
                      <RestoreIcon />
                      {t('Restore', 'กู้คืน')}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm ml-1" disabled={busy} onClick={() => purge(item)}>
                      {t('Delete permanently', 'ลบถาวร')}
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <EmptyRow colSpan={5}>{t('The trash is empty.', 'ถังขยะว่าง')}</EmptyRow>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
