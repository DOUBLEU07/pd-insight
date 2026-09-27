'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Language = 'en' | 'th';

const STORAGE_KEY = 'phasepulse-lang';

interface I18nContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  /**
   * Pick the string (or JSX) for the current language. Generic so long help
   * text can pass rich JSX for both languages, not only plain strings.
   */
  t: <T = string>(en: T, th: T) => T;
  /** Locale for dates and numbers. */
  locale: string;
}

const I18nContext = createContext<I18nContextType>({
  lang: 'en',
  setLang: () => {},
  toggleLang: () => {},
  t: (en) => en,
  locale: 'en-GB',
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>('en');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'th' || stored === 'en') setLangState(stored);
    } catch {
      /* storage blocked: stay in English */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* the choice still applies to this page */
    }
  }, []);

  const value = useMemo<I18nContextType>(
    () => ({
      lang,
      setLang,
      toggleLang: () => setLang(lang === 'en' ? 'th' : 'en'),
      t: <T,>(en: T, th: T): T => (lang === 'th' ? th : en),
      locale: lang === 'th' ? 'th-TH' : 'en-GB',
    }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
