import { useMemo } from "react";
import { nestOnSheets, type NestingPart } from "../lib/nesting";

interface Props {
  parts: NestingPart[];
  thickness?: number;
  allowRotate?: boolean;
}

const COLORS = [
  "#f59e0b", "#ef4444", "#3b82f6", "#10b981", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

export default function NestingView({ parts, thickness = 2, allowRotate = true }: Props) {
  const result = useMemo(
    () => nestOnSheets(
      parts.map(p => ({ ...p, allowRotate })),
      undefined,
      undefined,
      thickness,
    ),
    [parts, thickness, allowRotate],
  );

  if (parts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
        Добавьте детали — покажу раскрой листов 2500×1250
      </div>
    );
  }

  // Максимальный масштаб отображения (CSS px на мм)
  const scale = 0.18; // 2500 мм → 450 px

  const rotatedCount = result.sheets.reduce(
    (s, sh) => s + sh.placed.filter((p) => p.rot).length,
    0,
  );

  return (
    <div className="space-y-4">
      {/* Индикатор режима раскроя */}
      <div
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] font-bold ${
          allowRotate
            ? "border-amber-200 bg-amber-50/60 text-amber-800"
            : "border-slate-300 bg-slate-50 text-slate-700"
        }`}
      >
        <span className="text-base">{allowRotate ? "⟳" : "▭"}</span>
        <span>
          {allowRotate
            ? "Поворот деталей разрешён"
            : "Поворот деталей запрещён (направление проката)"}
        </span>
        {allowRotate && rotatedCount > 0 && (
          <span className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
            повёрнуто: {rotatedCount} из {result.sheets.reduce((s, sh) => s + sh.placed.length, 0)}
          </span>
        )}
        {!allowRotate && (
          <span className="ml-auto rounded-full bg-slate-300 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
            без поворота
          </span>
        )}
      </div>
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
                    left: p.x * scale + 1,
                    top: p.y * scale + 1,
                    width: Math.max(2, p.w * scale - 2),
                    height: Math.max(2, p.h * scale - 2),
                    backgroundColor: COLORS[i % COLORS.length],
                    border: "1px solid rgba(0,0,0,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                  title={`${p.title} · ${p.w}×${p.h} мм`}
                >
                  {p.rot && (
                    <span
                      style={{
                        position: "absolute",
                        top: 1,
                        right: 2,
                        fontSize: 8,
                        lineHeight: 1,
                        color: "rgba(255,255,255,0.85)",
                        fontWeight: 700,
                      }}
                      title="Повёрнута на 90°"
                    >
                      ⟳
                    </span>
                  )}
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
