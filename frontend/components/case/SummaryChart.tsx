'use client';

import { useCallback, useEffect, useRef } from 'react';

import type { PdCase } from '@/lib/types';

/**
 * Combined case chart, ported from the prototype's `drawSummaryChart` and the
 * annotated figure CMD FINAL CODE saved per image: AC reference sine, phase
 * gridlines, 0/360 markers, the plot frame and the two gap lines.
 */
export function SummaryChart({
  pdCase,
  imageUrl,
  width = 760,
  height = 460,
}: {
  pdCase: PdCase;
  imageUrl: string | null;
  width?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

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

    // ---- header text ----
    const gap = pdCase.gap;
    const top = pdCase.ai_top_class ?? '-';
    const topScore = pdCase.ai_top_score_percent;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#1E293B';
    ctx.font = '11px "Courier New", monospace';
    ctx.fillText(pdCase.prpd_filename ?? `${pdCase.case_base_name}_PRPD.png`, w / 2, 16);
    ctx.fillText(
      `Top class: ${top}${topScore != null ? ` (${topScore.toFixed(2)}%)` : ''} | ` +
        `PD source: ${pdCase.confirmed_pd_source_type ?? '-'}`,
      w / 2,
      32,
    );
    ctx.fillText(
      `Gap angle = ${gap.gap_angle_deg?.toFixed(4) ?? '-'} deg | ` +
        `Gap time = ${gap.gap_time_ms?.toFixed(4) ?? '-'} ms | ` +
        `Band = ${gap.gap_time_band ?? '-'} | Severity = ${pdCase.severity_by_gap_time ?? '-'}`,
      w / 2,
      48,
    );
    ctx.textAlign = 'left';

    const frame = { x_left: 62, x_right: w - 24, y_top: 74, y_bottom: h - 46 };
    const midY = (frame.y_top + frame.y_bottom) / 2;
    const halfH = (frame.y_bottom - frame.y_top) / 2;
    const spanX = frame.x_right - frame.x_left;
    const phaseX = (deg: number) => frame.x_left + (deg / 360) * spanX;

    // ---- the PRPD bitmap, fitted into the plot frame ----
    if (imgRef.current) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.drawImage(
        imgRef.current,
        frame.x_left,
        frame.y_top,
        spanX,
        frame.y_bottom - frame.y_top,
      );
      ctx.restore();
    }

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(frame.x_left, frame.y_top, spanX, frame.y_bottom - frame.y_top);

    // ---- AC reference sine ----
    ctx.beginPath();
    ctx.strokeStyle = '#94A3B8';
    ctx.setLineDash([5, 3]);
    ctx.lineWidth = 1.3;
    for (let p = 0; p <= 360; p += 2) {
      const x = phaseX(p);
      const y = midY - Math.sin((p * Math.PI) / 180) * halfH * 0.92;
      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // ---- 90 / 180 / 270 ----
    ctx.strokeStyle = '#CBD5E1';
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1;
    [90, 180, 270].forEach((p) => {
      ctx.beginPath();
      ctx.moveTo(phaseX(p), frame.y_top);
      ctx.lineTo(phaseX(p), frame.y_bottom);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // ---- 0 / 360 ----
    ctx.strokeStyle = '#3B82F6';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.6;
    [frame.x_left, frame.x_right].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, frame.y_top);
      ctx.lineTo(x, frame.y_bottom);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // ---- plot frame markers ----
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([8, 4]);
    [frame.y_top, frame.y_bottom].forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // ---- gap lines, positioned by measured phase ----
    if (gap.left_phase_deg != null && gap.right_phase_deg != null) {
      const xL = phaseX(gap.left_phase_deg);
      const xR = phaseX(gap.right_phase_deg);
      ctx.strokeStyle = '#DC2626';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xL, frame.y_top);
      ctx.lineTo(xL, frame.y_bottom);
      ctx.stroke();
      ctx.strokeStyle = '#16A34A';
      ctx.beginPath();
      ctx.moveTo(xR, frame.y_top);
      ctx.lineTo(xR, frame.y_bottom);
      ctx.stroke();
    }

    // ---- axes ----
    ctx.fillStyle = '#64748B';
    ctx.font = '10px Kanit, sans-serif';
    ctx.textAlign = 'center';
    [0, 90, 180, 270, 360].forEach((p) => {
      ctx.fillText(String(p), phaseX(p), frame.y_bottom + 16);
    });
    ctx.fillText('Phase [°]', (frame.x_left + frame.x_right) / 2, h - 8);

    ctx.save();
    ctx.translate(16, midY);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Amplitude', 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';

    // ---- legend ----
    const legend = [
      { label: 'Current plot frame', color: '#F59E0B', dash: [6, 3] },
      { label: '0 / 360 deg', color: '#3B82F6', dash: [5, 3] },
      { label: '90/180/270 deg', color: '#94A3B8', dash: [2, 3] },
      { label: 'Left gap line', color: '#DC2626', dash: [] as number[] },
      { label: 'Right gap line', color: '#16A34A', dash: [] as number[] },
    ];
    const boxW = 152;
    const boxH = legend.length * 16 + 12;
    const boxX = frame.x_right - boxW - 6;
    const boxY = frame.y_top + 6;

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    legend.forEach((it, i) => {
      const ly = boxY + 14 + i * 16;
      ctx.strokeStyle = it.color;
      ctx.lineWidth = 2;
      ctx.setLineDash(it.dash);
      ctx.beginPath();
      ctx.moveTo(boxX + 8, ly);
      ctx.lineTo(boxX + 28, ly);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#334155';
      ctx.font = '10px Kanit, sans-serif';
      ctx.fillText(it.label, boxX + 34, ly + 3);
    });
  }, [pdCase]);

  useEffect(() => {
    if (!imageUrl) {
      imgRef.current = null;
      draw();
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      draw();
    };
    img.onerror = () => {
      imgRef.current = null;
      draw();
    };
    img.src = imageUrl;
  }, [imageUrl, draw]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div className="canvas-wrap">
      <canvas ref={canvasRef} width={width} height={height} id="summary-canvas" />
    </div>
  );
}

export function downloadSummaryImage(caseName: string) {
  const canvas = document.getElementById('summary-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `${caseName}_summary.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
