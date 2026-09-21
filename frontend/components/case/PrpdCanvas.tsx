'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface Framea {
  x_left: number;
  x_right: number;
  y_top: number;
  y_bottom: number;
}

export type CalibHandle =
  | 'x_left'
  | 'x_right'
  | 'y_top'
  | 'y_bottom'
  | 'frame_both_x'
  | 'frame_both_y';

export type GapHandle = 'gapLeft' | 'gapRight' | 'gapBoth';
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
  /** Whether dual-line locked adjustment is active */
  lockSpan?: boolean;
  /** Fired continuously while dragging a single handle */
  onDrag?: (handle: Handle, value: number) => void;
  /** Fired once on pointer release, for persisting a single handle */
  onDragEnd?: (handle: Handle, value: number) => void;
  /** Fired continuously when dragging both gap lines simultaneously */
  onDragPair?: (left: number, right: number) => void;
  /** Fired once on release when dragging both gap lines simultaneously */
  onDragEndPair?: (left: number, right: number) => void;
  /** Fired continuously when dragging both frame lines simultaneously */
  onDragFramePair?: (nextFrame: Frame) => void;
  /** Fired once on release when dragging both frame lines */
  onDragEndFramePair?: (nextFrame: Frame) => void;
  /** Rendered width in CSS pixels; the image is scaled to fit. */
  displayWidth?: number;
}

const HIT_TOLERANCE_PX = 9;

