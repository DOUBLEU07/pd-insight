'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Spinner } from '@/components/ui/primitives';
import { api, fileUrl } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { EvaluationSample, ModelEvaluation as Evaluation, TrainedModel } from '@/lib/types';

/** Blue sequential ramp (reference palette steps 100→650). */
const RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281'];

function rampColor(share: number): { bg: string; fg: string } {
  const i = Math.min(RAMP.length - 1, Math.max(0, Math.round(share * (RAMP.length - 1))));
  return { bg: RAMP[i], fg: i >= 6 ? '#ffffff' : '#0f1d2c' };
}

/**
 * What a finished run learned and where it goes wrong: learning curves, the
 * confusion matrix, per-class figures, and the test images it misclassified.
 */
export function ModelEvaluation({ model }: { model: TrainedModel }) {
  const { t } = useI18n();
  const [data, setData] = useState<Evaluation | null>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    api
      .modelEvaluation(model.id)
      .then((d) => live && setData(d))
      .catch(() => live && setData({ available: false, reason: t('Could not load the evaluation.', 'โหลดผลการประเมินไม่สำเร็จ') }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.id]);

  if (!data) return <Spinner />;
  if (!data.available) {
    return (
      <p className="callout">
        {model.engine_used === 'simulated'
          ? t(
              'Simulated run: no network was fitted, so there are no per-image predictions to show.',
              'การเทรนแบบจำลอง: ไม่ได้ฝึกโมเดลจริง จึงไม่มีผลทำนายรายภาพให้แสดง',
            )
          : data.reason ?? t('No evaluation was recorded for this run.', 'ไม่มีผลการประเมินของการเทรนนี้')}
      </p>
    );
  }

  const h = data.history ?? {};
  const epochs = (h.loss ?? []).length;

  return (
    <div className="stack">
      {epochs > 1 && (
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <div className="section-title">{t('Loss by epoch', 'Loss ในแต่ละ epoch')}</div>
            <LineChart
              series={[
                { name: t('Training', 'ชุดฝึก'), color: 'var(--series-1)', values: h.loss ?? [] },
                { name: t('Validation', 'ชุดตรวจสอบ'), color: 'var(--series-2)', values: h.val_loss ?? [] },
              ]}
              format={(v) => v.toFixed(3)}
            />
          </div>
          <div>
            <div className="section-title">{t('Accuracy by epoch', 'ความแม่นยำในแต่ละ epoch')}</div>
            <LineChart
              series={[
                { name: t('Training', 'ชุดฝึก'), color: 'var(--series-1)', values: (h.acc ?? []).map((v) => v * 100) },
                { name: t('Validation', 'ชุดตรวจสอบ'), color: 'var(--series-2)', values: (h.val_acc ?? []).map((v) => v * 100) },
              ]}
              yMin={0}
              yMax={100}
              format={(v) => `${v.toFixed(1)}%`}
            />
          </div>
        </div>
      )}

      {data.confusion && data.class_names && (
        <div className="grid gap-5 xl:grid-cols-[auto_minmax(0,1fr)]">
          <div>
            <div className="section-title">{t('Confusion matrix (test set)', 'Confusion matrix (ชุดทดสอบ)')}</div>
            <ConfusionMatrix names={data.class_names} matrix={data.confusion} />
          </div>
          <div className="min-w-0">
            <div className="section-title">{t('Per class', 'แยกตามคลาส')}</div>
            <div className="table-wrap rounded-lg border border-line">
              <table className="data compact">
                <thead>
                  <tr>
                    <th>{t('Class', 'คลาส')}</th>
                    <th>{t('Test images', 'ภาพทดสอบ')}</th>
                    <th>{t('Correct', 'ถูก')}</th>
                    <th>Precision</th>
                    <th>Recall</th>
                    <th>F1</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.per_class ?? []).map((r) => (
                    <tr key={r.name}>
                      <td>
                        <b>{r.name}</b>
                      </td>
                      <td className="num">{r.support}</td>
                      <td className="num">{r.correct}</td>
                      <td className="num">{r.precision.toFixed(1)}%</td>
                      <td className="num">{r.recall.toFixed(1)}%</td>
                      <td className="num">{r.f1.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint mt-2 text-[13px]">
              {t(
                'Recall: share of that class the model found. Precision: share of its predictions for that class that were right.',
                'Recall: สัดส่วนของคลาสนั้นที่โมเดลหาเจอ · Precision: สัดส่วนที่โมเดลทายคลาสนั้นแล้วถูก',
              )}
            </p>
          </div>
        </div>
      )}

      {data.samples && <SampleGallery samples={data.samples} classNames={data.class_names ?? []} />}
    </div>
  );
}

function ConfusionMatrix({ names, matrix }: { names: string[]; matrix: number[][] }) {
  const { t } = useI18n();
  return (
    <div className="table-wrap">
      <table className="confusion">
        <thead>
          <tr>
            <th className="row text-left" style={{ fontWeight: 500 }}>
              {t('True ↓ / Predicted →', 'จริง ↓ / ทำนาย →')}
            </th>
            {names.map((n) => (
              <th key={n}>{n}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => {
            const total = row.reduce((a, b) => a + b, 0);
            return (
              <tr key={names[i]}>
                <th className="row">{names[i]}</th>
                {row.map((count, j) => {
                  const share = total ? count / total : 0;
                  const { bg, fg } = count ? rampColor(share) : { bg: 'transparent', fg: 'var(--muted)' };
                  const diag = i === j;
                  return (
                    <td
                      key={j}
                      title={t(
                        `True ${names[i]}, predicted ${names[j]}: ${count} (${Math.round(share * 100)}% of ${names[i]})`,
                        `จริง ${names[i]} ทำนายเป็น ${names[j]}: ${count} (${Math.round(share * 100)}% ของ ${names[i]})`,
                      )}
                      style={{
                        background: bg,
                        color: fg,
                        border: count ? undefined : '1px dashed var(--line)',
                        boxShadow: diag ? 'inset 0 0 0 2px var(--success)' : undefined,
                      }}
                    >
                      {count}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[13px] text-muted">
        {t('Green outline = correct. Shade = share of the true class.', 'กรอบเขียว = ทำนายถูก · ความเข้มสี = สัดส่วนของคลาสจริง')}
      </p>
    </div>
  );
}

function SampleGallery({ samples, classNames }: { samples: EvaluationSample[]; classNames: string[] }) {
  const { t } = useI18n();
  const wrong = samples.filter((s) => !s.correct);
  const [show, setShow] = useState<'wrong' | 'all'>(wrong.length ? 'wrong' : 'all');
  const [cls, setCls] = useState('');
  const [limit, setLimit] = useState(24);

  const list = useMemo(
    () => (show === 'wrong' ? wrong : samples).filter((s) => !cls || s.true === cls),
    [show, wrong, samples, cls],
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="section-title !mb-0">{t('Test images', 'ภาพในชุดทดสอบ')}</div>
          <p className="hint text-[13px]">
            {wrong.length
              ? t(
                  `${wrong.length} of ${samples.length} images were predicted wrong. Check whether they are mislabelled, unclear or genuinely hard.`,
                  `ทำนายผิด ${wrong.length} จาก ${samples.length} ภาพ ตรวจดูว่าติดป้ายผิด ภาพไม่ชัด หรือยากจริง`,
                )
              : t(`All ${samples.length} test images were predicted correctly.`, `ทำนายถูกทั้ง ${samples.length} ภาพ`)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="seg">
            <button type="button" className={show === 'wrong' ? 'on' : ''} onClick={() => setShow('wrong')}>
              {t('Wrong', 'ทำนายผิด')} ({wrong.length})
            </button>
            <button type="button" className={show === 'all' ? 'on' : ''} onClick={() => setShow('all')}>
              {t('All', 'ทั้งหมด')} ({samples.length})
            </button>
          </div>
          <select className="w-auto" value={cls} onChange={(e) => setCls(e.target.value)} aria-label={t('True class', 'คลาสจริง')}>
            <option value="">{t('Every true class', 'ทุกคลาสจริง')}</option>
            {classNames.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="empty rounded-lg border border-line">{t('Nothing to show for this filter.', 'ไม่มีภาพตามตัวกรองนี้')}</p>
      ) : (
        <div className="sample-grid">
          {list.slice(0, limit).map((s, i) => {
            const url = fileUrl(s.prpd_url);
            const top = Object.entries(s.scores).sort((a, b) => b[1] - a[1]);
            return (
              <figure key={`${s.prpd}-${i}`} className={`sample m-0 ${s.correct ? '' : 'wrong'}`}>
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" title={t('Open full size', 'เปิดภาพเต็ม')}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={s.prpd ?? ''} loading="lazy" />
                  </a>
                ) : (
                  <div className="empty h-[116px]">-</div>
                )}
                <figcaption className="sample-body">
                  <span className="name" title={s.prpd ?? ''}>
                    {(s.prpd ?? '').split('/').pop()}
                  </span>
                  <span className="verdict">
                    <span className="pill pill-gray">{s.true}</span>→
                    <span className={`pill ${s.correct ? 'pill-green' : 'pill-red'}`}>{s.predicted}</span>
                  </span>
                  <span className="mt-1 block font-mono text-[12px] text-muted">
                    {top.map(([k, v]) => `${k.slice(0, 3)} ${v.toFixed(0)}%`).join(' · ')}
                  </span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
      {list.length > limit && (
        <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => setLimit((n) => n + 24)}>
          {t(`Show more (${list.length - limit} left)`, `แสดงเพิ่ม (เหลือ ${list.length - limit})`)}
        </button>
      )}
    </div>
  );
}

/** Small multi-series line chart on one y-axis, with a hover crosshair. */
function LineChart({
  series,
  yMin,
  yMax,
  format,
  height = 190,
}: {
  series: { name: string; color: string; values: number[] }[];
  yMin?: number;
  yMax?: number;
  format: (v: number) => string;
  height?: number;
}) {
  const { t } = useI18n();
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shown = series.filter((s) => s.values.length > 0);
  const n = Math.max(0, ...shown.map((s) => s.values.length));
  const all = shown.flatMap((s) => s.values);
  const lo = yMin ?? Math.max(0, Math.min(...all) * 0.9);
  const hi = yMax ?? (Math.max(...all) * 1.05 || 1);

  const pad = { l: 44, r: 12, t: 8, b: 26 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => pad.t + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const ticks = [0, 1, 2, 3].map((k) => lo + ((hi - lo) * k) / 3);
  const xTicks = n <= 8 ? Array.from({ length: n }, (_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  }

  return (
    <div className="viz" ref={boxRef}>
      <div className="viz-legend">
        {shown.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} height={height} role="img" aria-label={shown.map((s) => s.name).join(', ')}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke="var(--grid-line)" strokeWidth={1} />
            <text className="axis-num" x={pad.l - 6} y={y(v) + 4} textAnchor="end">
              {format(v)}
            </text>
          </g>
        ))}
        {xTicks.map((i) => (
          <text key={i} className="axis-num" x={x(i)} y={height - 6} textAnchor="middle">
            {i + 1}
          </text>
        ))}
        {shown.map((s) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          />
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + plotH} stroke="var(--line-strong)" strokeDasharray="3 3" />
            {shown.map((s) =>
              s.values[hover] != null ? (
                <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
              ) : null,
            )}
          </g>
        )}
        <rect
          x={pad.l}
          y={pad.t}
          width={plotW}
          height={plotH}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null && (
        <div
          className="viz-tip"
          style={{ left: Math.min(width - 150, Math.max(0, x(hover) + 10)), top: 24 }}
          role="status"
        >
          <b>
            {t('Epoch', 'Epoch')} {hover + 1}
          </b>
          {shown.map((s) => (
            <div key={s.name}>
              <i style={{ background: s.color }} />
              {s.name}
              <span className="v">{s.values[hover] != null ? format(s.values[hover]) : '-'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
