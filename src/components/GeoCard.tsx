import { useEffect, useRef, useState } from "react";
import { fmtWeightText } from "../lib/cart";
import { bboxOf, type Pt } from "../lib/extract";
import type { FileEval } from "../lib/fileeval";

/** Отрисовка распознанной геометрии с наложением линий гиба */
function GeoCanvas({ ev }: { ev: FileEval }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onR = () => setTick((t) => t + 1);
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const parent = cv.parentElement!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(parent.clientWidth, 40);
    const H = Math.max(parent.clientHeight, 40);
    cv.width = W * dpr;
    cv.height = H * dpr;
    cv.style.width = W + "px";
    cv.style.height = H + "px";
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);

    const g = ev.geom;
    const hasPreview = !!g.previewCanvas;
    const loops = g.rawLoops;
    const lbb = bboxOf(loops.length ? loops : [[{ x: 0, y: 0 }, { x: 1, y: 1 }]]);
    // базовый прямоугольник: вся страница (для растра) или контуры (для вектора)
    const base = hasPreview && g.raster ? { minX: 0, minY: 0, maxX: g.raster.pageW, maxY: g.raster.pageH } : lbb;
    const bw = Math.max(base.maxX - base.minX, 1e-6);
    const bh = Math.max(base.maxY - base.minY, 1e-6);
    const pad = 14;
    const scale = Math.min((W - pad * 2) / bw, (H - pad * 2) / bh);
    const ox = (W - bw * scale) / 2;
    const oy = (H - bh * scale) / 2;
    const X = (u: number) => ox + (u - base.minX) * scale;
    const Y = (u: number) => oy + (base.maxY - u) * scale;

    // превью страницы (скан)
    if (hasPreview && g.previewCanvas) {
      ctx.globalAlpha = 0.92;
      ctx.drawImage(g.previewCanvas, X(base.minX), Y(base.maxY), bw * scale, bh * scale);
      ctx.globalAlpha = 1;
    }
    // маска распознанной области
    if (g.raster?.mask) {
      ctx.globalAlpha = 0.45;
      ctx.drawImage(g.raster.mask, X(base.minX), Y(base.maxY), bw * scale, bh * scale);
      ctx.globalAlpha = 1;
    }

    // контуры
    ctx.lineWidth = 1.4;
    loops.forEach((loop: Pt[]) => {
      if (loop.length < 2) return;
      ctx.beginPath();
      loop.forEach((p, i) => (i === 0 ? ctx.moveTo(X(p.x), Y(p.y)) : ctx.lineTo(X(p.x), Y(p.y))));
      ctx.closePath();
      ctx.strokeStyle = "#1e293b";
      ctx.stroke();
      ctx.fillStyle = "rgba(37,99,235,0.10)";
      ctx.fill();
    });

    // габарит распознанной детали
    ctx.strokeStyle = "#ea580c";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(X(lbb.minX), Y(lbb.maxY), (lbb.maxX - lbb.minX) * scale, (lbb.maxY - lbb.minY) * scale);
    ctx.setLineDash([]);

    // линии гиба
    ev.part.bendLines.forEach((b) => {
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      if (b.axis === "y") {
        ctx.moveTo(X(b.coord), Y(b.from));
        ctx.lineTo(X(b.coord), Y(b.to));
      } else {
        ctx.moveTo(X(b.from), Y(b.coord));
        ctx.lineTo(X(b.to), Y(b.coord));
      }
      ctx.stroke();
      ctx.setLineDash([]);
      // маркер
      const mx = b.axis === "y" ? X(b.coord) : X((b.from + b.to) / 2);
      const my = b.axis === "y" ? Y((b.from + b.to) / 2) : Y(b.coord);
      ctx.fillStyle = "#dc2626";
      ctx.beginPath();
      ctx.arc(mx, my, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [ev, tick]);

  return <canvas ref={ref} className="absolute inset-0" />;
}

const SRC_LABEL: Record<string, string> = {
  dxf: "DXF · вектор",
  "pdf-vector": "PDF · векторные пути",
  "pdf-raster": "PDF · распознан растр",
  image: "Изображение · распознан растр",
  none: "геометрия не распознана",
};

export default function GeoCard({
  ev,
  calib,
  onCalib,
  title,
  onTitle,
  parts,
  partNames,
  onPartNameChange,
  onAdd,
  added,
  onRemove,
}: {
  ev: FileEval;
  calib: string;
  onCalib: (v: string) => void;
  title: string;
  onTitle: (v: string) => void;
  /** Массив деталей, если файл содержит несколько контуров */
  parts?: import("../lib/fileeval").FileEval[];
  partNames?: string[];
  onPartNameChange?: (idx: number, name: string) => void;
  onAdd: () => void;
  added: boolean;
  onRemove: () => void;
}) {
  const p = ev.part;
  const money = (v: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(v)) + " ₽";
  const n1 = (v: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(v);
  const q = ev.quality;
  const qStyle =
    q === "ok"
      ? "bg-emerald-100 text-emerald-800"
      : q === "partial"
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-800";
  const qText = q === "ok" ? "геометрия распознана" : q === "partial" ? "распознано частично" : "не распознано";

  return (
    <div className="vis-card !p-0 overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-amber-600">◈</span>
          <span className="truncate text-[13px] font-bold text-slate-700">{ev.geom.name}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${qStyle}`}>{qText}</span>
        </div>
        <button onClick={onRemove} className="shrink-0 rounded-md px-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500">✕</button>
      </div>

      <div className="relative h-56 bg-white">
        <GeoCanvas ev={ev} />
        <span className="absolute top-2 left-2 rounded-full bg-slate-900/80 px-2 py-0.5 font-mono text-[10px] font-semibold text-white">
          {SRC_LABEL[ev.geom.source]}
        </span>
        <span className="absolute right-2 bottom-2 rounded-full bg-white/90 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
          {ev.geom.vectorPaths > 0 ? `${ev.geom.vectorPaths} путей · ` : ""}
          {p.keptLoops}/{p.totalLoops} контуров
        </span>
      </div>

      {/* Измерения */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-b border-slate-100 px-4 py-3 font-mono text-[11.5px] sm:grid-cols-4">
        <div><div className="font-sans text-[10px] font-bold text-slate-400 uppercase">Габарит X</div><div className="font-bold text-slate-800">{n1(p.widthMm)} мм</div></div>
        <div><div className="font-sans text-[10px] font-bold text-slate-400 uppercase">Габарит Y</div><div className="font-bold text-slate-800">{n1(p.heightMm)} мм</div></div>
        <div><div className="font-sans text-[10px] font-bold text-slate-400 uppercase">Площадь</div><div className="font-bold text-slate-800">{n1(p.areaMm2 / 100)} см²</div></div>
        <div><div className="font-sans text-[10px] font-bold text-slate-400 uppercase">Длина реза</div><div className="font-bold text-slate-800">{n1(p.cutLenMm)} мм</div></div>
      </div>

      <div className="space-y-3 px-4 py-3">
        {/* Калибровка */}
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
          <label className="mb-1 block text-[10.5px] font-bold tracking-wide text-amber-800 uppercase">
            Калибровка масштаба
            <span className="ml-1 font-sans font-medium text-amber-700 normal-case">
              измерено {n1(ev.measuredUnits)} {ev.geom.unitName} — введите реальный размер
            </span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              className="field !py-1.5 text-center text-[13px]"
              value={calib}
              min={0}
              step="any"
              placeholder="мм"
              onChange={(e) => onCalib(e.target.value)}
            />
            <span className="shrink-0 font-mono text-[11px] font-bold whitespace-nowrap text-amber-800">
              1 {ev.geom.unitName} = {ev.mmPerUnit.toFixed(ev.mmPerUnit < 0.01 ? 4 : 3)} мм
            </span>
          </div>
        </div>

        {/* Название */}
        <input
          type="text"
          className="field !py-2 text-[13px]"
          placeholder="Название детали"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
        />

        {/* Результаты гибки */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { l: "Развёртка", v: `${n1(p.flatMm)} мм` },
            { l: "Гибов", v: String(p.nBends) },
            { l: "Вес шт.", v: fmtWeightText(ev.weightPiece) },
            { l: "Усилие", v: `${n1(ev.forceTon)} т` },
          ].map((c) => (
            <div key={c.l} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
              <div className="text-[9.5px] font-bold tracking-wide text-slate-400 uppercase">{c.l}</div>

        {/* Список деталей файла */}
        {parts && parts.length > 1 && (
          <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
            <div className="text-[11.5px] font-bold uppercase tracking-wider text-amber-800">
              Детали файла ({parts.length}) — задайте названия
            </div>
            {parts.map((pp, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 shrink-0 font-mono text-[11px] font-bold text-slate-400">
                  #{i + 1}
                </span>
                <input
                  type="text"
                  className="field flex-1 py-1.5 text-[12.5px]"
                  placeholder={`Деталь ${i + 1}`}
                  value={partNames?.[i] ?? ""}
                  onChange={(e) => onPartNameChange?.(i, e.target.value)}
                />
                <span className="shrink-0 font-mono text-[10.5px] text-slate-500 whitespace-nowrap">
                  {pp.part.widthMm.toFixed(0)}×{pp.part.heightMm.toFixed(0)} мм
                </span>
              </div>
            ))}
          </div>
        )}
              <div className="font-mono text-[14px] font-bold text-slate-900">{c.v}</div>
            </div>
          ))}
        </div>

        {/* Смета */}
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg bg-slate-900 px-3.5 py-2.5">
          <div className="space-y-0.5 font-mono text-[11px] text-slate-300">
            <div>металл {money(ev.cost.metal)} · гибка {money(ev.cost.bending)} · наладка {money(ev.cost.setup)}</div>
            <div className="text-slate-400">
              без НДС {money(ev.cost.subtotal)} · НДС {money(ev.cost.vat)} · {fmtWeightText(ev.weightBatch)}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-lg font-black text-amber-400">{money(ev.cost.total)}</div>
            <div className="font-mono text-[10px] text-slate-400">{money(ev.perPiece)} / шт</div>
          </div>
        </div>

        {/* Примечания */}
        {ev.notes.length > 0 && (
          <ul className="space-y-1">
            {ev.notes.slice(0, 5).map((n, i) => (
              <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-slate-500">
                <span className="text-amber-500">•</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={onAdd}
          disabled={q === "none"}
          className={`w-full rounded-lg px-4 py-2.5 text-[13px] font-bold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 ${
            added ? "bg-emerald-600" : "bg-amber-600 hover:bg-amber-700"
          }`}
        >
          {added ? "✓ Добавлено в смету" : "+ Добавить в смету по геометрии"}
        </button>
      </div>
    </div>
  );
}
