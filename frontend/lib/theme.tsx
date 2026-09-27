'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'phasepulse-theme';

interface ThemeContextType {
  /** What the user chose. */
  theme: Theme;
  /** What is showing now; `auto` resolves by local time. */
  isDark: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'auto',
  isDark: false,
  setTheme: () => {},
  toggleTheme: () => {},
});

/** Dark between 18:00 and 06:00 local time, as the boot script in app/layout.tsx does. */
function darkByClock(): boolean {
  const hour = new Date().getHours();
  return hour < 6 || hour >= 18;
}

function resolve(theme: Theme): boolean {
  return theme === 'dark' || (theme === 'auto' && darkByClock());
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('auto');
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    let stored: Theme = 'auto';
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === 'dark' || raw === 'light' || raw === 'auto') stored = raw;
    } catch {
      /* storage blocked: follow the clock */
    }
    setThemeState(stored);
  }, []);

  // Apply the class, and in auto mode re-check every few minutes so the page
  // turns over at 06:00 / 18:00 without a reload.
  useEffect(() => {
    const apply = () => {
      const dark = resolve(theme);
      setIsDark(dark);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    if (theme !== 'auto') return;
    const timer = setInterval(apply, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* the choice still applies to this page */
    }
  }, []);

  const value = useMemo<ThemeContextType>(
    () => ({
      theme,
      isDark,
      setTheme,
      toggleTheme: () => setTheme(isDark ? 'light' : 'dark'),
    }),
    [theme, isDark, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
