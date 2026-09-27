import type { Config } from 'tailwindcss';

/**
 * Colours are CSS variables defined in app/globals.css, so every utility below
 * follows the light/dark theme without a `dark:` variant. The `.dark` class on
 * <html> (set by lib/theme.tsx) swaps the variables.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        muted: 'var(--muted)',
        navy: 'var(--navy)',
        cyan: 'var(--cyan)',
        primary: {
          DEFAULT: 'var(--primary)',
          ink: 'var(--primary-ink)',
          soft: 'var(--primary-soft)',
          line: 'var(--primary-line)',
        },
        success: {
          DEFAULT: 'var(--success)',
          soft: 'var(--success-soft)',
          line: 'var(--success-line)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          soft: 'var(--warning-soft)',
          line: 'var(--warning-line)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          soft: 'var(--danger-soft)',
          line: 'var(--danger-line)',
        },
        corona: '#F59E0B',
        surfaceblue: '#0EA5E9',
        internal: '#EF4444',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Thai"', '-apple-system', '"Segoe UI"', 'sans-serif'],
        display: ['Kanit', '"IBM Plex Sans Thai"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      borderRadius: {
        sm: '5px',
        md: '7px',
        lg: '10px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        popover: 'var(--shadow-popover)',
      },
    },
  },
  plugins: [],
};

export default config;
