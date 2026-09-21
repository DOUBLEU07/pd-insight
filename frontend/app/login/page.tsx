'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';

import {
  ActivityIcon,
  EyeIcon,
  LanguagesIcon,
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
  const { lang, toggleLang, t } = useI18n();
  const { isDark, toggleTheme } = useTheme();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('natthawutrit.2545@gmail.com');
  const [password, setPassword] = useState('phasepulse');
  const [fullName, setFullName] = useState('Natthawut Rit');
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
    <div className={`login-page ${isDark ? 'dark' : ''}`}>
      <div className="login-brand">
        <span>
          <ActivityIcon width={24} height={24} />
        </span>
        <b>PhasePulse</b>
        <small>{t('Partial Discharge Analysis Platform', 'แพลตฟอร์มวิเคราะห์ Partial Discharge')}</small>
      </div>

      <article className="login-card">
        <div className="auth-tabs">
          <button
            className={mode === 'login' ? 'active' : ''}
            onClick={() => switchMode('login')}
            type="button"
          >
            {t('Sign in', 'เข้าสู่ระบบ')}
          </button>
          <button
            className={mode === 'signup' ? 'active' : ''}
            onClick={() => switchMode('signup')}
            type="button"
          >
            {t('Sign up', 'สมัครสมาชิก')}
          </button>
        </div>

        {mode === 'login' ? (
          <LogInIcon width={28} height={28} className="text-sky-500 mb-2" />
        ) : (
          <UserPlusIcon width={28} height={28} className="text-sky-500 mb-2" />
        )}

        <h1>
          {mode === 'login'
            ? t('Welcome back', 'ยินดีต้อนรับกลับ')
            : t('Create your account', 'สร้างบัญชีใหม่')}
        </h1>
        <p>
          {mode === 'login'
            ? t(
                'Sign in to access your assessments and model projects.',
                'เข้าสู่ระบบเพื่อเข้าถึงผลการประเมินและโครงการโมเดลของคุณ'
              )
            : t(
                'Register an account for the PhasePulse research platform.',
                'ลงทะเบียนบัญชีสำหรับแพลตฟอร์มวิจัย PhasePulse'
              )}
        </p>

        {error && (
          <div className="locked-banner red mb-4 text-xs">
            {error}
          </div>
        )}

        {mode === 'signup' && (
          <label>
            {t('Full name', 'ชื่อ–นามสกุล')}
            <input
              type="text"
              placeholder={t('Your name', 'ชื่อของคุณ')}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onKeyDown={onKeyEvent}
            />
          </label>
        )}

        <label>
          {t('Email address / Username', 'อีเมล หรือ ชื่อผู้ใช้')}
          <input
            type="text"
            placeholder="name@example.com"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={onKeyEvent}
            autoComplete="username"
          />
        </label>

        <label>
          {t('Password', 'รหัสผ่าน')}
          <span className="password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder={t('At least 8 characters', 'อย่างน้อย 8 ตัวอักษร')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onKeyEvent}
              autoComplete="current-password"
            />
            <button
              type="button"
              aria-label={t('Show password', 'แสดงรหัสผ่าน')}
              onClick={() => setShowPassword((v) => !v)}
            >
              <EyeIcon width={18} height={18} />
            </button>
          </span>
        </label>

        {mode === 'signup' && (
          <label>
            {t('Role', 'บทบาทในระบบ')}
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        )}

        {mode === 'login' ? (
          <div className="login-row">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              {t('Remember me', 'จดจำฉัน')}
            </label>
            <button
              type="button"
              className="link-btn"
              onClick={() =>
                alert(
                  t(
                    'Default demo credentials:\nnatthawutrit.2545@gmail.com / phasepulse\nor admin / admin',
                    'รหัสผ่านเริ่มต้น:\nnatthawutrit.2545@gmail.com / phasepulse\nหรือ admin / admin'
                  )
                )
              }
            >
              {t('Forgot password?', 'ลืมรหัสผ่าน?')}
            </button>
          </div>
        ) : (
          <label className="terms">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
            />
            <span>
              {t(
                'I agree to the Terms of Use and Privacy Notice.',
                'ฉันยอมรับข้อกำหนดการใช้งานและประกาศความเป็นส่วนตัว'
              )}
            </span>
          </label>
        )}

        <button
          className="primary login-submit"
          type="button"
          onClick={submit}
          disabled={busy}
        >
          <LogInIcon width={18} height={18} />
          {busy
            ? t('Please wait…', 'กำลังดำเนินการ…')
            : mode === 'login'
            ? t('Sign in', 'เข้าสู่ระบบ')
            : t('Create account', 'สร้างบัญชี')}
        </button>

        <p className="login-note">
          {t(
            'Prototype access — Senior Project Partial Discharge Platform',
            'การเข้าถึงระบบต้นแบบ — โครงงานวิศวกรรม Partial Discharge Analysis'
          )}
        </p>

        <div className="mt-4 flex items-center justify-center gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
          <img src="/logos/kmutnb.svg" alt="KMUTNB" className="h-7 w-auto opacity-75 hover:opacity-100 transition-opacity" title="KMUTNB" />
          <img src="/logos/eng.jpg" alt="ENG" className="h-6 w-auto rounded opacity-75 hover:opacity-100 transition-opacity" title="Faculty of Engineering" />
          <img src="/logos/ece.png" alt="ECE" className="h-7 w-auto opacity-75 hover:opacity-100 transition-opacity" title="ECE Department" />
        </div>
      </article>

      <div className="login-tools">
        <button
          type="button"
          onClick={toggleLang}
          title={t('Switch to Thai', 'เปลี่ยนเป็นภาษาอังกฤษ')}
        >
          <LanguagesIcon width={16} height={16} />
          {lang.toUpperCase()}
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          title={isDark ? t('Light mode', 'โหมดสว่าง') : t('Dark mode', 'โหมดมืด')}
        >
          {isDark ? <SunIcon width={16} height={16} /> : <MoonIcon width={16} height={16} />}
        </button>
      </div>
    </div>
  );
}
