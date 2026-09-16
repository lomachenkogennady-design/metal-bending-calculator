// Геометрическая обработка контуров: площадь, периметр, линии гиба, развёртка, вес

export interface Pt {
  x: number;
  y: number;
}
export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type PartMode = "flat" | "section";
export type Quality = "ok" | "partial" | "none";

export interface BendLine {
  /** ось, вдоль которой идет линия гиба: 'y' — линия вертикальна (const x), 'x' — горизонтальна (const y) */
  axis: "x" | "y";
  coord: number;
  from: number;
  to: number;
  span: number;
}

export interface ExtractedPart {
  loops: Pt[][];
  keptLoops: number;
  totalLoops: number;
  bb: BBox;
  widthMm: number;
  heightMm: number;
  areaMm2: number;
  outerLenMm: number;
  cutLenMm: number;
  bendLines: BendLine[];
  nBends: number;
  flatMm: number;
  partLengthMm: number;
  mode: PartMode;
  quality: Quality;
  notes: string[];
}

// ─── Базовая геометрия ───────────────────────────────────────────────────────

export function bboxOf(loops: Pt[][]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  loops.forEach((l) =>
    l.forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    })
  );
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

export function loopLength(loop: Pt[], closed = true): number {
  let s = 0;
  const n = loop.length;
  if (n < 2) return 0;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % n];
    s += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return s;
}

export function loopSignedArea(loop: Pt[]): number {
  let s = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Площадь детали: внешний контур минус отверстия, чьи центры лежат внутри него */
export function partArea(loops: Pt[][]): number {
  if (loops.length === 0) return 0;
  const withData = loops.map((l) => ({ l, a: Math.abs(loopSignedArea(l)), c: centroid(l) }));
  withData.sort((x, y) => y.a - x.a);
  const outer = withData[0];
  let area = outer.a;
  for (let i = 1; i < withData.length; i++) {
    if (withData[i].a < outer.a * 0.98 && pointInPolygon(withData[i].c, outer.l)) area -= withData[i].a;
  }
  return Math.max(0, area);
}

export function centroid(loop: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i], q = loop[(i + 1) % loop.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-12) {
    const n = loop.length || 1;
    return { x: loop.reduce((s, p) => s + p.x, 0) / n, y: loop.reduce((s, p) => s + p.y, 0) / n };
  }
  a *= 0.5;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/** Упрощение Рамера–Дугласа–Пекера */
export function simplify(loop: Pt[], tol: number): Pt[] {
  if (loop.length < 3 || tol <= 0) return loop;
  const keep = new Uint8Array(loop.length);
  keep[0] = keep[loop.length - 1] = 1;
  const stack: [number, number][] = [[0, loop.length - 1]];
  const perp = (p: Pt, a: Pt, b: Pt) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-18) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    if (i1 - i0 < 2) continue;
    const a = loop[i0], b = loop[i1];
    let dMax = -1, iMax = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = perp(loop[i], a, b);
      if (d > dMax) { dMax = d; iMax = i; }
    }
    if (dMax > tol && iMax > 0) {
      keep[iMax] = 1;
      stack.push([i0, iMax], [iMax, i1]);
    }
  }
  const out = loop.filter((_, i) => keep[i]);
  return out.length >= 3 ? out : loop;
}

/** Убирает размеры, штриховку, текст и прочий мусор — оставляет контуры детали */
export function filterPartLoops(loops: Pt[][]): { kept: Pt[][]; dropped: number } {
  if (!loops.length) return { kept: [], dropped: 0 };
  const sized = loops.map((l) => ({ l, a: Math.abs(loopSignedArea(l)), len: loopLength(l, false) }));
  const maxA = Math.max(...sized.map((s) => s.a), 0);
  const maxLen = Math.max(...sized.map((s) => s.len), 0);
  if (maxA <= 0 && maxLen <= 0) return { kept: loops, dropped: 0 };
  const kept = sized.filter((s) => {
    // открытые контуры-размеры: короткие относительно самого длинного
    if (s.a < maxA * 0.02 && s.len < maxLen * 0.25) return false;
    // микроскопические замкнутые контуры (буквы, маркеры)
    if (maxA > 0 && s.a < maxA * 0.004) return false;
    return true;
  }).map((s) => s.l);
  return { kept: kept.length ? kept : loops, dropped: loops.length - kept.length };
}

// ─── Поиск линий гиба ────────────────────────────────────────────────────────

export function segments(loop: Pt[]): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  for (let i = 0; i < loop.length - 1; i++) out.push([loop[i], loop[i + 1]]);
  return out;
}

