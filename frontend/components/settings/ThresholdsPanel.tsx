'use client';

import { useEffect, useState } from 'react';

import { Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useI18n } from '@/lib/i18n';
import type { ThresholdKey, ThresholdSettings } from '@/lib/types';

type T = <V = string>(en: V, th: V) => V;

/** Editable thresholds, grouped the way the rule engine applies them. */
function thresholdGroups(t: T): {
  title: string;
  hint: string;
  rows: { key: ThresholdKey; label: string; help: string }[];
}[] {
  return [
    {
      title: t('Classification', 'การจำแนก'),
      hint: t('Decides whether any class wins, or the case is Non-identified.', 'กำหนดว่ามีคลาสใดชนะ หรือเคสเป็น Non-identified'),
      rows: [
        {
          key: 'topclass_threshold',
          label: t('TopClass threshold', 'เกณฑ์ TopClass'),
          help: t('Every class at or below this gives Non-identified.', 'ทุกคลาสที่ไม่เกินค่านี้จะได้ Non-identified'),
        },
      ],
    },
    {
      title: t('PD source', 'แหล่ง PD'),
      hint: t('Turns the winning class into a PD source, and how strong that is.', 'แปลงคลาสที่ชนะเป็นแหล่ง PD และระดับความเชื่อมั่น'),
      rows: [
        {
          key: 'joint_dual_threshold',
          label: t('Joint dual threshold', 'เกณฑ์ Joint คู่'),
          help: t('Surface and Internal both above this give Terminations / Joint.', 'Surface และ Internal เกินค่านี้ทั้งคู่ จะได้ Terminations / Joint'),
        },
        {
          key: 'strong_rule_threshold',
          label: t('Strong rule threshold', 'เกณฑ์กฎแข็ง'),
          help: t('A single class above this is trusted without confirmation.', 'คลาสเดียวที่เกินค่านี้เชื่อถือได้โดยไม่ต้องยืนยัน'),
        },
      ],
    },
    {
      title: t('Severity bands', 'ช่วงความรุนแรง'),
      hint: t('Turns a measured gap-time into Initial, Moderate or High.', 'แปลง Gap-Time ที่วัดได้เป็น Initial, Moderate หรือ High'),
      rows: [
        {
          key: 'gap_time_high_ms',
          label: t('High below', 'High เมื่อต่ำกว่า'),
          help: t('Gap-time under this is the most severe band.', 'Gap-Time ต่ำกว่าค่านี้คือช่วงรุนแรงที่สุด'),
        },
        {
          key: 'gap_time_moderate_ms',
          label: t('Moderate up to', 'Moderate ถึง'),
          help: t('Gap-time above this is the least severe band.', 'Gap-Time สูงกว่าค่านี้คือช่วงรุนแรงน้อยที่สุด'),
        },
        {
          key: 'cycle_time_ms',
          label: t('Mains cycle', 'รอบไฟฟ้า'),
          help: t('One full cycle: 20 ms at 50 Hz, 16.67 ms at 60 Hz.', 'หนึ่งรอบ: 20 ms ที่ 50 Hz, 16.67 ms ที่ 60 Hz'),
        },
      ],
    },
    {
      title: t('Internal sanity check', 'การตรวจสอบ Internal'),
      hint: t('The Internal confidence band that must also pass the quadrant check.', 'ช่วงความมั่นใจของ Internal ที่ต้องผ่านการตรวจจตุภาคด้วย'),
      rows: [
        {
          key: 'confidence_threshold',
          label: t('Band lower bound', 'ขอบล่างของช่วง'),
          help: t('Also used by the legacy Strict and SMART modes.', 'ใช้ในโหมด Strict และ SMART แบบเดิมด้วย'),
        },
        {
          key: 'internal_high_confidence',
          label: t('Band upper bound', 'ขอบบนของช่วง'),
          help: t('Above this, Internal is trusted without the quadrant check.', 'สูงกว่าค่านี้ เชื่อ Internal โดยไม่ต้องตรวจจตุภาค'),
        },
      ],
    },
  ];
}

/**
 * The account's decision thresholds, editable in place. Shown in Settings and
 * again as the criteria step of the training wizard.
 */
