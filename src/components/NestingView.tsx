import { useMemo } from "react";
import { nestOnSheets, type NestingPart } from "../lib/nesting";

interface Props {
  parts: NestingPart[];
}

const COLORS = [
  "#f59e0b", "#ef4444", "#3b82f6", "#10b981", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

export default function NestingView({ parts }: Props) {
  const result = useMemo(() => nestOnSheets(parts), [parts]);

  if (parts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
        Добавьте детали — покажу раскрой листов 2500×1250
      </div>
    );
  }

  // Максимальный масштаб отображения (CSS px на мм)
  const scale = 0.18; // 2500 мм → 450 px

  return (
    <div className="space-y-4">
      {/* Сводка */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800/70">Листов</div>
          <div className="mt-0.5 font-mono text-[22px] font-bold text-amber-900">{result.sheetCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Использование</div>
          <div className="mt-0.5 font-mono text-[22px] font-bold text-emerald-700">
            {(result.utilization * 100).toFixed(1)} %
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Деталей</div>
          <div className="mt-0.5 font-mono text-[22px] font-bold text-slate-900">
            {parts.reduce((s, p) => s + p.qty, 0)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Лист</div>
          <div className="mt-0.5 font-mono text-[14px] font-bold text-slate-900">
            {result.sheetW} × {result.sheetH}
          </div>
        </div>
      </div>

      {/* Предупреждение о неразмещённых */}
      {result.unplaced.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-[12px] text-red-800">
          <b>⛔ Не размещено на листе:</b>{" "}
          {result.unplaced.map((u) => `${u.title} (${u.width}×${u.height} мм)`).join(", ")}.
          Размер превышает габариты листа {result.sheetW}×{result.sheetH}.
        </div>
      )}

      {/* Листы */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {result.sheets.map((sheet) => (
          <div key={sheet.index} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Лист {sheet.index} / {result.sheetCount}
              </div>
              <div className="font-mono text-[10px] text-slate-400">
                {sheet.placed.length} дет.
              </div>
            </div>

            {/* Визуализация */}
            <div
              className="relative rounded-lg bg-slate-100"
              style={{
                width: result.sheetW * scale,
                height: result.sheetH * scale,
                border: "1px solid #cbd5e1",
              }}
            >
              {sheet.placed.map((p, i) => (
                <div
                  key={i}
                  className="absolute rounded-[2px] text-[8px] font-bold text-white"
                  style={{
                    left: p.x * scale,
                    top: p.y * scale,
                    width: p.w * scale,
                    height: p.h * scale,
                    backgroundColor: COLORS[i % COLORS.length],
                    border: "1px solid rgba(0,0,0,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                  title={`${p.title} · ${p.w}×${p.h} мм`}
                >
                  {p.w * scale > 20 && p.h * scale > 12 ? p.title.slice(0, 6) : ""}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
