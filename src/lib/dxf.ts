// @ts-ignore — у пакета нет типов
import DxfParser from "dxf-parser";

export interface Polyline {
  pts: [number, number][];
  color?: string;
  dashed?: boolean;
}
export interface DxfDrawing {
  polylines: Polyline[];
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  entityCount: number;
}

const ACI: Record<number, string> = {
  1: "#e11d48", 2: "#facc15", 3: "#22c55e", 4: "#06b6d4", 5: "#3b82f6",
  6: "#ec4899", 7: "#334155", 8: "#64748b", 9: "#cbd5e1",
};

export function parseDxf(text: string): DxfDrawing {
  const ParserCtor: any = (DxfParser as any)?.default ?? DxfParser;
  const parser = new ParserCtor();
  const dxf: any = parser.parseSync(text);

  // Защита от битого/пустого DXF
  if (!dxf || !dxf.entities) {
    return {
      polylines: [],
      bbox: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      entityCount: 0,
    };
  }

  // Единицы из HEADER: 1=inch, 2=feet, 4=mm, 5=cm, 6=m
  const insUnits = dxf.header?.["$INSUNITS"] ?? 4;
  const unitScale =
    insUnits === 1 ? 25.4 :
    insUnits === 2 ? 304.8 :
    insUnits === 5 ? 10 :
    insUnits === 6 ? 1000 :
    1;

  const polylines: Polyline[] = [];
  let count = 0;

  const colorOf = (e: { color?: number }): string | undefined =>
    e.color && ACI[e.color] ? ACI[e.color] : undefined;

  const pushPoly = (pts: [number, number][], color?: string, closed = false, dashed = false) => {
    if (pts.length < 2) return;
    polylines.push({ pts: closed ? [...pts, pts[0]] : pts, color, dashed });
  };

  const handleEntity = (e: any, tf: (p: [number, number]) => [number, number]) => {
    if (!e) return;
    count++;
    const c = colorOf(e);
    switch (e.type) {
      case "LINE": {
        const a = tf([e.vertices[0].x, e.vertices[0].y]);
        const b = tf([e.vertices[1].x, e.vertices[1].y]);
        pushPoly([a, b], c);
        break;
      }
      case "LWPOLYLINE":
      case "POLYLINE": {
        const verts: any[] = e.vertices ?? [];
        const expanded: [number, number][] = [];

        for (let i = 0; i < verts.length; i++) {
          const v = verts[i];
          expanded.push(tf([v.x, v.y]));

          // bulge — тангенс четверти угла дуги до следующей вершины
          const bulge = v.bulge ?? 0;
          const next = verts[(i + 1) % verts.length];
          if (Math.abs(bulge) > 1e-6 && next) {
            const x1 = v.x, y1 = v.y, x2 = next.x, y2 = next.y;
            const theta = 4 * Math.atan(bulge);
            const dx = x2 - x1, dy = y2 - y1;
            const chord = Math.hypot(dx, dy);
            if (chord > 1e-9) {
              const radius = chord / (2 * Math.sin(Math.abs(theta) / 2));
              const nx = -dy / chord, ny = dx / chord;
              const h = radius * Math.cos(theta / 2);
              const sign = bulge > 0 ? 1 : -1;
              const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
              const cx = mx + sign * nx * h;
              const cy = my + sign * ny * h;
              const a1 = Math.atan2(y1 - cy, x1 - cx);
              const a2 = Math.atan2(y2 - cy, x2 - cx);
              let sweep = a2 - a1;
              if (bulge > 0 && sweep < 0) sweep += Math.PI * 2;
              if (bulge < 0 && sweep > 0) sweep -= Math.PI * 2;
              const segs = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI / 18)));
              for (let k = 1; k < segs; k++) {
                const a = a1 + sweep * (k / segs);
                expanded.push(tf([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]));
              }
            }
          }
        }

        pushPoly(expanded, c, !!e.shape || !!e.closed);
        break;
      }
      case "CIRCLE": {
        const pts: [number, number][] = [];
        for (let i = 0; i <= 72; i++) {
          const a = (i / 72) * Math.PI * 2;
          pts.push(tf([e.center.x + e.radius * Math.cos(a), e.center.y + e.radius * Math.sin(a)]));
        }
        pushPoly(pts, c);
        break;
      }
      case "ARC": {
        const pts: [number, number][] = [];
        const a0 = (e.startAngle * Math.PI) / 180;
        const a1 = (e.endAngle * Math.PI) / 180;
        let sweep = a1 - a0;
        if (sweep <= 0) sweep += Math.PI * 2;
        const n = Math.max(8, Math.ceil((sweep / (Math.PI * 2)) * 72));
        for (let i = 0; i <= n; i++) {
          const a = a0 + sweep * (i / n);
          pts.push(tf([e.center.x + e.radius * Math.cos(a), e.center.y + e.radius * Math.sin(a)]));
        }
        pushPoly(pts, c);
        break;
      }
      case "ELLIPSE": {
        const center = e.center;
        const major = e.majorAxisEndPoint ?? e.majorAxis;
        if (!center || !major) break;
        const mx = major.x ?? major[0];
        const my = major.y ?? major[1];
        const majLen = Math.hypot(mx, my);
        const minLen = majLen * (e.axisRatio ?? 1);
        const angle = Math.atan2(my, mx);
        const start = e.startAngle ?? 0;
        const end = e.endAngle ?? Math.PI * 2;
        const pts: [number, number][] = [];
        const n = 72;
        for (let i = 0; i <= n; i++) {
          const t = start + (end - start) * (i / n);
          const ex = majLen * Math.cos(t);
          const ey = minLen * Math.sin(t);
          const rx = ex * Math.cos(angle) - ey * Math.sin(angle);
          const ry = ex * Math.sin(angle) + ey * Math.cos(angle);
          pts.push(tf([center.x + rx, center.y + ry]));
        }
        pushPoly(pts, c);
        break;
      }
      case "SPLINE": {
        const cps = e.controlPoints ?? e.fitPoints ?? [];
        if (cps.length >= 2) {
          const pts = cps.map((p: any) => tf(Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y]));
          pushPoly(pts, c, false, true);
        }
        break;
      }
      case "INSERT": {
        const block = dxf.blocks?.[e.name];
        if (!block?.entities) break;
        const ix = e.position?.x ?? 0;
        const iy = e.position?.y ?? 0;
        const rot = ((e.rotation ?? 0) * Math.PI) / 180;
        const sx = e.scale?.x ?? 1;
        const sy = e.scale?.y ?? 1;
        const inner = (p: [number, number]): [number, number] => {
          const x = p[0] * sx;
          const y = p[1] * sy;
          const rx = x * Math.cos(rot) - y * Math.sin(rot);
          const ry = x * Math.sin(rot) + y * Math.cos(rot);
          return tf([rx + ix, ry + iy]);
        };
        block.entities.forEach((be: any) => handleEntity(be, inner));
        break;
      }
    }
  };

  // Применяем масштаб единиц измерения к координатам
  const applyUnits = (p: [number, number]): [number, number] =>
    [p[0] * unitScale, p[1] * unitScale];

  (dxf.entities ?? []).forEach((e: any) => handleEntity(e, applyUnits));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  polylines.forEach((pl) =>
    pl.pts.forEach(([x, y]) => {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    })
  );
  if (!isFinite(minX)) { minX = minY = 0; maxX = maxY = 100; }
  return { polylines, bbox: { minX, minY, maxX, maxY }, entityCount: count };
}

export function drawDxf(canvas: HTMLCanvasElement, drawing: DxfDrawing) {
  const parent = canvas.parentElement!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = parent.clientWidth;
  const H = parent.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const { polylines, bbox } = drawing;
  const bw = bbox.maxX - bbox.minX || 1;
  const bh = bbox.maxY - bbox.minY || 1;
  const pad = 24;
  const scale = Math.min((W - pad * 2) / bw, (H - pad * 2) / bh);
  const ox = (W - bw * scale) / 2 - bbox.minX * scale;
  const oy = (H + bh * scale) / 2 + bbox.minY * scale;

  polylines.forEach((pl) => {
    ctx.strokeStyle = pl.color ?? "#334155";
    ctx.lineWidth = 1.1;
    if (pl.dashed) ctx.setLineDash([6, 4]);
    ctx.beginPath();
    pl.pts.forEach(([x, y], i) => {
      const px = ox + x * scale;
      const py = oy - y * scale;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  });
}
