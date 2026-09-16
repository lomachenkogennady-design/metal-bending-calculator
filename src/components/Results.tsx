import { MATERIALS, WASTE_FACTOR, fmt, fmt0, fmt2, fmtMoney, type CalcInput, type CalcResult } from "../lib/bending";
import { fmtWeightText } from "../lib/cart";
import type { ProfileGeometry } from "../lib/geometry";
import Scene3D from "./Scene3D";
import ProfileCanvas from "./ProfileCanvas";
import FlatCanvas from "./FlatCanvas";

interface Props {
  input: CalcInput;
  result: CalcResult;
  geom: ProfileGeometry;
}

function Card({ label, value, unit, sub, accent }: { label: string; value: string; unit?: string; sub?: string; accent?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-4 transition-all duration-300 ${
        accent ? "border-amber-300 bg-amber-50/70" : "border-slate-200 bg-white"
      } hover:-translate-y-0.5 hover:shadow-md`}
    >
      <div className={`absolute inset-y-0 left-0 w-1 ${accent ? "bg-amber-500" : "bg-slate-800"}`} />
      <div className="text-[10px] font-bold tracking-[0.08em] text-slate-400 uppercase">{label}</div>
      <div className="mt-1 font-mono text-[22px] leading-tight font-bold text-slate-900">
        {value}
        {unit && <span className="ml-1 text-[13px] font-semibold text-slate-500">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 text-[11px] font-medium text-slate-400">{sub}</div>}
    </div>
  );
}

const warnStyles = {
  error: "border-red-300 bg-red-50 text-red-800",
  warn: "border-amber-300 bg-amber-50 text-amber-900",
  info: "border-sky-300 bg-sky-50 text-sky-900",
} as const;
const warnIcon = { error: "⛔", warn: "⚠️", info: "ℹ️" } as const;

export default function Results({ input, result, geom }: Props) {
  const mat = MATERIALS.find((m) => m.id === input.materialId)!;

  return (
    <section className="mt-8 space-y-6">
      {/* Визуализация */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="vis-card !p-0 overflow-hidden lg:row-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h4 className="flex items-center gap-2 text-[13px] font-bold tracking-wide text-slate-700 uppercase">
              <span className="text-amber-600">▣</span> 3D-модель
            </h4>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-500">
              t={input.thickness} мм · вращайте мышью
            </span>
          </div>
          <div className="h-[340px] bg-gradient-to-b from-slate-50 to-slate-100">
            {result.ok && <Scene3D geom={geom} length={input.length} color={mat.color} />}
          </div>
        </div>
        <div className="vis-card">
          <h4 className="mb-2 flex items-center justify-between text-[13px] font-bold tracking-wide text-slate-700 uppercase">
            <span className="flex items-center gap-2"><span className="text-amber-600">◫</span> Сечение профиля</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-500">
              t={input.thickness} · R{result.innerRadius}
            </span>
          </h4>
          <div className="h-56 rounded-lg border border-slate-200 bg-white">
            {result.ok && <ProfileCanvas geom={geom} angles={input.angles} className="block h-full w-full" />}
          </div>
        </div>
        <div className="vis-card">
          <h4 className="mb-2 flex items-center justify-between text-[13px] font-bold tracking-wide text-slate-700 uppercase">
            <span className="flex items-center gap-2"><span className="text-amber-600">▤</span> Развёртка заготовки</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-500">
              t={input.thickness} мм · K={fmt2(result.kFactor)}
            </span>
          </h4>
          <div className="h-56 rounded-lg border border-slate-200 bg-white">
            {result.ok && (
              <FlatCanvas
                flat={result.flat}
                length={input.length}
                straights={result.straightLengths}
                allowances={result.bendAllowances}
                angles={input.angles}
                className="block h-full w-full"
              />
            )}
          </div>
        </div>
      </div>

      {/* Карточки результатов */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Card label="Длина развёртки" value={fmt(result.flat)} unit="мм" sub={`DIN 6935 · K=${fmt2(result.kFactor)}`} accent />
        <Card label="Усилие гибки" value={fmt(result.forceTon)} unit="т" sub={`${fmt0(result.forceKN)} кН · 1.33·Rm·t²·L/V`} />
        <Card label="V-матрица" value={fmt(input.vMatrix)} unit="мм" sub={`R внутр. = ${fmt2(result.innerRadius)} мм`} accent />
        <Card label="Вес детали" value={fmt2(result.weightPiece)} unit="кг" sub={`${mat.short} · ${mat.density} кг/м³`} />
        <Card label="Вес партии" value={fmtWeightText(result.weightBatch).replace(" кг", "").replace(" г", "")} unit={result.weightBatch < 0.1 ? "г" : "кг"} sub={`${fmt0(input.quantity)} шт × ${fmt2(result.weightPiece)} кг`} />
        <Card label="Гибов" value={String(result.nBends)} sub={`углы ${input.angles.slice(0, result.nBends).map((a) => a + "°").join(" / ")}`} />
        <Card label="Мин. полка" value={String(result.minFlange)} unit="мм" sub={`для V=${fmt(input.vMatrix)} мм`} />
        <Card label="Рекоменд. пресс" value={fmt(result.recommendedPress)} unit="т" sub={`задан: ${input.pressTon} т`} />
      </div>

      {/* Предупреждения */}
      {result.warnings.length > 0 && (
        <div className="space-y-2">
          {result.warnings.map((w, i) => (
            <div key={i} className={`flex items-start gap-2.5 rounded-lg border-l-4 px-4 py-2.5 text-[13px] font-medium ${warnStyles[w.level]}`}>
              <span className="mt-0.5 shrink-0 text-sm">{warnIcon[w.level]}</span>
              <span>{w.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Смета */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-3">
          <h4 className="text-[13px] font-bold tracking-wide text-slate-700 uppercase">Расчёт стоимости партии</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="px-5 py-4">
            {[
              {
                name: `Металл (${mat.short})`,
                note: `${fmt(result.weightBatch)} кг × ${fmt0(input.metalPrice)} ₽/кг · отходы ${Math.round((WASTE_FACTOR - 1) * 100)} %`,
                val: result.cost.metal,
              },
              {
                name: "Гибка",
                note: `${result.nBends} гиба × ${fmt(input.length / 1000)} м × ${fmt0(input.pricePerMeter)} ₽/м × ${fmt0(input.quantity)} шт`,
                val: result.cost.bending,
              },
              { name: "Наладка инструмента", note: "единовременно на партию", val: result.cost.setup },
            ].map((r) => (
              <div key={r.name} className="flex items-start justify-between gap-4 border-b border-dashed border-slate-200 py-2.5 last:border-0">
                <div>
                  <div className="text-[13px] font-semibold text-slate-800">{r.name}</div>
                  <div className="text-[11px] text-slate-400">{r.note}</div>
                </div>
                <div className="shrink-0 font-mono text-[14px] font-bold text-slate-900">{fmtMoney(r.val)}</div>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4 md:border-t-0 md:border-l">
            {[
              { name: "Сумма без НДС", val: result.cost.subtotal, cls: "text-slate-700" },
              { name: `НДС ${Math.round(0.22 * 100)} %`, val: result.cost.vat, cls: "text-slate-700" },
            ].map((r) => (
              <div key={r.name} className="flex items-center justify-between py-1.5 text-[13px]">
                <span className="font-medium text-slate-500">{r.name}</span>
                <span className={`font-mono font-bold ${r.cls}`}>{fmtMoney(r.val)}</span>
              </div>
            ))}
            <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-900 px-4 py-3">
              <span className="text-[13px] font-bold tracking-wide text-slate-200 uppercase">Итого с НДС</span>
              <span className="font-mono text-xl font-black text-amber-400">{fmtMoney(result.cost.total)}</span>
            </div>
            <div className="mt-2 text-right text-[11px] text-slate-400">
              {fmtMoney(result.cost.total / Math.max(1, input.quantity))} / шт
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
