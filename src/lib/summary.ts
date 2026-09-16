// Консолидация всех рассчитанных данных в единый набор + экспорт JSON/CSV

import { MATERIALS, VAT_RATE, fmtMoney, type CalcInput, type CalcResult } from "./bending";
import { cartTotals, itemFromCalc, type CartItem } from "./cart";
import type { FileEval } from "./fileeval";

export type PositionSource = "manual" | "file" | "cart";

export interface SummaryPosition {
  source: PositionSource;
  sourceLabel: string;
  title: string;
  material: string;
  thickness?: number;
  bends: number | null;
  flatMm: number | null;
  lengthMm: number | null;
  qty: number;
  weightKg: number;
  forceTon: number | null;
  subtotal: number;
  vat: number;
  total: number;
  status?: string;
}

export interface Summary {
  generatedAt: string;
  client: { name: string; phone: string; email: string };
  positions: SummaryPosition[];
  totals: {
    qty: number;
    weightKg: number;
    subtotal: number;
    vat: number;
    total: number;
  };
}

/** Собирает ВСЕ данные: текущий ручной расчёт + живые оценки файлов + позиции сметы */
export function buildSummary(opts: {
  manualInput: CalcInput | null;
  manualResult: CalcResult | null;
  fileEvals: FileEval[];
  cart: CartItem[];
}): Summary {
  const manualPositions: SummaryPosition[] = [];
  const filePositions: SummaryPosition[] = [];
  const client = {
    name: opts.manualInput?.clientName ?? opts.cart[0]?.client.name ?? "",
    phone: opts.manualInput?.clientPhone ?? opts.cart[0]?.client.phone ?? "",
    email: opts.manualInput?.clientEmail ?? opts.cart[0]?.client.email ?? "",
  };

  if (opts.manualInput && opts.manualResult && opts.manualResult.ok) {
    const mat = MATERIALS.find((m) => m.id === opts.manualInput!.materialId);
    const item = itemFromCalc(opts.manualInput, opts.manualResult);
    manualPositions.push({
      source: "manual",
      sourceLabel: "ручной расчёт",
      title: item.title,
      material: mat?.short ?? "",
      thickness: opts.manualInput.thickness,
      bends: opts.manualResult.nBends,
      flatMm: opts.manualResult.flat,
      lengthMm: opts.manualInput.length,
      qty: opts.manualInput.quantity,
      weightKg: opts.manualResult.weightBatch,
      forceTon: opts.manualResult.forceTon,
      subtotal: item.subtotal,
      vat: item.vat,
      total: item.total,
      status: opts.manualResult.warnings.some((w) => w.level === "error")
        ? "есть ошибки"
        : opts.manualResult.warnings.length
          ? "есть предупреждения"
          : "ok",
    });
  }

  opts.fileEvals.forEach((ev) => {
    filePositions.push({
      source: "file",
      sourceLabel: ev.geom.source === "dxf" ? "DXF" : ev.geom.source === "pdf-vector" ? "PDF-вектор" : ev.geom.source === "pdf-raster" ? "PDF-скан" : "скан",
      title: ev.geom.name,
      material: ev.materialShort,
      thickness: ev.thickness,
      bends: ev.part.nBends,
      flatMm: Math.round(ev.part.flatMm * 10) / 10,
      lengthMm: Math.round(ev.part.partLengthMm * 10) / 10,
      qty: ev.quantity,
      weightKg: ev.weightBatch,
      forceTon: ev.forceTon,
      subtotal: ev.cost.subtotal,
      vat: ev.cost.vat,
      total: ev.cost.total,
      status: ev.quality === "ok" ? "ok" : ev.quality === "partial" ? "частично распознано" : "не рассчитано",
    });
  });

  const cartPositions: SummaryPosition[] = opts.cart.map((i) => ({
    source: "cart" as const,
    sourceLabel: "смета",
    title: i.title,
    material: i.material,
    thickness: i.thickness,
    bends: i.bends ?? null,
    flatMm: i.flat ?? null,
    lengthMm: i.length ?? null,
    qty: i.qty,
    weightKg: i.weightBatch,
    forceTon: null,
    subtotal: i.subtotal,
    vat: i.vat,
    total: i.total,
  }));

  // Итог: текущий ручной расчёт + живые файлы + корзина (полная сводка всех данных)
  const allPositions = [...manualPositions, ...filePositions, ...cartPositions];
  const tot = cartTotals(opts.cart);
  const totalTotal = allPositions.reduce((s, p) => s + p.total, 0);
  const totalSub = allPositions.reduce((s, p) => s + p.subtotal, 0);
  const totalVat = allPositions.reduce((s, p) => s + p.vat, 0);
  const totalWeight = allPositions.reduce((s, p) => s + p.weightKg, 0);

  return {
    generatedAt: new Date().toISOString(),
    client,
    positions: allPositions,
    totals: {
      qty: allPositions.reduce((s, p) => s + p.qty, 0),
      weightKg: Math.round(totalWeight * 10) / 10 || tot.weight,
      subtotal: Math.round(totalSub * 100) / 100,
      vat: Math.round(totalVat * 100) / 100,
      total: Math.round(totalTotal * 100) / 100,
    },
  };
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function exportSummaryJSON(s: Summary) {
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json;charset=utf-8" });
  download(blob, `fireprom-data-${new Date().toISOString().slice(0, 10)}.json`);
}

export function exportSummaryCSV(s: Summary) {
  const d = (v: number) => v.toFixed(2).replace(".", ",");
  const rows: string[] = [
    "Источник;Наименование;Материал;Толщина мм;Гибов;Развёртка мм;Длина мм;Кол-во;Вес кг;Без НДС ₽;НДС " + Math.round(VAT_RATE * 100) + " % ₽;Итого ₽",
    ...s.positions.map((p) =>
      [
        p.sourceLabel,
        `"${p.title.split('"').join('""')}"`,
        p.material || "—",
        p.thickness ?? "—",
        p.bends ?? "—",
        p.flatMm ?? "—",
        p.lengthMm ?? "—",
        p.qty,
        d(p.weightKg),
        d(p.subtotal),
        d(p.vat),
        d(p.total),
      ].join(";")
    ),
    `ИТОГО;;;;;;${s.totals.qty};${d(s.totals.weightKg)};${d(s.totals.subtotal)};${d(s.totals.vat)};${d(s.totals.total)}`,
  ];
  const blob = new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
  download(blob, `fireprom-smeta-${new Date().toISOString().slice(0, 10)}.csv`);
}

export { fmtMoney };