export function ThresholdsPanel({ compact = false }: { compact?: boolean }) {
  const { toast, refreshOptions } = useApp();
  const { t } = useI18n();

  const [thresholds, setThresholds] = useState<ThresholdSettings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function applySettings(next: ThresholdSettings) {
    setThresholds(next);
    setDraft(Object.fromEntries(Object.entries(next.effective).map(([k, v]) => [k, String(v)])));
  }

  useEffect(() => {
    api
      .getThresholds()
      .then(applySettings)
      .catch(() => setThresholds(null));
  }, []);

  async function saveThresholds() {
    if (!thresholds) return;
    const payload: Record<string, number> = {};
    for (const [key, raw] of Object.entries(draft)) {
      const value = Number(raw);
      if (raw.trim() === '' || Number.isNaN(value)) {
        toast(t(`"${key}" is not a number`, `"${key}" ไม่ใช่ตัวเลข`));
        return;
      }
      payload[key] = value;
    }
    setSaving(true);
    try {
      applySettings(await api.saveThresholds(payload));
      await refreshOptions();
      toast(t('Thresholds saved', 'บันทึกเกณฑ์แล้ว'));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not save thresholds', 'บันทึกเกณฑ์ไม่สำเร็จ'));
    } finally {
      setSaving(false);
    }
  }

  async function restoreDefaults() {
    setSaving(true);
    try {
      applySettings(await api.resetThresholds());
      await refreshOptions();
      toast(t('Published defaults restored', 'คืนค่าเริ่มต้นแล้ว'));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not restore defaults', 'คืนค่าเริ่มต้นไม่สำเร็จ'));
    } finally {
      setSaving(false);
    }
  }

  if (!thresholds) return <Spinner />;

  const v = (key: ThresholdKey) => draft[key] || thresholds.effective[key];

  return (
    <>
      <div className="callout mb-4">
        <b className="mb-1 block">{t('With these values', 'ด้วยค่าปัจจุบัน')}</b>
        <ul className="bullets">
          <li>
            {t(
              `All three classes at or below ${v('topclass_threshold')}% give Non-identified.`,
              `ทั้งสามคลาสไม่เกิน ${v('topclass_threshold')}% จะได้ Non-identified`,
            )}
          </li>
          <li>
            {t(
              `Surface and Internal both above ${v('joint_dual_threshold')}% give Terminations / Joint.`,
              `Surface และ Internal เกิน ${v('joint_dual_threshold')}% ทั้งคู่ จะได้ Terminations / Joint`,
            )}
          </li>
          <li>
            {t(
              `For Corona or Surface, gap-time under ${v('gap_time_high_ms')} ms is High and above ${v('gap_time_moderate_ms')} ms is Initial.`,
              `สำหรับ Corona หรือ Surface Gap-Time ต่ำกว่า ${v('gap_time_high_ms')} ms คือ High และสูงกว่า ${v('gap_time_moderate_ms')} ms คือ Initial`,
            )}
          </li>
        </ul>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {thresholdGroups(t).map((group) => (
          <div key={group.title}>
            <div className="section-title !mb-0">{group.title}</div>
            <p className="hint mb-2 text-[13px]">{group.hint}</p>
            <div className="table-wrap rounded-lg border border-line">
              <table className="data compact">
                <tbody>
                  {group.rows.map(({ key, label, help }) => {
                    const bound = thresholds.bounds[key];
                    const changed = String(thresholds.defaults[key]) !== String(draft[key] ?? '');
                    return (
                      <tr key={key}>
                        <td>
                          <div className="font-semibold">
                            {label} {changed && <span className="pill pill-amber ml-1">{t('changed', 'แก้ไขแล้ว')}</span>}
                          </div>
                          {!compact && <div className="text-[13px] text-muted">{help}</div>}
                        </td>
                        <td className="w-[150px]">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.01"
                              min={bound.min}
                              max={bound.max}
                              value={draft[key] ?? ''}
                              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                              className="!w-[88px] font-mono"
                              aria-label={label}
                            />
                            <span className="text-[13px] text-muted">{bound.unit}</span>
                          </div>
                          <div className="mt-1 text-[12.5px] text-muted">
                            {t('default', 'ค่าเริ่มต้น')} {thresholds.defaults[key]}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void saveThresholds()}>
          {t('Save thresholds', 'บันทึกเกณฑ์')}
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={saving || thresholds.overridden.length === 0}
          onClick={() => void restoreDefaults()}
        >
          {t('Restore published defaults', 'คืนค่าเริ่มต้น')}
        </button>
        <span className="text-[13.5px] text-muted">
          {thresholds.overridden.length === 0
            ? t('Using the published values.', 'ใช้ค่าตามงานวิจัย')
            : t(`${thresholds.overridden.length} value(s) differ from the defaults.`, `มี ${thresholds.overridden.length} ค่าที่ต่างจากค่าเริ่มต้น`)}
        </span>
      </div>
    </>
  );
}
