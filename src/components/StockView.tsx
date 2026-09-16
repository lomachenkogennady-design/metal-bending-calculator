import { useMemo } from "react";
import { stockCutting, type StockPart } from "../lib/stockCutting";

interface Props {
  parts: StockPart[];
}

const COLORS = [
  "#f59e0b", "#ef4444", "#3b82f6", "#10b981", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

export default function StockView({ parts }: Props) {
  const result = useMemo(() => stockCutting(parts), [parts]);

  if (parts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
        Добавьте профильные заготовки — покажу раскрой хлыстов 6 м
      </div>
    );
  }

  // Масштаб: 6000 мм → 600 px
  const scale = 0.1;

  // Уникальные цвета по partId
  const partIds = Array.from(new Set(parts.map((p) => p.id)));
  const colorOf = (id: string) => COLORS[partIds.indexOf(id) % COLORS.length];

  return (
    <div className="space-y-4">
      {/* Сводка */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800/70">Хлыстов</div>
          <div className="mt-0.5 font-mono text-[22px] font-bold text-amber-900">{result.barCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Использование</div>
          <div className="mt-0.5 font-mono text-[22px] font-bold text-emerald-700">
            {(result.utilization * 100).toFixed(1)} %
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Заготовок</div>
          <div className="mt-0.5 font-mono text-[22px] font-bold text-slate-900">
            {parts.reduce((s, p) => s + p.qty, 0)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Остаток</div>
          <div className="mt-0.5 font-mono text-[14px] font-bold text-slate-900">
            {result.totalWaste} мм
          </div>
        </div>
      </div>

      {/* Хлысты */}
      <div className="space-y-2">
        {result.bars.map((bar) => (
          <div key={bar.index} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Хлыст {bar.index} / {result.barCount}
              </div>
              <div className="font-mono text-[10px] text-slate-400">
                {bar.pieces.length} заг. · использовано {bar.usedLength} мм · остаток {bar.waste} мм
              </div>
            </div>

            {/* Визуализация полосы */}
            <div
              className="relative h-8 rounded overflow-hidden border border-slate-300 bg-slate-100"
              style={{ width: result.stockLength * scale }}
            >
              {bar.pieces.map((p, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 flex items-center justify-center text-[9px] font-bold text-white"
                  style={{
                    left: p.offset * scale,
                    width: p.length * scale,
                    backgroundColor: colorOf(p.partId),
                    borderRight: "1px solid rgba(0,0,0,0.2)",
                    overflow: "hidden",
                    padding: "0 2px",
                    whiteSpace: "nowrap",
                  }}
                  title={`${p.title} · ${p.length} мм`}
                >
                  {p.length * scale > 30 ? p.length : ""}
                </div>
              ))}
              {/* Остаток */}
              {bar.waste > 0 && (
                <div
                  className="absolute top-0 bottom-0 flex items-center justify-center text-[9px] font-bold text-slate-500"
                  style={{
                    left: bar.usedLength * scale,
                    width: bar.waste * scale,
                    backgroundColor: "#e2e8f0",
                    borderLeft: "1px dashed #94a3b8",
                  }}
                >
                  {bar.waste * scale > 30 ? `остаток ${bar.waste}` : ""}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
