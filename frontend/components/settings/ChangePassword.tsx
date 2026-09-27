'use client';

import { useState, type FormEvent } from 'react';

import { EyeIcon } from '@/components/ui/icons';
import { ApiError, api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useI18n } from '@/lib/i18n';

const MIN_LENGTH = 6;

/** 0-4, from length and character variety. Guidance only; the API enforces the minimum. */
function strength(pw: string): number {
  if (!pw) return 0;
  let score = pw.length >= MIN_LENGTH ? 1 : 0;
  if (pw.length >= 10) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.min(4, score);
}

const STRENGTH_COLOR = ['var(--line)', '#ef4444', '#f59e0b', '#0ea5e9', '#10b981'];

export function ChangePassword() {
  const { toast } = useApp();
  const { t } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const score = strength(next);
  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit = current && next.length >= MIN_LENGTH && next === confirm && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      toast(t('Password changed. Use the new one next time you sign in.', 'เปลี่ยนรหัสผ่านแล้ว ใช้รหัสใหม่ในการเข้าสู่ระบบครั้งถัดไป'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && /incorrect/i.test(err.message)) {
        setError(t('The current password is incorrect.', 'รหัสผ่านปัจจุบันไม่ถูกต้อง'));
      } else if (err instanceof ApiError && err.status === 400 && /different/i.test(err.message)) {
        setError(t('Choose a password different from the current one.', 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสปัจจุบัน'));
      } else {
        setError(err instanceof Error ? err.message : t('Could not change the password.', 'เปลี่ยนรหัสผ่านไม่สำเร็จ'));
      }
    } finally {
      setBusy(false);
    }
  }

  const type = show ? 'text' : 'password';

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <div className="field">
        <label className="label" htmlFor="pw-current">
          {t('Current password', 'รหัสผ่านปัจจุบัน')}
        </label>
        <div className="password-wrap">
          <input
            id="pw-current"
            type={type}
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <button
            type="button"
            className="icon-only"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? t('Hide passwords', 'ซ่อนรหัสผ่าน') : t('Show passwords', 'แสดงรหัสผ่าน')}
          >
            <EyeIcon slashed={show} />
          </button>
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="pw-new">
          {t('New password', 'รหัสผ่านใหม่')}
        </label>
        <input id="pw-new" type={type} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <div className="strength" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <i key={i} style={{ background: i <= score ? STRENGTH_COLOR[score] : undefined }} />
          ))}
        </div>
        {tooShort ? (
          <p className="field-error">{t(`At least ${MIN_LENGTH} characters.`, `อย่างน้อย ${MIN_LENGTH} ตัวอักษร`)}</p>
        ) : (
          <p className="field-help">
            {t(
              `At least ${MIN_LENGTH} characters. Mixing cases, numbers and symbols makes it stronger.`,
              `อย่างน้อย ${MIN_LENGTH} ตัวอักษร ผสมตัวพิมพ์เล็กใหญ่ ตัวเลข และสัญลักษณ์จะปลอดภัยขึ้น`,
            )}
          </p>
        )}
      </div>

      <div className="field">
        <label className="label" htmlFor="pw-confirm">
          {t('Confirm new password', 'ยืนยันรหัสผ่านใหม่')}
        </label>
        <input
          id="pw-confirm"
          type={type}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {mismatch && <p className="field-error">{t('The two passwords do not match.', 'รหัสผ่านทั้งสองช่องไม่ตรงกัน')}</p>}
      </div>

      {error && (
        <p className="callout callout-red mt-3" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary mt-4" disabled={!canSubmit}>
        {busy ? t('Changing…', 'กำลังเปลี่ยน…') : t('Change password', 'เปลี่ยนรหัสผ่าน')}
      </button>
    </form>
  );
}
