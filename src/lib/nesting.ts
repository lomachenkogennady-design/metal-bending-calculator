import { WORKSHOP } from "./bending";

export interface NestingPart {
  id: string;
  title: string;
  width: number;
  height: number;
  qty: number;
  /** Разрешить поворот на 90° (по умолчанию true). false — при запрете по направлению проката */
  allowRotate?: boolean;
}
export interface PlacedPart extends NestingPart {
  x: number; y: number; rot: boolean; w: number; h: number;
}
export interface SheetLayout {
  index: number; placed: PlacedPart[]; usedArea: number;
}
export interface NestingResult {
  sheets: SheetLayout[]; sheetCount: number; utilization: number;
  sheetW: number; sheetH: number; unplaced: NestingPart[];
}

interface FreeRect { x: number; y: number; w: number; h: number; }
interface Sheet { placed: PlacedPart[]; free: FreeRect[]; }

function pruneFree(free: FreeRect[]): void {
  for (let i = free.length - 1; i >= 0; i--) {
    for (let j = 0; j < free.length; j++) {
      if (i === j) continue;
      const a = free[i], b = free[j];
      if (a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) {
        free.splice(i, 1);
        break;
      }
    }
  }
}

function splitFreeAgainst(free: FreeRect[], placed: FreeRect): FreeRect[] {
  const out: FreeRect[] = [];
  for (const fr of free) {
    if (
      placed.x >= fr.x + fr.w || placed.x + placed.w <= fr.x ||
      placed.y >= fr.y + fr.h || placed.y + placed.h <= fr.y
    ) {
      out.push(fr);
      continue;
    }
    if (placed.y > fr.y) {
      out.push({ x: fr.x, y: fr.y, w: fr.w, h: placed.y - fr.y });
    }
    if (placed.y + placed.h < fr.y + fr.h) {
      out.push({ x: fr.x, y: placed.y + placed.h, w: fr.w, h: (fr.y + fr.h) - (placed.y + placed.h) });
    }
    if (placed.x > fr.x) {
      const y0 = Math.max(fr.y, placed.y);
      const y1 = Math.min(fr.y + fr.h, placed.y + placed.h);
      if (y1 > y0) out.push({ x: fr.x, y: y0, w: placed.x - fr.x, h: y1 - y0 });
    }
    if (placed.x + placed.w < fr.x + fr.w) {
      const y0 = Math.max(fr.y, placed.y);
      const y1 = Math.min(fr.y + fr.h, placed.y + placed.h);
      if (y1 > y0) out.push({ x: placed.x + placed.w, y: y0, w: (fr.x + fr.w) - (placed.x + placed.w), h: y1 - y0 });
    }
  }
  return out.filter(r => r.w > 1e-3 && r.h > 1e-3);
}

type SortFn = (a: { part: NestingPart }, b: { part: NestingPart }) => number;
type FitMode = "bssf" | "baf";

function runOnce(
  pieces: { part: NestingPart }[],
  innerW: number, innerH: number, margin: number, gap: number,
  sortFn: SortFn, fitMode: FitMode,
): { sheets: Sheet[]; sheetCount: number } {
  const sorted = [...pieces].sort(sortFn);
  const sheets: Sheet[] = [];

  for (const { part } of sorted) {
    let bestSheet = -1, bestRectIdx = -1, bestRot = false;
    let bestScore1 = Infinity, bestScore2 = Infinity;

    for (let si = 0; si < sheets.length; si++) {
      const free = sheets[si].free;
      for (let ri = 0; ri < free.length; ri++) {
        const fr = free[ri];
        const candidates: [number, number, boolean][] = [];
        if (part.width <= fr.w && part.height <= fr.h) candidates.push([part.width, part.height, false]);
        if (part.allowRotate !== false && part.height <= fr.w && part.width <= fr.h) {
          candidates.push([part.height, part.width, true]);
        }

        for (const [pw, ph, rot] of candidates) {
          const lw = fr.w - pw;
          const lh = fr.h - ph;
          let s1: number, s2: number;
          if (fitMode === "bssf") {
            s1 = Math.min(lw, lh);
            s2 = Math.max(lw, lh);
          } else {
            s1 = lw * lh;
            s2 = Math.min(lw, lh);
          }
          if (s1 < bestScore1 || (s1 === bestScore1 && s2 < bestScore2)) {
            bestSheet = si; bestRectIdx = ri; bestRot = rot;
            bestScore1 = s1; bestScore2 = s2;
          }
        }
      }
    }

    if (bestSheet === -1) {
      sheets.push({ placed: [], free: [{ x: margin, y: margin, w: innerW, h: innerH }] });
      bestSheet = sheets.length - 1;
      bestRectIdx = 0;
      bestRot = !(part.width <= innerW && part.height <= innerH);
    }

    const sheet = sheets[bestSheet];
    const fr = sheet.free[bestRectIdx];
    const pw = bestRot ? part.height : part.width;
    const ph = bestRot ? part.width : part.height;
    const px = fr.x;
    const py = fr.y;

    sheet.placed.push({ ...part, x: px, y: py, rot: bestRot, w: pw, h: ph });
    const reserved: FreeRect = { x: px, y: py, w: pw + gap, h: ph + gap };
    sheet.free = splitFreeAgainst(sheet.free, reserved);
    pruneFree(sheet.free);
  }

  return { sheets, sheetCount: sheets.length };
}

