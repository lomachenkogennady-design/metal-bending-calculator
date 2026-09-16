// ─── Справочники ─────────────────────────────────────────────────────────────

export interface Material {
  id: string;
  name: string;
  short: string;
  /** Полное обозначение из счёта поставщика (ГОСТ / ТУ) */
  spec?: string;
  rm: number; // предел прочности, МПа
  density: number; // кг/м³
  color: number; // цвет 3D-модели
  price: number; // ₽/кг
}

export const MATERIALS: Material[] = [
  {
    id: "steel",
    name: "Оцинкованная сталь ОЦ",
    short: "ОЦ",
    spec: "Лист ОЦ 1,5×1250×2500 / Ц-А-БШ-БД-НО-АП-02-140-М-ПС ГОСТ 14918-2020",
    rm: 320,
    density: 7850,
    color: 0xa8b4c0,
    price: 93,
  },
  {
    id: "steel-black",
    name: "Сталь чёрная холоднокатаная",
    short: "х/к",
    spec: "Лист 1,2×1250×2500 БТ-БШ-БД-ПВ-О ГОСТ 19904-90 / 08пс-6-П-Г ГОСТ 16523-97",
    rm: 370,
    density: 7850,
    color: 0x8d98a8,
    price: 75,
  },
  {
    id: "stainless",
    name: "Нержавеющая AISI 304 (08Х18Н10)",
    short: "AISI 304",
    spec: "Лист AISI 304 х/к мат (2В) ГОСТ 5632-2014",
    rm: 620,
    density: 7900,
    color: 0xc9d2dc,
    price: 550,
  },
  {
    id: "aluminium",
    name: "Алюминий АМг2",
    short: "АМг2",
    spec: "Лист АМг2М ГОСТ 21631-2019",
    rm: 190,
    density: 2690,
    color: 0xd9dde3,
    price: 320,
  },
];

export const THICKNESSES = [0.5, 0.8, 1, 1.2, 1.5, 2];

/** Возможности производства (из памятки для заказчика) */
export const WORKSHOP = {
  laser: {
    field: { w: 2990, h: 1490 },
    cut:   { w: 2490, h: 1240 },
    sheet: { w: 2500, h: 1250 },
    maxThickness: { steel: 5, stainless: 3, aluminium: 3 } as Record<string, number>,
    /** Цены резки ₽/м по материалу и толщине (среднерыночные) */
    pricePerMeter: {
      steel:     { "1": 15, "2": 25, "3": 40, "4": 55, "5": 75 },
      stainless: { "1": 30, "2": 50, "3": 75 },
      aluminium: { "1": 35, "2": 55, "3": 80 },
    } as Record<string, Record<string, number>>,
    /** Стоимость одной врезки (прошивки), ₽ */
    piercePrice: 8,
    /** Минимальная стоимость резки за деталь, ₽ */
    minCostPerPart: 50,
  },
  press: {
    maxWidth: 2490,
    maxDepth: 280,
    maxDepthNarrow: 470,
    maxDepthNarrowWidth: 2000,
    minThickness: 0.2,
    maxThickness: 2,
    minFlange: 11,
    minClosedBend: 12,
    standardRadiusIsThickness: true,
  },
  services: [
    "Лазерная резка",
    "Гибка",
    "Сварка",
    "Пескоструйная обработка",
    "Порошковая покраска RAL",
  ],
} as const;

export interface ProfileDef {
  id: string;
  name: string;
  /** внешние размеры полок по ходу контура, мм */
  flanges: number[];
  /** знак направления поворота на каждом гибе (для построения контура) */
  turns: number[];
  /** сторона центра гиба: [+1 слева от входа / -1 справа, +1 слева от выхода / -1 справа] */
  cs: [number, number][];
  closed?: boolean;
}

export const PROFILES: ProfileDef[] = [
  { id: "angle", name: "Уголок", flanges: [50, 50], turns: [1], cs: [[1, 1]] },
  { id: "u", name: "П-образный", flanges: [40, 80, 40], turns: [1, 1], cs: [[1, 1], [1, 1]] },
  { id: "z", name: "Z-образный", flanges: [40, 60, 40], turns: [-1, 1], cs: [[1, 1], [-1, -1]] },
  { id: "hat", name: "Шляпный", flanges: [30, 40, 60, 40, 30], turns: [1, -1, -1, 1], cs: [[1, -1], [-1, -1], [-1, -1], [-1, 1]] },
  { id: "box", name: "Короб", flanges: [30, 60, 30, 60], turns: [1, 1, 1, 1], cs: [[1, 1], [1, 1], [1, 1], [1, 1]], closed: true },
];

