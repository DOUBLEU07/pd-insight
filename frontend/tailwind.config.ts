import type { Config } from 'tailwindcss';

/**
 * Palette, radii and shadow are taken verbatim from the :root block of
 * PD_Insight_Prototype.html so the rebuilt UI matches the approved design.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EEF3F8',
          100: '#DCE6EF',
          200: '#B9CEE0',
          400: '#4472A8',
          500: '#1F4E79',
          600: '#17395A',
          700: '#102943',
        },
        corona: '#F59E0B',
        surfaceblue: '#0EA5E9',
        internal: '#EF4444',
        mixedpd: '#A855F7',
        nonid: '#94A3B8',
        emerald: {
          50: '#ECFDF5',
          200: '#A7F3D0',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
        },
        red: {
          50: '#FEF2F2',
          200: '#FECACA',
          700: '#B91C1C',
        },
        amber: {
          50: '#FFFBEB',
          700: '#92400E',
        },
        slate: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          900: '#0F172A',
        },
      },
      fontFamily: {
        sans: ['Kanit', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        base: '14px',
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,.05), 0 4px 14px -6px rgba(15,23,42,.10)',
        popover: '0 20px 44px -12px rgba(15,23,42,.28)',
        login: '0 24px 56px -24px rgba(15,23,42,.20)',
      },
    },
  },
  plugins: [],
};

export default config;