export function PrpdCanvas({
  imageUrl,
  imageWidth,
  imageHeight,
  frame,
  mode,
  gapLeft,
  gapRight,
  lockSpan = false,
  onDrag,
  onDragEnd,
  onDragPair,
  onDragEndPair,
  onDragFramePair,
  onDragEndFramePair,
  displayWidth = 720,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgReady, setImgReady] = useState(false);
  const [dragging, setDragging] = useState<Handle | null>(null);
  const [hover, setHover] = useState<Handle | null>(null);

  // Snapshot on pointer down for smooth dual-line translation
  const dragStart = useRef<{
    mx: number;
    my: number;
    frame: Frame;
    gapLeft: number;
    gapRight: number;
  } | null>(null);

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

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    if (imgRef.current) {
      ctx.drawImage(imgRef.current, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#94A3B8';
      ctx.font = '12px Kanit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PRPD image unavailable', w / 2, h / 2);
      ctx.textAlign = 'left';
    }

    const sx = (v: number) => v * scale;
    const sy = (v: number) => v * scale;

    const fx1 = sx(frame.x_left);
    const fx2 = sx(frame.x_right);
    const fy1 = sy(frame.y_top);
    const fy2 = sy(frame.y_bottom);

    // 90 / 180 / 270 phase references
    ctx.save();
    ctx.strokeStyle = 'rgba(100,116,139,.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    [90, 180, 270].forEach((deg) => {
      const x = fx1 + (deg / 360) * (fx2 - fx1);
      ctx.beginPath();
      ctx.moveTo(x, fy1);
      ctx.lineTo(x, fy2);
      ctx.stroke();
    });
    ctx.restore();

    if (mode === 'calibration') {
      // Plot frame rectangle
      ctx.save();
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 2;
      ctx.strokeRect(fx1, fy1, fx2 - fx1, fy2 - fy1);
      ctx.restore();

      // Full-height 0 / 360 lines
      ctx.save();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = hover === 'x_left' || dragging === 'x_left' ? '#0284c7' : '#1F4E79';
      ctx.beginPath();
      ctx.moveTo(fx1, 0);
      ctx.lineTo(fx1, h);
      ctx.stroke();

      ctx.strokeStyle = hover === 'x_right' || dragging === 'x_right' ? '#0284c7' : '#1F4E79';
      ctx.beginPath();
      ctx.moveTo(fx2, 0);
      ctx.lineTo(fx2, h);
      ctx.stroke();

      // Full-width top / bottom lines
      ctx.strokeStyle = hover === 'y_top' || dragging === 'y_top' ? '#ea580c' : '#F59E0B';
      ctx.beginPath();
      ctx.moveTo(0, fy1);
      ctx.lineTo(w, fy1);
      ctx.stroke();

      ctx.strokeStyle = hover === 'y_bottom' || dragging === 'y_bottom' ? '#ea580c' : '#F59E0B';
      ctx.beginPath();
      ctx.moveTo(0, fy2);
      ctx.lineTo(w, fy2);
      ctx.stroke();
      ctx.restore();

      ctx.font = 'bold 11px Kanit, sans-serif';
      ctx.fillStyle = '#1F4E79';
      ctx.fillText('0°', fx1 + 4, 14);
      ctx.fillText('360°', Math.max(4, fx2 - 32), 14);
      ctx.fillStyle = '#B45309';
      ctx.fillText('Top', 4, Math.max(12, fy1 - 5));
      ctx.fillText('Bottom', 4, Math.min(h - 4, fy2 + 14));

      // If lockSpan is active, draw a hint badge
      if (lockSpan) {
        ctx.save();
        ctx.fillStyle = 'rgba(2,132,199,0.12)';
        ctx.fillRect(fx1, fy1, fx2 - fx1, fy2 - fy1);
        ctx.fillStyle = '#0284c7';
        ctx.font = 'bold 11px Kanit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⟷ Drag frame together (ปรับสองเส้นพร้อมกัน)', (fx1 + fx2) / 2, fy1 + 20);
        ctx.restore();
      }
    } else {
      // Gap mode: dim frame, bright gap lines
      ctx.save();
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fx1, fy1, fx2 - fx1, fy2 - fy1);
      ctx.restore();

      if (gapLeft != null && gapRight != null) {
        const gx1 = sx(gapLeft);
        const gx2 = sx(gapRight);
        const minX = Math.min(gx1, gx2);
        const spanW = Math.abs(gx2 - gx1);

        ctx.save();
        const isBandActive = hover === 'gapBoth' || dragging === 'gapBoth' || lockSpan;
        ctx.fillStyle = isBandActive ? 'rgba(245,158,11,0.28)' : 'rgba(245,158,11,0.14)';
        ctx.fillRect(minX, fy1, spanW, fy2 - fy1);

        // Gap left line (yellow/orange)
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = hover === 'gapLeft' || dragging === 'gapLeft' ? '#ff9900' : '#F59E0B';
        ctx.beginPath();
        ctx.moveTo(gx1, fy1);
        ctx.lineTo(gx1, fy2);
        ctx.stroke();

        // Gap right line (green)
        ctx.strokeStyle = hover === 'gapRight' || dragging === 'gapRight' ? '#059669' : '#10B981';
        ctx.beginPath();
        ctx.moveTo(gx2, fy1);
        ctx.lineTo(gx2, fy2);
        ctx.stroke();
        ctx.restore();

        ctx.font = 'bold 11px Kanit, sans-serif';
        ctx.fillStyle = '#B45309';
        ctx.fillText('L', gx1 + 4, fy1 + 14);
        ctx.fillStyle = '#047857';
        ctx.fillText('R', gx2 + 4, fy1 + 14);

        // Show dual-line drag hint inside the band
        if (spanW > 40) {
          ctx.save();
          ctx.fillStyle = isBandActive ? '#b45309' : 'rgba(180,83,9,0.7)';
          ctx.font = '500 10px Kanit, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('⟷ ปรับพร้อมกัน', (gx1 + gx2) / 2, (fy1 + fy2) / 2);
          ctx.restore();
        }
      }
    }
  }, [frame, gapLeft, gapRight, mode, scale, imgReady, hover, dragging, lockSpan]);

  useEffect(() => {
    draw();
  }, [draw]);

  // ---- hit testing ----
  const hitTest = useCallback(
    (mx: number, my: number): Handle | null => {
      const candidates: [Handle, number][] = [];

      if (mode === 'calibration') {
        const dXLeft = Math.abs(mx - frame.x_left * scale);
        const dXRight = Math.abs(mx - frame.x_right * scale);
        const dYTop = Math.abs(my - frame.y_top * scale);
        const dYBottom = Math.abs(my - frame.y_bottom * scale);

        candidates.push(
          ['x_left', dXLeft],
          ['x_right', dXRight],
          ['y_top', dYTop],
          ['y_bottom', dYBottom]
        );

        const within = candidates
          .filter(([, dist]) => dist < HIT_TOLERANCE_PX)
          .sort((a, b) => a[1] - b[1]);

        if (within.length) {
          if (lockSpan && (within[0][0] === 'x_left' || within[0][0] === 'x_right')) {
            return 'frame_both_x';
          }
          return within[0][0];
        }

        // Check if inside plot frame for dual adjustment
        if (lockSpan) {
          const fx1 = frame.x_left * scale;
          const fx2 = frame.x_right * scale;
          const fy1 = frame.y_top * scale;
          const fy2 = frame.y_bottom * scale;
          if (mx >= fx1 && mx <= fx2 && my >= fy1 && my <= fy2) {
            return 'frame_both_x';
          }
        }
        return null;
      } else if (gapLeft != null && gapRight != null) {
        const gx1 = gapLeft * scale;
        const gx2 = gapRight * scale;
        const dL = Math.abs(mx - gx1);
        const dR = Math.abs(mx - gx2);

        candidates.push(['gapLeft', dL], ['gapRight', dR]);

        const within = candidates
          .filter(([, dist]) => dist < HIT_TOLERANCE_PX)
          .sort((a, b) => a[1] - b[1]);

        // If directly hitting a line
        if (within.length) {
          if (lockSpan) return 'gapBoth';
          return within[0][0];
        }

        // If clicking inside the gap band between Left and Right, enable dual-line drag!
        const fy1 = frame.y_top * scale;
        const fy2 = frame.y_bottom * scale;
        const minX = Math.min(gx1, gx2);
        const maxX = Math.max(gx1, gx2);

        if (mx >= minX && mx <= maxX && my >= fy1 && my <= fy2) {
          return 'gapBoth';
        }
      }

      return null;
    },
    [frame, gapLeft, gapRight, mode, scale, lockSpan]
  );

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      mx: (e.clientX - rect.left) * (canvas.width / rect.width),
      my: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function valueFor(handle: Handle, mx: number, my: number): number {
    const isVertical = handle === 'y_top' || handle === 'y_bottom';
    const raw = isVertical ? my / scale : mx / scale;
    const limit = isVertical ? imageHeight : imageWidth;
    return Math.round(Math.max(0, Math.min(limit, raw)));
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const { mx, my } = pointerPos(e);
    const hit = hitTest(mx, my);
    if (!hit) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(hit);

    dragStart.current = {
      mx,
      my,
      frame: { ...frame },
      gapLeft: gapLeft ?? 0,
      gapRight: gapRight ?? 0,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const { mx, my } = pointerPos(e);
    if (!dragging) {
      setHover(hitTest(mx, my));
      return;
    }

    if (!dragStart.current) return;
    const deltaX_img = Math.round((mx - dragStart.current.mx) / scale);
    const deltaY_img = Math.round((my - dragStart.current.my) / scale);

    // 1. Dual Gap Lines Dragging (ปรับสองเส้น Gap พร้อมกัน)
    if (dragging === 'gapBoth' || (lockSpan && (dragging === 'gapLeft' || dragging === 'gapRight'))) {
      const span = dragStart.current.gapRight - dragStart.current.gapLeft;
      let nextLeft = dragStart.current.gapLeft + deltaX_img;
      let nextRight = dragStart.current.gapRight + deltaX_img;

      // Constrain within frame bounds
      if (nextLeft < frame.x_left) {
        nextLeft = frame.x_left;
        nextRight = nextLeft + span;
      }
      if (nextRight > frame.x_right) {
        nextRight = frame.x_right;
        nextLeft = nextRight - span;
      }

      onDragPair?.(Math.round(nextLeft), Math.round(nextRight));
      return;
    }

    // 2. Dual Frame Lines Dragging (ปรับ 0° และ 360° พร้อมกัน)
    if (dragging === 'frame_both_x') {
      const span = dragStart.current.frame.x_right - dragStart.current.frame.x_left;
      let nextLeft = dragStart.current.frame.x_left + deltaX_img;
      let nextRight = dragStart.current.frame.x_right + deltaX_img;

      if (nextLeft < 0) {
        nextLeft = 0;
        nextRight = span;
      }
      if (nextRight > imageWidth) {
        nextRight = imageWidth;
        nextLeft = imageWidth - span;
      }

      onDragFramePair?.({
        ...frame,
        x_left: Math.round(nextLeft),
        x_right: Math.round(nextRight),
      });
      return;
    }

    // 3. Single Handle Dragging
    onDrag?.(dragging, valueFor(dragging, mx, my));
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragging || !dragStart.current) return;
    const { mx, my } = pointerPos(e);
    const deltaX_img = Math.round((mx - dragStart.current.mx) / scale);

    if (dragging === 'gapBoth' || (lockSpan && (dragging === 'gapLeft' || dragging === 'gapRight'))) {
      const span = dragStart.current.gapRight - dragStart.current.gapLeft;
      let nextLeft = dragStart.current.gapLeft + deltaX_img;
      let nextRight = dragStart.current.gapRight + deltaX_img;

      if (nextLeft < frame.x_left) {
        nextLeft = frame.x_left;
        nextRight = nextLeft + span;
      }
      if (nextRight > frame.x_right) {
        nextRight = frame.x_right;
        nextLeft = nextRight - span;
      }

      onDragEndPair?.(Math.round(nextLeft), Math.round(nextRight));
    } else if (dragging === 'frame_both_x') {
      const span = dragStart.current.frame.x_right - dragStart.current.frame.x_left;
      let nextLeft = dragStart.current.frame.x_left + deltaX_img;
      let nextRight = dragStart.current.frame.x_right + deltaX_img;

      if (nextLeft < 0) {
        nextLeft = 0;
        nextRight = span;
      }
      if (nextRight > imageWidth) {
        nextRight = imageWidth;
        nextLeft = imageWidth - span;
      }

      onDragEndFramePair?.({
        ...frame,
        x_left: Math.round(nextLeft),
        x_right: Math.round(nextRight),
      });
    } else {
      onDragEnd?.(dragging, valueFor(dragging, mx, my));
    }

    setDragging(null);
    dragStart.current = null;
  }

  const active = dragging ?? hover;
  const cursor =
    active === 'gapBoth' || active === 'frame_both_x'
      ? 'grab'
      : active === 'y_top' || active === 'y_bottom'
      ? 'ns-resize'
      : active
      ? 'ew-resize'
      : 'default';

  return (
    <div className="canvas-wrap relative">
      <canvas
        ref={canvasRef}
        width={displayWidth}
        height={displayHeight}
        style={{ cursor, touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          if (!dragging) setHover(null);
        }}
        className="rounded-lg border border-slate-200 shadow-sm bg-white"
      />
    </div>
  );
}

