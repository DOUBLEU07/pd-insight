'use client';

import { useEffect, useState } from 'react';

import { getAcceptedTermsToday, getDataConsent, recordConsent } from '@/lib/consent';
import { useI18n } from '@/lib/i18n';

/**
 * Terms-of-use and dataset-consent gate. Accepting the terms is required;
 * allowing uploads to be reused for dataset/model development is optional and
 * declining it blocks nothing. Shown once per calendar day per browser.
 */
let acknowledgedThisLoad = false;

export function ConsentGate({ onDecline, onSettled }: { onDecline: () => void; onSettled?: () => void }) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(() => !acknowledgedThisLoad && !getAcceptedTermsToday());
  const [terms, setTerms] = useState(false);
  const [data, setData] = useState(() => getDataConsent());

  // Tells the layout the terms are out of the way (accepted now or earlier today).
  useEffect(() => {
    if (!visible) onSettled?.();
  }, [visible, onSettled]);

  if (!visible) return null;

  function accept() {
    recordConsent(true, data);
    acknowledgedThisLoad = true;
    setVisible(false);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="modal-card">
        <div className="modal-head">
          <h2 id="consent-title">{t('Terms of use and data consent', 'ข้อกำหนดการใช้งานและความยินยอมด้านข้อมูล')}</h2>
          <p className="card-sub">
            {t('Please confirm before continuing. You will not be asked again today.', 'กรุณายืนยันก่อนใช้งาน ระบบจะไม่ถามซ้ำภายในวันนี้')}
          </p>
        </div>

        <div className="modal-body">
          <p className="callout callout-red mb-4">
            <b>{t('PhasePulse is a decision-support tool, not a diagnostic authority.', 'PhasePulse เป็นเครื่องมือช่วยตัดสินใจ ไม่ใช่ผู้วินิจฉัย')}</b>{' '}
            {t(
              'Its classification, gap-time and severity results are preliminary. Check them against the original measurement and have a qualified engineer confirm them before any engineering decision.',
              'ผลการจำแนก Gap-Time และความรุนแรงเป็นผลเบื้องต้น ต้องตรวจกับข้อมูลการวัดต้นฉบับและให้วิศวกรผู้มีคุณสมบัติยืนยันก่อนตัดสินใจทางวิศวกรรม',
            )}
          </p>

          <ul className="bullets mb-4">
            <li>{t('The models recognise three classes only: Corona, Surface and Internal. Mixed PD may be misclassified.', 'โมเดลรู้จักเพียง 3 คลาส: Corona, Surface และ Internal ส่วน PD แบบผสมอาจจำแนกผิด')}</li>
            <li>{t('Low-resolution, cropped, annotated or noisy images reduce reliability.', 'ภาพความละเอียดต่ำ ถูกตัด มีตัวอักษรทับ หรือมีสัญญาณรบกวน ลดความน่าเชื่อถือ')}</li>
            <li>{t('Initial / Moderate / High are this framework’s criteria, not an international standard.', 'Initial / Moderate / High เป็นเกณฑ์ของระบบนี้ ไม่ใช่มาตรฐานสากล')}</li>
            <li>{t('When gap-time cannot be determined, the case is recorded as Not measurable.', 'เมื่อวัด Gap-Time ไม่ได้ ระบบจะบันทึกเคสเป็น "วัดไม่ได้"')}</li>
          </ul>

          <div className="space-y-2">
            <label className={`option-card ${terms ? 'on' : ''}`}>
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
              <span>
                <span className="lbl">
                  {t('I accept the terms of use', 'ฉันยอมรับข้อกำหนดการใช้งาน')} <span className="text-danger">*</span>
                </span>
                <span className="desc">
                  {t(
                    'I understand the results are preliminary, must be verified by a qualified engineer, and do not replace expert diagnosis.',
                    'ฉันเข้าใจว่าผลเป็นการประเมินเบื้องต้น ต้องให้วิศวกรผู้มีคุณสมบัติตรวจสอบ และไม่ได้แทนที่การวินิจฉัยของผู้เชี่ยวชาญ',
                  )}
                </span>
              </span>
            </label>

            <label className={`option-card ${data ? 'on' : ''}`}>
              <input type="checkbox" checked={data} onChange={(e) => setData(e.target.checked)} />
              <span>
                <span className="lbl">
                  {t('Allow my uploads to be used for dataset and model development', 'อนุญาตให้ใช้ข้อมูลที่อัปโหลดเพื่อพัฒนาชุดข้อมูลและโมเดล')}{' '}
                  <span className="tag">{t('optional', 'ไม่บังคับ')}</span>
                </span>
                <span className="desc">
                  {t(
                    'Kept for this purpose: the PRPD image, the TF map if uploaded, the confirmed label, the model result and related metadata (case name, times, axis values, reviewer account). Declining does not limit any feature.',
                    'ข้อมูลที่เก็บ: ภาพ PRPD, TF Map (ถ้ามี), ป้ายที่ยืนยัน, ผลโมเดล และข้อมูลประกอบ (ชื่อเคส เวลา ค่าแกน บัญชีผู้ตรวจ) หากไม่ยินยอมก็ใช้งานได้ครบ',
                  )}
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onDecline} type="button">
            {t('Decline and sign out', 'ไม่ยอมรับและออกจากระบบ')}
          </button>
          <button className="btn btn-primary" onClick={accept} disabled={!terms} type="button">
            {t('Continue', 'ดำเนินการต่อ')}
          </button>
        </div>
      </div>
    </div>
  );
}
