'use client';

import { useRouter } from 'next/navigation';

import { CheckIcon, FolderIcon, ImageIcon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n';

/**
 * The two ways into an assessment, side by side, so it is always clear which
 * one is being used: one PRPD image (with an optional TF map), or a whole
 * folder at once. Used on the dashboard and at the top of the assessment page.
 */
export function AssessmentChoice({ active }: { active?: 'single' | 'folder' }) {
  const router = useRouter();
  const { t } = useI18n();

  const options = [
    {
      key: 'single' as const,
      icon: <ImageIcon />,
      title: t('Single image', 'ภาพเดี่ยว'),
      desc: t('One PRPD image, plus its TF map if you have it', 'ภาพ PRPD 1 ภาพ และ TF Map ของภาพนั้น (ถ้ามี)'),
    },
    {
      key: 'folder' as const,
      icon: <FolderIcon />,
      title: t('Folder / batch', 'ทั้งโฟลเดอร์'),
      desc: t('A whole folder, up to 500 images, paired automatically', 'ทั้งโฟลเดอร์ สูงสุด 500 ภาพ จับคู่ให้อัตโนมัติ'),
    },
  ];

  return (
    <div className="choice-row" role="radiogroup" aria-label={t('Assessment type', 'รูปแบบการประเมิน')}>
      {options.map((o) => {
        const on = active === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            className={`choice-tile ${on ? 'on' : ''}`}
            onClick={() => router.push(`/cases?mode=${o.key}`)}
          >
            <span className="choice-icon">{o.icon}</span>
            <span className="choice-text">
              <b>{o.title}</b>
              <span>{o.desc}</span>
            </span>
            {active && (
              <span className="choice-check">
                <CheckIcon />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
