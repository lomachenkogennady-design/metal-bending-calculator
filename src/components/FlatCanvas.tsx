import { useEffect, useRef, useState } from "react";
import { fmt } from "../lib/bending";

interface Props {
  flat: number;
  length: number;
  straights: number[];
  allowances: number[];
  angles: number[];
  className?: string;
}

export default function FlatCanvas({ flat, length, straights, allowances, angles, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [resizeTick, setResizeTick] = useState(0);

  useEffect(() => {
    const onR = () => setResizeTick((t) => t + 1);
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || flat <= 0) return;

    const rect = cv.getBoundingClientRect();
    const W = Math.max(100, rect.width);
    const H = Math.max(100, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = W + "px";
    cv.style.height = H + "px";
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const padL = 70, padR = 90, padT = 38, padB = 50;
    const availW = Math.max(40, W - padL - padR);
    const availH = Math.max(40, H - padT - padB);
    const scale = Math.min(availW / flat, availH / Math.max(length, 1));
    const rw = flat * scale;
    const rh = Math.max(14, length * scale);
    const x0 = padL + (availW - rw) / 2;
    const y0 = padT + (availH - rh) / 2;

    // Заготовка
    const grad = ctx.createLinearGradient(0, y0, 0, y0 + rh);
    grad.addColorStop(0, "#dbe4f0");
    grad.addColorStop(1, "#c3cfe0");
    ctx.fillStyle = grad;
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(x0, y0, rw, rh, 2);
    ctx.fill();
    ctx.stroke();

    // Штриховка
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0, y0, rw, rh, 2);
    ctx.clip();
    ctx.strokeStyle = "rgba(51,65,85,0.13)";
    ctx.lineWidth = 1;
    for (let x = -rh; x < rw + rh; x += 9) {
      ctx.beginPath();
      ctx.moveTo(x0 + x, y0 + rh);
      ctx.lineTo(x0 + x + rh, y0);
      ctx.stroke();
    }
    ctx.restore();

    // Линии гибов
    let acc = 0;
    for (let j = 0; j < allowances.length; j++) {
      const pos = acc + (straights[j] ?? 0) + allowances[j] / 2;
      acc += (straights[j] ?? 0) + allowances[j];
      const bx = x0 + pos * scale;
      ctx.strokeStyle = "#ea580c";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([7, 4]);
      ctx.beginPath();
      ctx.moveTo(bx, y0 - 8);
      ctx.lineTo(bx, y0 + rh + 8);
      ctx.stroke();
      ctx.setLineDash([]);

      const label = `${angles[j] ?? 90}°`;
      ctx.font = "700 10px 'JetBrains Mono', monospace";
      const tw = ctx.measureText(label).width + 10;
      const ly = y0 - 16;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#ea580c";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx - tw / 2, ly - 9, tw, 15, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#9a3412";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, bx, ly - 1);
    }

    // Размерная линия развёртки
    const ink = "#64748b";
    const dy = y0 + rh + 22;
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, dy);
    ctx.lineTo(x0 + rw, dy);
    ctx.stroke();
    const arrow = (ax: number, ay: number, dir: number) => {
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + 7 * Math.cos(dir - 0.42), ay + 7 * Math.sin(dir - 0.42));
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + 7 * Math.cos(dir + 0.42), ay + 7 * Math.sin(dir + 0.42));
      ctx.stroke();
    };
    arrow(x0, dy, Math.PI);
    arrow(x0 + rw, dy, 0);
    ctx.font = "600 11px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`РАЗВЁРТКА ${fmt(Math.round(flat * 10) / 10)} мм`, x0 + rw / 2, dy + 14);

    // Длина изделия справа
    ctx.textAlign = "left";
    ctx.fillText(`L=${fmt(length)}`, x0 + rw + 12, y0 + rh / 2);
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.moveTo(x0 + rw + 6, y0);
    ctx.lineTo(x0 + rw + 6, y0 + rh);
    ctx.stroke();
  }, [flat, length, straights, allowances, angles, resizeTick]);

  return <canvas ref={ref} className={className} style={{ display: "block" }} />;
}