export function nestOnSheets(
  parts: NestingPart[],
  sheetW = WORKSHOP.laser.sheet.w,
  sheetH = WORKSHOP.laser.sheet.h,
  thickness = 2,       // толщина металла, мм — определяет тепловой зазор
  margin = 5,          // кромка от края листа, мм
): NestingResult {
  // Динамический зазор: тепло + врезка. 2 мм стали → 3 мм.
  const gap = Math.max(2, Math.ceil(thickness * 1.2));
  const innerW = sheetW - margin * 2;
  const innerH = sheetH - margin * 2;

  const pieces: { part: NestingPart }[] = [];
  const unplaced: NestingPart[] = [];

  for (const p of parts) {
    const fitsN = p.width <= innerW && p.height <= innerH;
    const fitsR = p.height <= innerW && p.width <= innerH;
    if (!fitsN && !fitsR) {
      if (!unplaced.find(u => u.id === p.id)) unplaced.push(p);
      continue;
    }
    for (let i = 0; i < p.qty; i++) pieces.push({ part: p });
  }

  // 6 стратегий: разные сортировки × разные критерии
  const strategies: { sort: SortFn; fit: FitMode; name: string }[] = [
    { name: "area+bssf",  sort: (a,b) => b.part.width*b.part.height - a.part.width*a.part.height, fit: "bssf" },
    { name: "area+baf",   sort: (a,b) => b.part.width*b.part.height - a.part.width*a.part.height, fit: "baf"  },
    { name: "height+bssf",sort: (a,b) => b.part.height - a.part.height || b.part.width - a.part.width, fit: "bssf" },
    { name: "height+baf", sort: (a,b) => b.part.height - a.part.height || b.part.width - a.part.width, fit: "baf"  },
    { name: "width+bssf", sort: (a,b) => b.part.width - a.part.width || b.part.height - a.part.height, fit: "bssf" },
    { name: "maxside+baf",sort: (a,b) => Math.max(b.part.width,b.part.height) - Math.max(a.part.width,a.part.height), fit: "baf" },
  ];

  let best: { sheets: Sheet[]; sheetCount: number; utilization: number } | null = null;

  for (const s of strategies) {
    const r = runOnce(pieces, innerW, innerH, margin, gap, s.sort, s.fit);
    const usedArea = r.sheets.reduce((sum, sh) => sum + sh.placed.reduce((s2, p) => s2 + p.w * p.h, 0), 0);
    const totalArea = r.sheetCount * sheetW * sheetH;
    const util = totalArea > 0 ? usedArea / totalArea : 0;
    if (!best || r.sheetCount < best.sheetCount || (r.sheetCount === best.sheetCount && util > best.utilization)) {
      best = { sheets: r.sheets, sheetCount: r.sheetCount, utilization: util };
    }
  }

  const resultSheets: SheetLayout[] = (best?.sheets ?? []).map((sh, i) => ({
    index: i + 1,
    placed: sh.placed,
    usedArea: sh.placed.reduce((s, p) => s + p.w * p.h, 0),
  }));

  return {
    sheets: resultSheets,
    sheetCount: resultSheets.length,
    utilization: best?.utilization ?? 0,
    sheetW, sheetH, unplaced,
  };
}
