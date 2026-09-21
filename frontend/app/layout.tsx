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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800&display=swap"
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
