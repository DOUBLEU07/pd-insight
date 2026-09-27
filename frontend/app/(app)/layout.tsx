'use client';

import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { ConsentGate } from '@/components/shell/ConsentGate';
import { HelpPopover } from '@/components/shell/HelpPopover';
import {
  ActivityIcon,
  AlertIcon,
  DashboardIcon,
  FileTextIcon,
  FolderIcon,
  HelpIcon,
  ImageIcon,
  KeyIcon,
  MoonIcon,
  SettingsIcon,
  SignOutIcon,
  SunIcon,
  TrainingIcon,
} from '@/components/ui/icons';
import { useApp } from '@/lib/app-context';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

/** Institution logos, ordered university → faculty → department. */
const INSTITUTION_LOGOS = [
  { src: '/logos/kmutnb.svg', alt: 'KMUTNB', title: "King Mongkut's University of Technology North Bangkok" },
  { src: '/logos/eng.jpg', alt: 'ENG KMUTNB', title: 'Faculty of Engineering, KMUTNB' },
  { src: '/logos/ece.png', alt: 'ECE KMUTNB', title: 'Department of Electrical and Computer Engineering, KMUTNB' },
];

type Section = 'dashboard' | 'single' | 'folder' | 'results' | 'training' | 'settings';

function useSection(): Section {
  const pathname = usePathname();
  const mode = useSearchParams().get('mode');
  if (pathname.startsWith('/batches')) return 'folder';
  if (pathname.startsWith('/cases/')) return 'results';
  if (pathname.startsWith('/cases')) {
    if (mode === 'folder') return 'folder';
    if (mode === 'results') return 'results';
    return 'single';
  }
  if (pathname.startsWith('/training')) return 'training';
  if (pathname.startsWith('/settings')) return 'settings';
  return 'dashboard';
}

function MainNav() {
  const router = useRouter();
  const section = useSection();
  const { t } = useI18n();

  const items: { key: Section; href: string; icon: ReactNode; label: string }[] = [
    { key: 'dashboard', href: '/dashboard', icon: <DashboardIcon />, label: t('Dashboard', 'แดชบอร์ด') },
    { key: 'single', href: '/cases?mode=single', icon: <ImageIcon />, label: t('Single image', 'ภาพเดี่ยว') },
    { key: 'folder', href: '/cases?mode=folder', icon: <FolderIcon />, label: t('Folder / batch', 'ทั้งโฟลเดอร์') },
    { key: 'results', href: '/cases?mode=results', icon: <FileTextIcon />, label: t('Results', 'ผลการประเมิน') },
  ];

  return (
    <nav className="main-nav" aria-label={t('Main', 'เมนูหลัก')}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`nav-item ${section === item.key ? 'active' : ''}`}
          aria-current={section === item.key ? 'page' : undefined}
          onClick={() => router.push(item.href)}
          title={item.label}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
      <span className="nav-sep" aria-hidden="true" />
      <button
        type="button"
        className={`nav-item ${section === 'training' ? 'active' : ''}`}
        aria-current={section === 'training' ? 'page' : undefined}
        onClick={() => router.push('/training')}
        title={t('Model development', 'พัฒนาโมเดล')}
      >
        <TrainingIcon />
        <span>{t('Model development', 'พัฒนาโมเดล')}</span>
      </button>
    </nav>
  );
}

function PageHead() {
  const section = useSection();
  const { t } = useI18n();

  const heads: Record<Section, [string, string]> = {
    dashboard: [t('Overview', 'ภาพรวม'), t('Dashboard', 'แดชบอร์ด')],
    single: [t('PD assessment', 'การประเมิน PD'), t('Single image assessment', 'ประเมินภาพเดี่ยว')],
    folder: [t('PD assessment', 'การประเมิน PD'), t('Folder / batch assessment', 'ประเมินทั้งโฟลเดอร์')],
    results: [t('PD assessment', 'การประเมิน PD'), t('Assessment results', 'ผลการประเมิน')],
    training: [t('Models', 'โมเดล'), t('Model development', 'พัฒนาโมเดล')],
    settings: [t('Account', 'บัญชี'), t('Settings', 'การตั้งค่า')],
  };
  const [eyebrow, title] = heads[section];

  return (
    <div className="page-head">
      <div className="page-head-inner">
        <div>
          <div className="eyebrow">PhasePulse · {eyebrow}</div>
          <h1>{title}</h1>
        </div>
      </div>
    </div>
  );
}