/** ± nudge buttons with dual-line adjustment support */
export function NudgeRow({
  items,
  onNudge,
  onNudgePair,
  disabled = false,
}: {
  items: { label: string; handle: Handle }[];
  onNudge: (handle: Handle, delta: number) => void;
  onNudgePair?: (type: 'gap' | 'frame' | 'y', delta: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="nudge-panel">
      <b>Fine adjustment — 1 pixel per click (ปรับละเอียด — ครั้งละ 1 พิกเซล)</b>
      <div>
        {items.map(({ label, handle }) => (
          <span key={handle}>
            <small>{label}</small>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onNudge(handle, -1)}
              aria-label={`${label} -1px`}
            >
              −
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onNudge(handle, 1)}
              aria-label={`${label} +1px`}
            >
              +
            </button>
          </span>
        ))}

        {onNudgePair && (
          <>
            <span className="border-sky-300 bg-sky-50 dark:bg-sky-950/30">
              <small className="font-semibold text-sky-700 dark:text-sky-300">
                ⟷ ปรับคู่กัน (Dual ±1px)
              </small>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onNudgePair('gap', -1)}
                title="Shift both Gap lines left 1px"
              >
                ◀
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onNudgePair('gap', 1)}
                title="Shift both Gap lines right 1px"
              >
                ▶
              </button>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
