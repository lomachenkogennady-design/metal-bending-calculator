// Сводит геометрию из DXF / PDF-вектор / растра к расчёту гибки

import { parseDxf, type Polyline } from "./dxf";
import { extractPdfVector, renderPdfPageImageData, PT_TO_MM, type PdfVectorPage } from "./pdfvector";
import { analyzeRaster, type RasterAnalysis } from "./raster";
import {
  estimatePart, loopSignedArea, bboxOf, weightFromArea, weightFromSection,
  type ExtractedPart, type PartMode, type Pt,
} from "./extract";
import { MATERIALS, VAT_RATE, WASTE_FACTOR, round1, round2, kFactor, innerRadiusFromV, calcLaserCost } from "./bending";

export type FileKind = "dxf" | "pdf" | "img";
export type GeoSource = "dxf" | "pdf-vector" | "pdf-raster" | "image" | "none";

export interface SourceFile {
  id: string;
  name: string;
  kind: FileKind;
  text?: string;
  data?: ArrayBuffer;
}

export interface FileGeom {
  fileId: string;
  name: string;
  source: GeoSource;
  page: number;
  totalPages: number;
  /** исходные единицы (мм для DXF, pt для PDF, px для растра) */
  rawLoops: Pt[][];
  unitToMm: number;
  unitName: string;
  vectorPaths: number;
  raster?: RasterAnalysis;
  previewCanvas?: HTMLCanvasElement;
  vectorPages?: PdfVectorPage[];
  /** предложений по калибровке */
  autoScale: boolean;
  warnings: string[];
}

export interface EvalParams {
  materialId: string;
  thickness: number;
  vMatrix: number;
  quantity: number;
  metalPrice: number;
  pricePerMeter: number;
  setupCost: number;
  mode: PartMode;
  partLength: number;
  /** брать длину изделия из поля ввода, а не из чертежа */
  forceLength: boolean;
  bendsOverride: number | null;
  /** Лазерная резка */
  laserEnabled?: boolean;
  laserPrice?: number;         // ₽/м (0 = авто из WORKSHOP)
  laserPierceCount?: number;   // врезок на деталь
}

export interface FileEval {
  geom: FileGeom;
  part: ExtractedPart;
  quantity: number;
  materialShort: string;
  thickness: number;
  /** масштаб: мм на единицу исходных данных */
  mmPerUnit: number;
  measuredUnits: number;
  kFactor: number;
  innerRadius: number;
  weightPiece: number;
  weightBatch: number;
  forceTon: number;
  forceKN: number;
  recommendedPress: number;
  cost: {
    metal: number; bending: number; setup: number;
    laser: number; laserLengthM: number; laserPierceCount: number;
    subtotal: number; vat: number; total: number;
  };
  perPiece: number;
  quality: "ok" | "partial" | "none";
  notes: string[];
}

// ─── Извлечение геометрии из файла ───────────────────────────────────────────

const polyToLoops = (polys: Polyline[]): Pt[][] => polys.map((p) => p.pts.map(([x, y]) => ({ x, y })));

export async function analyzeFile(file: SourceFile, pdfPage = 1): Promise<FileGeom> {
  const base: FileGeom = {
    fileId: file.id, name: file.name, source: "none", page: pdfPage, totalPages: 1,
    rawLoops: [], unitToMm: 1, unitName: "мм", vectorPaths: 0, autoScale: true, warnings: [],
  };

  if (file.kind === "dxf" && file.text) {
    try {
      const dxf = parseDxf(file.text);
      const loops = polyToLoops(dxf.polylines);
      return { ...base, source: "dxf", rawLoops: loops, unitToMm: 1, unitName: "мм", vectorPaths: dxf.entityCount };
    } catch {
      return { ...base, warnings: ["Не удалось разобрать DXF — проверьте формат файла."] };
    }
  }

  if (file.kind === "pdf" && file.data) {
    // 1) пробуем векторные пути
    try {
      const pages = await extractPdfVector(file.data.slice(0), 2);
      const target = pages.find((p) => p.page === pdfPage) ?? pages[0];
      const useful = (target?.loops ?? []).filter((l) => Math.abs(loopSignedArea(l)) > 0);
      if (target && useful.length >= 1) {
        return {
          ...base, source: "pdf-vector", rawLoops: useful, unitToMm: PT_TO_MM, unitName: "pt",
          vectorPaths: target.pathCount, totalPages: target.total, vectorPages: pages,
          autoScale: true,
        };
      }
      base.warnings.push("Векторных путей не найдено — файл распознан как скан.");
    } catch {
      base.warnings.push("Векторный разбор не удался — используется распознавание растра.");
    }
    // 2) растр
    try {
      const { imageData, preview, total } = await renderPdfPageImageData(file.data.slice(0), pdfPage, 1200);
      const raster = analyzeRaster(imageData);
      return {
        ...base, source: "pdf-raster", raster, previewCanvas: preview, totalPages: total,
        rawLoops: [raster.contour], unitToMm: 1, unitName: "px", autoScale: false,
      };
    } catch {
      return { ...base, warnings: [...base.warnings, "Не удалось открыть PDF."] };
    }
  }

  if (file.kind === "img" && file.data) {
    try {
      const blob = new Blob([file.data], { type: "image/png" });
      const url = URL.createObjectURL(blob);
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url;
      });
      const W = Math.min(1200, Math.max(400, img.width));
      const H = Math.round((img.height / img.width) * W);
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d", { willReadFrequently: true })!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      const imageData = ctx.getImageData(0, 0, W, H);
      const raster = analyzeRaster(imageData);
      URL.revokeObjectURL(url);
      return {
        ...base, source: "image", raster, previewCanvas: cv,
        rawLoops: [raster.contour], unitToMm: 1, unitName: "px", autoScale: false,
      };
    } catch {
      return { ...base, warnings: ["Не удалось прочитать изображение."] };
    }
  }

  return base;
}

