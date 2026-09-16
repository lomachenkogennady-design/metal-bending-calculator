import { MATERIALS, PROFILES, type CalcInput, type CalcResult, fmt0 } from "./bending";
import type { FileEval } from "./fileeval";

export interface CartItem {
  id: string;
  title: string;
  kind: "calc" | "custom";
  material: string;
  thickness?: number;
  profile?: string;
  bends?: number;
  flat?: number;
  length?: number;
  qty: number;
  weightBatch: number;
  metal: number;
  bending: number;
  setup: number;
  laser?: number;
  laserLengthM?: number;
  laserPierceCount?: number;
  subtotal: number;
  vat: number;
  total: number;
  client: { name: string; phone: string; email: string };
  files?: string[];
  note?: string;
}

let idCounter = 1;
export const nextId = () => `${Date.now().toString(36)}-${idCounter++}`;

export function itemFromCalc(input: CalcInput, result: CalcResult): CartItem {
  const mat = MATERIALS.find((m) => m.id === input.materialId);
  const prof = PROFILES.find((p) => p.id === input.profileId);
  return {
    id: nextId(),
    kind: "calc",
    title: input.detailName || `${prof?.name ?? "Деталь"} ${String(input.thickness).replace(".", ",")} мм`,
    material: mat?.short ?? "",
    thickness: input.thickness,
    profile: prof?.name,
    bends: result.nBends,
    flat: result.flat,
    length: input.length,
    qty: input.quantity,
    weightBatch: result.weightBatch,
    metal: result.cost.metal,
    bending: result.cost.bending,
    setup: result.cost.setup,
    laser: result.cost.laser,
    laserLengthM: result.cost.laserLengthM,
    laserPierceCount: result.cost.laserPierceCount,
    subtotal: result.cost.subtotal,
    vat: result.cost.vat,
    total: result.cost.total,
    client: { name: input.clientName, phone: input.clientPhone, email: input.clientEmail },
  };
}

/** Позиция, рассчитанная по геометрии файла (DXF / PDF / скан) */
/** Короткое читаемое имя из длинной строки DXF-парсера */
export function shortName(name: string, max = 36): string {
  let s = (name || "").trim().replace(/\s+/g, " ");
  // Отрезаем весь мусор после второго " - " (парсер клеит много параметров)
  const parts = s.split(/\s+-\s+/).filter((p) => p.length > 0 && p !== "sh" && p !== "br");
  if (parts.length > 2) s = parts.slice(0, 2).join(" · ");
  else if (parts.length > 0) s = parts.join(" · ");
  if (s.length > max) s = s.slice(0, max - 1).trim() + "…";
  return s || "Позиция";
}

export function itemFromExtracted(
  ev: FileEval,
  title: string,
  client: { name: string; phone: string; email: string },
  quantity: number,
  materialShort: string,
  thickness: number
): CartItem {
  const p = ev.part;
  const src = ev.geom.source === "dxf" ? "DXF" : ev.geom.source === "pdf-vector" ? "PDF-вектор" : "скан";
  return {
    id: nextId(),
    kind: "custom",
    title: shortName(title || ev.geom.name),
    material: `${materialShort} · ${src}`,
    thickness,
    profile: `${p.mode === "flat" ? "Развёртка" : "Сечение"} · K=${ev.kFactor.toFixed(2)} · R${ev.innerRadius}`,
    bends: p.nBends,
    flat: Math.round(p.flatMm * 10) / 10,
    length: Math.round(p.partLengthMm * 10) / 10,
    qty: Math.max(1, quantity),
    weightBatch: ev.weightBatch,
    metal: ev.cost.metal,
    bending: ev.cost.bending,
    setup: ev.cost.setup,
    laser: ev.cost.laser,
    laserLengthM: ev.cost.laserLengthM,
    laserPierceCount: ev.cost.laserPierceCount,
    subtotal: ev.cost.subtotal,
    vat: ev.cost.vat,
    total: ev.cost.total,
    client,
    files: [ev.geom.name],
    note: `${p.widthMm.toFixed(0)}×${p.heightMm.toFixed(0)} мм · S=${(p.areaMm2 / 100).toFixed(1)} см² · ${ev.forceTon} т`,
  };
}

export function cartTotals(items: CartItem[]) {
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const vat = items.reduce((s, i) => s + i.vat, 0);
  return {
    qty: items.reduce((s, i) => s + i.qty, 0),
    weight: Math.round(items.reduce((s, i) => s + i.weightBatch, 0) * 1000) / 1000,
    metal: items.reduce((s, i) => s + i.metal, 0),
    bending: items.reduce((s, i) => s + i.bending, 0),
    // Наладка берётся один раз на партию, не суммируется по позициям
    setup: items.length > 0 ? Math.max(...items.map((i) => i.setup)) : 0,
    laser: items.reduce((s, i) => s + (i.laser ?? 0), 0),
    subtotal,
    vat,
    total: subtotal + vat,
  };
}

export const fmtMoney0 = (v: number) => fmt0(Math.round(v)) + " ₽";


/** Форматирование веса: <0,1 кг → граммы, иначе кг */
export function fmtWeightText(v: number): string {
  const n = Number(v) || 0;
  if (n > 0 && n < 0.1) return `${(n * 1000).toFixed(1).replace(".", ",")} г`;
  return `${n.toFixed(2).replace(".", ",")} кг`;
}
