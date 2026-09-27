'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useI18n } from '@/lib/i18n';

export interface Frame {
  x_left: number;
  x_right: number;
  y_top: number;
  y_bottom: number;
}

export type CalibHandle = 'x_left' | 'x_right' | 'y_top' | 'y_bottom';
export type GapHandle = 'gapLeft' | 'gapRight';
export type Handle = CalibHandle | GapHandle;

interface Props {
  /** Absolute URL of the PRPD bitmap. */
  imageUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  frame: Frame;
  /** Which overlay to draw and drag. */
  mode: 'calibration' | 'gap';
  gapLeft?: number | null;
  gapRight?: number | null;
  /** Fired continuously while dragging a handle. */
  onDrag?: (handle: Handle, value: number) => void;
  /** Fired once on pointer release, for persisting the handle. */
  onDragEnd?: (handle: Handle, value: number) => void;
  /** Largest width, in CSS pixels, the canvas grows to. */
  maxWidth?: number;
  /** Largest height, so a tall plot never pushes the controls off screen. */
  maxHeight?: number;
}

const HIT_TOLERANCE_PX = 9;

/**
 * The interactive PRPD plot. Sizes itself to its container (capped by
 * maxWidth/maxHeight) and draws at device resolution; all handle values are
 * in the original image's pixel space.
 */
