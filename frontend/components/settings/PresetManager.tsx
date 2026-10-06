'use client';

import { useCallback, useEffect, useState } from 'react';

import { TrashIcon } from '@/components/ui/icons';
import { EmptyRow, Spinner, fmtDate } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { TRASH_LINK, useApp } from '@/lib/app-context';
import { useI18n } from '@/lib/i18n';
import type { CalibrationPreset } from '@/lib/types';

/**
 * Saved axis presets. Presets are created from a case's "Plot axes" step;
 * this is where they are reviewed and removed.
 */
export function PresetManager() {
  const { toast } = useApp();
  const { t, locale } = useI18n();
  const [presets, setPresets] = useState<CalibrationPreset[] | null>(null);

  const load = useCallback(async () => {
    try {
      setPresets(await api.listPresets());
    } catch {
      setPresets([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(p: CalibrationPreset) {
    if (
      !window.confirm(
        t(
          `Move preset "${p.preset_name}" to the trash? You can restore it for 30 days from Trash (the bin icon at the top right).`,
          `ย้ายค่าแกน "${p.preset_name}" ไปถังขยะ? กู้คืนได้ภายใน 30 วันที่ถังขยะ (ไอคอนถังขยะมุมขวาบน)`,
        ),
      )
    )
      return;
    try {
      await api.deletePreset(p.id);
      toast(t(`Moved "${p.preset_name}" to the trash`, `ย้าย "${p.preset_name}" ไปถังขยะแล้ว`), TRASH_LINK);
      void load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Delete failed', 'ลบไม่สำเร็จ'));
    }
  }

  if (presets === null) return <Spinner />;

  return (
    <div className="table-wrap rounded-lg border border-line">
      <table className="data compact">
        <thead>
          <tr>
            <th>{t('Name', 'ชื่อ')}</th>
            <th>{t('Image size', 'ขนาดภาพ')}</th>
            <th>{t('0° / 360°', '0° / 360°')}</th>
            <th>{t('Top / bottom', 'บน / ล่าง')}</th>
            <th>{t('Saved', 'บันทึกเมื่อ')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {presets.map((p) => (
            <tr key={p.id}>
              <td>
                <b>{p.preset_name}</b>
              </td>
              <td className="num">
                {p.image_width}×{p.image_height}
              </td>
              <td className="num">
                {p.x_left_0deg} / {p.x_right_360deg}
              </td>
              <td className="num">
                {p.y_top_plot} / {p.y_bottom_plot}
              </td>
              <td className="whitespace-nowrap text-muted">{fmtDate(p.saved_time, locale)}</td>
              <td className="text-right">
                <button
                  type="button"
                  className="icon-only"
                  title={t('Delete preset', 'ลบค่าแกน')}
                  aria-label={t('Delete preset', 'ลบค่าแกน')}
                  onClick={() => void remove(p)}
                >
                  <TrashIcon />
                </button>
              </td>
            </tr>
          ))}
          {presets.length === 0 && (
            <EmptyRow colSpan={6}>
              {t(
                'No presets yet. Save one from the "Plot axes" step of any case.',
                'ยังไม่มีค่าแกนที่บันทึก บันทึกได้จากขั้น "ปรับแกนกราฟ" ของเคสใดก็ได้',
              )}
            </EmptyRow>
          )}
        </tbody>
      </table>
    </div>
  );
}
