'use client';

import { useMemo, useState, type ReactNode } from 'react';

import { CheckIcon, FolderIcon, ImageIcon, RestoreIcon, TrainingIcon, TrashIcon } from '@/components/ui/icons';
import { Meter, StatusBadge, severityPillClass } from '@/components/ui/primitives';
import { useI18n } from '@/lib/i18n';

/**
 * First-use tutorial. Shown once per account after the terms are accepted, and
 * again whenever it is opened from the account menu. Every screen is a mock-up
 * filled with sample data, so it reads the same for a brand-new account that
 * has no cases yet.
 */
export function Tutorial({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);

  const steps: { title: string; body: ReactNode; mock: ReactNode }[] = [
    {
      title: t('Welcome to PhasePulse', 'ยินดีต้อนรับสู่ PhasePulse'),
      body: t(
        'PhasePulse classifies partial discharge (PD) from PRPD images and grades its severity from the gap-time between the two discharge clusters. This short tour walks through one case using sample data.',
        'PhasePulse จำแนก Partial Discharge (PD) จากภาพ PRPD และประเมินความรุนแรงจาก Gap-Time ระหว่างกลุ่มการคายประจุสองกลุ่ม ทัวร์สั้น ๆ นี้จะพาดูการทำงานหนึ่งเคสด้วยข้อมูลตัวอย่าง',
      ),
      mock: <FlowMock />,
    },
    {
      title: t('1. Dashboard', '1. แดชบอร์ด'),
      body: t(
        'Your overview: how many cases you have, how many are reviewed, and which ones are high severity. Start a new assessment from here, or continue one you left open.',
        'ภาพรวมของคุณ: จำนวนเคส เคสที่ตรวจแล้ว และเคสที่รุนแรงสูง เริ่มการประเมินใหม่หรือตรวจต่อจากที่ค้างไว้ได้จากหน้านี้',
      ),
      mock: <DashboardMock />,
    },
    {
      title: t('2. Upload images', '2. อัปโหลดภาพ'),
      body: t(
        'Upload one image, or a whole folder. Files are paired by name: <case>_PRPD with <case>_TF. A PRPD on its own is analysed with the PRPD-only model; a pair uses the Hybrid model. Each sub-folder is listed, and the ✕ removes it before importing.',
        'อัปโหลดภาพเดียวหรือทั้งโฟลเดอร์ ระบบจับคู่ไฟล์ตามชื่อ <case>_PRPD กับ <case>_TF ภาพ PRPD เดี่ยวใช้โมเดล PRPD-only ส่วนภาพคู่ใช้โมเดล Hybrid โฟลเดอร์ย่อยจะแสดงเป็นรายการ กด ✕ เพื่อเอาออกก่อนนำเข้า',
      ),
      mock: <UploadMock />,
    },
    {
      title: t('3. The case: classification', '3. หน้าเคส: ผลการจำแนก'),
      body: t(
        'Each case opens in five steps. Step 1 shows what the model thinks: a confidence per class, the decision rule applied, and the PD source to confirm.',
        'แต่ละเคสมี 5 ขั้นตอน ขั้นที่ 1 แสดงผลของโมเดล: ความมั่นใจแต่ละคลาส กฎการตัดสินที่ใช้ และแหล่ง PD ที่ต้องยืนยัน',
      ),
      mock: <CaseClassificationMock />,
    },
    {
      title: t('4. The case: axes and gap-time', '4. หน้าเคส: แกนและ Gap-Time'),
      body: t(
        'Fit the frame to the plot axes, then drag the two gap lines onto the facing edges of the clusters. The gap-time and severity update as you drag. If the clusters cannot be separated, save the case as Not measurable at sign-off.',
        'ปรับกรอบให้ตรงแกนกราฟ แล้วลากเส้น Gap สองเส้นไปที่ขอบด้านในของกลุ่มการคายประจุ Gap-Time และความรุนแรงจะคำนวณใหม่ทันที ถ้าแยกกลุ่มไม่ได้ ให้บันทึกเป็น "วัดไม่ได้" ในขั้นยืนยันผล',
      ),
      mock: <GapMock />,
    },
    {
      title: t('5. Results and export', '5. ผลการประเมินและส่งออก'),
      body: t(
        'Every signed-off case lands in Results, where you can search, filter and export the 73-column summary CSV.',
        'เคสที่ยืนยันผลแล้วจะอยู่ในหน้าผลการประเมิน ค้นหา กรอง และส่งออกไฟล์สรุป CSV 73 คอลัมน์ได้',
      ),
      mock: <ResultsMock />,
    },
    {
      title: t('6. Model development', '6. พัฒนาโมเดล'),
      body: t(
        'Train your own classifier. Tick PRPD-only, Hybrid or both: upload PRPD images, and add the TF maps too if you want the Hybrid model. Name each model or leave it blank to have one picked. When you start, you are asked whether the dataset may be shared with the developers.',
        'เทรนโมเดลของคุณเอง เลือก PRPD-only, Hybrid หรือทั้งสองแบบ อัปโหลดภาพ PRPD และเพิ่ม TF Map ถ้าต้องการโมเดล Hybrid ตั้งชื่อแต่ละโมเดลหรือเว้นว่างให้ระบบตั้งให้ เมื่อเริ่มเทรนระบบจะถามว่ายินยอมแบ่งปันชุดข้อมูลให้ผู้พัฒนาหรือไม่',
      ),
      mock: <TrainingMock />,
    },
    {
      title: t('7. Tidy up: fold sections and the trash', '7. จัดหน้าจอ: พับหัวข้อและถังขยะ'),
      body: t(
        'Click the arrow beside any section title to fold it away. Anything you delete goes to the trash for 30 days, where it can be restored. You can reopen this tour from the account menu.',
        'กดลูกศรหน้าชื่อหัวข้อเพื่อพับเก็บ สิ่งที่ลบจะอยู่ในถังขยะ 30 วันและกู้คืนได้ เปิดทัวร์นี้อีกครั้งได้จากเมนูบัญชี',
      ),
      mock: <TidyMock />,
    },
  ];

  const step = steps[index];
  const last = index === steps.length - 1;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      <div className="modal-card wide">
        <div className="modal-head">
          <div className="eyebrow">
            {t('Getting started', 'เริ่มต้นใช้งาน')} · {index + 1}/{steps.length}
          </div>
          <h2 id="tutorial-title">{step.title}</h2>
        </div>

        <div className="modal-body">
          <div className="grid items-start gap-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <p className="text-[15px] leading-relaxed">{step.body}</p>
            <div className="tutorial-mock" key={index}>
              <span className="tag tutorial-tag">{t('Sample data', 'ข้อมูลตัวอย่าง')}</span>
              {step.mock}
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            {t('Skip tour', 'ข้ามทัวร์')}
          </button>
          <div className="flex items-center gap-3">
            <div className="tutorial-dots" aria-hidden="true">
              {steps.map((s, i) => (
                <i key={s.title} className={i === index ? 'on' : i < index ? 'done' : ''} />
              ))}
            </div>
            {index > 0 && (
              <button className="btn btn-secondary" type="button" onClick={() => setIndex((i) => i - 1)}>
                {t('Back', 'ย้อนกลับ')}
              </button>
            )}
            <button className="btn btn-primary" type="button" onClick={() => (last ? onClose() : setIndex((i) => i + 1))}>
              {last ? (
                <>
                  <CheckIcon />
                  {t('Start using PhasePulse', 'เริ่มใช้งาน')}
                </>
              ) : (
                t('Next', 'ถัดไป')
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// MOCK-UPS (sample data only, nothing here touches the API)
// ===========================================================================
function FlowMock() {
  const { t } = useI18n();
  const items = [
    [t('Upload', 'อัปโหลด'), 'PRPD / TF'],
    [t('Analyse', 'วิเคราะห์'), 'AI'],
    [t('Review', 'ตรวจทาน'), t('5 steps', '5 ขั้น')],
    [t('Export', 'ส่งออก'), 'CSV'],
  ];
  return (
    <ol className="tutorial-flow">
      {items.map(([a, b], i) => (
        <li key={a}>
          <span className="step-no">{i + 1}</span>
          <b>{a}</b>
          <small>{b}</small>
        </li>
      ))}
    </ol>
  );
}

function DashboardMock() {
  const { t } = useI18n();
  return (
    <div className="kpi-grid !grid-cols-2">
      <div className="kpi" style={{ ['--accent' as string]: 'var(--navy)' }}>
        <div className="kpi-label">{t('Total cases', 'เคสทั้งหมด')}</div>
        <div className="kpi-value">24</div>
        <div className="kpi-sub">{t('from 3 upload(s)', 'จากการอัปโหลด 3 ครั้ง')}</div>
      </div>
      <div className="kpi" style={{ ['--accent' as string]: '#10b981' }}>
        <div className="kpi-label">{t('Reviewed', 'ตรวจแล้ว')}</div>
        <div className="kpi-value">18</div>
        <Meter value={75} accent="#10b981" />
      </div>
      <div className="kpi" style={{ ['--accent' as string]: '#f59e0b' }}>
        <div className="kpi-label">{t('Waiting for review', 'รอตรวจ')}</div>
        <div className="kpi-value">6</div>
      </div>
      <div className="kpi" style={{ ['--accent' as string]: '#ef4444' }}>
        <div className="kpi-label">{t('High severity', 'ความรุนแรงสูง')}</div>
        <div className="kpi-value">3</div>
      </div>
    </div>
  );
}

function UploadMock() {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <span className="label">{t('Folders in this upload', 'โฟลเดอร์ที่จะอัปโหลด')}</span>
      <ul className="folder-chips">
        {[
          ['substation_A/cable_01', 8],
          ['substation_A/cable_02', 6],
        ].map(([d, n]) => (
          <li key={d}>
            <FolderIcon />
            <span>{d}</span>
            <small>{n}</small>
            <span className="icon-only !h-6 !w-6">✕</span>
          </li>
        ))}
      </ul>
      <div className="file-list">
        {['10_3.0VS_PRPD.png', '10_3.0VS_TF.png', '12_4.5VS_PRPD.png', '15_2.0VS_PRPD.png'].map((f) => (
          <div key={f}>
            <ImageIcon width={14} height={14} />
            <span>{f}</span>
            <small>{f.includes('_TF') ? 'TF' : 'PRPD'}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function CaseStepper({ on }: { on: number }) {
  const { t } = useI18n();
  const labels = [t('Classification', 'ผลการจำแนก'), t('Plot axes', 'ปรับแกนกราฟ'), 'Gap-Time', t('Summary', 'สรุปผล'), t('Sign-off', 'ยืนยันผล')];
  return (
    <div className="stepper mb-3 !flex-nowrap overflow-hidden">
      {labels.map((l, i) => (
        <span key={l} className={`step-btn !px-2 !text-[12px] ${i === on ? 'on' : ''} ${i < on ? 'done' : ''}`}>
          <span className="step-no">{i < on ? <CheckIcon width={11} height={11} /> : i + 1}</span>
          <span className="hidden sm:inline">{l}</span>
        </span>
      ))}
    </div>
  );
}

function CaseClassificationMock() {
  const { t } = useI18n();
  const scores = [
    ['Corona', 3.9, '#64748b'],
    ['Surface', 4.7, '#f59e0b'],
    ['Internal', 89.5, '#2563eb'],
  ] as const;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <b>10_3.0VS</b>
        <StatusBadge status="in_review" />
      </div>
      <CaseStepper on={0} />
      <div className="space-y-2">
        {scores.map(([name, pct, color]) => (
          <div key={name}>
            <div className="flex justify-between text-[13.5px]">
              <span>{name}</span>
              <span className="font-mono">{pct.toFixed(1)}%</span>
            </div>
            <Meter value={pct} accent={color} />
          </div>
        ))}
      </div>
      <p className="mt-3 text-[13.5px]">
        {t('AI result', 'ผล AI')}: <span className="pill pill-blue">Internal</span>{' '}
        <span className="text-muted">· TopClass 30</span>
      </p>
    </div>
  );
}

/** A small PRPD scatter with two clusters and the two gap lines placed. */
function GapMock() {
  const { t } = useI18n();
  const points = useMemo(() => {
    // Deterministic pseudo-random points, so the mock looks the same every time.
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < 140; i += 1) {
      const positive = i % 2 === 0;
      const phase = positive ? 20 + rand() * 85 : 200 + rand() * 85;
      const amp = (0.25 + rand() * 0.7) * (positive ? 1 : -1);
      out.push({ x: 20 + (phase / 360) * 260, y: 80 - amp * 60 });
    }
    return out;
  }, []);

  const left = 20 + (107.6 / 360) * 260;
  const right = 20 + (221.8 / 360) * 260;
  const sine = Array.from({ length: 61 }, (_, i) => {
    const x = 20 + (i / 60) * 260;
    const y = 80 - Math.sin((i / 60) * Math.PI * 2) * 55;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  return (
    <div>
      <CaseStepper on={2} />
      <svg viewBox="0 0 300 160" className="tutorial-prpd" role="img" aria-label={t('Sample PRPD plot', 'ภาพ PRPD ตัวอย่าง')}>
        <rect x="20" y="15" width="260" height="130" className="frame" />
        <line x1="20" y1="80" x2="280" y2="80" className="axis" />
        <path d={sine} className="sine" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="1.6" className="pt" />
        ))}
        <rect x={left} y="15" width={right - left} height="130" className="gap" />
        <line x1={left} y1="15" x2={left} y2="145" className="gap-line" />
        <line x1={right} y1="15" x2={right} y2="145" className="gap-line" />
        <text x="20" y="157" className="lbl">0°</text>
        <text x="268" y="157" className="lbl">360°</text>
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[13.5px]">
        <span>
          {t('Gap angle', 'มุม Gap')} <b className="font-mono">114.2°</b>
        </span>
        <span>
          · Gap-Time <b className="font-mono">6.35 ms</b>
        </span>
        <span className={`pill ${severityPillClass('Moderate')}`}>Moderate</span>
      </div>
    </div>
  );
}

function ResultsMock() {
  const { t } = useI18n();
  const rows = [
    ['10_3.0VS', 'Internal', 'Moderate', 'done'],
    ['12_4.5VS', 'Surface', 'High', 'done'],
    ['15_2.0VS', 'Corona', 'Initial', 'in_review'],
    ['18_1.5VS', 'Non-identified', 'Not measurable', 'pending'],
  ] as const;
  return (
    <table className="data compact">
      <thead>
        <tr>
          <th>{t('Case', 'เคส')}</th>
          <th>{t('AI result', 'ผล AI')}</th>
          <th>{t('Severity', 'ความรุนแรง')}</th>
          <th>{t('Status', 'สถานะ')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, result, sev, status]) => (
          <tr key={name}>
            <td>
              <b>{name}</b>
            </td>
            <td>{result}</td>
            <td>
              <span className={`pill ${severityPillClass(sev)}`}>{sev}</span>
            </td>
            <td>
              <StatusBadge status={status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TrainingMock() {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      {[
        ['PRPD-only', 'PRPD-only 1', true],
        ['Hybrid (PRPD + TF map)', 'Hybrid 1', true],
      ].map(([label, name, on]) => (
        <div key={label as string} className={`option-card ${on ? 'on' : ''}`}>
          <input type="checkbox" checked={on as boolean} readOnly tabIndex={-1} />
          <span>
            <span className="lbl">{label}</span>
            <span className="desc">
              {t('Name', 'ชื่อ')}: {name}
            </span>
          </span>
        </div>
      ))}
      <div className="model-list">
        <div className="model-row on">
          <b>PRPD-only 1</b>
          <span className="acc">91.7%</span>
          <small>
            <span className="pill pill-green mr-1 !text-[12px] !leading-[18px]">{t('Completed', 'เสร็จแล้ว')}</span>
            <TrainingIcon width={12} height={12} /> MobileNetV2
          </small>
        </div>
      </div>
    </div>
  );
}

function TidyMock() {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <div className="rounded-[10px] border border-line p-3">
        <div className="card-title text-[15px]">
          <span className="fold-toggle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ transform: 'rotate(0deg)' }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
          {t('Imported folders', 'โฟลเดอร์ที่นำเข้าแล้ว')}
          <span className="ml-auto text-[12.5px] font-normal text-muted">{t('folded', 'พับอยู่')}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-[10px] border border-line p-3 text-[14px]">
        <TrashIcon width={16} height={16} />
        <b>substation_A</b>
        <span className="text-muted">· {t('27 days left', 'เหลือ 27 วัน')}</span>
        <span className="btn btn-secondary btn-sm ml-auto">
          <RestoreIcon />
          {t('Restore', 'กู้คืน')}
        </span>
      </div>
    </div>
  );
}
