'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { ConsentGate } from '@/components/shell/ConsentGate';
import { HelpPopover } from '@/components/shell/HelpPopover';
import {
  ActivityIcon,
  ChevronDownIcon,
  DashboardIcon,
  FileTextIcon,
  FolderIcon,
  HelpIcon,
  ImageIcon,
  LanguagesIcon,
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

function PageHeadContent({ pathname }: { pathname: string }) {
  const searchParams = useSearchParams();
  const { t } = useI18n();

  let sectionKey = 'DASHBOARD';
  let pageTitle = t('Dashboard', 'แดชบอร์ด');

  if (pathname.startsWith('/cases')) {
    const mode = searchParams.get('mode');
    if (mode === 'folder') {
      sectionKey = 'FOLDER / BATCH ASSESSMENT';
      pageTitle = t('Folder / Batch Assessment', 'ประเมินโฟลเดอร์ / ชุดข้อมูล');
    } else if (mode === 'results') {
      sectionKey = 'ASSESSMENT RESULTS';
      pageTitle = t('Assessment Results', 'ผลการประเมิน');
    } else if (pathname.includes('/cases/')) {
      sectionKey = 'CASE REVIEW';
      pageTitle = t('Case Review & Calibration', 'ตรวจผลและปรับแกนเคส');
    } else {
      sectionKey = 'SINGLE IMAGE ASSESSMENT';
      pageTitle = t('Single Image Assessment', 'ประเมินภาพเดี่ยว');
    }
  } else if (pathname.startsWith('/batches')) {
    sectionKey = 'BATCH PREVIEW';
    pageTitle = t('Batch Preview', 'ภาพรวมชุดข้อมูล');
  } else if (pathname.startsWith('/training')) {
    sectionKey = 'MODEL DEVELOPMENT';
    pageTitle = t('Model Development', 'พัฒนาโมเดล');
  } else if (pathname.startsWith('/settings')) {
    sectionKey = 'SETTINGS';
    pageTitle = t('Settings', 'การตั้งค่า');
  }

  return (
    <div className="page-head">
      <p>PHASEPULSE / {sectionKey}</p>
      <h1>{pageTitle}</h1>
    </div>
  );
}

function PageHeadBanner({ pathname }: { pathname: string }) {
  return (
    <Suspense
      fallback={
        <div className="page-head">
          <p>PHASEPULSE</p>
          <h1>PhasePulse</h1>
        </div>
      }
    >
      <PageHeadContent pathname={pathname} />
    </Suspense>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready, signOut } = useApp();
  const { lang, toggleLang, t } = useI18n();
  const { isDark, toggleTheme } = useTheme();

  const [helpOpen, setHelpOpen] = useState(false);
  const [assessmentOpen, setAssessmentOpen] = useState(false);

  useEffect(() => {
    if (ready && !user) router.replace('/login');
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[13px] text-slate-400">
        {t('Loading…', 'กำลังโหลด…')}
      </div>
    );
  }

  const isCasesActive = pathname.startsWith('/cases') || pathname.startsWith('/batches');
  const isDashboardActive = pathname === '/dashboard' || pathname === '/';
  const isTrainingActive = pathname.startsWith('/training');

  const avatarInitial = user.username
    ? user.username.split('@')[0].slice(0, 2).toUpperCase()
    : 'NR';

  return (
    <div className={`app ${isDark ? 'dark' : ''}`}>
      <header className="topbar">
        {/* Brand */}
        <button
          className="brand"
          onClick={() => router.push('/dashboard')}
          type="button"
        >
          <span>
            <ActivityIcon width={22} height={22} />
          </span>
          <b>
            PhasePulse
            <small>{t('Partial Discharge Analysis Platform', 'แพลตฟอร์มวิเคราะห์ Partial Discharge')}</small>
          </b>
        </button>

        {/* Main Navigation */}
        <nav className="main-nav">
          <button
            type="button"
            className={isDashboardActive ? 'active' : ''}
            onClick={() => router.push('/dashboard')}
          >
            <DashboardIcon width={17} height={17} />
            <span>{t('Dashboard', 'แดชบอร์ด')}</span>
          </button>

          {/* Assessment Dropdown */}
          <div
            className={`nav-menu ${isCasesActive ? 'active' : ''}`}
            onMouseEnter={() => setAssessmentOpen(true)}
            onMouseLeave={() => setAssessmentOpen(false)}
          >
            <button
              type="button"
              className="nav-menu-trigger"
              onClick={() => router.push('/cases?mode=single')}
            >
              <ImageIcon width={17} height={17} />
              <span>{t('PD Assessment', 'การประเมิน PD')}</span>
              <ChevronDownIcon width={14} height={14} />
            </button>

            <div className={`nav-dropdown ${assessmentOpen ? 'block' : ''}`}>
              <button
                type="button"
                onClick={() => {
                  setAssessmentOpen(false);
                  router.push('/cases?mode=single');
                }}
              >
                <ImageIcon width={18} height={18} className="text-sky-500" />
                <span>
                  <b>{t('Single Image', 'ภาพเดี่ยว')}</b>
                  <small>{t('PRPD or PRPD + TF Map', 'PRPD หรือ PRPD + TF Map')}</small>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAssessmentOpen(false);
                  router.push('/cases?mode=folder');
                }}
              >
                <FolderIcon width={18} height={18} className="text-amber-500" />
                <span>
                  <b>{t('Folder / Batch', 'โฟลเดอร์ / ชุดข้อมูล')}</b>
                  <small>{t('Pair and review up to 500 images', 'จับคู่และตรวจได้สูงสุด 500 ภาพ')}</small>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAssessmentOpen(false);
                  router.push('/cases?mode=results');
                }}
              >
                <FileTextIcon width={18} height={18} className="text-emerald-500" />
                <span>
                  <b>{t('Results', 'ผลลัพธ์')}</b>
                  <small>{t('Cases, details and exports', 'เคส รายละเอียด และการส่งออก')}</small>
                </span>
              </button>
            </div>
          </div>

          <button
            type="button"
            className={isTrainingActive ? 'active' : ''}
            onClick={() => router.push('/training')}
          >
            <TrainingIcon width={17} height={17} />
            <span>{t('Model Development', 'พัฒนาโมเดล')}</span>
          </button>
        </nav>

        {/* Tools on Right */}
        <div className="tools">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            title={t('Help / Documentation', 'ช่วยเหลือ / เอกสารประกอบ')}
          >
            <HelpIcon width={17} height={17} />
            <span className="hidden sm:inline">{t('Help', 'ช่วยเหลือ')}</span>
          </button>

          <button
            type="button"
            className={pathname.startsWith('/settings') ? 'active' : ''}
            onClick={() => router.push('/settings')}
            aria-label={t('Settings', 'การตั้งค่า')}
            title={t('Settings', 'การตั้งค่า')}
          >
            <SettingsIcon width={17} height={17} />
          </button>

          {/* Language Switcher */}
          <button
            type="button"
            onClick={toggleLang}
            title={t('Switch to Thai', 'เปลี่ยนเป็นภาษาอังกฤษ')}
            className="flex items-center gap-1 font-semibold"
          >
            <LanguagesIcon width={16} height={16} />
            <span>{lang.toUpperCase()}</span>
          </button>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? t('Switch to Light Mode', 'เปลี่ยนเป็นโหมดสว่าง') : t('Switch to Dark Mode', 'เปลี่ยนเป็นโหมดมืด')}
          >
            {isDark ? <SunIcon width={17} height={17} /> : <MoonIcon width={17} height={17} />}
          </button>

          {/* Sign Out */}
          <button
            type="button"
            onClick={() => void signOut()}
            title={t('Log out', 'ออกจากระบบ')}
            aria-label={t('Log out', 'ออกจากระบบ')}
          >
            <SignOutIcon width={17} height={17} />
          </button>

          {/* User Profile Avatar */}
          <button
            type="button"
            className="profile-button"
            onClick={() => router.push('/dashboard')}
            title={`${user.username} (${user.role})`}
          >
            {avatarInitial}
          </button>

          {/* Institution logos */}
          <div className="hero-logo-row hidden xl:flex items-center gap-2 pl-2 border-l border-white/20">
            {INSTITUTION_LOGOS.map(({ src, alt, title }) => (
              <div
                className="flex h-8 items-center justify-center rounded bg-white/95 px-2 py-0.5 shadow-sm"
                key={src}
                title={title}
              >
                <img src={src} alt={alt} className="h-6 w-auto object-contain" />
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Page Breadcrumb / Heading Bar */}
      <PageHeadBanner pathname={pathname} />

      <main className="content">{children}</main>

      <footer className="note">
        <div className="mx-auto max-w-[840px] rounded-md border border-[#FDE68A] bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800/60 px-[14px] py-[9px] text-[12px] font-semibold leading-[1.5] text-amber-700 dark:text-amber-300">
          {t(
            'AI results are a preliminary assessment, not a diagnosis. Verify every case against the measurement data and confirm with a qualified engineer before making an engineering decision.',
            'ผลการประเมินจาก AI เป็นเพียงการวิเคราะห์เบื้องต้นไม่ใช่การวินิจฉัยขั้นสุดท้าย กรุณาตรวจสอบกับข้อมูลการวัดและยืนยันร่วมกับวิศวกรผู้เชี่ยวชาญก่อนตัดสินใจทางวิศวกรรม'
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400">
          <span>PhasePulse: Partial Discharge Analysis Platform</span>
          <span>•</span>
          <span>KMUTNB • Faculty of Engineering • ECE</span>
        </div>
      </footer>

      <HelpPopover open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ConsentGate onDecline={() => void signOut()} />
    </div>
  );
}
