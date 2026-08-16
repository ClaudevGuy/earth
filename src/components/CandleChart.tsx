import { useEffect, useRef, useState } from "react";
import type { Candle } from "../market/types";
import { formatPrice } from "../lib/format";

function formatAxisTime(ts: number, span: number): string {
  const d = new Date(ts * 1000);
  if (span > 86_400 * 20) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  if (span > 86_400 * 2) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function CandleChart({ candles, height = 360 }: { candles: Candle[]; height?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; candle: Candle } | null>(null);
  const hoverRef = useRef(hover);
  hoverRef.current = hover;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = wrap.clientWidth;
      const h = height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, h);

      const pad = { top: 16, right: 72, bottom: 28, left: 12 };
      const volH = Math.round(h * 0.22);
      const plotH = h - pad.top - pad.bottom - volH - 8;
      const plotW = width - pad.left - pad.right;
      const plotY = pad.top;
      const volY = pad.top + plotH + 8;

      ctx.fillStyle = "rgba(14, 11, 9, 0.25)";
      ctx.fillRect(0, 0, width, h);

      if (!candles.length || plotW < 40) {
        ctx.fillStyle = "#cbb9a6";
        ctx.font = "13px Outfit, system-ui, sans-serif";
        ctx.fillText("No series for this pair yet.", pad.left, h / 2);
        return;
      }

      const highs = candles.map((c) => c.high);
      const lows = candles.map((c) => c.low);
      let minP = Math.min(...lows);
      let maxP = Math.max(...highs);
      const padP = (maxP - minP) * 0.08 || maxP * 0.02 || 1;
      minP -= padP;
      maxP += padP;
      const maxV = Math.max(...candles.map((c) => c.volume), 1);
      const span = candles[candles.length - 1]!.time - candles[0]!.time || 1;
      const gap = plotW / candles.length;
      const bodyW = Math.max(1.5, Math.min(9, gap * 0.68));

      const yFor = (price: number) => plotY + ((maxP - price) / (maxP - minP)) * plotH;
      const xFor = (i: number) => pad.left + gap * i + gap / 2;

      ctx.strokeStyle = "rgba(240, 226, 200, 0.08)";
      ctx.lineWidth = 1;
      ctx.font = "11px IBM Plex Mono, monospace";
      ctx.fillStyle = "#cbb9a6";
      for (let i = 0; i <= 4; i++) {
        const price = maxP - ((maxP - minP) * i) / 4;
        const y = yFor(price);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.stroke();
        ctx.fillText(formatPrice(price), pad.left + plotW + 8, y + 4);
      }

      candles.forEach((c, i) => {
        const x = xFor(i);
        const up = c.close >= c.open;
        const color = up ? "#8aaf84" : "#d46848";
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, yFor(c.high));
        ctx.lineTo(x, yFor(c.low));
        ctx.stroke();
        const yOpen = yFor(c.open);
        const yClose = yFor(c.close);
        const top = Math.min(yOpen, yClose);
        const body = Math.max(1, Math.abs(yClose - yOpen));
        ctx.globalAlpha = 0.92;
        ctx.fillRect(x - bodyW / 2, top, bodyW, body);
        ctx.globalAlpha = 1;

        const vh = (c.volume / maxV) * (volH - 4);
        ctx.globalAlpha = 0.45;
        ctx.fillRect(x - bodyW / 2, volY + volH - vh, bodyW, vh);
        ctx.globalAlpha = 1;
      });

      ctx.strokeStyle = "rgba(240, 226, 200, 0.1)";
      ctx.beginPath();
      ctx.moveTo(pad.left, volY - 4);
      ctx.lineTo(pad.left + plotW, volY - 4);
      ctx.stroke();

      const tickEvery = Math.max(1, Math.round(candles.length / 6));
      ctx.fillStyle = "#cbb9a6";
      ctx.font = "10px IBM Plex Mono, monospace";
      candles.forEach((c, i) => {
        if (i % tickEvery !== 0 && i !== candles.length - 1) return;
        ctx.fillText(formatAxisTime(c.time, span), xFor(i) - 18, h - 10);
      });

      const pointer = hoverRef.current;
      if (pointer) {
        const i = Math.max(0, Math.min(candles.length - 1, Math.round((pointer.x - pad.left - gap / 2) / gap)));
        const c = candles[i];
        if (c) {
          const x = xFor(i);
          const y = yFor(c.close);
          ctx.strokeStyle = "rgba(240, 226, 200, 0.28)";
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(x, pad.top);
          ctx.lineTo(x, volY + volH);
          ctx.moveTo(pad.left, y);
          ctx.lineTo(pad.left + plotW, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "#e09245";
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [candles, height, hover]);

  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = rect.width;
    const padLeft = 12;
    const padRight = 72;
    const plotW = width - padLeft - padRight;
    const gap = candles.length ? plotW / candles.length : 1;
    const i = Math.max(0, Math.min(candles.length - 1, Math.round((x - padLeft - gap / 2) / gap)));
    const candle = candles[i];
    setHover(candle ? { x, y, candle } : null);
  }

  return (
    <div className="chart-wrap" ref={wrapRef} style={{ height }}>
      <canvas
        ref={canvasRef}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        aria-label="Price chart"
      />
      {hover ? (
        <div className="chart-tip" style={{ left: Math.min(hover.x + 12, 280), top: 8 }}>
          <span>{new Date(hover.candle.time * 1000).toLocaleString()}</span>
          <span>
            O {formatPrice(hover.candle.open)} · H {formatPrice(hover.candle.high)} · L {formatPrice(hover.candle.low)} · C{" "}
            {formatPrice(hover.candle.close)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
