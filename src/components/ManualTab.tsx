import NumberField from "./NumberField";
import {
  MATERIALS,
  PROFILES,
  THICKNESSES,
  innerRadiusFromV,
  recommendedV,
  fmt,
  fmt2,
  type CalcInput,
} from "../lib/bending";

interface Props {
  input: CalcInput;
  onChange: (patch: Partial<CalcInput>) => void;
  onAdd: () => void;
  added: boolean;
}

/** Обёртка блока с заголовком */
function Block({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 font-mono text-[13px] font-bold text-white">
          {n}
        </span>
        <div className="flex-1">
          <div className="text-[14px] font-bold tracking-wide text-slate-800 uppercase">
            {title}
          </div>
          {hint && <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export default function ManualTab({ input, onChange, onAdd, added }: Props) {
  const prof = PROFILES.find((p) => p.id === input.profileId)!;
  const mat = MATERIALS.find((m) => m.id === input.materialId);

  const setFlange = (i: number, v: number) => {
    const flanges = [...input.flanges];
    flanges[i] = Math.max(1, Math.min(2000, v));
    onChange({ flanges });
  };
  const setAngle = (i: number, v: number) => {
    const angles = [...input.angles];
    angles[i] = Math.max(10, Math.min(170, v));
    onChange({ angles });
  };

  const method = input.bendMethod ?? "air";
  const displayR = method === "coining" ? input.thickness : innerRadiusFromV(input.vMatrix);

  return (
    <div className="space-y-5">
      {/* ─── БЛОК 1. Материал и толщина ─── */}
      <Block n={1} title="Материал и толщина" hint="Листовой металл для гибки">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Тип металла</label>
            <select
              className="field"
              value={input.materialId}
              onChange={(e) => onChange({ materialId: e.target.value })}
            >
              {MATERIALS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            {mat && (
              <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-500">
                {mat.spec && (
                  <div className="font-mono text-[10px] leading-tight text-slate-400">
                    {mat.spec}
                  </div>
                )}
                <div>
                  Rm = {mat.rm} МПа · ρ = {mat.density} кг/м³ · {mat.price} ₽/кг
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="label">
              Толщина листа, мм <span className="hint">стрелками ↕</span>
            </label>
            <select
              className="field"
              value={input.thickness}
              onChange={(e) =>
                onChange({ thickness: Number(e.target.value), vMatrix: recommendedV(Number(e.target.value)) })
              }
            >
              {THICKNESSES.map((t) => (
                <option key={t} value={t}>
                  {String(t).replace(".", ",")} мм
                </option>
              ))}
            </select>
            <div className="mt-1.5 text-[11px] text-slate-500">
              Доступно 0,5 – 2 мм (по памятке производства)
            </div>
          </div>
        </div>
      </Block>

      {/* ─── БЛОК 2. Профиль сечения ─── */}
      <Block n={2} title="Профиль сечения" hint="Форма детали и размеры">
        <div>
          <label className="label">Тип профиля</label>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {PROFILES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  onChange({
                    profileId: p.id,
                    flanges: [...p.flanges],
                    angles: p.flanges.map(() => 90),
                  })
                }
                className={`rounded-lg border px-2 py-2.5 text-[11px] font-semibold transition ${
                  input.profileId === p.id
                    ? "border-amber-500 bg-amber-50 text-amber-800 shadow-[0_0_0_3px_rgba(245,158,11,0.15)]"
                    : "border-slate-300 bg-white text-slate-500 hover:border-slate-400"
                }`}
              >
                {p.name}
                <span className="mt-0.5 block font-mono text-[10px] font-bold text-slate-400">
                  {p.closed
                    ? `${p.flanges.length} гиба`
                    : p.flanges.length === 2
                      ? "1 гиб"
                      : `${p.flanges.length - 1} гиба`}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">
            Полки <span className="hint">мм · по ходу контура</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {prof.flanges.map((_, i) => (
              <div key={i} className="min-w-16 flex-1">
                <div className="mb-1 text-center font-mono text-[10px] font-bold text-slate-400">
                  П{i + 1}
                </div>
                <NumberField
                  value={input.flanges[i] ?? prof.flanges[i]}
                  onChange={(v) => setFlange(i, v)}
                  min={5}
                  step={1}
                  className="field text-center"
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="label">
            Углы гиба <span className="hint">°</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: prof.turns.length }).map((_, i) => (
              <div key={i} className="min-w-16 flex-1">
                <div className="mb-1 text-center font-mono text-[10px] font-bold text-slate-400">
                  Гиб {i + 1}
                </div>
                <NumberField
                  value={input.angles[i] ?? 90}
                  onChange={(v) => setAngle(i, v)}
                  min={10}
                  max={170}
                  step={5}
                  className="field text-center"
                />
              </div>
            ))}
          </div>
        </div>
      </Block>

      {/* ─── БЛОК 3. Технология гибки ─── */}
      <Block n={3} title="Технология гибки" hint="Метод, матрица, длина">
        <div>
          <label className="label">Метод гибки</label>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onChange({ bendMethod: "air" })}
              className={`flex-1 rounded-lg border px-3 py-2 text-[12px] font-semibold transition ${
                method === "air"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              Воздушная <span className="ml-1 font-mono text-[10px] opacity-80">R = 0,16·V</span>
            </button>
            <button
              type="button"
              onClick={() => onChange({ bendMethod: "coining" })}
              className={`flex-1 rounded-lg border px-3 py-2 text-[12px] font-semibold transition ${
                method === "coining"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              Калибровка <span className="ml-1 font-mono text-[10px] opacity-80">R = t</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">
              V-матрица, мм{" "}
              <button
                type="button"
                onClick={() => onChange({ vMatrix: recommendedV(input.thickness) })}
                className="hint cursor-pointer font-bold text-amber-600 hover:text-amber-700"
              >
                8×t → {fmt(recommendedV(input.thickness))}
              </button>
            </label>
            <NumberField
              value={input.vMatrix}
              onChange={(v) => onChange({ vMatrix: v })}
              step={0.5}
              min={2}
            />
          </div>
          <div>
            <label className="label">
              Внутр. радиус R, мм{" "}
              {method === "coining" && <span className="hint font-bold text-amber-600">= t</span>}
            </label>
            <input
              type="text"
              readOnly
              className="field field-readonly"
              value={fmt2(displayR)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Длина изделия, мм</label>
            <NumberField
              value={input.length}
              onChange={(v) => onChange({ length: v })}
              step={10}
              min={10}
              max={2490}
            />
          </div>
          <div>
            <label className="label">Количество, шт</label>
            <NumberField
              value={input.quantity}
              onChange={(v) => onChange({ quantity: v })}
              step={1}
              min={1}
            />
          </div>
        </div>
      </Block>

      {/* ─── БЛОК 4. Операции ─── */}
      <Block n={4} title="Операции" hint="Лазерная резка и гибка">
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-[12px] font-bold text-slate-700">
              <input
                type="checkbox"
                checked={input.laserEnabled ?? false}
                onChange={(e) => onChange({ laserEnabled: e.target.checked })}
                className="h-4 w-4 accent-amber-600"
              />
              <span>🔦 Лазерная резка контура</span>
            </label>
            {input.laserEnabled && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-800">
                включена
              </span>
            )}
          </div>
          {input.laserEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">
                  Цена, ₽/м <span className="hint ml-1 font-normal">(0 = авто)</span>
                </label>
                <NumberField
                  value={input.laserPrice ?? 0}
                  onChange={(v) => onChange({ laserPrice: v })}
                  min={0}
                  step={5}
                  placeholder="авто"
                />
              </div>
              <div>
                <label className="label">
                  Врезок, шт <span className="hint ml-1 font-normal">на деталь</span>
                </label>
                <NumberField
                  value={input.laserPierceCount ?? 0}
                  onChange={(v) => onChange({ laserPierceCount: v })}
                  min={0}
                  step={1}
                />
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <div className="mb-3 flex items-center gap-2 text-[12px] font-bold text-slate-700">
            <span>🔨 Гибка на прессе</span>
            <span className="rounded-full bg-slate-200 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600">
              {prof.closed ? prof.flanges.length : prof.flanges.length - 1} гибов
            </span>
          </div>
          <div>
            <label className="label">Цена гибки, ₽/м</label>
            <NumberField
              value={input.pricePerMeter}
              onChange={(v) => onChange({ pricePerMeter: v })}
              step={1}
              min={0}
            />
          </div>
        </div>
      </Block>

      {/* ─── БЛОК 5. Стоимость и заказчик ─── */}
      <Block n={5} title="Стоимость и заказчик" hint="Цена металла, наладка, контакты">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Металл, ₽/кг</label>
            <NumberField
              value={input.metalPrice}
              onChange={(v) => onChange({ metalPrice: v })}
              step={0.5}
            />
          </div>
          <div>
            <label className="label">Наладка, ₽</label>
            <NumberField
              value={input.setupCost}
              onChange={(v) => onChange({ setupCost: v })}
              step={10}
              min={0}
            />
          </div>
        </div>

        <div>
          <label className="label">
            Название детали <span className="hint">для спецификации</span>
          </label>
          <input
            type="text"
            className="field"
            placeholder="Например: Кронштейн двери"
            value={input.detailName}
            onChange={(e) => onChange({ detailName: e.target.value })}
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="mb-3 text-[11px] font-bold tracking-[0.08em] text-slate-400 uppercase">
            Контактные данные для сметы
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              type="text"
              className="field"
              placeholder="Имя"
              value={input.clientName}
              onChange={(e) => onChange({ clientName: e.target.value })}
            />
            <input
              type="text"
              className="field"
              placeholder="Телефон"
              value={input.clientPhone}
              onChange={(e) => onChange({ clientPhone: e.target.value })}
            />
            <input
              type="text"
              className="field"
              placeholder="Email"
              value={input.clientEmail}
              onChange={(e) => onChange({ clientEmail: e.target.value })}
            />
          </div>
        </div>
      </Block>

      {/* ─── Кнопка добавить в смету ─── */}
      <button
        type="button"
        onClick={onAdd}
        className={`w-full rounded-xl px-6 py-3.5 text-[15px] font-bold text-white shadow-lg transition active:scale-[0.99] ${
          added
            ? "bg-emerald-600 shadow-emerald-600/25 hover:bg-emerald-700"
            : "bg-amber-600 shadow-amber-600/25 hover:bg-amber-700"
        }`}
      >
        {added ? "✓ Добавлено в смету" : "+ Добавить позицию в смету"}
      </button>
    </div>
  );
}
