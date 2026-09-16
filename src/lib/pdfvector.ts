// Извлечение векторной геометрии из PDF через operator list (pdf.js)

import * as pdfjsLib from "pdfjs-dist";
import { OPS } from "pdfjs-dist";
import { simplify, type Pt } from "./extract";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfVectorPage {
  page: number;
  total: number;
  loops: Pt[][];
  widthPt: number;
  heightPt: number;
  pathCount: number;
}

type M = [number, number, number, number, number, number];
const idM = (): M => [1, 0, 0, 1, 0, 0];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: M, x: number, y: number): Pt => ({
  x: m[0] * x + m[2] * y + m[4],
  y: m[1] * x + m[3] * y + m[5],
});

const bezier = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 12): Pt[] => {
  const out: Pt[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push({
      x: u ** 3 * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * p3.x,
      y: u ** 3 * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * p3.y,
    });
  }
  return out;
};

/** Разбор одного constructPath в список подконтуров (в координатах страницы) */
function parseConstructPath(args: any[], ctm: M): Pt[][] {
  let ops: number[] | null = null;
  let coords: number[] = [];

  if (Array.isArray(args[0]) && (Array.isArray(args[1]) || args[1] instanceof Float32Array)) {
    ops = args[0] as number[];
    coords = Array.from(args[1] as ArrayLike<number>);
  } else if (Array.isArray(args[0]) && args.length === 1) {
    ops = args[0] as number[];
    coords = [];
  } else {
    // старый формат: плоский список [op, x, y, op, x, y, ...]
    ops = [];
    coords = [];
    for (const v of args) (typeof v === "number" ? coords : ops).push(v as any);
    // эвристика не удалась
    if (ops.length === 0) return [];
  }

  const subpaths: Pt[][] = [];
  let cur: Pt[] = [];
  let start: Pt | null = null;
  let cx = 0, cy = 0;
  let ci = 0;
  const next = (k: number) => {
    const v = coords.slice(ci, ci + k).map(Number);
    ci += k;
    return v;
  };

  const flush = () => {
    if (cur.length >= 2) subpaths.push(cur);
    cur = [];
  };

  const opList = ops ?? [];
  for (const op of opList) {
    switch (op) {
      case OPS.moveTo: {
        flush();
        const [x, y] = next(2);
        const p = apply(ctm, x, y);
        cur = [p];
        start = p;
        cx = x; cy = y;
        break;
      }
      case OPS.lineTo: {
        const [x, y] = next(2);
        const p = apply(ctm, x, y);
        if (cur.length === 0) cur = [apply(ctm, cx, cy)];
        cur.push(p);
        cx = x; cy = y;
        break;
      }
      case OPS.curveTo: {
        const [x1, y1, x2, y2, x3, y3] = next(6);
        const p0 = apply(ctm, cx, cy);
        const a = apply(ctm, x1, y1), b = apply(ctm, x2, y2), c = apply(ctm, x3, y3);
        if (cur.length === 0) cur = [p0];
        cur.push(...bezier(p0, a, b, c));
        cx = x3; cy = y3;
        break;
      }
      case OPS.curveTo2: {
        const [x2, y2, x3, y3] = next(4);
        const p0 = apply(ctm, cx, cy);
        const b = apply(ctm, x2, y2), c = apply(ctm, x3, y3);
        if (cur.length === 0) cur = [p0];
        cur.push(...bezier(p0, p0, b, c));
        cx = x3; cy = y3;
        break;
      }
      case OPS.curveTo3: {
        const [x1, y1, x3, y3] = next(4);
        const p0 = apply(ctm, cx, cy);
        const a = apply(ctm, x1, y1), c = apply(ctm, x3, y3);
        if (cur.length === 0) cur = [p0];
        cur.push(...bezier(p0, a, c, c));
        cx = x3; cy = y3;
        break;
      }
      case OPS.rectangle: {
        const [x, y, w, h] = next(4);
        flush();
        cur = [apply(ctm, x, y), apply(ctm, x + w, y), apply(ctm, x + w, y + h), apply(ctm, x, y + h)];
        start = cur[0];
        flush();
        cx = x; cy = y;
        break;
      }
      case OPS.closePath: {
        if (start && cur.length >= 2) cur.push(start);
        break;
      }
      case OPS.endPath:
        flush();
        break;
      default:
        break;
    }
  }
  flush();
  return subpaths;
}

/** Извлекает все векторные контуры со страниц PDF */
export async function extractPdfVector(
  data: ArrayBuffer,
  maxPages = 2
): Promise<PdfVectorPage[]> {
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const total = doc.numPages;
  const n = Math.min(total, maxPages);
  const out: PdfVectorPage[] = [];

  for (let p = 1; p <= n; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    let loops: Pt[][] = [];
    let pathCount = 0;
    try {
      const ol = await page.getOperatorList();
      let ctm = idM();
      const stack: M[] = [];
      for (let i = 0; i < ol.fnArray.length; i++) {
        const fn = ol.fnArray[i];
        const args = ol.argsArray[i];
        if (fn === OPS.save) { stack.push(ctm); }
        else if (fn === OPS.restore) { ctm = stack.pop() ?? idM(); }
        else if (fn === OPS.transform) { ctm = mul(ctm, args as unknown as M); }
        else if (fn === OPS.constructPath) {
          const sp = parseConstructPath(args, ctm);
          if (sp.length) {
            pathCount++;
            loops.push(...sp);
          }
        }
      }
    } catch {
      loops = [];
    }
    // у мягких сглаженных контуров слишком много точек — упрощаем
    loops = loops.map((l) => simplify(l, Math.max(viewport.width, viewport.height) * 0.0008));
    out.push({ page: p, total, loops, widthPt: viewport.width, heightPt: viewport.height, pathCount });
    page.cleanup();
  }

  try {
    await doc.destroy();
  } catch {
    /* noop */
  }
  return out;
}

/** Растровый рендер страницы PDF (для сканов и как запасной вариант) */
export async function renderPdfPageImageData(
  data: ArrayBuffer,
  pageIndex: number,
  targetWidth = 1100
): Promise<{ imageData: ImageData; preview: HTMLCanvasElement; total: number }> {
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const page = await doc.getPage(Math.min(Math.max(1, pageIndex), doc.numPages));
  const v1 = page.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = (targetWidth / v1.width) * dpr;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport } as any).promise;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const total = doc.numPages;
  page.cleanup();
  try {
    await doc.destroy();
  } catch {
    /* noop */
  }
  return { imageData, preview: canvas, total };
}

export const PT_TO_MM = 25.4 / 72;