export function PrpdCanvas({
  imageUrl,
  imageWidth,
  imageHeight,
  frame,
  mode,
  gapLeft,
  gapRight,
  onDrag,
  onDragEnd,
  maxWidth = 760,
  maxHeight = 520,
}: Props) {
  const { t } = useI18n();
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgReady, setImgReady] = useState(false);
  const [boxWidth, setBoxWidth] = useState(maxWidth);
  const [dragging, setDragging] = useState<Handle | null>(null);
  const [hover, setHover] = useState<Handle | null>(null);

  // ---- fit to container ----
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBoxWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const aspect = imageWidth > 0 ? imageHeight / imageWidth : 0.75;
  const displayWidth = Math.max(
    200,
    Math.min(boxWidth || maxWidth, maxWidth, aspect > 0 ? maxHeight / aspect : maxWidth),
  );
  const scale = imageWidth > 0 ? displayWidth / imageWidth : 1;
  const displayHeight = Math.round(imageHeight * scale);

  // ---- load the bitmap ----
  useEffect(() => {
    if (!imageUrl) {
      imgRef.current = null;
      setImgReady(false);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setImgReady(true);
    };
    img.onerror = () => {
      imgRef.current = null;
      setImgReady(false);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // ---- draw ----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(displayWidth);
    const h = displayHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    if (imgRef.current) {
      ctx.drawImage(imgRef.current, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#94A3B8';
      ctx.font = '14px "IBM Plex Sans Thai", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('PRPD image unavailable', 'ไม่มีภาพ PRPD'), w / 2, h / 2);
      ctx.textAlign = 'left';
    }

    const fx1 = frame.x_left * scale;
    const fx2 = frame.x_right * scale;
    const fy1 = frame.y_top * scale;
    const fy2 = frame.y_bottom * scale;

    // 90 / 180 / 270 phase references
    ctx.save();
    ctx.strokeStyle = 'rgba(100,116,139,.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    [90, 180, 270].forEach((deg) => {
      const x = fx1 + (deg / 360) * (fx2 - fx1);
      ctx.beginPath();
      ctx.moveTo(x, fy1);
      ctx.lineTo(x, fy2);
      ctx.stroke();
    });
    ctx.restore();

    const label = (text: string, x: number, y: number, color: string) => {
      ctx.font = '600 12px "IBM Plex Sans Thai", sans-serif';
      const width = ctx.measureText(text).width + 8;
      const lx = Math.max(2, Math.min(w - width - 2, x));
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillRect(lx, y - 12, width, 16);
      ctx.fillStyle = color;
      ctx.fillText(text, lx + 4, y);
    };

    if (mode === 'calibration') {
      const active = dragging ?? hover;
      ctx.save();
      ctx.lineWidth = 2.4;
      // 0° / 360°
      ctx.strokeStyle = active === 'x_left' ? '#0284c7' : '#1769aa';
      ctx.beginPath();
      ctx.moveTo(fx1, 0);
      ctx.lineTo(fx1, h);
      ctx.stroke();
      ctx.strokeStyle = active === 'x_right' ? '#0284c7' : '#1769aa';
      ctx.beginPath();
      ctx.moveTo(fx2, 0);
      ctx.lineTo(fx2, h);
      ctx.stroke();
      // top / bottom
      ctx.strokeStyle = active === 'y_top' ? '#c2410c' : '#e6a124';
      ctx.beginPath();
      ctx.moveTo(0, fy1);
      ctx.lineTo(w, fy1);
      ctx.stroke();
      ctx.strokeStyle = active === 'y_bottom' ? '#c2410c' : '#e6a124';
      ctx.beginPath();
      ctx.moveTo(0, fy2);
      ctx.lineTo(w, fy2);
      ctx.stroke();
      ctx.restore();

      label('0°', fx1 + 4, 16, '#0b4f86');
      label('360°', fx2 - 40, 16, '#0b4f86');
      label(t('Top', 'บน'), 4, Math.max(14, fy1 - 5), '#92400e');
      label(t('Bottom', 'ล่าง'), 4, Math.min(h - 4, fy2 + 16), '#92400e');
    } else {
      ctx.save();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fx1, fy1, fx2 - fx1, fy2 - fy1);
      ctx.restore();

      if (gapLeft != null && gapRight != null) {
        const gx1 = gapLeft * scale;
        const gx2 = gapRight * scale;
        const active = dragging ?? hover;

        ctx.save();
        ctx.fillStyle = 'rgba(230,161,36,0.14)';
        ctx.fillRect(Math.min(gx1, gx2), fy1, Math.abs(gx2 - gx1), fy2 - fy1);
        ctx.lineWidth = 2.8;
        ctx.strokeStyle = active === 'gapLeft' ? '#c2410c' : '#e6a124';
        ctx.beginPath();
        ctx.moveTo(gx1, fy1);
        ctx.lineTo(gx1, fy2);
        ctx.stroke();
        ctx.strokeStyle = active === 'gapRight' ? '#047857' : '#1d9b62';
        ctx.beginPath();
        ctx.moveTo(gx2, fy1);
        ctx.lineTo(gx2, fy2);
        ctx.stroke();
        ctx.restore();

        label(t('L', 'ซ้าย'), gx1 + 4, fy1 + 16, '#92400e');
        label(t('R', 'ขวา'), gx2 + 4, fy1 + 16, '#047857');
      }
    }
    // imgReady is a dependency so the canvas redraws once the bitmap arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, gapLeft, gapRight, mode, scale, displayWidth, displayHeight, imgReady, hover, dragging, t]);

  useEffect(() => {
    draw();
  }, [draw]);

  // ---- hit testing ----
  const hitTest = useCallback(
    (mx: number, my: number): Handle | null => {
      const candidates: [Handle, number][] =
        mode === 'calibration'
          ? [
              ['x_left', Math.abs(mx - frame.x_left * scale)],
              ['x_right', Math.abs(mx - frame.x_right * scale)],
              ['y_top', Math.abs(my - frame.y_top * scale)],
              ['y_bottom', Math.abs(my - frame.y_bottom * scale)],
            ]
          : gapLeft != null && gapRight != null
            ? [
                ['gapLeft', Math.abs(mx - gapLeft * scale)],
                ['gapRight', Math.abs(mx - gapRight * scale)],
              ]
            : [];
      const within = candidates.filter(([, d]) => d < HIT_TOLERANCE_PX).sort((a, b) => a[1] - b[1]);
      return within.length ? within[0][0] : null;
    },
    [frame, gapLeft, gapRight, mode, scale],
  );

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      mx: (e.clientX - rect.left) * (displayWidth / rect.width),
      my: (e.clientY - rect.top) * (displayHeight / rect.height),
    };
  }

  function valueFor(handle: Handle, mx: number, my: number): number {
    const vertical = handle === 'y_top' || handle === 'y_bottom';
    const raw = vertical ? my / scale : mx / scale;
    const limit = vertical ? imageHeight : imageWidth;
    return Math.round(Math.max(0, Math.min(limit, raw)));
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const { mx, my } = pointerPos(e);
    const hit = hitTest(mx, my);
    if (!hit) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(hit);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const { mx, my } = pointerPos(e);
    if (!dragging) {
      setHover(hitTest(mx, my));
      return;
    }
    onDrag?.(dragging, valueFor(dragging, mx, my));
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragging) return;
    const { mx, my } = pointerPos(e);
    onDragEnd?.(dragging, valueFor(dragging, mx, my));
    setDragging(null);
  }

  const active = dragging ?? hover;
  const cursor = active === 'y_top' || active === 'y_bottom' ? 'ns-resize' : active ? 'ew-resize' : 'crosshair';

  return (
    <div className="canvas-box" ref={boxRef}>
      <canvas
        ref={canvasRef}
        style={{ width: displayWidth, height: displayHeight, cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          if (!dragging) setHover(null);
        }}
      />
      <div className="canvas-legend">
        {mode === 'calibration' ? (
          <>
            <span>
              <i style={{ background: '#1769aa' }} />
              {t('0° / 360° lines', 'เส้น 0° / 360°')}
            </span>
            <span>
              <i style={{ background: '#e6a124' }} />
              {t('Top / bottom of the plot', 'ขอบบน / ล่างของกราฟ')}
            </span>
          </>
        ) : (
          <>
            <span>
              <i style={{ background: '#e6a124' }} />
              {t('Left gap line', 'เส้น Gap ซ้าย')}
            </span>
            <span>
              <i style={{ background: '#1d9b62' }} />
              {t('Right gap line', 'เส้น Gap ขวา')}
            </span>
          </>
        )}
        <span>{t('Drag a line to move it', 'ลากเส้นเพื่อปรับตำแหน่ง')}</span>
      </div>
    </div>
  );
}

/** ±1 px nudges, one pair of buttons per line. */
export function NudgeRow({
  items,
  onNudge,
  disabled = false,
}: {
  items: { label: string; handle: Handle }[];
  onNudge: (handle: Handle, delta: number) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="nudge-panel">
      <b>{t('Fine-tune (1 px):', 'ปรับละเอียด (1 px):')}</b>
      {items.map(({ label, handle }) => (
        <span className="nudge" key={handle}>
          <span>{label}</span>
          <button type="button" disabled={disabled} onClick={() => onNudge(handle, -1)} aria-label={`${label} −1 px`}>
            −
          </button>
          <button type="button" disabled={disabled} onClick={() => onNudge(handle, 1)} aria-label={`${label} +1 px`}>
            +
          </button>
        </span>
      ))}
    </div>
  );
}
