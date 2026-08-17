import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AppProvider } from '@/lib/app-context';

import './globals.css';

export const metadata: Metadata = {
  title: 'PD Insight: Partial Discharge Diagnostic System',
  description:
    'Classify partial discharge defects from PRPD plots, measure gap-time and sign off each case.',
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
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
