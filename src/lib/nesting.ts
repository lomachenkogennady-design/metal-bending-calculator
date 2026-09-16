import { WORKSHOP } from "./bending";

export interface NestingPart {
  id: string;
  title: string;
  width: number;
  height: number;
  qty: number;
}

export interface PlacedPart extends NestingPart {
  x: number;
  y: number;
  rot: boolean;
  w: number;
  h: number;
}

export interface SheetLayout {
  index: number;
  placed: PlacedPart[];
  usedArea: number;
}

export interface NestingResult {
  sheets: SheetLayout[];
  sheetCount: number;
  utilization: number;
  sheetW: number;
  sheetH: number;
  unplaced: NestingPart[];
}

interface FreeRect { x: number; y: number; w: number; h: number; }

function pruneFree(free: FreeRect[]): void {
  for (let i = free.length - 1; i >= 0; i--) {
    for (let j = 0; j < free.length; j++) {
      if (i === j) continue;
      const a = free[i], b = free[j];
      if (
        a.x >= b.x && a.y >= b.y &&
        a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h
      ) {
        free.splice(i, 1);
        break;
      }
    }
  }
}

/** MaxRects-BSSF (Best Short Side Fit) с поддержкой поворота на 90° */
export function nestOnSheets(
  parts: NestingPart[],
  sheetW = WORKSHOP.laser.sheet.w,
  sheetH = WORKSHOP.laser.sheet.h,
): NestingResult {
  const pieces: { part: NestingPart }[] = [];
  const unplaced: NestingPart[] = [];

  for (const p of parts) {
    const fitsN = p.width <= sheetW && p.height <= sheetH;
    const fitsR = p.height <= sheetW && p.width <= sheetH;
    if (!fitsN && !fitsR) {
      if (!unplaced.find((u) => u.id === p.id)) unplaced.push(p);
      continue;
    }
    for (let i = 0; i < p.qty; i++) pieces.push({ part: p });
  }

  // Сортировка по площади (убывание) — для лучшей упаковки
  pieces.sort((a, b) => {
    const sa = a.part.width * a.part.height;
    const sb = b.part.width * b.part.height;
    return sb - sa;
  });

  const sheets: { placed: PlacedPart[]; free: FreeRect[] }[] = [];

  for (const { part } of pieces) {
    let bestSheet = -1, bestRectIdx = -1, bestRot = false;
    let bestShort = Infinity, bestLong = Infinity;

    for (let si = 0; si < sheets.length; si++) {
      const free = sheets[si].free;
      for (let ri = 0; ri < free.length; ri++) {
        const fr = free[ri];
        // Без поворота
        if (part.width <= fr.w && part.height <= fr.h) {
          const lw = fr.w - part.width, lh = fr.h - part.height;
          const short = Math.min(lw, lh), long = Math.max(lw, lh);
          if (short < bestShort || (short === bestShort && long < bestLong)) {
            bestSheet = si; bestRectIdx = ri; bestRot = false;
            bestShort = short; bestLong = long;
          }
        }
        // С поворотом
        if (part.height <= fr.w && part.width <= fr.h) {
          const lw = fr.w - part.height, lh = fr.h - part.width;
          const short = Math.min(lw, lh), long = Math.max(lw, lh);
          if (short < bestShort || (short === bestShort && long < bestLong)) {
            bestSheet = si; bestRectIdx = ri; bestRot = true;
            bestShort = short; bestLong = long;
          }
        }
      }
    }

    // Новый лист
    if (bestSheet === -1) {
      sheets.push({ placed: [], free: [{ x: 0, y: 0, w: sheetW, h: sheetH }] });
      bestSheet = sheets.length - 1;
      bestRectIdx = 0;
      bestRot = !(part.width <= sheetW && part.height <= sheetH);
    }

    const sheet = sheets[bestSheet];
    const fr = sheet.free[bestRectIdx];
    const pw = bestRot ? part.height : part.width;
    const ph = bestRot ? part.width : part.height;
    const px = fr.x, py = fr.y;

    sheet.placed.push({ ...part, x: px, y: py, rot: bestRot, w: pw, h: ph });

    // Split Heuristic: заменяем используемый free rect на 4 новых
    const newFree: FreeRect[] = [];
    if (px + pw < fr.x + fr.w) newFree.push({ x: px + pw, y: fr.y, w: fr.x + fr.w - (px + pw), h: fr.h });
    if (py + ph < fr.y + fr.h) newFree.push({ x: fr.x, y: py + ph, w: fr.w, h: fr.y + fr.h - (py + ph) });
    if (px > fr.x)             newFree.push({ x: fr.x, y: fr.y, w: px - fr.x, h: fr.h });
    if (py > fr.y)             newFree.push({ x: fr.x, y: fr.y, w: fr.w, h: py - fr.y });

    sheet.free.splice(bestRectIdx, 1);
    sheet.free.push(...newFree);
    pruneFree(sheet.free);
  }

  const resultSheets: SheetLayout[] = sheets.map((sh, i) => ({
    index: i + 1,
    placed: sh.placed,
    usedArea: sh.placed.reduce((s, p) => s + p.w * p.h, 0),
  }));

  const totalArea = resultSheets.length * sheetW * sheetH;
  const usedArea = resultSheets.reduce((s, sh) => s + sh.usedArea, 0);

  return {
    sheets: resultSheets,
    sheetCount: resultSheets.length,
    utilization: totalArea > 0 ? usedArea / totalArea : 0,
    sheetW, sheetH, unplaced,
  };
}
