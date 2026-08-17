'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
  /** Fired continuously while dragging (image pixel coordinates). */
  onDrag?: (handle: Handle, value: number) => void;
  /** Fired once on pointer release, for persisting. */
  onDragEnd?: (handle: Handle, value: number) => void;
  /** Rendered width in CSS pixels; the image is scaled to fit. */
  displayWidth?: number;
}

const HIT_TOLERANCE_PX = 9;

/**
 * Draws the real PRPD image with draggable overlay lines.
 *
 * All coordinates in props and callbacks are *image pixel* coordinates, matching
 * the x_left_0deg / left_line_pixel values the backend stores, so nothing has to
 * be converted before saving.
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
  displayWidth = 720,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgReady, setImgReady] = useState(false);
  const [dragging, setDragging] = useState<Handle | null>(null);
  const [hover, setHover] = useState<Handle | null>(null);

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

    // 90 / 180 / 270 phase references.
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
      // Plot frame rectangle.
      ctx.save();
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 2;
      ctx.strokeRect(fx1, fy1, fx2 - fx1, fy2 - fy1);
      ctx.restore();

      // Full-height 0 / 360 lines.
      ctx.save();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#1F4E79';
      [fx1, fx2].forEach((x) => {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      });
      // Full-width top / bottom lines.
      ctx.strokeStyle = '#F59E0B';
      [fy1, fy2].forEach((y) => {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      });
      ctx.restore();

      ctx.font = 'bold 11px Kanit, sans-serif';
      ctx.fillStyle = '#1F4E79';
      ctx.fillText('x_left (0°)', fx1 + 4, 14);
      ctx.fillText('x_right (360°)', Math.max(4, fx2 - 86), 14);
      ctx.fillStyle = '#B45309';
      ctx.fillText('y_top', 4, Math.max(12, fy1 - 5));
      ctx.fillText('y_bottom', 4, Math.min(h - 4, fy2 + 14));
    } else {
      // Gap mode: dim frame, bright gap lines.
      ctx.save();
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fx1, fy1, fx2 - fx1, fy2 - fy1);
      ctx.restore();

      if (gapLeft != null && gapRight != null) {
        const gx1 = sx(gapLeft);
        const gx2 = sx(gapRight);

        ctx.save();
        ctx.fillStyle = 'rgba(245,158,11,0.14)';
        ctx.fillRect(Math.min(gx1, gx2), fy1, Math.abs(gx2 - gx1), fy2 - fy1);

        ctx.lineWidth = 2.6;
        ctx.strokeStyle = '#F59E0B';
        ctx.beginPath();
        ctx.moveTo(gx1, fy1);
        ctx.lineTo(gx1, fy2);
        ctx.stroke();

        ctx.strokeStyle = '#10B981';
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
      }
    }
  }, [frame, gapLeft, gapRight, mode, scale, imgReady]);

  useEffect(() => {
    draw();
  }, [draw]);

  // ---- hit testing ----
  const hitTest = useCallback(
    (mx: number, my: number): Handle | null => {
      const candidates: [Handle, number][] = [];

      if (mode === 'calibration') {
        candidates.push(
          ['x_left', Math.abs(mx - frame.x_left * scale)],
          ['x_right', Math.abs(mx - frame.x_right * scale)],
          ['y_top', Math.abs(my - frame.y_top * scale)],
          ['y_bottom', Math.abs(my - frame.y_bottom * scale)],
        );
      } else if (gapLeft != null && gapRight != null) {
        candidates.push(
          ['gapLeft', Math.abs(mx - gapLeft * scale)],
          ['gapRight', Math.abs(mx - gapRight * scale)],
        );
      }

      // Nearest line wins, so corners do not always favour the vertical handle.
      const within = candidates
        .filter(([, dist]) => dist < HIT_TOLERANCE_PX)
        .sort((a, b) => a[1] - b[1]);
      return within.length ? within[0][0] : null;
    },
    [frame, gapLeft, gapRight, mode, scale],
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
  const cursor = active
    ? active === 'y_top' || active === 'y_bottom'
      ? 'ns-resize'
      : 'ew-resize'
    : 'default';

  return (
    <div className="canvas-wrap">
      <canvas
        ref={canvasRef}
        width={displayWidth}
        height={displayHeight}
        style={{ cursor, touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
      />
    </div>
  );
}

/** ± nudge buttons, matching the prototype's `.nudge-row`. */
export function NudgeRow({
  items,
  onNudge,
  disabled = false,
}: {
  items: { label: string; handle: Handle }[];
  onNudge: (handle: Handle, delta: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="nudge-row">
      {items.map(({ label, handle }) => (
        <span className="nudge-grp" key={handle}>
          {label}
          <button type="button" disabled={disabled} onClick={() => onNudge(handle, -1)}>
            −
          </button>
          <button type="button" disabled={disabled} onClick={() => onNudge(handle, 1)}>
            +
          </button>
        </span>
      ))}
    </div>
  );
}
