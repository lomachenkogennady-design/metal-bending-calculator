import { fmtMoney, fmt0, VAT_RATE } from "../lib/bending";
import { fmtWeightText } from "../lib/cart";
import { exportSummaryCSV, exportSummaryJSON, type Summary, type SummaryPosition } from "../lib/summary";

const SRC_STYLE: Record<string, string> = {
  "ручной расчёт": "bg-slate-900 text-amber-400",
  DXF: "bg-blue-100 text-blue-800",
  "PDF-вектор": "bg-violet-100 text-violet-800",
  "PDF-скан": "bg-orange-100 text-orange-800",
  скан: "bg-orange-100 text-orange-800",
  смета: "bg-slate-100 text-slate-600",
};

function PosRow({ p }: { p: SummaryPosition }) {
  const dims = [p.flatMm ? `разв. ${fmt0(p.flatMm)}` : null, p.lengthMm ? `L ${fmt0(p.lengthMm)}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0">
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold tracking-wide uppercase ${SRC_STYLE[p.sourceLabel] ?? SRC_STYLE.смета}`}>
        {p.sourceLabel}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-semibold text-slate-800" title={p.title}>{p.title}</div>
        {dims && <div className="font-mono text-[10.5px] text-slate-400">{dims}</div>}
      </div>
      {p.bends != null && <span className="hidden font-mono text-[11px] font-bold text-slate-500 sm:block">{p.bends} гиб.</span>}
      <span className="hidden font-mono text-[11px] font-bold text-slate-500 sm:block">{fmt0(p.qty)} шт</span>
      <span className="hidden font-mono text-[11px] font-bold text-slate-500 sm:block">{fmtWeightText(p.weightKg)}</span>
      <span className="shrink-0 font-mono text-[12.5px] font-bold text-slate-900">{fmtMoney(p.total)}</span>
    </div>
  );
}

export default function SummaryPanel({ summary }: { summary: Summary }) {
  const t = summary.totals;
  if (summary.positions.length === 0) return null;

  return (
    <section className="mt-10 scroll-mt-24" id="svodka">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-black tracking-tight text-slate-900">Сводка всех данных</h2>
          <p className="text-[12px] text-slate-400">
            ручной расчёт + {summary.positions.filter((p) => p.source === "file").length} файла(-ов) + смета ·{" "}
            {summary.client.name || "заказчик не указан"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => exportSummaryJSON(summary)}
            className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-[12px] font-bold text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
          >
            ⬇ JSON
          </button>
          <button
            type="button"
            onClick={() => exportSummaryCSV(summary)}
            className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-[12px] font-bold text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
          >
            ⬇ CSV (Excel)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="max-h-64 overflow-auto">
            {summary.positions.map((p, i) => (
              <PosRow key={p.source + i} p={p} />
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-900 p-4 text-white shadow-sm">
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold tracking-[0.1em] text-slate-400 uppercase">Итого по всем данным</div>
            {[
              { l: "Позиций", v: String(summary.positions.length) },
              { l: "Штук в партии", v: fmt0(t.qty) },
              { l: "Вес металла", v: fmtWeightText(t.weightKg) },
              { l: "Без НДС", v: fmtMoney(t.subtotal) },
              { l: `НДС ${Math.round(VAT_RATE * 100)} %`, v: fmtMoney(t.vat) },
            ].map((r) => (
              <div key={r.l} className="flex items-center justify-between text-[12.5px]">
                <span className="text-slate-400">{r.l}</span>
                <span className="font-mono font-bold">{r.v}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg bg-amber-500 px-3.5 py-2.5 text-slate-900">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-black tracking-wide uppercase">Итого с НДС</span>
              <span className="font-mono text-lg font-black">{fmtMoney(t.total)}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
