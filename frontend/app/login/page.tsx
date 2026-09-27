'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';

import {
  ActivityIcon,
  EyeIcon,
  LogInIcon,
  MoonIcon,
  SunIcon,
  UserPlusIcon,
} from '@/components/ui/icons';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

export default function LoginPage() {
  const router = useRouter();
  const { user, ready, signIn, signUp } = useApp();
  const { lang, setLang, t } = useI18n();
  const { isDark, toggleTheme } = useTheme();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('researcher');
  const [roles, setRoles] = useState<string[]>(['researcher']);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace('/dashboard');
  }, [ready, user, router]);

  useEffect(() => {
    api
      .roles()
      .then((r) => setRoles(r.roles))
      .catch(() => setRoles(['researcher', 'expert', 'user', 'advisor', 'operator']));
  }, []);

  function switchMode(next: 'login' | 'signup') {
    setMode(next);
    setError('');
  }

  async function submit() {
    if (!username.trim() || !password) {
      setError(
        t('Please enter both username/email and password.', 'กรุณากรอกทั้งอีเมล/ชื่อผู้ใช้และรหัสผ่าน')
      );
      return;
    }
    if (mode === 'signup' && !agreeTerms) {
      setError(
        t('Please agree to the Terms of Use and Privacy Notice.', 'กรุณายอมรับข้อกำหนดการใช้งานและประกาศความเป็นส่วนตัว')
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (mode === 'signup') {
        await signUp(username.trim(), password, role);
      } else {
        await signIn(username.trim(), password);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t('Authentication failed. Please check your credentials.', 'การเข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบข้อมูล')
      );
    } finally {
      setBusy(false);
    }
  }

  function onKeyEvent(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') void submit();
  }

  return (
    <div className="login-page">
      <div className="login-brand">
        <span className="brand-mark">
          <ActivityIcon width={22} height={22} />
        </span>
        <span className="brand-name text-[22px]">
          PhasePulse
          <small>{t('Partial Discharge Analysis Platform', 'แพลตฟอร์มวิเคราะห์ Partial Discharge')}</small>
        </span>
      </div>

      <article className="login-card">
        <div className="seg mb-5 flex w-full">
          <button className={`flex-1 justify-center ${mode === 'login' ? 'on' : ''}`} onClick={() => switchMode('login')} type="button">
            <LogInIcon />
            {t('Sign in', 'เข้าสู่ระบบ')}
          </button>
          <button className={`flex-1 justify-center ${mode === 'signup' ? 'on' : ''}`} onClick={() => switchMode('signup')} type="button">
            <UserPlusIcon />
            {t('Sign up', 'สมัครสมาชิก')}
          </button>
        </div>

        <h1>{mode === 'login' ? t('Welcome back', 'ยินดีต้อนรับกลับ') : t('Create your account', 'สร้างบัญชีใหม่')}</h1>
        <p className="card-sub">
          {mode === 'login'
            ? t('Sign in to your assessments and model projects.', 'เข้าสู่ระบบเพื่อเข้าถึงผลการประเมินและโครงการโมเดลของคุณ')
            : t('Register an account for the PhasePulse research platform.', 'ลงทะเบียนบัญชีสำหรับแพลตฟอร์มวิจัย PhasePulse')}
        </p>

        {error && (
          <p className="callout callout-red mt-4" role="alert">
            {error}
          </p>
        )}

        {mode === 'signup' && (
          <div className="field">
            <label className="label" htmlFor="full-name">
              {t('Full name', 'ชื่อ–นามสกุล')}
            </label>
            <input
              id="full-name"
              type="text"
              placeholder={t('Your name', 'ชื่อของคุณ')}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onKeyDown={onKeyEvent}
            />
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="username">
            {t('Email or username', 'อีเมล หรือ ชื่อผู้ใช้')}
          </label>
          <input
            id="username"
            type="text"
            placeholder="name@example.com"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={onKeyEvent}
            autoComplete="username"
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="password">
            {t('Password', 'รหัสผ่าน')}
          </label>
          <div className="password-wrap">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder={t('At least 6 characters', 'อย่างน้อย 6 ตัวอักษร')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onKeyEvent}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            <button
              type="button"
              className="icon-only"
              aria-label={showPassword ? t('Hide password', 'ซ่อนรหัสผ่าน') : t('Show password', 'แสดงรหัสผ่าน')}
              onClick={() => setShowPassword((v) => !v)}
            >
              <EyeIcon slashed={showPassword} />
            </button>
          </div>
        </div>

        {mode === 'signup' && (
          <div className="field">
            <label className="label" htmlFor="role">
              {t('Role', 'บทบาท')}
            </label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        )}

        {mode === 'login' ? (
          <div className="mt-3 flex items-center justify-between gap-3 text-[14px]">
            <label className="flex cursor-pointer items-center gap-2 text-muted">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
              {t('Remember me', 'จดจำฉัน')}
            </label>
            <button
              type="button"
              className="link"
              onClick={() =>
                alert(
                  t(
                    'Ask the administrator to reset your password.\n\nOnce signed in, change it under Settings → Change password.',
                    'ติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน\n\nเมื่อเข้าสู่ระบบแล้ว เปลี่ยนรหัสได้ที่ การตั้งค่า → เปลี่ยนรหัสผ่าน',
                  ),
                )
              }
            >
              {t('Forgot password?', 'ลืมรหัสผ่าน?')}
            </button>
          </div>
        ) : (
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-[14px] text-muted">
            <input type="checkbox" className="mt-1" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} />
            <span>{t('I agree to the Terms of Use and Privacy Notice.', 'ฉันยอมรับข้อกำหนดการใช้งานและประกาศความเป็นส่วนตัว')}</span>
          </label>
        )}

        <button className="btn btn-primary btn-lg mt-5 w-full" type="button" onClick={() => void submit()} disabled={busy}>
          {busy ? <span className="spinner !border-white/40 !border-t-white" /> : <LogInIcon />}
          {busy
            ? t('Please wait…', 'กำลังดำเนินการ…')
            : mode === 'login'
              ? t('Sign in', 'เข้าสู่ระบบ')
              : t('Create account', 'สร้างบัญชี')}
        </button>

        <div className="mt-5 flex items-center justify-center gap-3 border-t border-line pt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/kmutnb.svg" alt="KMUTNB" className="h-7 w-auto" title="KMUTNB" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/eng.jpg" alt="ENG" className="h-6 w-auto rounded" title="Faculty of Engineering" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/ece.png" alt="ECE" className="h-7 w-auto" title="ECE Department" />
        </div>
      </article>

      <div className="login-tools">
        <div className="seg" role="group" aria-label={t('Language', 'ภาษา')}>
          <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>
            EN
          </button>
          <button type="button" className={lang === 'th' ? 'on' : ''} onClick={() => setLang('th')}>
            TH
          </button>
        </div>
        <button
          type="button"
          className="tool-btn"
          onClick={toggleTheme}
          aria-label={isDark ? t('Light mode', 'โหมดสว่าง') : t('Dark mode', 'โหมดมืด')}
          title={isDark ? t('Light mode', 'โหมดสว่าง') : t('Dark mode', 'โหมดมืด')}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </div>
  );
}
