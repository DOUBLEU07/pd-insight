'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { ConsentGate } from '@/components/shell/ConsentGate';
import { HelpPopover } from '@/components/shell/HelpPopover';
import {
  DashboardIcon,
  HelpIcon,
  SettingsIcon,
  SignOutIcon,
  TrainingIcon,
  WorkflowIcon,
} from '@/components/ui/icons';
import { useApp } from '@/lib/app-context';

const PAGE_META: Record<string, { title: string; sub: string }> = {
  '/dashboard': { title: 'Dashboard', sub: 'Overview of all PD cases' },
  '/cases': {
    title: 'Case Workflow',
    sub: 'Upload a single case, or import a folder, then calibrate and review end-to-end',
  },
  '/batches': { title: 'Batch Preview', sub: 'Images in this batch' },
  '/training': { title: 'Model Training', sub: 'Accumulated usage data and model training runs' },
  '/settings': { title: 'Settings', sub: 'System configuration and model status' },
};

/** Institution logos, ordered university → faculty → department. */
const INSTITUTION_LOGOS = [
  {
    src: '/logos/kmutnb.svg',
    alt: 'KMUTNB',
    title: "King Mongkut's University of Technology North Bangkok",
  },
  { src: '/logos/eng.jpg', alt: 'ENG KMUTNB', title: 'Faculty of Engineering, KMUTNB' },
  {
    src: '/logos/ece.png',
    alt: 'ECE KMUTNB',
    title: 'Department of Electrical and Computer Engineering, KMUTNB',
  },
];

function metaFor(pathname: string) {
  const key = Object.keys(PAGE_META).find((k) => pathname.startsWith(k));
  return key ? PAGE_META[key] : { title: 'PD Insight', sub: '' };
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready, signOut } = useApp();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (ready && !user) router.replace('/login');
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[13px] text-slate-400">
        Loading…
      </div>
    );
  }

  const meta = metaFor(pathname);

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', Icon: DashboardIcon },
    { href: '/cases', label: 'Case Workflow', Icon: WorkflowIcon },
    { href: '/training', label: 'Model Training', Icon: TrainingIcon },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="mark">P</div>
          <div>
            <div className="text-[15.5px] font-semibold leading-[1.2] text-slate-900">
              PD Insight
            </div>
            <div className="mt-px text-[11px] text-slate-400">
              Partial Discharge Diagnostic System
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ href, label, Icon }) => {
            const active =
              pathname.startsWith(href) ||
              (href === '/dashboard' && pathname.startsWith('/batches'));
            return (
              <button
                key={href}
                className={active ? 'active' : ''}
                onClick={() => router.push(href)}
                type="button"
              >
                <Icon />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex-1" />

        <div className="sidebar-foot">
          <div className="link" data-help-trigger onClick={() => setHelpOpen((v) => !v)}>
            <HelpIcon width={15} height={15} />
            <span>Help</span>
          </div>
          <div className="link" onClick={() => router.push('/settings')}>
            <SettingsIcon width={15} height={15} />
            <span>Settings</span>
          </div>
          <div className="link" onClick={() => void signOut()}>
            <SignOutIcon width={15} height={15} />
            <span>Sign Out</span>
          </div>
          <div className="account-chip">
            <span className="avatar">{user.username.charAt(0).toUpperCase()}</span>
            <span>
              <b className="text-slate-900">{user.username}</b>
              <br />
              <span className="capitalize text-slate-400">{user.role}</span>
            </span>
          </div>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <svg
            className="topbar-scatter"
            viewBox="0 0 1200 140"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M0,70 Q150,15 300,70 T600,70 T900,70 T1200,70"
              fill="none"
              stroke="#ffffff"
              strokeWidth="1"
              strokeOpacity=".22"
            />
            <g fill="#F59E0B" fillOpacity=".7">
              <circle cx="140" cy="34" r="2.2" />
              <circle cx="155" cy="28" r="1.7" />
              <circle cx="170" cy="42" r="2" />
              <circle cx="182" cy="24" r="1.5" />
              <circle cx="800" cy="106" r="2" />
              <circle cx="815" cy="114" r="1.6" />
            </g>
            <g fill="#0EA5E9" fillOpacity=".7">
              <circle cx="440" cy="40" r="1.8" />
              <circle cx="455" cy="52" r="2.2" />
              <circle cx="470" cy="32" r="1.6" />
              <circle cx="1060" cy="100" r="1.8" />
              <circle cx="1075" cy="92" r="1.6" />
            </g>
            <g fill="#EF4444" fillOpacity=".65">
              <circle cx="640" cy="104" r="2.2" />
              <circle cx="655" cy="114" r="1.8" />
              <circle cx="670" cy="98" r="1.6" />
              <circle cx="95" cy="100" r="1.8" />
            </g>
          </svg>

          <div className="relative z-[1]">
            <h1>{meta.title}</h1>
            <div className="sub">{meta.sub}</div>
          </div>

          <div className="relative z-[1] flex flex-shrink-0 items-center gap-4">
            <button
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/40 bg-white/[.16] p-0 text-[13px] font-extrabold text-white"
              title="Help / how this page works"
              data-help-trigger
              onClick={() => setHelpOpen((v) => !v)}
              type="button"
            >
              ?
            </button>
            <div className="hero-logo-row hidden sm:flex">
              {INSTITUTION_LOGOS.map(({ src, alt, title }) => (
                <div className="hero-logo-slot" key={src} title={title}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={alt} />
                </div>
              ))}
            </div>
          </div>
        </header>

        <main className="content">{children}</main>

        <footer className="note">
          <div className="mx-auto max-w-[820px] rounded-md border border-[#FDE68A] bg-amber-50 px-[14px] py-[9px] text-[12px] font-semibold leading-[1.5] text-amber-700">
            AI results are a preliminary assessment, not a diagnosis. Verify every case against the
            measurement data and confirm with a qualified engineer before making an engineering
            decision.
          </div>
          <div className="mt-[10px]">PD Insight: Partial Discharge Diagnostic System</div>
        </footer>
      </div>

      <HelpPopover open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ConsentGate onDecline={() => void signOut()} />
    </div>
  );
}
