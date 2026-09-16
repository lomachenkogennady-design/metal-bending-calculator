// Геометрический анализ растра (скан чертежа / страница PDF как картинка)

import { bboxOf, type BBox, type Pt } from "./extract";

export interface RasterAnalysis {
  /** контур детали в пикселях */
  contour: Pt[];
  bboxPx: BBox;
  /** площадь замкнутого контура в px² (внутренность + линии) */
  areaPx: number;
  /** доля площади bbox, занятая деталью */
  fillRatio: number;
  widthPx: number;
  heightPx: number;
  pageW: number;
  pageH: number;
  closed: boolean;
  /** маска «внутренности» для наложения поверх превью */
  mask: HTMLCanvasElement | null;
  inkRatio: number;
}

/** Порог Отсу */
function otsu(hist: number[], total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

export function analyzeRaster(img: ImageData): RasterAnalysis {
  const { width: W, height: H, data } = img;
  const N = W * H;
  const gray = new Uint8Array(N);
  const hist = new Float64Array(256);
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    const a = data[o + 3];
    // прозрачный фон считаем белым
    const v = a < 8 ? 255 : (data[o] * 299 + data[o + 1] * 587 + data[o + 2] * 114) / 1000;
    const g = v | 0;
    gray[i] = g;
    hist[g]++;
  }
  const thr = otsu(Array.from(hist), N);
  const ink = new Uint8Array(N);
  let inkCount = 0;
  for (let i = 0; i < N; i++) {
    if (gray[i] < Math.min(230, thr + 6)) { ink[i] = 1; inkCount++; }
  }
  // если «чернил» больше половины — инвертируем (тёмный фон)
  if (inkCount > N * 0.5) {
    inkCount = 0;
    for (let i = 0; i < N; i++) { ink[i] = ink[i] ? 0 : 1; inkCount += ink[i]; }
  }
  const inkRatio = inkCount / N;

  // Заливка фона от краёв: всё, что достижимо вне «чернил» — снаружи
  const outside = new Uint8Array(N);
  const stack: number[] = [];
  const push = (i: number) => {
    if (i >= 0 && i < N && !outside[i] && !ink[i]) { outside[i] = 1; stack.push(i); }
  };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % W;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (i >= W) push(i - W);
    if (i < N - W) push(i + W);
  }

  // Внутренность = не снаружи и не чернила. Считаем и площадь, и маску.
  const insideMask = new Uint8Array(N);
  let insideCount = 0;
  let inkInside = 0;
  for (let i = 0; i < N; i++) {
    if (!outside[i] && !ink[i]) { insideMask[i] = 1; insideCount++; }
  }
  for (let i = 0; i < N; i++) if (ink[i] && !outside[i]) inkInside++;

  // Габарит по «значимым» пикселям (внутренность + чернила), убираем поля листа
  const sig = (i: number) => insideMask[i] || ink[i];
  const colCount = new Int32Array(W);
  const rowCount = new Int32Array(H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (sig(y * W + x)) { colCount[x]++; rowCount[y]++; }
    }
  }
  const span = (counts: Int32Array) => {
    let max = 0;
    for (let i = 0; i < counts.length; i++) if (counts[i] > max) max = counts[i];
    const lim = Math.max(1, max * 0.06);
    let a = -1, b = -1;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] > lim) { if (a < 0) a = i; b = i; }
    }
    return a < 0 ? [0, counts.length - 1] : [a, b];
  };
  const [x0, x1] = span(colCount);
  const [y0, y1] = span(rowCount);
  const bw = Math.max(1, x1 - x0 + 1);
  const bh = Math.max(1, y1 - y0 + 1);

  // Площадь внутри габарита
  let areaPx = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (insideMask[i] || ink[i]) areaPx++;
    }
  }
  const bboxArea = bw * bh;
  const fillRatio = areaPx / bboxArea;
  // Контур не замкнут (текст/разрывы) → заливка «утекла», берём габарит с коэффициентом
  const closed = fillRatio >= 0.18;
  if (!closed) areaPx = bboxArea * 0.82;

  // Маска для наложения
  let mask: HTMLCanvasElement | null = null;
  try {
    mask = document.createElement("canvas");
    mask.width = W;
    mask.height = H;
    const mctx = mask.getContext("2d")!;
    const out = mctx.createImageData(W, H);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (insideMask[i] || ink[i]) {
          const o = i * 4;
          out.data[o] = 234;
          out.data[o + 1] = 88;
          out.data[o + 2] = 12;
          out.data[o + 3] = 110;
        }
      }
    }
    mctx.putImageData(out, 0, 0);
  } catch {
    mask = null;
  }

  // Контур: обход граничных пикселей (Moore-neighbor) от верхней левой точки
  const contour = traceContour(ink, insideMask, W, H, x0, y0, x1, y1);
  const bb = contour.length >= 8 ? bboxOf([contour]) : bboxOf([[{ x: x0, y: y0 }, { x: x1, y: y1 }]]);

  return {
    contour, bboxPx: bb, areaPx, fillRatio,
    widthPx: bw, heightPx: bh, pageW: W, pageH: H, closed, mask, inkRatio,
  };
}

/** Трассировка внешнего контура связной области (чернила ∪ внутренность) */
function traceContour(ink: Uint8Array, inside: Uint8Array, W: number, H: number, x0: number, y0: number, x1: number, y1: number): Pt[] {
  const solid = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const i = y * W + x;
    return !!(ink[i] || inside[i]);
  };
  // стартовая точка — верхний левый «твёрдый» пиксель
  let sx = -1, sy = -1;
  outer: for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (solid(x, y) && !solid(x, y - 1) && !solid(x - 1, y)) { sx = x; sy = y; break outer; }
    }
  }
  if (sx < 0) return [];

  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const pts: Pt[] = [];
  let cx = sx, cy = sy, dir = 0;
  const maxSteps = (x1 - x0 + 1) * 4 + (y1 - y0 + 1) * 4 + 4000;
  for (let step = 0; step < maxSteps; step++) {
    pts.push({ x: cx, y: cy });
    let found = false;
    for (let k = 0; k < 8; k++) {
      const nd = (dir + 6 + k) % 8; // старт с поворота назад
      const nx = cx + dirs[nd][0];
      const ny = cy + dirs[nd][1];
      if (solid(nx, ny)) {
        cx = nx; cy = ny; dir = nd;
        found = true;
        break;
      }
    }
    if (!found) break;
    if (cx === sx && cy === sy) break;
  }
  // прореживание контура
  const step = Math.max(1, Math.round(pts.length / 900));
  return pts.filter((_, i) => i % step === 0);
}
