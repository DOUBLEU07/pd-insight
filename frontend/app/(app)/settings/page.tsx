'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { ChangePassword } from '@/components/settings/ChangePassword';
import { PresetManager } from '@/components/settings/PresetManager';
import { ThresholdsPanel } from '@/components/settings/ThresholdsPanel';
import { KeyIcon, MonitorIcon, MoonIcon, SlidersIcon, SunIcon, UserIcon } from '@/components/ui/icons';
import { Collapse, FoldToggle, KV, Spinner, fmtDate } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useI18n } from '@/lib/i18n';
import { useTheme, type Theme } from '@/lib/theme';
import type { ModelKind, TrainedModel } from '@/lib/types';

export default function SettingsPage() {
  const { options, user, toast } = useApp();
  const { t, lang, setLang, locale } = useI18n();
  const { theme, setTheme } = useTheme();

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

  // Deep links from the account menu (#password) and elsewhere (#presets).
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement) el.open = true;
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (id === 'password') document.getElementById('pw-current')?.focus({ preventScroll: true });
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  async function selectModel(kind: ModelKind, model: TrainedModel | null) {
    setSwitching(true);
    const mode = kind === 'hybrid' ? t('PRPD + TF cases', 'เคส PRPD + TF') : t('PRPD-only cases', 'เคส PRPD อย่างเดียว');
    try {
      if (model) await api.activateModel(model.id);
      else await api.deactivateModels(kind);
      await loadModels();
      toast(
        model
          ? t(`${mode} will be analysed with ${model.name}`, `${mode}จะวิเคราะห์ด้วย ${model.name}`)
          : t(`${mode} will be analysed with the published model`, `${mode}จะวิเคราะห์ด้วยโมเดลตั้งต้น`),
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not change the analysis model', 'เปลี่ยนโมเดลไม่สำเร็จ'));
    } finally {
      setSwitching(false);
    }
  }

  if (!options) return <Spinner />;

  const ml = options.ml_status;
  const c = options.constants;
  const selectable = (models ?? []).filter((m) => m.can_activate);

  const yesNo = (v: boolean) => (
    <span className={`pill ${v ? 'pill-green' : 'pill-red'}`}>{v ? t('Available', 'พร้อมใช้') : t('Missing', 'ไม่พบ')}</span>
  );

  const themes: { key: Theme; icon: ReactNode; label: string }[] = [
    { key: 'auto', icon: <MonitorIcon />, label: t('Auto (by time)', 'อัตโนมัติ (ตามเวลา)') },
    { key: 'light', icon: <SunIcon />, label: t('Light', 'สว่าง') },
    { key: 'dark', icon: <MoonIcon />, label: t('Dark', 'มืด') },
  ];

  return (
    <div className="stack">
      <div className="grid-2 items-start">
        <section className="card">
          <h2 className="card-title mb-3"><FoldToggle />
            <SlidersIcon />
            {t('Preferences', 'การแสดงผล')}
          </h2>
          <div className="field">
            <span className="label">{t('Theme', 'ธีม')}</span>
            <div className="seg" role="group" aria-label={t('Theme', 'ธีม')}>
              {themes.map((th) => (
                <button key={th.key} type="button" className={theme === th.key ? 'on' : ''} onClick={() => setTheme(th.key)}>
                  {th.icon}
                  {th.label}
                </button>
              ))}
            </div>
            <p className="field-help">
              {t('Auto switches to dark between 18:00 and 06:00.', 'อัตโนมัติจะเป็นโหมดมืดระหว่าง 18:00–06:00')}
            </p>
          </div>
          <div className="field">
            <span className="label">{t('Language', 'ภาษา')}</span>
            <div className="seg" role="group" aria-label={t('Language', 'ภาษา')}>
              <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>
                English
              </button>
              <button type="button" className={lang === 'th' ? 'on' : ''} onClick={() => setLang('th')}>
                ไทย
              </button>
            </div>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <h3 className="section-title flex items-center gap-2">
              <UserIcon width={17} height={17} className="text-primary-ink" />
              {t('Account', 'บัญชี')}
            </h3>
            <KV
              rows={[
                [t('Username', 'ชื่อผู้ใช้'), <b key="u">{user?.username ?? '-'}</b>],
                [t('Role', 'บทบาท'), <span className="capitalize" key="r">{user?.role ?? '-'}</span>],
              ]}
            />
            <p className="field-help">
              {t(
                'Your role is recorded on every case you sign off. It does not limit what you can do.',
                'บทบาทจะถูกบันทึกในทุกเคสที่คุณยืนยัน และไม่จำกัดสิทธิ์การใช้งาน',
              )}
            </p>
          </div>
        </section>

        <section className="card" id="password">
          <h2 className="card-title mb-3"><FoldToggle />
            <KeyIcon />
            {t('Change password', 'เปลี่ยนรหัสผ่าน')}
          </h2>
          <ChangePassword />
        </section>
      </div>

      <section className="card">
        <h2 className="card-title"><FoldToggle />
          {t('Analysis model', 'โมเดลที่ใช้วิเคราะห์')} <span className="tag">{t('this account', 'บัญชีนี้')}</span>
        </h2>
        <p className="card-sub mb-3">
          {t(
            'Choose one model for PRPD-only cases and one for PRPD + TF cases. Applies the next time a case is analysed; signed-off cases keep the model they were scored with.',
            'เลือกโมเดลสำหรับเคส PRPD อย่างเดียว และโมเดลสำหรับเคส PRPD + TF แยกกัน มีผลกับการวิเคราะห์ครั้งถัดไป เคสที่ยืนยันแล้วยังใช้ผลจากโมเดลเดิม',
          )}
        </p>
        {models === null ? (
          <Spinner />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {(
              [
                [
                  'prpd_only',
                  t('PRPD-only cases', 'เคส PRPD อย่างเดียว'),
                  t('A case with a PRPD image and no TF map.', 'เคสที่มีภาพ PRPD และไม่มี TF Map'),
                  'PRPD_2_Only',
                ],
                [
                  'hybrid',
                  t('PRPD + TF cases (Hybrid)', 'เคส PRPD + TF (Hybrid)'),
                  t('A case with a PRPD image and its TF map.', 'เคสที่มีภาพ PRPD คู่กับ TF Map'),
                  'PRPD_3_Hybrid',
                ],
              ] as const
            ).map(([kind, title, desc, published]) => {
              const choices = selectable.filter((m) => m.kind === kind);
              const current = choices.find((m) => m.is_active) ?? null;
              return (
                <div key={kind}>
                  <span className="label">{title}</span>
                  <p className="field-help !mt-0 mb-2">{desc}</p>
                  <div className="space-y-2">
                    <label className={`option-card ${current === null ? 'on' : ''}`}>
                      <input
                        type="radio"
                        name={`analysis-model-${kind}`}
                        checked={current === null}
                        disabled={switching}
                        onChange={() => void selectModel(kind, null)}
                      />
                      <span>
                        <span className="lbl">{t('Published model (default)', 'โมเดลตั้งต้น (ค่าเริ่มต้น)')}</span>
                        <span className="desc">{published}</span>
                      </span>
                    </label>
                    {choices.map((m) => (
                      <label key={m.id} className={`option-card ${m.is_active ? 'on' : ''}`}>
                        <input
                          type="radio"
                          name={`analysis-model-${kind}`}
                          checked={m.is_active}
                          disabled={switching}
                          onChange={() => void selectModel(kind, m)}
                        />
                        <span>
                          <span className="lbl">{m.name}</span>
                          <span className="desc">
                            {t(
                              `${m.accuracy}% test accuracy · ${m.dataset_size} samples · trained ${fmtDate(m.finished_at, locale)}`,
                              `ความแม่นยำ ${m.accuracy}% · ${m.dataset_size} ตัวอย่าง · เทรนเมื่อ ${fmtDate(m.finished_at, locale)}`,
                            )}
                          </span>
                        </span>
                      </label>
                    ))}
                    {choices.length === 0 && (
                      <p className="hint text-[13.5px]">
                        {kind === 'hybrid'
                          ? t('No trained Hybrid model yet. Train one under Model development.', 'ยังไม่มีโมเดล Hybrid ที่เทรนแล้ว เทรนได้ที่หน้าพัฒนาโมเดล')
                          : t('No trained PRPD-only model yet. Train one under Model development.', 'ยังไม่มีโมเดล PRPD-only ที่เทรนแล้ว เทรนได้ที่หน้าพัฒนาโมเดล')}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="card-title"><FoldToggle />{t('Saved axis presets', 'ค่าแกนที่บันทึกไว้')}</h2>
        <p className="card-sub mb-3">
          {t(
            'Axes are fitted and saved in a case’s "Plot axes" step. New images of the same size use the newest preset automatically.',
            'ปรับและบันทึกแกนได้ในขั้น "ปรับแกนกราฟ" ของเคส ภาพใหม่ที่ขนาดเท่ากันจะใช้ค่าล่าสุดโดยอัตโนมัติ',
          )}
        </p>
        <div id="presets">
          <PresetManager />
        </div>
      </section>

      <div>
        <Collapse id="thresholds" title={t('Decision thresholds (advanced)', 'เกณฑ์การตัดสิน (ขั้นสูง)')} meta={t('this account', 'บัญชีนี้')}>
          <ThresholdsPanel />
        </Collapse>

        <Collapse title={t('Model engine status', 'สถานะเอนจินโมเดล')}>
          <KV
            rows={[
              [t('ML enabled', 'เปิดใช้ ML'), yesNo(ml.enable_ml)],
              ['TensorFlow', yesNo(ml.tensorflow_available)],
              [t('PRPD-only model', 'โมเดล PRPD-only'), yesNo(ml.prpd_only_available)],
              [t('Hybrid model', 'โมเดล Hybrid'), yesNo(ml.hybrid_available)],
              [t('Gap-time model', 'โมเดล Gap-Time'), yesNo(ml.auto_gap_available)],
              [t('Gap-time model version', 'เวอร์ชันโมเดล Gap-Time'), ml.auto_gap_model_version],
              [t('Models folder', 'โฟลเดอร์โมเดล'), <code key="d">{ml.models_dir}</code>],
              ...(ml.load_error
                ? ([[t('Load error', 'ข้อผิดพลาด'), <span className="text-danger" key="e">{ml.load_error}</span>]] as [ReactNode, ReactNode][])
                : []),
            ]}
          />
          <p className="field-help">
            {t(
              'Without TensorFlow or the .keras files the system uses a mock engine and marks each case as mock.',
              'หากไม่มี TensorFlow หรือไฟล์ .keras ระบบจะใช้โหมดจำลองและติดป้ายเคสว่าเป็นผลจำลอง',
            )}
          </p>
        </Collapse>

        <Collapse title={t('Fixed constants & decision rules', 'ค่าคงที่และกฎการตัดสิน')}>
          <KV
            rows={[
              [t('Default image size', 'ขนาดภาพเริ่มต้น'), `${c.default_image_width}×${c.default_image_height}`],
              [
                t('Default frame (L / R / T / B)', 'กรอบเริ่มต้น (ซ้าย/ขวา/บน/ล่าง)'),
                `${c.default_frame.x_left_0deg} / ${c.default_frame.x_right_360deg} / ${c.default_frame.y_top_plot} / ${c.default_frame.y_bottom_plot}`,
              ],
              [t('Allowed uploads', 'ไฟล์ที่รองรับ'), c.allowed_extensions.join(', ')],
            ]}
          />
          <div className="table-wrap mt-3 rounded-lg border border-line">
            <table className="data compact">
              <thead>
                <tr>
                  <th>{t('Rule', 'กฎ')}</th>
                  <th>{t('How it decides', 'วิธีตัดสิน')}</th>
                </tr>
              </thead>
              <tbody>
                {options.decision_modes.map((m) => (
                  <tr key={m.key}>
                    <td className="whitespace-nowrap">
                      <b>{m.label}</b>
                    </td>
                    <td className="text-muted">{m.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Collapse>
      </div>
    </div>
  );
}