function UserMenu({ onHelp }: { onHelp: () => void }) {
  const router = useRouter();
  const { user, signOut } = useApp();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!user) return null;
  const initials = user.username.split('@')[0].slice(0, 2).toUpperCase();

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="avatar-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.username}
        onClick={() => setOpen((v) => !v)}
      >
        {initials}
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <b>{user.username}</b>
            <span>{user.role}</span>
          </div>
          <button type="button" className="menu-item" role="menuitem" onClick={() => go('/settings')}>
            <SettingsIcon />
            {t('Settings', 'การตั้งค่า')}
          </button>
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            onClick={() => go('/settings#password')}
          >
            <KeyIcon />
            {t('Change password', 'เปลี่ยนรหัสผ่าน')}
          </button>
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onHelp();
            }}
          >
            <HelpIcon />
            {t('Help & reference', 'คู่มือการใช้งาน')}
          </button>
          <button
            type="button"
            className="menu-item danger"
            role="menuitem"
            onClick={() => void signOut()}
          >
            <SignOutIcon />
            {t('Sign out', 'ออกจากระบบ')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready, signOut } = useApp();
  const { lang, setLang, t } = useI18n();
  const { isDark, toggleTheme } = useTheme();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (ready && !user) router.replace('/login');
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-muted">
        <span className="spinner" />
        {t('Loading…', 'กำลังโหลด…')}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => router.push('/dashboard')} type="button">
          <span className="brand-mark">
            <ActivityIcon width={20} height={20} />
          </span>
          <span className="brand-name">
            PhasePulse
            <small>{t('Partial discharge analysis', 'วิเคราะห์ Partial Discharge')}</small>
          </span>
        </button>

        <Suspense fallback={<nav className="main-nav" />}>
          <MainNav />
        </Suspense>

        <div className="tools">
          <button
            type="button"
            className="tool-btn hide-sm"
            onClick={() => setHelpOpen(true)}
            title={t('Help & reference', 'คู่มือการใช้งาน')}
          >
            <HelpIcon />
          </button>

          <div className="lang-switch" role="group" aria-label={t('Language', 'ภาษา')}>
            <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>
              EN
            </button>
            <button type="button" className={lang === 'th' ? 'on' : ''} onClick={() => setLang('th')}>
              TH
            </button>
          </div>

          <button
            type="button"
            className="tool-btn"
            onClick={toggleTheme}
            title={isDark ? t('Switch to light mode', 'เปลี่ยนเป็นโหมดสว่าง') : t('Switch to dark mode', 'เปลี่ยนเป็นโหมดมืด')}
            aria-label={isDark ? t('Switch to light mode', 'เปลี่ยนเป็นโหมดสว่าง') : t('Switch to dark mode', 'เปลี่ยนเป็นโหมดมืด')}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>

          <button
            type="button"
            className={`tool-btn hide-sm ${pathname.startsWith('/settings') ? 'active' : ''}`}
            onClick={() => router.push('/settings')}
            title={t('Settings', 'การตั้งค่า')}
            aria-label={t('Settings', 'การตั้งค่า')}
          >
            <SettingsIcon />
          </button>

          <UserMenu onHelp={() => setHelpOpen(true)} />
        </div>
      </header>

      <Suspense fallback={<div className="page-head" />}>
        <PageHead />
      </Suspense>

      <main className="content">{children}</main>

      <footer className="site-foot">
        <div className="site-foot-inner">
          <p className="disclaimer">
            <AlertIcon />
            {t(
              'AI results are a preliminary assessment, not a diagnosis. Verify each case against the measurement data and confirm with a qualified engineer before any engineering decision.',
              'ผลจาก AI เป็นการประเมินเบื้องต้น ไม่ใช่การวินิจฉัย ตรวจทุกเคสกับข้อมูลการวัดและยืนยันกับวิศวกรผู้มีคุณสมบัติก่อนตัดสินใจทางวิศวกรรม',
            )}
          </p>
          <div className="logo-row">
            {INSTITUTION_LOGOS.map(({ src, alt, title }) => (
              <span key={src} title={title}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={alt} />
              </span>
            ))}
          </div>
        </div>
      </footer>

      <HelpPopover open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ConsentGate onDecline={() => void signOut()} />
    </div>
  );
}
