/**
 * Thai renderings of the fixed sentences the training API sends back
 * (run stages, notes, dataset checks). The API speaks English; these patterns
 * mirror backend/app/services/ml/training.py so the page reads in one language.
 * Anything unrecognised is shown as sent.
 */

type T = <V = string>(en: V, th: V) => V;

const STAGES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Queued$/, () => 'รอคิว'],
  [/^Preparing the dataset$/, () => 'กำลังเตรียมชุดข้อมูล'],
  [/^Loading training images$/, () => 'กำลังโหลดภาพชุดฝึก'],
  [/^Loading validation and test images$/, () => 'กำลังโหลดภาพชุดตรวจสอบและทดสอบ'],
  [/^Building the network$/, () => 'กำลังสร้างโครงข่าย'],
  [/^Training epoch (\d+) of (\d+)$/, (m) => `กำลังเทรน epoch ${m[1]} จาก ${m[2]}`],
  [/^Evaluating on the test set$/, () => 'กำลังประเมินบนชุดทดสอบ'],
  [/^Saving the model$/, () => 'กำลังบันทึกโมเดล'],
  [/^Simulating \(TensorFlow unavailable\)$/, () => 'กำลังจำลอง (ไม่มี TensorFlow)'],
  [/^Completed$/, () => 'เสร็จแล้ว'],
  [/^Failed$/, () => 'ล้มเหลว'],
];

const MESSAGES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [
    /^(.+): needs at least (\d+) training samples \(has (\d+)\)\.$/,
    (m) => `${m[1]}: ต้องมีตัวอย่างชุดฝึกอย่างน้อย ${m[2]} (มี ${m[3]})`,
  ],
  [
    /^(.+): needs at least (\d+) test samples \(has (\d+)\)\.$/,
    (m) => `${m[1]}: ต้องมีตัวอย่างชุดทดสอบอย่างน้อย ${m[2]} (มี ${m[3]})`,
  ],
  [
    /^(\d+) Hybrid file\(s\) have no matching pair\./,
    (m) => `ไฟล์ Hybrid ${m[1]} ไฟล์ไม่มีคู่ ภาพ PRPD แต่ละภาพต้องมี TF Map จากการวัดเดียวกัน ตั้งชื่อเป็น <case>_PRPD และ <case>_TF`,
  ],
  [
    /^Class counts are unbalanced: the largest training class has (\d+) samples and the smallest (\d+)\./,
    (m) => `จำนวนแต่ละคลาสไม่สมดุล: คลาสที่มากที่สุดมี ${m[1]} ตัวอย่าง น้อยที่สุด ${m[2]} ความแม่นยำจะเอียงไปทางคลาสที่ใหญ่กว่า`,
  ],
  [
    /^The (train|test|valid) split is ([\d.]+)% of the dataset, against a recommended (\d+)%\.$/,
    (m) => `ชุด ${m[1]} คิดเป็น ${m[2]}% ของข้อมูล (แนะนำ ${m[3]}%)`,
  ],
  [
    /^No validation samples were uploaded\./,
    () => 'ไม่มีชุดตรวจสอบ ระบบจะแบ่งส่วนหนึ่งของชุดฝึกมาใช้แทน ทำให้ค่าตรวจสอบเป็นอิสระน้อยลง',
  ],
  [/^Accuracy measured on the held-out test set\.$/, () => 'ความแม่นยำวัดจากชุดทดสอบที่แยกไว้'],
  [
    /^Accuracy measured on the training set \(no test images were uploaded\)\.$/,
    () => 'ความแม่นยำวัดจากชุดฝึก (ไม่มีภาพชุดทดสอบ)',
  ],
  [/^Simulated run:/, () => 'การเทรนแบบจำลอง: ไม่มี TensorFlow จึงไม่ได้ฝึกโครงข่ายจริง ตัวเลขประมาณจากองค์ประกอบของชุดข้อมูล ไม่ใช่ความแม่นยำที่วัดได้'],
  // ---- input checks on an uploaded case (cv/detect.py validate_input) ----
  [/^PRPD filename appears inconsistent with PRPD input field\.$/, () => 'ชื่อไฟล์ PRPD ไม่ตรงกับช่อง PRPD'],
  [/^PRPD filename does not clearly indicate PRPD\/Pattern\.$/, () => 'ชื่อไฟล์ PRPD ไม่ได้ระบุว่าเป็น PRPD/Pattern ชัดเจน'],
  [/^TF Map filename appears inconsistent with TF input field\.$/, () => 'ชื่อไฟล์ TF Map ไม่ตรงกับช่อง TF'],
  [/^TF Map filename does not clearly indicate TF\/TWMap\.$/, () => 'ชื่อไฟล์ TF Map ไม่ได้ระบุว่าเป็น TF/TWMap ชัดเจน'],
  [/^PRPD\/TF filename pair may not match: (.*)$/, (m) => `ชื่อไฟล์ PRPD/TF อาจไม่ใช่คู่เดียวกัน: ${m[1]}`],
  [/^PRPD plot frame could not be reliably detected\./, () => 'ตรวจจับกรอบกราฟ PRPD ได้ไม่แน่นอน อาจต้องปรับแกนเอง'],
  [/^PRPD plot area appears small\./, () => 'พื้นที่กราฟ PRPD ดูเล็ก แนะนำให้ใช้ภาพที่ส่งออกจากเครื่องโดยตรง'],
  [/^PRPD plot area appears unusually large or cropped\.$/, () => 'พื้นที่กราฟ PRPD ใหญ่ผิดปกติหรือถูกตัดขอบ'],
  [
    /^PRPD image size is (\d+)x(\d+), not default (\d+)x(\d+)\./,
    (m) => `ภาพ PRPD ขนาด ${m[1]}×${m[2]} ไม่ใช่ขนาดมาตรฐาน ${m[3]}×${m[4]} อาจต้องใช้ค่าแกนที่บันทึกไว้หรือปรับแกนเอง`,
  ],
  [/^unsupported file type$/, () => 'ไม่รองรับชนิดไฟล์นี้'],
  [/^empty file$/, () => 'ไฟล์ว่าง'],
  [/^Cannot read image/, () => 'อ่านไฟล์ภาพไม่ได้'],
  [
    /^MobileNetV2 ImageNet weights could not be loaded/,
    () => 'โหลดน้ำหนัก MobileNetV2 (ImageNet) ไม่ได้ ให้เซิร์ฟเวอร์เชื่อมต่ออินเทอร์เน็ตหนึ่งครั้ง (หรือ build Docker image ใหม่) แล้วเทรนอีกครั้ง',
  ],
];

function translate(table: [RegExp, (m: RegExpMatchArray) => string][], text: string): string | null {
  for (const [re, render] of table) {
    const m = text.match(re);
    if (m) return render(m);
  }
  return null;
}

/** A training stage ("Training epoch 3 of 12") in the current language. */
export function stageText(stage: string | null | undefined, t: T): string {
  if (!stage) return '';
  return t(stage, translate(STAGES, stage) ?? stage);
}

/** A training note, dataset check or rejection reason in the current language. */
export function serverText(text: string | null | undefined, t: T): string {
  if (!text) return '';
  // Errors arrive as "RuntimeError: <message>"; translate the message part.
  const prefixed = text.match(/^(\w+Error): (.*)$/s);
  const body = prefixed ? prefixed[2] : text;
  const th = translate(MESSAGES, body);
  return t(text, th ?? text);
}
