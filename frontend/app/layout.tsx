import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AppProvider } from '@/lib/app-context';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/lib/theme';

import './globals.css';

export const metadata: Metadata = {
  title: 'PhasePulse | Partial Discharge Analysis Platform',
  description:
    'Expert-reviewed PRPD assessment, Gap-Time severity analysis, and model development for high-voltage equipment.',
};

/**
 * Applies the saved theme and language before first paint, so a dark-mode
 * user never sees a white flash and Thai text is laid out with lang="th".
 * Mirrors the rules in lib/theme.tsx and lib/i18n.tsx.
 */
const bootScript = `(function(){try{var t=localStorage.getItem('phasepulse-theme');var h=new Date().getHours();var d=t==='dark'||((t!=='light')&&(h<6||h>=18));if(d)document.documentElement.classList.add('dark');if(localStorage.getItem('phasepulse-lang')==='th')document.documentElement.lang='th';}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=Kanit:wght@500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeProvider>
          <I18nProvider>
            <AppProvider>{children}</AppProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