// ─── Входы/выходы расчёта ────────────────────────────────────────────────────

export interface CalcInput {
  materialId: string;
  thickness: number;
  profileId: string;
  flanges: number[];
  angles: number[]; // углы гиба, ° (по умолчанию 90)
  length: number; // длина изделия, мм
  vMatrix: number;
  /** Метод гибки: air — воздушная (R = 0,16·V), coining — калибровка (R = t) */
  bendMethod?: "air" | "coining"; // V-матрица, мм
  quantity: number;
  pressTon: number;
  setupCost: number;
  metalPrice: number;
  pricePerMeter: number;
  detailName: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  /** Лазерная резка */
  laserEnabled?: boolean;
  laserPrice?: number;         // ₽/м (0 = из WORKSHOP)
  laserPierceCount?: number;   // врезок на деталь
  /** Точная длина реза, мм — передаётся из polygonLength() */
  cutLengthMm?: number;
}

export interface Warning {
  level: "error" | "warn" | "info";
  text: string;
}

export interface CostBreakdown {
  metal: number;
  bending: number;
  setup: number;
  laser: number;
  laserLengthM: number;
  laserPierceCount: number;
  subtotal: number;
  vat: number;
  total: number;
}

export interface CalcResult {
  ok: boolean;
  kFactor: number;
  innerRadius: number; // R = 0.16·V
  flat: number; // длина развёртки, мм
  bendAllowances: number[]; // удлинение на каждый гиб, мм
  bendDeductions: number[]; // вычет на каждый гиб, мм
  straightLengths: number[]; // прямые участки по нейтральной линии
  weightPiece: number; // кг
  weightBatch: number; // кг
  forceKN: number; // усилие гибки (макс.), кН
  forceTon: number; // в тоннах
  recommendedPress: number; // рекомендуемый тоннаж, т
  minFlange: number; // мин. полка для данной V, мм
  recommendedV: number;
  nBends: number;
  cost: CostBreakdown;
  warnings: Warning[];
}

export const VAT_RATE = 0.22;
export const WASTE_FACTOR = 1.07; // отходы металла 7%

// ─── Геометрия гиба ──────────────────────────────────────────────────────────

/** K-фактор (положение нейтральной линии) в зависимости от R/t */
export function kFactor(r: number, t: number): number {
  const rt = r / t;
  if (rt <= 0.5) return 0.33;
  if (rt <= 1) return 0.36;
  if (rt <= 3) return 0.40;
  if (rt <= 6) return 0.44;
  return 0.5;
}

/** Рекомендуемая V-матрица: 8×t (допустимо 6…12×t) */
export function recommendedV(t: number): number {
  return Math.max(4, Math.round(t * 8 * 2) / 2);
}

/** Внутренний радиус при воздушной гибке: R ≈ 0.16·V */
export function innerRadiusFromV(v: number): number {
  return Math.round(v * 0.16 * 100) / 100;
}

/** Минимальная полка для гибки на матрице V */
export function minFlange(v: number, t: number): number {
  return Math.ceil(v / 2 + t);
}

/**
 * Расчёт гибки листового металла.
 * Развёртка: L = Σ(внешних полок) − Σ(BD), BD = 2·OSSB − BA,
 * OSSB = tan(φ/2)·(R+t), BA = φрад·(R + K·t).
 * Усилие воздушной гибки: F = 1.33·Rm·t²·L / V (кН).
 */
/** Расчёт стоимости лазерной резки для одной детали */
export function calcLaserCost(
  materialId: string,
  thickness: number,
  cutLengthMm: number,
  pierceCount: number,
  pricePerMeter: number,
  piercePrice?: number,
): { lengthM: number; pierceCount: number; cost: number; usedPrice: number } {
  const lengthM = cutLengthMm / 1000;
  const usedPrice = pricePerMeter > 0
    ? pricePerMeter
    : (WORKSHOP.laser.pricePerMeter[materialId]?.[String(Math.round(thickness))] ?? 40);
  const pierce = piercePrice ?? WORKSHOP.laser.piercePrice;
  let cost = lengthM * usedPrice + pierceCount * pierce;
  if (cost < WORKSHOP.laser.minCostPerPart) cost = WORKSHOP.laser.minCostPerPart;
  return { lengthM, pierceCount, cost: Math.round(cost * 100) / 100, usedPrice };
}

