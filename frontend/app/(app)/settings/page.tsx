'use client';

import { useEffect, useState } from 'react';

import { KV, Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import type { ThresholdKey, ThresholdSettings } from '@/lib/types';

/** Editable thresholds, grouped the way the rule engine applies them. */
const THRESHOLD_GROUPS: {
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

export default function SettingsPage() {
  const { options, user, toast, refreshOptions } = useApp();

  const [thresholds, setThresholds] = useState<ThresholdSettings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function applySettings(next: ThresholdSettings) {
    setThresholds(next);
    setDraft(
      Object.fromEntries(Object.entries(next.effective).map(([k, v]) => [k, String(v)])),
    );
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

  if (!options) return <Spinner label="Loading settings…" />;

  const ml = options.ml_status;
  const c = options.constants;

  const yesNo = (v: boolean) => (
    <span className={`pill ${v ? 'pill-green' : 'pill-red'}`}>{v ? 'Available' : 'Missing'}</span>
  );

  return (
    <>
      <div className="card">
        <h2>Account</h2>
        <KV
          rows={[
            ['Username', user?.username ?? '-'],
            ['Role', <span className="capitalize" key="r">{user?.role ?? '-'}</span>],
            [
              'Role behaviour',
              'Recorded as reviewer_role on every case you sign off. It does not restrict any action.',
            ],
          ]}
        />
      </div>

      <div className="card">
        <h2>Model Status</h2>
        <p className="hint">
          Real inference needs both TensorFlow and the .keras files. When either is missing the
          system falls back to a deterministic mock engine and marks each case accordingly.
        </p>
        <KV
          rows={[
            ['ML enabled', yesNo(ml.enable_ml)],
            ['TensorFlow', yesNo(ml.tensorflow_available)],
            ['PRPD-only model (Model 2)', yesNo(ml.prpd_only_available)],
            ['Hybrid model (Model 3)', yesNo(ml.hybrid_available)],
            ['Auto Gap-time model', yesNo(ml.auto_gap_available)],
            ['Auto Gap-time version', ml.auto_gap_model_version],
            ['Models directory', <code key="d">{ml.models_dir}</code>],
            ...(ml.load_error
              ? ([['Load error', <span className="text-red-700" key="e">{ml.load_error}</span>]] as [
                  string,
                  React.ReactNode,
                ][])
              : []),
          ]}
        />
      </div>

      <div className="card">
        <h2>
          Decision Thresholds{' '}
          <span className="text-[11px] font-medium text-slate-400">this account only</span>
        </h2>
        <p className="hint">
          The numbers the rule engine compares confidence scores and gap-times against. Changes
          apply to your account alone and take effect the next time a case is analysed. Cases
          already signed off keep the values they were scored with until you re-run them.
        </p>

        {!thresholds ? (
          <Spinner label="Loading thresholds…" />
        ) : (
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
                  <b>
                    {draft.strong_rule_threshold || thresholds.effective.strong_rule_threshold}%
                  </b>{' '}
                  gives Floating / Corona / Bad contact as a strong rule.
                </li>
                <li>
                  Surface and Internal both above{' '}
                  <b>{draft.joint_dual_threshold || thresholds.effective.joint_dual_threshold}%</b>{' '}
                  give Terminations / Joint.
                </li>
                <li>
                  For Corona or Surface, gap-time under{' '}
                  <b>{draft.gap_time_high_ms || thresholds.effective.gap_time_high_ms} ms</b> is
                  High, and above{' '}
                  <b>
                    {draft.gap_time_moderate_ms || thresholds.effective.gap_time_moderate_ms} ms
                  </b>{' '}
                  is Initial.
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
                      <th>What it does</th>
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
                                onChange={(e) =>
                                  setDraft((d) => ({ ...d, [key]: e.target.value }))
                                }
                                className="w-[78px]"
                              />
                              <span className="text-[11.5px] text-slate-400">{bound.unit}</span>
                            </div>
                          </td>
                          <td className="text-[12px] text-slate-400">
                            {thresholds.defaults[key]} {bound.unit}
                          </td>
                          <td className="text-[11.5px] text-slate-500">{help}</td>
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
        )}
      </div>

      <div className="card">
        <h2>Fixed Constants</h2>
        <p className="hint">
          Calibration and upload settings, ported from PRPD_4_Gap Time.md, PART3 CMD FINAL CODE.
          These are the same for every account.
        </p>
        <KV
          rows={[
            [
              'Default image size',
              `${c.default_image_width}×${c.default_image_height} (PDProcessingII)`,
            ],
            [
              'Default frame (L / R / T / B)',
              `${c.default_frame.x_left_0deg} / ${c.default_frame.x_right_360deg} / ${c.default_frame.y_top_plot} / ${c.default_frame.y_bottom_plot}`,
            ],
            ['Allowed uploads', c.allowed_extensions.join(', ')],
          ]}
        />
      </div>

      <div className="card">
        <h2>Decision Rules</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Key</th>
              <th>Label</th>
              <th>Rule</th>
            </tr>
          </thead>
          <tbody>
            {options.decision_modes.map((m) => (
              <tr key={m.key}>
                <td>
                  <code>{m.key}</code>
                </td>
                <td>{m.label}</td>
                <td className="text-[12px] text-slate-500">{m.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
