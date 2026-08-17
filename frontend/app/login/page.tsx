'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';

import { CapsLockIcon, EyeIcon } from '@/components/ui/icons';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';

/** Strength scoring copied from the prototype's `scorePasswordStrength`. */
const PW_STRENGTH_META = [
  { label: 'Very weak', color: '#EF4444' },
  { label: 'Weak', color: '#F59E0B' },
  { label: 'Fair', color: '#EAB308' },
  { label: 'Good', color: '#22C55E' },
  { label: 'Very strong', color: '#10B981' },
];

function scorePasswordStrength(pw: string): number {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

export default function LoginPage() {
  const router = useRouter();
  const { user, ready, signIn, signUp } = useApp();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('researcher');
  const [roles, setRoles] = useState<string[]>(['researcher']);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
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
      setError('Please enter both username and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (mode === 'signup') await signUp(username.trim(), password, role);
      else await signIn(username.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  function onKeyEvent(e: KeyboardEvent<HTMLInputElement>) {
    if (typeof e.getModifierState === 'function') setCapsLock(e.getModifierState('CapsLock'));
    if (e.key === 'Enter') void submit();
  }

  const score = scorePasswordStrength(password);
  const meta = PW_STRENGTH_META[score];

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-logo">
          <div className="mark">P</div>
          <div>
            <div className="text-[16px] font-semibold text-slate-900">PD Insight</div>
            <div className="text-[11px] text-slate-400">Partial Discharge Diagnostic System</div>
          </div>
        </div>

        <div className="login-tabs">
          <button
            className={mode === 'login' ? 'active' : ''}
            onClick={() => switchMode('login')}
            type="button"
          >
            Sign In
          </button>
          <button
            className={mode === 'signup' ? 'active' : ''}
            onClick={() => switchMode('signup')}
            type="button"
          >
            Sign Up
          </button>
        </div>

        {error && <div className="login-error">{error}</div>}

        <div className="field">
          <label className="field-label">Username</label>
          <input
            type="text"
            value={username}
            placeholder="e.g. researcher01"
            autoComplete="username"
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={onKeyEvent}
          />
        </div>

        <div className="field">
          <label className="field-label">Password</label>
          <div className="password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              placeholder="Password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              onChange={(e) => setPassword(e.target.value)}
              onKeyUp={onKeyEvent}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
              onBlur={() => setCapsLock(false)}
            />
            <button
              type="button"
              className="password-toggle-btn"
              aria-label="Show/hide password"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
            >
              <EyeIcon width={17} height={17} slashed={showPassword} />
            </button>
          </div>

          {capsLock && (
            <div className="capslock-warning">
              <CapsLockIcon width={13} height={13} /> Caps Lock is on
            </div>
          )}

          {mode === 'signup' && password && (
            <div className="mt-[9px]">
              <div className="pw-strength-bar-bg">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="pw-strength-segment"
                    style={{ background: i <= score ? meta.color : '#E2E8F0' }}
                  />
                ))}
              </div>
              <div className="mt-[6px] text-[11px] text-slate-400">Strength: {meta.label}</div>
            </div>
          )}
        </div>

        {mode === 'signup' && (
          <div className="field">
            <label className="field-label">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
            <p className="mt-[6px] text-[11px] leading-[1.5] text-slate-400">
              Role is recorded as the reviewer label on every case you sign off. It does not
              restrict what you can do in the system.
            </p>
          </div>
        )}

        <button
          className="btn btn-blue w-full justify-center"
          onClick={() => void submit()}
          disabled={busy}
          type="button"
        >
          {busy ? 'Please wait…' : mode === 'signup' ? 'Sign Up' : 'Sign In'}
        </button>
      </div>
    </div>
  );
}
