// Построение контура сечения гнутого профиля (внешний + внутренний контуры с дугами гибов)

export interface Pt {
  x: number;
  y: number;
}

export interface ProfileGeometry {
  polygon: Pt[]; // замкнутый контур материала (мм)
  moldPoints: Pt[]; // внешние точки пересечения полок (для простановки размеров)
  outerArcs: { c: Pt; r: number; a1: number; a2: number; sweep: number }[];
  thickness: number;
  radius: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  closed: boolean;
}

/** Периметр замкнутого полигона в мм (длина реза лазера) */
export function polygonLength(polygon: Pt[]): number {
  if (!polygon || polygon.length < 2) return 0;
  let len = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return Math.round(len * 100) / 100;
}

const left = (d: Pt): Pt => ({ x: -d.y, y: d.x });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s });
const rot = (d: Pt, rad: number): Pt => ({
  x: d.x * Math.cos(rad) - d.y * Math.sin(rad),
  y: d.x * Math.sin(rad) + d.y * Math.cos(rad),
});

export interface ProfileSpec {
  id?: string;
  flanges: number[];
  turns: number[];
  cs: [number, number][];
  closed?: boolean;
  startDir?: Pt;
}

const START_DIRS: Record<string, Pt> = {
  angle: { x: 1, y: 0 },
  u: { x: 0, y: -1 },
  z: { x: 1, y: 0 },
  hat: { x: 1, y: 0 },
  box: { x: 1, y: 0 },
};

/**
 * Строит сечение: ломаная внешних размеров (mold points) → центры гибов →
 * касательные, дуги (R+t снаружи, R внутри) → внутренний контур со смещением t.
 */