/**
 * Линии гиба — длинные прямые отрезки, параллельные осям и лежащие внутри контура.
 * Возвращаются только внутренние линии (кромки контура отбрасываются).
 */
export function detectBendLines(loops: Pt[][], bb: BBox): BendLine[] {
  const w = Math.max(bb.maxX - bb.minX, 1e-6);
  const h = Math.max(bb.maxY - bb.minY, 1e-6);
  const tol = Math.max(w, h) * 0.006;
  const linTol = Math.max(w, h) * 0.002;

  interface Acc { axis: "x" | "y"; coord: number; from: number; to: number; len: number }
  const acc: Acc[] = [];

  const add = (axis: "x" | "y", coord: number, from: number, to: number) => {
    const ex = acc.find(
      (a) => a.axis === axis && Math.abs(a.coord - coord) <= linTol * 3 && !(to < a.from - tol || from > a.to + tol)
    );
    if (ex) {
      const wsum = ex.len + (to - from);
      ex.coord = (ex.coord * ex.len + coord * (to - from)) / Math.max(wsum, 1e-9);
      ex.from = Math.min(ex.from, from);
      ex.to = Math.max(ex.to, to);
      ex.len = wsum;
    } else {
      acc.push({ axis, coord, from, to, len: to - from });
    }
  };

  loops.forEach((l) =>
    segments(l).forEach(([p, q]) => {
      const dx = Math.abs(q.x - p.x);
      const dy = Math.abs(q.y - p.y);
      if (dy <= tol && dx > tol) add("x", (p.y + q.y) / 2, Math.min(p.x, q.x), Math.max(p.x, q.x));
      else if (dx <= tol && dy > tol) add("y", (p.x + q.x) / 2, Math.min(p.y, q.y), Math.max(p.y, q.y));
    })
  );

  return acc
    .map((a) => ({ axis: a.axis, coord: a.coord, from: a.from, to: a.to, span: a.to - a.from }))
    .filter((a) => {
      if (a.span < tol * 4) return false;

      if (a.axis === "y") {
        // Вертикальная линия
        if (a.coord - bb.minX < w * 0.025 || bb.maxX - a.coord < w * 0.025) return false;
        // Гиб идёт от верхнего края до нижнего
        const touchesTop = a.to >= bb.maxY - h * 0.08;
        const touchesBottom = a.from <= bb.minY + h * 0.08;
        // И покрывает почти всю высоту
        return touchesTop && touchesBottom && a.span >= h * 0.85;
      }

      // Горизонтальная линия
      if (a.coord - bb.minY < h * 0.025 || bb.maxY - a.coord < h * 0.025) return false;
      const touchesLeft = a.from <= bb.minX + w * 0.08;
      const touchesRight = a.to >= bb.maxX - w * 0.08;
      return touchesLeft && touchesRight && a.span >= w * 0.85;
    })
    .sort((a, b) => (a.axis === b.axis ? a.coord - b.coord : a.axis < b.axis ? -1 : 1));
}

// ─── Итоговая оценка детали ──────────────────────────────────────────────────

export interface EstimateOptions {
  mode: PartMode;
  /** длина изделия (вдоль оси гибов), мм — обязательна для mode='section' */
  partLength?: number;
  /** ожидаемое число гибов (переопределяет автоопределение) */
  forceLength?: boolean;
  bendsOverride?: number | null;
}

