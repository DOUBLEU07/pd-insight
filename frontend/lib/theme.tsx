'use client';

import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'auto';

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  isDark: false,
  setTheme: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [isDark, setIsDark] = useState<boolean>(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('phasepulse-theme') as Theme | null;
      if (stored === 'dark' || stored === 'light' || stored === 'auto') {
        setThemeState(stored);
        applyTheme(stored);
      } else {
        // Auto by local time if not set
        const hour = new Date().getHours();
        const autoDark = hour < 6 || hour >= 18;
        setIsDark(autoDark);
        if (autoDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const applyTheme = (t: Theme) => {
    let dark = false;
    if (t === 'dark') {
      dark = true;
    } else if (t === 'light') {
      dark = false;
    } else {
      const hour = new Date().getHours();
      dark = hour < 6 || hour >= 18;
    }
    setIsDark(dark);
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const setTheme = (t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    try {
      localStorage.setItem('phasepulse-theme', t);
    } catch {
      // ignore
    }
  };

  const toggleTheme = () => {
    const next: Theme = isDark ? 'light' : 'dark';
    setTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, isDark, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