/** Измеренный габарит в исходных единицах (по большей стороне) */
export function measureUnits(geom: FileGeom): number {
  const b = bboxOf(geom.rawLoops);
  return Math.max(b.maxX - b.minX, b.maxY - b.minY);
}

// ─── Расчёт по извлечённой геометрии ─────────────────────────────────────────

export function evaluateFile(geom: FileGeom, calibWidthMm: number, p: EvalParams): FileEval {
  const mat = MATERIALS.find((m) => m.id === p.materialId) ?? MATERIALS[0];
  const notes: string[] = [...geom.warnings];
  const t = Math.max(0.2, p.thickness);
  const V = Math.max(2, p.vMatrix);
  const R = innerRadiusFromV(V);
  const K = kFactor(R, t);

  // масштаб: мм на единицу
  const bbUnits = bboxOf(geom.rawLoops);
  const measuredUnits = Math.max(bbUnits.maxX - bbUnits.minX, bbUnits.maxY - bbUnits.minY);
  let mmPerUnit = geom.unitToMm;
  let quality: FileEval["quality"] = "ok";

  if (geom.source === "pdf-raster" || geom.source === "image") {
    if (calibWidthMm > 0 && measuredUnits > 0) {
      mmPerUnit = calibWidthMm / measuredUnits;
      notes.push(`Калибровка: ${measuredUnits.toFixed(0)} px → ${calibWidthMm} мм (1 px = ${mmPerUnit.toFixed(4)} мм).`);
    } else {
      mmPerUnit = 0.25;
      quality = "partial";
      notes.push("Масштаб не задан — принят условно 1 px = 0,25 мм. Укажите реальный габарит детали.");
    }
    if (geom.raster && !geom.raster.closed) {
      quality = "partial";
      notes.push("Контур на скане не замкнут — площадь определена по габариту с коэффициентом 0,82.");
    }
  } else {
    if (calibWidthMm > 0 && measuredUnits > 0) {
      const natural = measuredUnits * mmPerUnit;
      if (Math.abs(natural - calibWidthMm) > 0.02 * Math.max(natural, calibWidthMm)) {
        mmPerUnit = calibWidthMm / measuredUnits;
        notes.push(`Калибровка масштаба: 1 ${geom.unitName} = ${mmPerUnit.toFixed(4)} мм (было 1:${(1 / mmPerUnit).toFixed(2)}).`);
      }
    }
  }

  const part = estimatePart(geom.rawLoops, {
    mode: p.mode,
    partLength: p.partLength,
    forceLength: p.forceLength === true,
    bendsOverride: p.bendsOverride,
  });
  const loopsMm = part.loops.map((l) => l.map((q) => ({ x: q.x * mmPerUnit, y: q.y * mmPerUnit })));
  const scaled: ExtractedPart = {
    ...part,
    loops: loopsMm,
    bb: (() => { const b = bboxOf(loopsMm); return b; })(),
    widthMm: part.widthMm * mmPerUnit,
    heightMm: part.heightMm * mmPerUnit,
    areaMm2: part.areaMm2 * mmPerUnit * mmPerUnit,
    outerLenMm: part.outerLenMm * mmPerUnit,
    cutLenMm: part.cutLenMm * mmPerUnit,
    flatMm: part.flatMm * mmPerUnit,
    bendLines: part.bendLines,
  };

  if (scaled.areaMm2 <= 0 || scaled.flatMm <= 0) quality = "none";

  // Вес
  const weightPiece =
    p.mode === "flat"
      ? weightFromArea(scaled.areaMm2, t, mat.density)
      : weightFromSection(scaled.areaMm2, scaled.partLengthMm, mat.density);
  const weightBatch = round2(weightPiece * Math.max(1, p.quantity));

  // Усилие гибки: F = 1.33·Rm·t²·L / V
  const L = Math.max(1, scaled.partLengthMm);
  const forceKN = round1((1.33 * mat.rm * t * t * L) / V / 1000);
  const forceTon = round1(forceKN / 9.81);
  const recommendedPress = Math.ceil((forceTon * 1.3) / 5) * 5;

  // Стоимость
  const metal = round2(weightBatch * p.metalPrice * WASTE_FACTOR);
  const bending = round2(scaled.nBends * (L / 1000) * p.pricePerMeter * Math.max(1, p.quantity));
  const setup = round2(p.setupCost);

  // ─── Лазерная резка ───
  // Длина реза: если есть точная — берём её, иначе оценка по прямоугольнику
  const cutLengthMm = (scaled as any).cutLengthMm && (scaled as any).cutLengthMm > 0
    ? (scaled as any).cutLengthMm
    : L * 2 + scaled.partLengthMm * 2;
  const laserEnabled = p.laserEnabled ?? false;
  const pierceCount = p.laserPierceCount ?? 0;
  const laserCalc = laserEnabled
    ? calcLaserCost(
        mat.id,
        t,
        cutLengthMm,
        pierceCount,
        p.laserPrice ?? 0,
      )
    : { lengthM: 0, pierceCount: 0, cost: 0, usedPrice: 0 };
  const laser = round2(laserCalc.cost * Math.max(1, p.quantity));

  const subtotal = round2(metal + bending + setup + laser);
  const vat = round2(subtotal * VAT_RATE);
  const total = round2(subtotal + vat);

  notes.push(...part.notes);
  if (scaled.nBends === 0) {
    quality = "partial";
    notes.push("Гибы не определены — задайте их число вручную, иначе работа по гибке не учтена.");
  }
  if (p.mode === "flat" && scaled.areaMm2 > 0) {
    notes.push(`Вес из площади развёртки: ${(scaled.areaMm2 / 100).toFixed(1)} см² × ${t} мм × ${mat.density} кг/м³.`);
  }

  return {
    geom, part: scaled, mmPerUnit, measuredUnits, kFactor: K, innerRadius: R,
    quantity: Math.max(1, p.quantity), materialShort: mat.short, thickness: t,
    weightPiece: round2(weightPiece), weightBatch,
    forceTon, forceKN, recommendedPress,
    cost: {
      metal, bending, setup,
      laser,
      laserLengthM: round2(laserCalc.lengthM * Math.max(1, p.quantity)),
      laserPierceCount: laserCalc.pierceCount * Math.max(1, p.quantity),
      subtotal, vat, total,
    },
    perPiece: total / Math.max(1, p.quantity),
    quality,
    notes,
  };
}


// ─── Разделение файла на отдельные детали ───

import { splitLoopsToParts } from "./extract";

/** Если в файле несколько независимых контуров — возвращает массив FileEval (по одному на деталь).
 *  Если одна деталь — массив из одного элемента. */
export function evaluateFileParts(
  geom: FileGeom,
  calibWidthMm: number,
  p: EvalParams,
): FileEval[] {
  const parts = splitLoopsToParts(geom.rawLoops);

  // Для DXF калибровка не нужна — координаты уже в мм
  const effectiveCalib = geom.source === "dxf" ? 0 : calibWidthMm;

  // Если одна деталь — обычный путь
  if (parts.length <= 1) {
    return [evaluateFile(geom, effectiveCalib, p)];
  }

  // Иначе — по одной детали на FileEval
  return parts.map((part, idx) => {
    const subLoops = [part.outer, ...part.holes];
    const subGeom: FileGeom = {
      ...geom,
      rawLoops: subLoops,
      name: `${geom.name} · деталь ${idx + 1}`,
    };
    return evaluateFile(subGeom, effectiveCalib, p);
  });
}