export function estimatePart(rawLoops: Pt[][], opts: EstimateOptions): ExtractedPart {
  const notes: string[] = [];
  const { kept, dropped } = filterPartLoops(rawLoops);
  if (dropped > 0) notes.push(`Отброшено ${dropped} служебных контуров (размеры/штриховка).`);

  const loops = kept.map((l) => simplify(l, 0.05));
  const bb = bboxOf(loops);
  const w = bb.maxX - bb.minX;
  const h = bb.maxY - bb.minY;
  const area = partArea(loops);
  const lens = loops.map((l) => loopLength(l, true)).sort((a, b) => b - a);
  const outerLen = lens[0] ?? 0;
  const cutLen = lens.reduce((s, v) => s + v, 0);

  if (loops.length === 0 || (w <= 0 && h <= 0)) {
    return {
      loops: [], keptLoops: 0, totalLoops: rawLoops.length, bb, widthMm: 0, heightMm: 0,
      areaMm2: 0, outerLenMm: 0, cutLenMm: 0, bendLines: [], nBends: 0, flatMm: 0,
      partLengthMm: opts.partLength ?? 1000, mode: opts.mode, quality: "none",
      notes: ["Контуры не распознаны — введите размеры вручную."],
    };
  }

  let bendLines = detectBendLines(loops, bb);
  let flat = 0;
  let partLength = 0;
  let quality: Quality = "ok";

  if (opts.mode === "flat") {
    // Плоская заготовка: линии гиба внутри контура, ось гиба — вдоль линии
    const vert = bendLines.filter((b) => b.axis === "y").length;
    const horz = bendLines.filter((b) => b.axis === "x").length;
    if (bendLines.length === 0) {
      flat = Math.max(w, h);
      partLength = Math.min(w, h);
      quality = "partial";
      notes.push("Линии гиба в контуре не найдены — развёртка принята по большему габариту, число гибов задайте вручную.");
    } else {
      // деталь вытянута вдоль оси гиба: длина изделия = протяжённость вдоль линии гиба
      if (vert >= horz) {
        flat = w;
        partLength = h;
        bendLines = bendLines.filter((b) => b.axis === "y");
      } else {
        flat = h;
        partLength = w;
        bendLines = bendLines.filter((b) => b.axis === "x");
      }
      notes.push(`Найдено линий гиба: ${bendLines.length} — развёртка ${flat.toFixed(1)} мм × ${partLength.toFixed(1)} мм.`);
    }
    // для развёртки длина измеряется по чертежу; вручную — только по явному запросу
    if (opts.forceLength && opts.partLength && opts.partLength > 0) {
      partLength = opts.partLength;
      notes.push(`Длина изделия задана вручную: ${partLength} мм вместо измеренной по чертежу.`);
    }
  } else {
    // Сечение (изометрия/вид профиля): длина средней линии контура = развёртка
    if (lens.length >= 2) {
      flat = (lens[0] + lens[1]) / 2;
      notes.push("Сечение: развёртка = длина средней линии (наружный + внутренний контур) / 2.");
    } else {
      flat = outerLen;
      quality = "partial";
      notes.push("Найден один контур — развёртка принята по его длине. Для точности нужен внутренний контур.");
    }
    partLength = opts.partLength && opts.partLength > 0 ? opts.partLength : 1000;
    bendLines = [];
  }

  const nBends = opts.bendsOverride && opts.bendsOverride > 0 ? opts.bendsOverride : bendLines.length;

  if (area <= 0) {
    quality = "partial";
    notes.push("Площадь контура не определена — вес рассчитан по габаритам.");
  }

  return {
    loops, keptLoops: loops.length, totalLoops: rawLoops.length, bb,
    widthMm: w, heightMm: h, areaMm2: area,
    outerLenMm: outerLen, cutLenMm: cutLen,
    bendLines, nBends, flatMm: flat, partLengthMm: partLength,
    mode: opts.mode, quality, notes,
  };
}

/** Вес детали, кг, из площади развёртки (мм²), толщины (мм) и плотности (кг/м³) */
export function weightFromArea(areaMm2: number, t: number, density: number): number {
  return (areaMm2 * t * 1e-9) * density;
}
/** Вес детали из сечения: площадь сечения (мм²) × длина (мм) */
export function weightFromSection(areaMm2: number, lenMm: number, density: number): number {
  return (areaMm2 * lenMm * 1e-9) * density;
}


// ─── Разделение контуров на детали (внешний + вложенные отверстия) ───

export interface DetectedPart {
  outer: Pt[];
  holes: Pt[][];
  bbox: BBox;
  area: number;
  holesArea: number;
}

/** Разбирает массив контуров на детали: внешние + их отверстия */
export function splitLoopsToParts(loops: Pt[][]): DetectedPart[] {
  if (!loops || loops.length === 0) return [];

  const sorted = loops
    .map((l, idx) => ({
      idx,
      l,
      area: Math.abs(loopSignedArea(l)),
      bbox: bboxOf([l]),
    }))
    .filter((x) => x.area > 0)
    .sort((a, b) => b.area - a.area);

  const usedAsHole = new Set<number>();
  const parts: DetectedPart[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (usedAsHole.has(i)) continue;
    const outer = sorted[i];

    const holes: Pt[][] = [];
    for (let j = i + 1; j < sorted.length; j++) {
      if (usedAsHole.has(j)) continue;
      const testPt = sorted[j].l[0];
      if (pointInPolygon(testPt, outer.l)) {
        holes.push(sorted[j].l);
        usedAsHole.add(j);
      }
    }

    const holesArea = holes.reduce((s, h) => s + Math.abs(loopSignedArea(h)), 0);
    parts.push({
      outer: outer.l,
      holes,
      bbox: outer.bbox,
      area: Math.max(0, outer.area - holesArea),
      holesArea,
    });
  }

  return parts;
}
