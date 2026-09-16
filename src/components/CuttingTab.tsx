import { useMemo, useState } from "react";
import NestingView from "./NestingView";
import StockView from "./StockView";
import type { NestingPart } from "../lib/nesting";
import type { StockPart } from "../lib/stockCutting";
import type { CartItem } from "../lib/cart";

interface Props {
  items: CartItem[];
}

type SubTab = "sheets" | "stocks";

export default function CuttingTab({ items }: Props) {
  const [sub, setSub] = useState<SubTab>("sheets");

  // Листовые детали: у каждой есть flat (длина развёртки) и length (длина изделия)
  const sheetParts: NestingPart[] = useMemo(
    () =>
      items
        .filter((it) => it.flat && it.length)
        .map((it, i) => ({
          id: it.id || `part-${i}`,
          title: it.title,
          width: it.flat!,
          height: it.length!,
          qty: it.qty,
        })),
    [items],
  );

  // Профильные заготовки: длина изделия × количество
  const stockParts: StockPart[] = useMemo(
    () =>
      items
        .filter((it) => it.length)
        .map((it, i) => ({
          id: it.id || `stock-${i}`,
          title: it.title,
          length: it.length!,
          qty: it.qty,
        })),
    [items],
  );

  return (
    <div className="space-y-6">
      {/* Переключатель */}
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setSub("sheets")}
          className={`rounded-lg px-4 py-2 text-[13px] font-bold transition ${
            sub === "sheets"
              ? "bg-amber-500 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          📄 Листы 2500×1250
        </button>
        <button
          type="button"
          onClick={() => setSub("stocks")}
          className={`rounded-lg px-4 py-2 text-[13px] font-bold transition ${
            sub === "stocks"
              ? "bg-amber-500 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          📏 Хлысты 6 м
        </button>
      </div>

      {/* Контент */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          Добавьте позиции в смету — покажу раскрой на листах и хлыстах
        </div>
      ) : sub === "sheets" ? (
        <NestingView parts={sheetParts} />
      ) : (
        <StockView parts={stockParts} />
      )}
    </div>
  );
}
