'use client';

import { useEffect, useRef } from 'react';

import { XIcon } from '@/components/ui/icons';
import { useApp } from '@/lib/app-context';
import { useI18n } from '@/lib/i18n';

/**
 * Help & reference drawer. Content follows the CMD 2026 paper (theory, model
 * and dataset, severity table) and the scope/limitation items of the project
 * review. Thresholds are read from the API so the text matches the account's
 * actual rules. Every section exists in English and Thai.
 */
export function HelpPopover({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { options } = useApp();
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const c = options?.constants;
  const topclass = c?.topclass_threshold ?? 30;
  const confidence = c?.confidence_threshold ?? 85;
  const internalHigh = c?.internal_high_confidence ?? 95;
  const cycle = c?.cycle_time_ms ?? 20;
  const dual = c?.joint_dual_threshold ?? 60;
  const strong = c?.strong_rule_threshold ?? 80;
  const highMs = c?.gap_time_high_ms ?? 4;
  const moderateMs = c?.gap_time_moderate_ms ?? 7;
  const deg = (ms: number) => Math.round((ms * 360) / cycle);

  const sections = [
    { id: 'help-about', label: t('About', 'เกี่ยวกับระบบ') },
    { id: 'help-theory', label: t('PD fundamentals', 'พื้นฐาน PD') },
    { id: 'help-workflow', label: t('Workflow', 'ขั้นตอนใช้งาน') },
    { id: 'help-classification', label: t('Classification', 'การจำแนก') },
    { id: 'help-severity', label: t('Gap-time & severity', 'Gap-Time และความรุนแรง') },
    { id: 'help-limits', label: t('Scope & limitations', 'ขอบเขตและข้อจำกัด') },
    { id: 'help-data', label: t('Data handling', 'การจัดการข้อมูล') },
    { id: 'help-refs', label: t('References', 'เอกสารอ้างอิง') },
  ];

  const jumpTo = (id: string) => ref.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="help-title" ref={ref} tabIndex={-1}>
        <button className="icon-only absolute right-4 top-4" aria-label={t('Close', 'ปิด')} onClick={onClose} type="button">
          <XIcon />
        </button>

        <h3 id="help-title">{t('Help & reference', 'คู่มือและข้อมูลอ้างอิง')}</h3>
        <p className="text-muted">
          {t(
            'How PhasePulse works, how to review a case, and the limits of the analysis.',
            'วิธีทำงานของ PhasePulse ขั้นตอนการตรวจเคส และข้อจำกัดของการวิเคราะห์',
          )}
        </p>

        <div className="toc">
          {sections.map((s) => (
            <button key={s.id} onClick={() => jumpTo(s.id)} type="button">
              {s.label}
            </button>
          ))}
        </div>

        <div className="callout callout-red">
          {t(
            <>
              <b>The AI output is a preliminary assessment, not a diagnosis.</b> Review every result
              with the original measurement data and confirm it with a qualified engineer before any
              maintenance or engineering decision.
            </>,
            <>
              <b>ผลจาก AI เป็นการประเมินเบื้องต้น ไม่ใช่การวินิจฉัย</b>{' '}
              ต้องตรวจทุกผลร่วมกับข้อมูลการวัดต้นฉบับ และให้วิศวกรผู้มีคุณสมบัติยืนยันก่อนตัดสินใจด้านการบำรุงรักษาหรือวิศวกรรม
            </>,
          )}
        </div>

        {/* ================= ABOUT ================= */}
        <section id="help-about">
          <h4>{t('What is PhasePulse?', 'PhasePulse คืออะไร')}</h4>
          {t(
            <>
              <p>
                PhasePulse classifies partial discharge (PD) from PRPD (phase-resolved partial discharge)
                plots. A model scores each case against three classes — <b>Corona</b>, <b>Surface</b> and{' '}
                <b>Internal</b> — and a rule engine combines those scores with a gap-time measurement to
                suggest a PD source and a severity. Every suggestion stays traceable and editable by the
                reviewer before it is saved.
              </p>
              <p>
                It is meant for <b>preliminary screening</b>: a first suggestion that reduces the work of
                reviewing large volumes of PD data. It does not replace expert diagnosis.
              </p>
            </>,
            <>
              <p>
                PhasePulse จำแนก Partial Discharge (PD) จากกราฟ PRPD (Phase-Resolved Partial Discharge)
                โมเดลให้คะแนนแต่ละเคสใน 3 คลาส คือ <b>Corona</b>, <b>Surface</b> และ <b>Internal</b>{' '}
                แล้วกลไกกฎจะนำคะแนนมารวมกับค่า Gap-Time เพื่อเสนอแหล่งกำเนิด PD และระดับความรุนแรง
                ทุกข้อเสนอตรวจสอบย้อนกลับได้และผู้ตรวจแก้ไขได้ก่อนบันทึก
              </p>
              <p>
                ระบบใช้สำหรับ<b>การคัดกรองเบื้องต้น</b> เพื่อให้ได้ข้อเสนอแรกและลดภาระการตรวจข้อมูล PD
                จำนวนมาก ไม่ได้แทนที่การวินิจฉัยของผู้เชี่ยวชาญ
              </p>
            </>,
          )}
        </section>

        {/* ================= PD FUNDAMENTALS ================= */}
        <section id="help-theory">
          <h4>{t('PD fundamentals', 'พื้นฐาน Partial Discharge')}</h4>
          <h5>{t('What PD is, and how it is measured', 'PD คืออะไร และวัดอย่างไร')}</h5>
          {t(
            <p>
              PD is a localised electrical discharge inside insulation under high electric stress, and
              an early sign of insulation degradation. Under IEC 60270 [1] PD is measured by charge, with
              the <b>apparent charge</b> as the main quantity. In cable terminations it can start at
              voids, sharp conductive points, surface contamination, poor installation or material
              defects.
            </p>,
            <p>
              PD คือการคายประจุไฟฟ้าเฉพาะที่ภายในฉนวนภายใต้สนามไฟฟ้าสูง และเป็นสัญญาณเริ่มต้นของการเสื่อมสภาพของฉนวน
              ตามมาตรฐาน IEC 60270 [1] การวัด PD อิงประจุ โดยมี<b>ประจุปรากฏ (apparent charge)</b>เป็นปริมาณหลัก
              ในหัวเคเบิล PD อาจเกิดจากโพรงอากาศ จุดแหลมของตัวนำ สิ่งสกปรกบนผิว การติดตั้งไม่ถูกต้อง หรือวัสดุบกพร่อง
            </p>,
          )}
          <h5>{t('Reading a PRPD pattern', 'การอ่านกราฟ PRPD')}</h5>
          {t(
            <p>
              A PRPD plot shows PD activity against the phase of the applied voltage: phase <b>0°–360°</b>{' '}
              on the horizontal axis, PD amplitude (pC or mV) on the vertical axis. Read the{' '}
              <b>phase position</b>, <b>polarity</b>, <b>amplitude</b>, <b>pulse density</b> and{' '}
              <b>cluster distribution</b>.
            </p>,
            <p>
              กราฟ PRPD แสดงกิจกรรม PD เทียบกับมุมเฟสของแรงดัน แกนนอนคือมุมเฟส <b>0°–360°</b>{' '}
              แกนตั้งคือแอมพลิจูด PD (pC หรือ mV) ให้พิจารณา<b>ตำแหน่งเฟส</b> <b>ขั้ว</b> <b>แอมพลิจูด</b>{' '}
              <b>ความหนาแน่นของพัลส์</b> และ<b>การกระจายของกลุ่ม</b>
            </p>,
          )}
          <h5>{t('Telling the three sources apart', 'การแยกแหล่งกำเนิดทั้งสาม')}</h5>
          <table className="data">
            <thead>
              <tr>
                <th>{t('Class', 'คลาส')}</th>
                <th>{t('Typical PRPD appearance', 'ลักษณะ PRPD ที่พบบ่อย')}</th>
                <th>{t('Reported as', 'รายงานเป็น')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>Corona</b>
                </td>
                <td>
                  {t(
                    'Strongly asymmetric; a narrow phase band near one voltage peak, small uniform amplitudes, high repetition. A sharp point or floating metal part discharging into gas.',
                    'ไม่สมมาตรชัดเจน อยู่ในช่วงเฟสแคบใกล้ยอดแรงดันด้านใดด้านหนึ่ง แอมพลิจูดเล็กและสม่ำเสมอ อัตราซ้ำสูง เกิดจากจุดแหลมหรือโลหะลอยที่คายประจุสู่ก๊าซ',
                  )}
                </td>
                <td>Floating / Corona / Bad contact</td>
              </tr>
              <tr>
                <td>
                  <b>Surface</b>
                </td>
                <td>
                  {t(
                    'Both half-cycles but unequal, spread over a wide phase range with broad amplitudes. Discharge tracking along a contaminated, wet or damaged surface.',
                    'เกิดทั้งสองครึ่งรอบแต่ไม่เท่ากัน กระจายกว้างในเฟสและแอมพลิจูด เกิดจากการคายประจุตามผิวที่สกปรก ชื้น หรือเสียหาย',
                  )}
                </td>
                <td>Outside surface discharge</td>
              </tr>
              <tr>
                <td>
                  <b>Internal</b>
                </td>
                <td>
                  {t(
                    'Two similar clusters, roughly symmetric between the half-cycles, on the rising slopes of the voltage. Discharge inside a void in the insulation.',
                    'สองกลุ่มคล้ายกัน ค่อนข้างสมมาตรระหว่างครึ่งรอบ อยู่บนช่วงขาขึ้นของแรงดัน เกิดจากการคายประจุในโพรงภายในฉนวน',
                  )}
                </td>
                <td>Internal</td>
              </tr>
            </tbody>
          </table>
          {t(
            <p className="mt-2">
              <b>Terminations / Joint</b> is not a model class: it is reported when Surface and Internal
              are both above {dual}%. A single class above {strong}% is a <b>strong rule</b>; weaker
              results need the reviewer&apos;s confirmation. These figures can be tuned in Settings.
            </p>,
            <p className="mt-2">
              <b>Terminations / Joint</b> ไม่ใช่คลาสของโมเดล แต่รายงานเมื่อ Surface และ Internal เกิน {dual}%
              ทั้งคู่ คลาสเดียวที่เกิน {strong}% ถือเป็น<b>กฎแข็ง</b> ส่วนผลที่อ่อนกว่าต้องให้ผู้ตรวจยืนยัน
              ปรับค่าเหล่านี้ได้ในหน้าการตั้งค่า
            </p>,
          )}
          <h5>{t('TF map', 'TF Map')}</h5>
          {t(
            <p>
              A time–frequency map groups individual pulses by their waveform in time and frequency, so
              pulses from different sources, or from noise, separate more clearly than in the PRPD alone [9].
            </p>,
            <p>
              TF Map จัดกลุ่มพัลส์ตามรูปคลื่นในโดเมนเวลาและความถี่ ทำให้แยกพัลส์จากแหล่งต่างกันหรือจากสัญญาณรบกวนได้ชัดกว่าการดู PRPD อย่างเดียว [9]
            </p>,
          )}
          <h5>Gap-Time</h5>
          {t(
            <p>
              Gap-time is the time between two discharge clusters in <b>opposite polarity</b> regions of
              the same pattern [7], [8], in milliseconds, from the end of the first cluster to the start of
              the next. Cluster position is steadier than amplitude across instruments, which is why it
              is used as an extra severity indicator.
            </p>,
            <p>
              Gap-Time คือเวลาระหว่างกลุ่มการคายประจุสองกลุ่มใน<b>ขั้วตรงข้าม</b>ของกราฟเดียวกัน [7], [8]
              หน่วยมิลลิวินาที วัดจากปลายกลุ่มแรกถึงต้นกลุ่มถัดไป ตำแหน่งของกลุ่มเสถียรกว่าแอมพลิจูดเมื่อเปลี่ยนเครื่องมือวัด
              จึงใช้เป็นตัวชี้วัดความรุนแรงเพิ่มเติม
            </p>,
          )}
        </section>

        {/* ================= WORKFLOW ================= */}
        <section id="help-workflow">
          <h4>{t('Workflow', 'ขั้นตอนใช้งาน')}</h4>
          <ol className="m-0 pl-5">
            <li>{t('Upload a PRPD image (plus its TF map), or a whole folder.', 'อัปโหลดภาพ PRPD (และ TF Map) หรือทั้งโฟลเดอร์')}</li>
            <li>{t('Read the three confidence scores and the result.', 'ดูคะแนนความมั่นใจทั้งสามและผลลัพธ์')}</li>
            <li>{t('Confirm or change the suggested PD source.', 'ยืนยันหรือเปลี่ยนแหล่ง PD ที่ระบบเสนอ')}</li>
            <li>{t('Fit the 0°, 360°, top and bottom lines to the plot.', 'ปรับเส้น 0°, 360°, บน และล่าง ให้ตรงกรอบกราฟ')}</li>
            <li>{t('Place both cluster boundaries to measure gap-time.', 'วางขอบของทั้งสองกลุ่มเพื่อวัด Gap-Time')}</li>
            <li>{t('Check the summary, add a note, and sign off.', 'ตรวจสรุป เพิ่มหมายเหตุ และยืนยันผล')}</li>
          </ol>
          {t(
            <p className="mt-2">
              For a folder, fit the axes once on the first case and use <b>Copy axes to the rest of this
              folder</b>. The PD source and gap-time steps are deliberately confirmed by a person, because
              automatic lines can be misplaced when clusters overlap.
            </p>,
            <p className="mt-2">
              สำหรับโฟลเดอร์ ให้ปรับแกนที่เคสแรกครั้งเดียว แล้วกด<b>คัดลอกแกนไปยังเคสที่เหลือในโฟลเดอร์นี้</b>{' '}
              ขั้นยืนยันแหล่ง PD และ Gap-Time ต้องให้คนยืนยัน เพราะเส้นอัตโนมัติอาจผิดตำแหน่งเมื่อกลุ่มซ้อนกัน
            </p>,
          )}
        </section>

        {/* ================= CLASSIFICATION ================= */}
        <section id="help-classification">
          <h4>{t('The classification result', 'ผลการจำแนก')}</h4>
          {t(
            <p>
              Every case is scored under one fixed rule, <b>TopClass {topclass}%</b>, matching the
              published method so results stay comparable.
            </p>,
            <p>
              ทุกเคสใช้กฎเดียวกันคือ <b>TopClass {topclass}%</b> ตามวิธีที่ตีพิมพ์ เพื่อให้เปรียบเทียบผลได้
            </p>,
          )}
          <table className="data">
            <thead>
              <tr>
                <th>{t('Rule', 'กฎ')}</th>
                <th>{t('Threshold', 'เกณฑ์')}</th>
                <th>{t('Effect', 'ผล')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>TopClass</td>
                <td className="num">&gt; {topclass}%</td>
                <td>
                  {t(
                    `All three ≤ ${topclass}% → Non-identified; otherwise the top class wins.`,
                    `ทั้งสามคลาส ≤ ${topclass}% → Non-identified นอกนั้นคลาสสูงสุดชนะ`,
                  )}
                </td>
              </tr>
              <tr>
                <td>{t('Internal sanity check', 'ตรวจสอบ Internal')}</td>
                <td className="num">
                  {confidence}–{internalHigh}%
                </td>
                <td>
                  {t(
                    'Internal in this band must reach 0.15 point share in every quadrant, or it becomes Non-identified.',
                    'Internal ในช่วงนี้ต้องมีสัดส่วนจุด ≥ 0.15 ในทุกจตุภาค มิฉะนั้นเปลี่ยนเป็น Non-identified',
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          <h5>{t('Model and dataset', 'โมเดลและชุดข้อมูล')}</h5>
          {t(
            <p>
              Both published models were trained on <b>994 laboratory cases</b> (IEC 60270; 320 corona, 346
              surface, 328 internal), split 64/20/16. The output uses sigmoid, so the three scores are
              independent. Test accuracy: <b>96.15%</b> for both PRPD-only and Hybrid (104 test samples).
            </p>,
            <p>
              โมเดลตั้งต้นทั้งสองเทรนด้วย<b>ข้อมูลห้องปฏิบัติการ 994 เคส</b> (IEC 60270; corona 320, surface 346,
              internal 328) แบ่ง 64/20/16 ชั้นผลลัพธ์ใช้ Sigmoid คะแนนทั้งสามจึงเป็นอิสระต่อกัน ความแม่นยำบนชุดทดสอบ{' '}
              <b>96.15%</b> ทั้ง PRPD-only และ Hybrid (104 ตัวอย่างทดสอบ)
            </p>,
          )}
        </section>

        {/* ================= GAP-TIME & SEVERITY ================= */}
        <section id="help-severity">
          <h4>{t('Gap-time and severity', 'Gap-Time และความรุนแรง')}</h4>
          {t(
            <p>
              Gap angle becomes gap-time assuming one mains cycle = {cycle} ms:{' '}
              <code>gap_time_ms = |gap_angle| × {cycle} ÷ 360</code>. The band and the confirmed PD source
              group then give the severity.
            </p>,
            <p>
              แปลงมุม Gap เป็นเวลาโดยถือว่าหนึ่งรอบไฟฟ้า = {cycle} ms: <code>gap_time_ms = |gap_angle| × {cycle} ÷ 360</code>{' '}
              จากนั้นช่วงเวลาและกลุ่มแหล่ง PD ที่ยืนยันจะให้ระดับความรุนแรง
            </p>,
          )}
          <table className="data">
            <thead>
              <tr>
                <th>{t('PD source group', 'กลุ่มแหล่ง PD')}</th>
                <th>Gap-Time</th>
                <th>{t('Gap angle', 'มุม Gap')}</th>
                <th>{t('Severity', 'ความรุนแรง')}</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  [t('Group 1: Corona / Surface', 'กลุ่ม 1: Corona / Surface'), ['Initial', 'Moderate', 'High']],
                  [t('Group 2: Joint / Internal', 'กลุ่ม 2: Joint / Internal'), ['Moderate', 'High', 'High']],
                ] as const
              ).map(([group, sevs]) =>
                [`> ${moderateMs} ms`, `${highMs}–${moderateMs} ms`, `< ${highMs} ms`].map((band, i) => (
                  <tr key={`${group}-${band}`}>
                    {i === 0 && <td rowSpan={3}>{group}</td>}
                    <td className="num">{band}</td>
                    <td className="num">
                      {i === 0 ? `> ${deg(moderateMs)}°` : i === 1 ? `${deg(highMs)}°–${deg(moderateMs)}°` : `< ${deg(highMs)}°`}
                    </td>
                    <td>
                      <span className={`pill ${sevs[i] === 'High' ? 'pill-red' : sevs[i] === 'Moderate' ? 'pill-amber' : 'pill-green'}`}>{sevs[i]}</span>
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
          <div className="callout callout-amber mt-3">
            {t(
              <>
                <b>These bands are this framework&apos;s criteria, not an international standard.</b> Under{' '}
                {highMs} ms does not by itself prove a defect is severe, and over {moderateMs} ms does not
                prove it is safe. With only one cluster, record the case as <b>Not measurable</b>.
              </>,
              <>
                <b>ช่วงเหล่านี้เป็นเกณฑ์ของระบบนี้ ไม่ใช่มาตรฐานสากล</b> ต่ำกว่า {highMs} ms ไม่ได้พิสูจน์ว่ารุนแรง
                และสูงกว่า {moderateMs} ms ไม่ได้พิสูจน์ว่าปลอดภัย หากมีกลุ่มเดียว ให้บันทึกเป็น<b>วัดไม่ได้</b>
              </>,
            )}
          </div>
        </section>

        {/* ================= LIMITATIONS ================= */}
        <section id="help-limits">
          <h4>{t('Scope and limitations', 'ขอบเขตและข้อจำกัด')}</h4>
          <ul className="bullets">
            <li>{t('The input must be a PRPD pattern with readable clusters, not another kind of plot.', 'ภาพต้องเป็นกราฟ PRPD ที่เห็นกลุ่มชัดเจน ไม่ใช่กราฟชนิดอื่น')}</li>
            <li>{t('Gap-time needs activity in both the positive and the negative half-cycle.', 'การวัด Gap-Time ต้องมีการคายประจุทั้งครึ่งรอบบวกและลบ')}</li>
            <li>{t('Low resolution, cropping, overlaid text and noise reduce reliability.', 'ภาพความละเอียดต่ำ ถูกตัดขอบ มีตัวอักษรทับ หรือมีสัญญาณรบกวน ลดความน่าเชื่อถือ')}</li>
            <li>{t('Plots from a different instrument or style than the training data may degrade results.', 'กราฟจากเครื่องมือหรือรูปแบบที่ต่างจากข้อมูลฝึกอาจทำให้ผลแย่ลง')}</li>
            <li>
              <b>{t('Only Corona, Surface and Internal are covered.', 'รองรับเฉพาะ Corona, Surface และ Internal')}</b>{' '}
              {t('Mixed PD may be misclassified, because the training data is pure PD.', 'PD แบบผสมอาจจำแนกผิด เพราะข้อมูลฝึกเป็น PD ชนิดเดียว')}
            </li>
            <li>{t('PRPD and TF map must come from the same measurement to be paired.', 'PRPD และ TF Map ต้องมาจากการวัดเดียวกันจึงจับคู่ได้')}</li>
            <li>{t('A confidence score is not proof that the class is correct.', 'คะแนนความมั่นใจไม่ได้พิสูจน์ว่าคลาสถูกต้อง')}</li>
            <li>{t('For training: no image from the same measurement may be in both train and test.', 'สำหรับการเทรน: ห้ามมีภาพจากการวัดเดียวกันทั้งในชุดฝึกและชุดทดสอบ')}</li>
          </ul>
        </section>

        {/* ================= DATA ================= */}
        <section id="help-data">
          <h4>{t('Data handling and privacy', 'การจัดการข้อมูลและความเป็นส่วนตัว')}</h4>
          {t(
            <p>
              Accepting the terms is required to use the system. Separately, and optionally, you may
              allow your uploads — PRPD image, TF map, confirmed label, model result, axis values and
              reviewer account — to be kept for dataset and model development. Declining does not limit
              any feature. Do not upload plots that contain personal or confidential information.
            </p>,
            <p>
              การยอมรับข้อกำหนดจำเป็นต่อการใช้งานระบบ ส่วนความยินยอมเพิ่มเติม (ไม่บังคับ) คือการอนุญาตให้เก็บข้อมูลที่อัปโหลด
              ได้แก่ ภาพ PRPD, TF Map, ป้ายที่ยืนยัน, ผลโมเดล, ค่าแกน และบัญชีผู้ตรวจ เพื่อพัฒนาชุดข้อมูลและโมเดล
              หากไม่ยินยอมก็ใช้งานได้ครบทุกฟังก์ชัน ไม่ควรอัปโหลดกราฟที่มีข้อมูลส่วนบุคคลหรือข้อมูลลับ
            </p>,
          )}
        </section>

        {/* ================= REFERENCES ================= */}
        <section id="help-refs">
          <h4>{t('References', 'เอกสารอ้างอิง')}</h4>
          <ol className="refs">
            <li>
              <i>High-voltage Test Techniques: Partial Discharge Measurements</i>, IEC 60270, Dec. 2000.
            </li>
            <li>
              <i>On-site Partial Discharge Assessment of HV and EHV Cable Systems</i>, CIGRE TB 728, WG B1.28, 2018.
            </li>
            <li>
              <i>Knowledge Rules for Partial Discharge Diagnosis in Service</i>, CIGRE TB 226, TF 15.11/33.03.02, 2003.
            </li>
            <li>
              R. Sahoo and S. Karmakar, &quot;Investigation of electrical tree growth characteristics and partial
              discharge pattern analysis using deep neural network,&quot; <i>Electr. Power Syst. Res.</i>, vol. 220, 2023.
            </li>
            <li>
              Y. Li, J. Han, Y. Du, and H. Jin, &quot;Time-frequency maps for multiple partial discharge sources
              separation in cable terminations,&quot; <i>IEEE Trans. Power Del.</i>, vol. 38, no. 3, 2023.
            </li>
            <li>
              M. Karimi et al., &quot;A novel application of deep belief networks in learning partial discharge
              patterns for classifying corona, surface, and internal discharges,&quot; <i>IEEE Trans. Ind. Electron.</i>,
              vol. 67, no. 4, 2020.
            </li>
            <li>
              N. Panmala, T. Suwanasri, P. Fuangpian, and C. Suwanasri, &quot;Partial discharge measurement with gap
              time analysis to determine severity of defect in rotating machines,&quot; <i>Proc. CMD</i>, 2024.
            </li>
            <li>
              P. Fuangpian, T. Suwanasri, and C. Suwanasri, &quot;Partial discharge severity analysis based on
              repetition rate, amplitude and gap distance in MV motor,&quot; <i>Proc. ISH</i>, 2019.
            </li>
            <li>
              G. C. Montanari, A. Cavallini, and F. Puletti, &quot;A new approach to partial discharge testing of HV
              cable systems,&quot; <i>IEEE Electr. Insul. Mag.</i>, vol. 22, no. 1, 2006.
            </li>
          </ol>
        </section>
      </aside>
    </div>
  );
}