export function calculate(input: CalcInput): CalcResult {
  const mat = MATERIALS.find((m) => m.id === input.materialId) ?? MATERIALS[0];
  const prof = PROFILES.find((p) => p.id === input.profileId) ?? PROFILES[0];
  const t = input.thickness;
  const V = input.vMatrix;
  const method = input.bendMethod ?? "air";
  const R = method === "coining" ? t : innerRadiusFromV(V);
  const K = kFactor(R, t);
  const warnings: Warning[] = [];

  const nFlanges = prof.flanges.length;
  const nBends = prof.closed ? nFlanges : nFlanges - 1;
  const angles = Array.from({ length: nBends }, (_, i) => clamp(input.angles[i] ?? 90, 10, 170));

  // Полки: синхронизированы с профилем
  const flanges = input.flanges.length === nFlanges ? input.flanges : prof.flanges;

  // Развёртка
  const bendAllowances: number[] = [];
  const bendDeductions: number[] = [];
  for (let i = 0; i < nBends; i++) {
    const phi = angles[i];
    const ossb = Math.tan((phi / 2) * (Math.PI / 180)) * (R + t);
    const ba = (phi * Math.PI / 180) * (R + K * t);
    bendAllowances.push(round2(ba));
    bendDeductions.push(round2(2 * ossb - ba));
  }
  const sumExt = flanges.reduce((s, f) => s + f, 0);
  const flat = Math.max(0, round1(sumExt - bendDeductions.reduce((s, d) => s + d, 0)));

  // Прямые участки (для схемы развёртки)
  const straightLengths: number[] = [];
  for (let i = 0; i < nFlanges; i++) {
    const dA = i > 0 || prof.closed ? bendDeductions[(i - 1 + nBends) % nBends] / 2 : 0;
    const dB = i < nFlanges - 1 || prof.closed ? bendDeductions[i % nBends] / 2 : 0;
    straightLengths.push(Math.max(0, round1(flanges[i] - dA - dB)));
  }

  // Вес
  const volumeM3 = (flat * input.length * t) * 1e-9;
  const weightPiece = round2(volumeM3 * mat.density);
  const weightBatch = round2(weightPiece * input.quantity);

  // Усилие гибки (одна гибка на всю длину)
  const forceKN = round1((1.33 * mat.rm * t * t * input.length) / V / 1000);
  const forceTon = round1(forceKN / 9.81);
  const recommendedPress = Math.ceil((forceTon * 1.3) / 5) * 5;

  const minFl = minFlange(V, t);
  const W = WORKSHOP;

  if (t < W.press.minThickness) {
    warnings.push({ level: "warn", text: `Толщина ${t} мм меньше минимальной для гибки (${W.press.minThickness} мм).` });
  }
  if (t > W.press.maxThickness) {
    warnings.push({ level: "warn", text: `Гибка ${t} мм превышает стандартную (${W.press.maxThickness} мм) — по согласованию.` });
  }

  const maxLaser = W.laser.maxThickness[mat.id] ?? 5;
  if (t > maxLaser) {
    warnings.push({ level: "error", text: `Лазер ${mat.short}: толщина ${t} мм превышает предел ${maxLaser} мм.` });
  }

  if (input.length > W.press.maxWidth) {
    warnings.push({ level: "error", text: `Длина ${input.length} мм превышает макс. ширину гиба ${W.press.maxWidth} мм.` });
  }

  const maxDepth = input.length <= W.press.maxDepthNarrowWidth ? W.press.maxDepthNarrow : W.press.maxDepth;
  const maxFlange = Math.max(...flanges);
  if (maxFlange > maxDepth) {
    warnings.push({ level: "warn", text: `Полка ${maxFlange} мм превышает макс. глубину гиба ${maxDepth} мм при ширине ${input.length} мм.` });
  }

  if (flanges.some((f) => f < W.press.minFlange)) {
    warnings.push({ level: "warn", text: `Полка меньше мин. высоты фланца ${W.press.minFlange} мм (V-гибка).` });
  }

  if (prof.closed) {
    const minF = Math.min(...flanges);
    if (minF < W.press.minClosedBend) {
      warnings.push({ level: "warn", text: `Мин. внутренний размер замкнутого гиба ${minF} мм меньше ${W.press.minClosedBend} мм.` });
    }
  }

  const recV = recommendedV(t);

  // Предупреждения
  flanges.forEach((f, i) => {
    if (f < minFl) {
      warnings.push({
        level: f < minFl * 0.6 ? "error" : "warn",
        text: `Полка ${i + 1} (${f} мм) меньше минимальной ${minFl} мм для V-матрицы ${V} мм — кромка провалится в ручей.`,
      });
    }
  });
  if (V / t < 6 || V / t > 12) {
    warnings.push({
      level: "warn",
      text: `Отношение V/t = ${(V / t).toFixed(1)}. Рекомендуемый диапазон 6…12 (оптимум 8×t = ${recV} мм).`,
    });
  }
  if (forceTon > input.pressTon) {
    warnings.push({
      level: "error",
      text: `Требуемое усилие ${fmt(forceTon)} т превышает тоннаж пресса ${input.pressTon} т. Нужен пресс ≥ ${recommendedPress} т.`,
    });
  } else if (forceTon > input.pressTon * 0.8) {
    warnings.push({
      level: "warn",
      text: `Усилие гибки ${fmt(forceTon)} т — близко к пределу пресса (${input.pressTon} т). Работайте на верхней границе режима.`,
    });
  }
  if (R < t && mat.id !== "aluminium") {
    warnings.push({
      level: "warn",
      text: `Внутренний радиус R=${R} мм < t=${t} мм: риск трещин на растянутой грани${mat.id === "stainless" ? " (нержавейка особенно чувствительна)" : ""}. Увеличьте V-матрицу.`,
    });
  }
  if (input.length > 2500) {
    warnings.push({ level: "info", text: `Длина изделия ${fmt(input.length)} мм: убедитесь в достаточной длине стола пресса и поддержке листа.` });
  }
  if (prof.id === "box") {
    warnings.push({ level: "info", text: "Короб: 4-й гиб замыкает контур — проверьте, что изделие снимается с матрицы (замковый гиб выполняется последним)." });
  }
  if (angles.some((a) => a !== 90)) {
    warnings.push({ level: "info", text: "Ненормированные углы: для точного развёртывания заказывайте пробную гибку (тестовый образец)." });
  }

  // ─── Лазерная резка ───
  const cutLengthMm = input.cutLengthMm && input.cutLengthMm > 0
    ? input.cutLengthMm
    : input.length * 2 + flat * 2;
  const laserEnabled = input.laserEnabled ?? false;
  const laserPierceCount = input.laserPierceCount ?? 0;
  const laserCalc = laserEnabled
    ? calcLaserCost(mat.id, t, cutLengthMm, laserPierceCount, input.laserPrice ?? 0)
    : { lengthM: 0, pierceCount: 0, cost: 0, usedPrice: 0 };
  const laser = round2(laserCalc.cost * input.quantity);

  // Стоимость
  const metal = round2(weightBatch * input.metalPrice * WASTE_FACTOR);
  const bending = round2(nBends * (input.length / 1000) * input.pricePerMeter * input.quantity);
  const setup = round2(input.setupCost);
  const subtotal = round2(metal + bending + setup + laser);
  const vat = round2(subtotal * VAT_RATE);
  const total = round2(subtotal + vat);

  return {
    ok: flat > 0 && input.length > 0 && input.quantity > 0,
    kFactor: K,
    innerRadius: R,
    flat,
    bendAllowances,
    bendDeductions,
    straightLengths,
    weightPiece,
    weightBatch,
    forceKN,
    forceTon,
    recommendedPress,
    minFlange: minFl,
    recommendedV: recV,
    nBends,
    cost: {
      metal, bending, setup,
      laser,
      laserLengthM: round2(laserCalc.lengthM * input.quantity),
      laserPierceCount: laserCalc.pierceCount * input.quantity,
      subtotal, vat, total,
    },
    warnings,
  };
}

// ─── Утилиты ─────────────────────────────────────────────────────────────────

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const round1 = (v: number) => Math.round(v * 10) / 10;
export const round2 = (v: number) => Math.round(v * 100) / 100;

const nf0 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmt = (v: number) => nf1.format(v);
export const fmt0 = (v: number) => nf0.format(v);
export const fmt2 = (v: number) => nf2.format(v);
export const fmtMoney = (v: number) => nf0.format(Math.round(v)) + " ₽";
