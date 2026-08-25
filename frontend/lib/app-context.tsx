'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

import { api, clearSession, getStoredUser, getToken, storeSession, type SessionUser } from './api';
import type { CaseOptions } from './types';

interface AppContextValue {
  user: SessionUser | null;
  ready: boolean;
  options: CaseOptions | null;
  /** Re-read reference data after the account changes its thresholds. */
  refreshOptions: () => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string, role: string) => Promise<void>;
  signOut: () => Promise<void>;
  toast: (message: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [options, setOptions] = useState<CaseOptions | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore an existing session on first paint.
  useEffect(() => {
    const stored = getStoredUser();
    if (!getToken() || !stored) {
      setReady(true);
      return;
    }
    api
      .me()
      .then((me) => setUser(me))
      .catch(() => {
        clearSession();
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  // Reference data (thresholds, dropdown values, ML status) is shared app-wide.
  // Retried on failure: a single dropped request here (e.g. the API container
  // still starting up under docker compose) used to leave every dropdown that
  // reads from `options` — PD source included — empty for the rest of the
  // session, with no way to recover short of logging out and back in.
  const refreshOptions = useCallback(async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        setOptions(await api.options());
        return;
      } catch {
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
    /* keep whatever is already loaded rather than blanking the UI */
  }, []);

  useEffect(() => {
    if (!user) {
      setOptions(null);
      return;
    }
    void refreshOptions();
  }, [user, refreshOptions]);

  const toast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(null), 2600);
  }, []);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const res = await api.login(username, password);
      storeSession(res.access_token, { username: res.username, role: res.role });
      setUser({ username: res.username, role: res.role });
      router.push('/dashboard');
    },
    [router],
  );

  const signUp = useCallback(
    async (username: string, password: string, role: string) => {
      const res = await api.signup(username, password, role);
      storeSession(res.access_token, { username: res.username, role: res.role });
      setUser({ username: res.username, role: res.role });
      router.push('/dashboard');
    },
    [router],
  );

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* signing out locally matters more than recording it */
    }
    clearSession();
    setUser(null);
    router.push('/login');
  }, [router]);

  const value = useMemo(
    () => ({ user, ready, options, refreshOptions, signIn, signUp, signOut, toast }),
    [user, ready, options, refreshOptions, signIn, signUp, signOut, toast],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className={`toast ${toastMessage ? 'show' : ''}`}>{toastMessage}</div>
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
