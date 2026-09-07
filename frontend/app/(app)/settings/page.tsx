'use client';

import { useCallback, useEffect, useState } from 'react';

import { ThresholdsPanel } from '@/components/settings/ThresholdsPanel';
import { KV, Spinner, fmtDate } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import type { TrainedModel } from '@/lib/types';

export default function SettingsPage() {
  const { options, user, toast } = useApp();

  // Models this account trained for itself, and which one analyses its cases.
  const [models, setModels] = useState<TrainedModel[] | null>(null);
  const [switching, setSwitching] = useState(false);

  const loadModels = useCallback(async () => {
    try {
      setModels(await api.listModels());
    } catch {
      setModels([]);
    }
  }, []);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  async function selectModel(model: TrainedModel | null) {
    setSwitching(true);
    try {
      if (model) await api.activateModel(model.id);
      else await api.deactivateModels();
      await loadModels();
      toast(
        model
          ? `New cases will be analysed with ${model.name}`
          : 'New cases will be analysed with the published models',
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not change the analysis model');
    } finally {
      setSwitching(false);
    }
  }

  if (!options) return <Spinner label="Loading settings…" />;

  const ml = options.ml_status;
  const c = options.constants;

  const selectable = (models ?? []).filter((m) => m.can_activate);
  const unselectable = (models ?? []).filter(
    (m) => m.status === 'completed' && !m.can_activate,
  );
  const selected = selectable.find((m) => m.is_active) ?? null;

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
          Analysis Model{' '}
          <span className="text-[11px] font-medium text-slate-400">this account only</span>
        </h2>
        <p className="hint">
          Which model classifies your cases. Models you build on the Model Training page appear
          here, and are visible to your account alone. Changing this takes effect the next time a
          case is analysed; cases already signed off keep the model they were scored with until you
          re-run them.
        </p>

        {models === null ? (
          <Spinner label="Loading your models…" />
        ) : (
          <div className="space-y-[10px]">
            <label className={`consent-item ${selected === null ? 'checked' : ''}`}>
              <input
                type="radio"
                name="analysis-model"
                checked={selected === null}
                disabled={switching}
                onChange={() => void selectModel(null)}
              />
              <span>
                <span className="lbl">Published models (default)</span>
                <span className="desc">
                  Model 2 (PRPD_2_Only) for PRPD-only cases and Model 3 (PRPD_3_Hybrid) when a T-F
                  map is uploaded, as exported from Colab.
                </span>
              </span>
            </label>

            {selectable.map((m) => (
              <label
                key={m.id}
                className={`consent-item ${m.is_active ? 'checked' : ''}`}
              >
                <input
                  type="radio"
                  name="analysis-model"
                  checked={m.is_active}
                  disabled={switching}
                  onChange={() => void selectModel(m)}
                />
                <span>
                  <span className="lbl">
                    {m.name}{' '}
                    <span className="text-[11px] font-medium text-slate-400">
                      {m.kind_label}
                    </span>
                  </span>
                  <span className="desc">
                    {m.accuracy}% accuracy on {m.dataset_size} sample(s), trained{' '}
                    {fmtDate(m.finished_at)}. Used when a case matches its input mode
                    {m.kind === 'hybrid'
                      ? ' (PRPD with a T-F map); PRPD-only cases fall back to Model 2.'
                      : ' (PRPD alone); cases with a T-F map fall back to Model 3.'}
                    {!m.uses_published_classes && (
                      <>
                        {' '}
                        Predicts <b>{m.class_names.join(', ')}</b>, reported as{' '}
                        {m.class_names.map((c) => m.pd_sources[c]).join(', ')}.
                      </>
                    )}
                  </span>
                </span>
              </label>
            ))}

            {selectable.length === 0 && (
              <p className="mt-[10px] text-[12.5px] text-slate-400">
                You have not trained a selectable model yet.{' '}
                {unselectable.length > 0 && (
                  <>
                    {unselectable.length} completed run(s) cannot be selected, because they were
                    simulated and produced no model file.{' '}
                  </>
                )}
                Build one on the <b>Model Training</b> page.
              </p>
            )}
          </div>
        )}
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
        <ThresholdsPanel />
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
