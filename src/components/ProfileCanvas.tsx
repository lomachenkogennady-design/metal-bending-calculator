import { useEffect, useRef, useState } from "react";
import type { ProfileGeometry, Pt } from "../lib/geometry";

interface Props {
  geom: ProfileGeometry;
  angles: number[];
  className?: string;
}

export default function ProfileCanvas({ geom, angles, className }: Props) {
  if (!geom) return null;
  const ref = useRef<HTMLCanvasElement>(null);
  const [resizeTick, setResizeTick] = useState(0);

  useEffect(() => {
    const onR = () => setResizeTick((t) => t + 1);
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;

    // Реальные размеры видимой области canvas (без padding родителя)
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

    const { polygon, moldPoints, thickness, radius } = geom;
    if (!polygon || polygon.length === 0) return;

    // Пересчёт bbox по фактическому полигону — надёжнее, чем geom.bbox
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of polygon) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    if (!isFinite(minX)) return;
    const bw = maxX - minX || 1;
    const bh = maxY - minY || 1;

    // Отступы: слева/справа — под размерные линии, сверху — под ярлыки, снизу — под размер
    const padL = 64, padR = 64, padT = 56, padB = 64;
    const availW = Math.max(40, W - padL - padR);
    const availH = Math.max(40, H - padT - padB);
    const scale = Math.min(availW / bw, availH / bh);

    // Центрируем ЦЕНТР bbox в ЦЕНТР доступной области (с учётом паддингов)
    const dataCX = (minX + maxX) / 2;
    const dataCY = (minY + maxY) / 2;
    const centerX = padL + availW / 2;
    const centerY = padT + availH / 2;
    const P = (p: Pt): [number, number] => [
      centerX + (p.x - dataCX) * scale,
      centerY - (p.y - dataCY) * scale,
    ];

    // Контур материала
    ctx.beginPath();
    polygon.forEach((p, i) => {
      const [x, y] = P(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#dbe4f0");
    grad.addColorStop(1, "#c3cfe0");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Диагональная штриховка внутри контура
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "rgba(51,65,85,0.14)";
    ctx.lineWidth = 1;
    for (let x = -H; x < W + H; x += 9) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + H, H);
      ctx.stroke();
    }
    ctx.restore();

    const ink = "#64748b";
    const mono = "600 11px 'JetBrains Mono', monospace";

    const arrow = (ax: number, ay: number, dir: number) => {
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + 7 * Math.cos(dir - 0.42), ay + 7 * Math.sin(dir - 0.42));
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + 7 * Math.cos(dir + 0.42), ay + 7 * Math.sin(dir + 0.42));
      ctx.stroke();
    };



    // Размер каждой полки — между соседними moldPoints
    const [pcx, pcy] = P({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });

    if (moldPoints && moldPoints.length >= 2) {
      for (let i = 0; i < moldPoints.length - 1; i++) {
        const a = moldPoints[i];
        const b = moldPoints[i + 1];
        const segLen = Math.hypot(b.x - a.x, b.y - a.y);
        if (segLen < 0.5) continue;

        const [ax, ay] = P(a);
        const [bx, by] = P(b);
        const dxs = bx - ax;
        const dys = by - ay;
        const slen = Math.hypot(dxs, dys);
        if (slen < 1) continue;

        // Нормаль к сегменту (в экранных координатах)
        let nx = -dys / slen;
        let ny = dxs / slen;

        // Разворачиваем нормаль наружу от центра полигона
        const midX = (ax + bx) / 2;
        const midY = (ay + by) / 2;
        if ((midX - pcx) * nx + (midY - pcy) * ny < 0) {
          nx = -nx;
          ny = -ny;
        }

        const offset = 22;
        const ox1 = ax + nx * offset;
        const oy1 = ay + ny * offset;
        const ox2 = bx + nx * offset;
        const oy2 = by + ny * offset;

        ctx.strokeStyle = ink;
        ctx.fillStyle = ink;
        ctx.lineWidth = 1;

        // выносные + размерная линия
        ctx.beginPath();
        ctx.moveTo(ax + nx * 4, ay + ny * 4);
        ctx.lineTo(ox1 + nx * 4, oy1 + ny * 4);
        ctx.moveTo(bx + nx * 4, by + ny * 4);
        ctx.lineTo(ox2 + nx * 4, oy2 + ny * 4);
        ctx.moveTo(ox1, oy1);
        ctx.lineTo(ox2, oy2);
        ctx.stroke();

        const ang = Math.atan2(oy2 - oy1, ox2 - ox1);
        arrow(ox1, oy1, ang);
        arrow(ox2, oy2, ang + Math.PI);

        // подпись размера
        const labelX = (ox1 + ox2) / 2 + nx * 10;
        const labelY = (oy1 + oy2) / 2 + ny * 10;
        const label = `${segLen.toFixed(1)}`;
        ctx.font = mono;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const isVertical = Math.abs(Math.abs(ang) - Math.PI / 2) < 0.35;
        if (isVertical) {
          ctx.save();
          ctx.translate(labelX, labelY);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(label, 0, 0);
          ctx.restore();
        } else {
          ctx.fillText(label, labelX, labelY);
        }
      }
    }

    // Толщина материала — стрелка между внешним и внутренним контуром
    // Ищем две точки полигона, лежащие на одной вертикали/горизонтали и разнесённые на толщину.
    let thickDrawn = false;
    for (let i = 0; i < polygon.length && !thickDrawn; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (segLen < 0.5) continue;

      // Средняя точка сегмента — это внешняя или внутренняя кромка
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;

      // Ищем точку с другой стороны того же материала: перпендикулярно сегменту на расстоянии ≈ thickness
      const dx = (b.x - a.x) / segLen;
      const dy = (b.y - a.y) / segLen;
      const nx = -dy;
      const ny = dx;

      // Ищем точку полигона, близкую к (mx + n*t) или (mx - n*t)
      for (const q of polygon) {
        const dpx = q.x - mx;
        const dpy = q.y - my;
        const dist = Math.hypot(dpx, dpy);
        if (dist < thickness * 0.6 || dist > thickness * 1.5) continue;

        // Проверяем, что q лежит примерно по нормали
        const dot = dpx * nx + dpy * ny;
        if (Math.abs(dot - thickness) > 0.4) continue;

        // Рисуем размерную стрелку между (mx,my) и q
        const [cx, cy] = P({ x: mx, y: my });
        const [qx, qy] = P(q);

        ctx.strokeStyle = "#0f172a";
        ctx.fillStyle = "#0f172a";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(qx, qy);
        ctx.stroke();

        // Стрелки на обоих концах
        const ang = Math.atan2(qy - cy, qx - cx);
        const arrowShrink = 6;
        const ax1 = cx + arrowShrink * Math.cos(ang);
        const ay1 = cy + arrowShrink * Math.sin(ang);
        const ax2 = qx - arrowShrink * Math.cos(ang);
        const ay2 = qy - arrowShrink * Math.sin(ang);
        arrow(ax1, ay1, ang + Math.PI);
        arrow(ax2, ay2, ang);

        // Подпись "t=2" рядом
        const labelX = (cx + qx) / 2 + Math.cos(ang + Math.PI / 2) * 14;
        const labelY = (cy + qy) / 2 + Math.sin(ang + Math.PI / 2) * 14;
        ctx.font = "700 11px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Фон под подписью
        const label = `t=${thickness}`;
        const tw = ctx.measureText(label).width + 8;
        ctx.fillStyle = "#fff";
        ctx.fillRect(labelX - tw / 2, labelY - 8, tw, 16);
        ctx.fillStyle = "#0f172a";
        ctx.fillText(label, labelX, labelY);

        thickDrawn = true;
        break;
      }
    }

    // Радиус гиба — на КАЖДОМ гибе (все внутренние moldPoints)
    if (moldPoints && moldPoints.length > 2) {
      const label = `R${radius} · t${thickness}`;
      ctx.font = mono;

      // рисуем по всем внутренним точкам (между началом и концом)
      for (let i = 1; i < moldPoints.length - 1; i++) {
        const pt = moldPoints[i];
        const [rx, ry] = P(pt);

        // точка
        ctx.strokeStyle = "#b45309";
        ctx.fillStyle = "#ffffff";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // подпись со смещением наружу от центра полигона
        const [ccx, ccy] = P({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
        const dxl = rx - ccx;
        const dyl = ry - ccy;
        const dlen = Math.hypot(dxl, dyl) || 1;
        const offX = (dxl / dlen) * 24;
        const offY = (dyl / dlen) * 24;

        ctx.fillStyle = "#b45309";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(label, rx + offX, ry + offY);
      }
    }
  }, [geom, angles, resizeTick]);

  return <canvas ref={ref} className={className} style={{ display: "block" }} />;
}
