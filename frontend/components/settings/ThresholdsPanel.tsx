'use client';

import { useEffect, useState } from 'react';

import { Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import type { ThresholdKey, ThresholdSettings } from '@/lib/types';

/** Editable thresholds, grouped the way the rule engine applies them. */
export const THRESHOLD_GROUPS: {
  title: string;
  hint: string;
  rows: { key: ThresholdKey; label: string; help: string }[];
}[] = [
  {
    title: 'Classification',
    hint: 'Decides whether a class wins at all, or the case is reported as Non-identified.',
    rows: [
      {
        key: 'topclass_threshold',
        label: 'TopClass threshold',
        help: 'Every class at or below this value gives Non-identified.',
      },
    ],
  },
  {
    title: 'PD source cascade',
    hint: 'Turns the winning class into a PD source, and decides whether that is a strong rule.',
    rows: [
      {
        key: 'joint_dual_threshold',
        label: 'Joint dual threshold',
        help: 'Surface and Internal both above this give Terminations / Joint.',
      },
      {
        key: 'strong_rule_threshold',
        label: 'Strong rule threshold',
        help: 'A single class above this is trusted without manual confirmation.',
      },
    ],
  },
  {
    title: 'Severity bands',
    hint: 'Converts a measured gap-time into Initial, Moderate or High.',
    rows: [
      {
        key: 'gap_time_high_ms',
        label: 'High below',
        help: 'Gap-time under this value is the most severe band.',
      },
      {
        key: 'gap_time_moderate_ms',
        label: 'Moderate up to',
        help: 'Gap-time above this value is the least severe band.',
      },
      {
        key: 'cycle_time_ms',
        label: 'Mains cycle',
        help: 'One full cycle: 20 ms at 50 Hz, 16.67 ms at 60 Hz.',
      },
    ],
  },
  {
    title: 'Internal sanity check',
    hint: 'The confidence band in which an Internal result must also pass the quadrant check.',
    rows: [
      {
        key: 'confidence_threshold',
        label: 'Band lower bound',
        help: 'Also the threshold used by the legacy Strict and SMART prototype modes.',
      },
      {
        key: 'internal_high_confidence',
        label: 'Band upper bound',
        help: 'Above this, an Internal result is trusted without the quadrant check.',
      },
    ],
  },
];

/**
 * The account's decision thresholds, editable in place.
 *
 * Shown on the Settings page and again as the criteria step of the training
 * wizard: a model is trained against the numbers the rule engine will later
 * compare its scores to, so the wizard shows the same editor rather than a
 * read-only copy that could drift from it.
 */
export function ThresholdsPanel({ compact = false }: { compact?: boolean }) {
  const { toast, refreshOptions } = useApp();

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
        toast(`"${key}" is not a number`);
        return;
      }
      payload[key] = value;
    }
    setSaving(true);
    try {
      applySettings(await api.saveThresholds(payload));
      await refreshOptions();
      toast('Thresholds saved for this account');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save thresholds');
    } finally {
      setSaving(false);
    }
  }

  async function restoreDefaults() {
    setSaving(true);
    try {
      applySettings(await api.resetThresholds());
      await refreshOptions();
      toast('Restored the published defaults');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not restore defaults');
    } finally {
      setSaving(false);
    }
  }

  if (!thresholds) return <Spinner label="Loading thresholds…" />;

  return (
    <>
      <div className="callout callout-slate mb-[16px]">
        <b className="mb-[6px] block text-slate-700">With your current values</b>
        <ul className="help-bullets">
          <li>
            All three classes at or below{' '}
            <b>{draft.topclass_threshold || thresholds.effective.topclass_threshold}%</b> give
            Non-identified.
          </li>
          <li>
            Corona above{' '}
            <b>{draft.strong_rule_threshold || thresholds.effective.strong_rule_threshold}%</b>{' '}
            gives Floating / Corona / Bad contact as a strong rule.
          </li>
          <li>
            Surface and Internal both above{' '}
            <b>{draft.joint_dual_threshold || thresholds.effective.joint_dual_threshold}%</b> give
            Terminations / Joint.
          </li>
          <li>
            For Corona or Surface, gap-time under{' '}
            <b>{draft.gap_time_high_ms || thresholds.effective.gap_time_high_ms} ms</b> is High, and
            above{' '}
            <b>{draft.gap_time_moderate_ms || thresholds.effective.gap_time_moderate_ms} ms</b> is
            Initial.
          </li>
        </ul>
      </div>

      {THRESHOLD_GROUPS.map((group) => (
        <div key={group.title} className="mb-[18px]">
          <label className="field-label mb-[2px] block">{group.title}</label>
          <p className="mb-[10px] mt-0 text-[11.5px] text-slate-400">{group.hint}</p>
          <table className="data">
            <thead>
              <tr>
                <th>Threshold</th>
                <th className="w-[130px]">Value</th>
                <th className="w-[90px]">Default</th>
                {!compact && <th>What it does</th>}
              </tr>
            </thead>
            <tbody>
              {group.rows.map(({ key, label, help }) => {
                const bound = thresholds.bounds[key];
                const changed = String(thresholds.defaults[key]) !== String(draft[key] ?? '');
                return (
                  <tr key={key}>
                    <td>
                      {label}
                      {changed && <span className="pill pill-amber ml-2">changed</span>}
                    </td>
                    <td>
                      <div className="flex items-center gap-[6px]">
                        <input
                          type="number"
                          step="0.01"
                          min={bound.min}
                          max={bound.max}
                          value={draft[key] ?? ''}
                          onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                          className="w-[78px]"
                        />
                        <span className="text-[11.5px] text-slate-400">{bound.unit}</span>
                      </div>
                    </td>
                    <td className="text-[12px] text-slate-400">
                      {thresholds.defaults[key]} {bound.unit}
                    </td>
                    {!compact && <td className="text-[11.5px] text-slate-500">{help}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-[10px]">
        <button
          className="btn btn-blue"
          type="button"
          disabled={saving}
          onClick={() => void saveThresholds()}
        >
          Save thresholds
        </button>
        <button
          className="btn btn-outline"
          type="button"
          disabled={saving || thresholds.overridden.length === 0}
          onClick={() => void restoreDefaults()}
        >
          Restore published defaults
        </button>
        <span className="text-[11.5px] text-slate-400">
          {thresholds.overridden.length === 0
            ? 'Using the published CMD FINAL V2 values.'
            : `${thresholds.overridden.length} value${
                thresholds.overridden.length === 1 ? '' : 's'
              } differ from the published defaults.`}
        </span>
      </div>
    </>
  );
}