export function buildProfile(spec: ProfileSpec, t: number, R: number, anglesDeg: number[]): ProfileGeometry {
  if (!Array.isArray(spec.flanges) || spec.flanges.length < (spec.closed ? 3 : 2)) {
    return {
      polygon: [],
      moldPoints: [],
      outerArcs: [],
      thickness: t,
      radius: R,
      bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      closed: !!spec.closed,
    };
  }
  const n = spec.flanges.length;
  const nBends = spec.closed ? n : n - 1;
  const angles = Array.from({ length: nBends }, (_, i) => Math.min(170, Math.max(10, anglesDeg[i] ?? 90)));
  const startDir = START_DIRS[spec.id ?? ""] ?? { x: 1, y: 0 };

  // 1. Точки пересечения внешних граней (mold points) и направления полок
  const mold: Pt[] = [];
  const dirs: Pt[] = [];
  let cur: Pt = { x: 0, y: 0 };
  let d = startDir;
  for (let i = 0; i < n; i++) {
    mold.push(cur);
    dirs.push(d);
    cur = add(cur, mul(d, spec.flanges[i]));
    if (i < nBends) {
      d = rot(d, (spec.turns[i] * angles[i] * Math.PI) / 180);
    }
  }
  if (spec.closed) mold.push({ ...mold[0] });
  else mold.push(cur);

  // 2. Центры гибов: C на расстоянии (R+t) от обеих линий, в стороне полости гиба
  const centers: Pt[] = [];
  const tanA: number[] = []; // касательная дистанция вдоль входящей линии (a<0)
  const tanB: number[] = []; // вдоль исходящей (b>0)
  for (let j = 0; j < nBends; j++) {
    const M = mold[spec.closed ? j : j + 1];
    const u = dirs[spec.closed ? (j - 1 + n) % n : j];
    const v = dirs[spec.closed ? j : j + 1];
    const [su, sv] = spec.cs[j] ?? [1, 1];
    const nu = left(u);
    const nv = left(v);
    const D = R + t;
    // (C−M)·nu = su·D, (C−M)·nv = sv·D; C = M + x·u + y·v
    const x = (sv * D) / (u.x * nv.x + u.y * nv.y || 1e-9);
    const y = (su * D) / (v.x * nu.x + v.y * nu.y || 1e-9);
    centers.push(add(M, add(mul(u, x), mul(v, y))));
    tanA.push(x);
    tanB.push(y);
  }

  // 3. Касательные точки на внешних линиях + стороны внутреннего контура полок
  const T1: Pt[] = [], T2: Pt[] = [];
  const hollow: Pt[] = []; // нормаль «в пустоту» для каждой полки
  for (let j = 0; j < nBends; j++) {
    const idx = spec.closed ? j : j + 1;
    const M = mold[idx];
    const u = dirs[spec.closed ? (j - 1 + n) % n : j];
    const v = dirs[spec.closed ? j : j + 1];
    T1.push(add(M, mul(u, tanA[j])));
    T2.push(add(M, mul(v, tanB[j])));
  }
  for (let i = 0; i < n; i++) {
    const hasIn = spec.closed || i > 0;
    const hasOut = spec.closed || i < n - 1;
    const w = dirs[i];
    const nl = left(w);
    let ref: Pt | null = null;
    let refPoint: Pt | null = null;
    if (hasIn) {
      ref = centers[spec.closed ? i : i - 1];
      refPoint = mold[i];
    } else if (hasOut) {
      ref = centers[i];
      refPoint = mold[i + 1];
    }
    if (ref && refPoint) {
      const s = Math.sign((ref.x - refPoint.x) * nl.x + (ref.y - refPoint.y) * nl.y) || 1;
      hollow.push(mul(nl, s));
    } else {
      hollow.push(nl);
    }
  }

  // 4. Дуги (внешние R+t, внутренние R)
  const arcPts = (c: Pt, r: number, p1: Pt, sweep: number, phi: number): Pt[] => {
    const a1 = Math.atan2(p1.y - c.y, p1.x - c.x);
    const pts: Pt[] = [];
    const seg = Math.max(6, Math.ceil(phi / 8));
    for (let k = 1; k < seg; k++) {
      const a = a1 + (sweep * phi * Math.PI / 180) * (k / seg);
      pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
    }
    return pts;
  };

  // Направление обхода дуги: середина правильной дуги лежит ближе к точке пересечения M
  const dist2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const outerArcData = centers.map((c, j) => {
    const M = mold[spec.closed ? j : j + 1];
    const a1 = Math.atan2(T1[j].y - c.y, T1[j].x - c.x);
    const phi = (angles[j] * Math.PI) / 180;
    const pPlus = { x: c.x + (R + t) * Math.cos(a1 + phi / 2), y: c.y + (R + t) * Math.sin(a1 + phi / 2) };
    const pMinus = { x: c.x + (R + t) * Math.cos(a1 - phi / 2), y: c.y + (R + t) * Math.sin(a1 - phi / 2) };
    return {
      c,
      r: R + t,
      a1,
      a2: Math.atan2(T2[j].y - c.y, T2[j].x - c.x),
      sweep: dist2(pPlus, M) < dist2(pMinus, M) ? 1 : -1,
    };
  });

  // 5. Сборка замкнутого полигона материала
  const polygon: Pt[] = [];
  if (spec.closed) {
    polygon.push(T1[0]);
    for (let j = 0; j < nBends; j++) {
      polygon.push(...arcPts(centers[j], R + t, T1[j], outerArcData[j].sweep, angles[j]));
      polygon.push(T2[j]);
      const jn = (j + 1) % nBends;
      polygon.push(T1[jn]);
    }
    polygon.pop(); // последний T1[0] уже есть
    // внутренний контур в обратном обходе
    for (let j = nBends - 1; j >= 0; j--) {
      const hPrev = hollow[(j - 1 + n) % n];
      const hNext = hollow[j];
      polygon.push(add(T2[j], mul(hNext, t)));
      polygon.push(...arcPts(centers[j], R, add(T2[j], mul(hNext, t)), -outerArcData[j].sweep, angles[j]));
      polygon.push(add(T1[j], mul(hPrev, t)));
    }
  } else {
    polygon.push(mold[0]);
    for (let j = 0; j < nBends; j++) {
      polygon.push(T1[j]);
      polygon.push(...arcPts(centers[j], R + t, T1[j], outerArcData[j].sweep, angles[j]));
      polygon.push(T2[j]);
    }
    polygon.push(mold[n]);
    // торцы
    polygon.push(add(mold[n], mul(hollow[n - 1], t)));
    for (let j = nBends - 1; j >= 0; j--) {
      const hPrev = hollow[j];
      const hNext = hollow[j + 1];
      polygon.push(add(T2[j], mul(hNext, t)));
      polygon.push(...arcPts(centers[j], R, add(T2[j], mul(hNext, t)), -outerArcData[j].sweep, angles[j]));
      polygon.push(add(T1[j], mul(hPrev, t)));
    }
    polygon.push(add(mold[0], mul(hollow[0], t)));
  }

  const allX = polygon.map((p) => p.x);
  const allY = polygon.map((p) => p.y);

  return {
    polygon,
    moldPoints: mold,
    outerArcs: outerArcData,
    thickness: t,
    radius: R,
    bbox: { minX: Math.min(...allX), minY: Math.min(...allY), maxX: Math.max(...allX), maxY: Math.max(...allY) },
    closed: !!spec.closed,
  };
}
