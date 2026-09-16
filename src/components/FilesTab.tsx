import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MATERIALS, THICKNESSES, recommendedV, fmt, fmtMoney, VAT_RATE } from "../lib/bending";
import { analyzeFile, evaluateFile, evaluateFileParts, measureUnits, type EvalParams, type FileEval, type FileGeom, type SourceFile } from "../lib/fileeval";
import type { PartMode } from "../lib/extract";
import GeoCard from "./GeoCard";
import Part3DViewer from "./Part3DViewer";
import NumberField from "./NumberField";

interface Props {
  files: SourceFile[];
  onFiles: (f: SourceFile[]) => void;
  client: { name: string; phone: string; email: string };
  onClient: (c: { name: string; phone: string; email: string }) => void;
  tech: EvalParams;
  onTech: (p: Partial<EvalParams>) => void;
  onAdd: (ev: FileEval, title: string, client: { name: string; phone: string; email: string }) => void;
  onAddParts?: (evs: FileEval[], names: string[], title: string, client: { name: string; phone: string; email: string }) => void;
  /** сообщает наверх актуальный список оценок по файлам (для общей сводки) */
  onEvals?: (list: FileEval[]) => void;
}

let fid = 1;

export default function FilesTab({ files, onFiles, client, onClient, tech, onTech, onAdd, onAddParts, onEvals }: Props) {
  const [busy, setBusy] = useState(false);
  const [geoms, setGeoms] = useState<Record<string, FileGeom>>({});
  const [calib, setCalib] = useState<Record<string, string>>({});
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [partNames, setPartNames] = useState<Record<string, string[]>>({});
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [open3D, setOpen3D] = useState<string | null>(null);
  const dxfRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  const ingest = useCallback(
    async (list: FileList | null, kind: "dxf" | "pdf" | "img") => {
      if (!list || list.length === 0) return;
      setBusy(true);
      const next: SourceFile[] = [];
      for (const f of Array.from(list)) {
        try {
          if (kind === "dxf") next.push({ id: `f${fid++}`, name: f.name, kind, text: await f.text() });
          else next.push({ id: `f${fid++}`, name: f.name, kind, data: await f.arrayBuffer() });
        } catch {
          /* пропуск нечитаемого файла */
        }
      }
      onFiles([...files, ...next]);
      setBusy(false);
    },
    [files, onFiles]
  );

  // Геометрический разбор всех файлов
  useEffect(() => {
    let alive = true;
    (async () => {
      setBusy(true);
      const out: Record<string, FileGeom> = {};
      for (const f of files) {
        try {
          const g = await analyzeFile(f, 1);
          out[g.fileId] = g;
        } catch {
          /* ignore */
        }
      }
      if (!alive) return;
      setGeoms(out);
      // автокалибровка: по умолчанию натуральный масштаб для вектора
      setCalib((c) => {
        const nc = { ...c };
        Object.values(out).forEach((g) => {
          if (nc[g.fileId] === undefined) {
            const natural = g.unitToMm > 0 ? measureUnits(g) * g.unitToMm : 0;
            nc[g.fileId] = g.autoScale && natural > 0 ? String(Math.round(natural * 100) / 100) : "";
          }
        });
        return nc;
      });
      setTitles((t) => {
        const nt = { ...t };
        Object.values(out).forEach((g) => {
          if (!nt[g.fileId]) nt[g.fileId] = g.name.replace(/\.[^.]+$/, "");
        });
        return nt;
      });
      setBusy(false);
    })();
    return () => {
      alive = false;
    };
  }, [files]);

  // Пересчёт при изменении технологии / калибровки
  const results = useMemo(() => {
    const map: Record<string, FileEval> = {};
    Object.values(geoms).forEach((g) => {
      map[g.fileId] = evaluateFile(g, Number(calib[g.fileId] ?? 0), tech);
    });
    return map;
  }, [geoms, calib, tech]);

  const list = files.map((f) => results[f.id]).filter(Boolean);

  // Разбиение каждого файла на отдельные детали (если контуров несколько)
  const partsMap = useMemo(() => {
    const map: Record<string, FileEval[]> = {};
    Object.values(geoms).forEach((g) => {
      try {
        map[g.fileId] = evaluateFileParts(g, Number(calib[g.fileId] ?? 0), tech);
      } catch (e) {
        console.warn("evaluateFileParts failed:", e);
        map[g.fileId] = [];
      }
    });
    return map;
  }, [geoms, calib, tech]);

  // Инициализация массивов имён при изменении partsMap
  useEffect(() => {
    setPartNames((prev) => {
      const next = { ...prev };
      Object.entries(partsMap).forEach(([fid, parts]) => {
        const old = next[fid] ?? [];
        if (old.length !== parts.length) {
          next[fid] = new Array(parts.length).fill("").map((_, i) => old[i] ?? "");
        }
      });
      return next;
    });
  }, [partsMap]);

  // поднимаем актуальные оценки наверх для общей сводки данных
  useEffect(() => {
    onEvals?.(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(list.map((e) => [e.geom.fileId, e.cost.total, e.weightBatch, e.part.nBends, e.quality]))]);

  return (
    <div className="space-y-6">
      {/* Загрузка + параметры технологии */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          {[
            { ref: dxfRef, icon: "📎", t: "DXF-чертежи", s: "вектор: контуры, линии гиба, площадь", accept: ".dxf", k: "dxf" as const },
            { ref: pdfRef, icon: "📄", t: "PDF-чертежи", s: "векторные пути, при скане — распознавание", accept: ".pdf", k: "pdf" as const },
            { ref: imgRef, icon: "🖼", t: "Сканы и фото", s: "PNG / JPG — бинаризация и контур", accept: "image/*", k: "img" as const },
          ].map((z) => (
            <div
              key={z.t}
              className="group flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-4 py-3.5 transition hover:border-amber-500 hover:bg-amber-50/50"
              onClick={() => z.ref.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                ingest(e.dataTransfer.files, z.k);
              }}
            >
              <div className="text-xl">{z.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-bold text-slate-700 group-hover:text-amber-700">{z.t}</div>
                <div className="truncate text-[11.5px] text-slate-400">{z.s}</div>
              </div>
              <span className="shrink-0 text-[11px] font-bold text-amber-600">выбрать</span>
              <input ref={z.ref} type="file" accept={z.accept} multiple className="hidden"
                onChange={(e) => { ingest(e.target.files, z.k); e.target.value = ""; }} />
            </div>
          ))}

          {files.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-bold tracking-wide text-slate-400 uppercase">Файлы ({files.length})</span>
                <button type="button" onClick={() => onFiles([])} className="text-[11px] font-bold text-red-500 hover:text-red-700">
                  Очистить все
                </button>
              </div>
              <div className="max-h-32 space-y-1 overflow-auto">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5">
                    <span className="truncate text-[12px] font-medium text-slate-700">{f.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold text-slate-400 uppercase">{f.kind}</span>
                      <button type="button" onClick={() => onFiles(files.filter((x) => x.id !== f.id))}
                        className="text-slate-400 hover:text-red-500">✕</button>
                    </span>
                  </div>
                ))}
              </div>
              {busy && <div className="mt-2 text-center text-[11px] font-semibold text-amber-600">Разбор геометрии…</div>}
            </div>
          )}
        </div>

        {/* Параметры технологии — общие для всех файлов */}
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="text-[11px] font-bold tracking-[0.08em] text-slate-400 uppercase">Технология (применяется ко всем файлам)</div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Материал</label>
              <select className="field" value={tech.materialId} onChange={(e) => onTech({ materialId: e.target.value })}>
                {MATERIALS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Толщина, мм</label>
              <select className="field" value={tech.thickness}
                onChange={(e) => onTech({ thickness: Number(e.target.value), vMatrix: recommendedV(Number(e.target.value)) })}>
                {THICKNESSES.map((t) => <option key={t} value={t}>{String(t).replace(".", ",")}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">
              Как задан чертёж <span className="hint">влияет на формулу веса и развёртки</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([
                ["flat", "Развёртка", "плоская заготовка: вес = S·t·ρ, гибы — по линиям внутри контура"],
                ["section", "Сечение / вид", "профиль в изометрии: развёртка = средняя линия контура"],
              ] as const).map(([id, t, s]) => (
                <button key={id} type="button" onClick={() => onTech({ mode: id as PartMode })}
                  className={`rounded-lg border px-3 py-2 text-left transition ${
                    tech.mode === id ? "border-amber-500 bg-amber-50 shadow-[0_0_0_3px_rgba(245,158,11,0.12)]" : "border-slate-300 bg-white hover:border-slate-400"
                  }`}>
                  <div className={`text-[12.5px] font-bold ${tech.mode === id ? "text-amber-800" : "text-slate-600"}`}>{t}</div>
                  <div className="mt-0.5 text-[10.5px] leading-snug text-slate-400">{s}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">V-матрица, мм</label>
              <NumberField
                value={tech.vMatrix}
                onChange={(v) => onTech({ vMatrix: v })}
                min={2}
                step={0.5}
              />
            </div>
            <div>
              <label className="label">
                <button type="button" onClick={() => onTech({ forceLength: !tech.forceLength })}
                  className="hint cursor-pointer font-bold text-amber-600 hover:text-amber-700">
                  {tech.forceLength ? "✓ вручную" : "из чертежа"}
                </button>
              </label>
              <NumberField
                value={tech.partLength}
                onChange={(v) => onTech({ partLength: v })}
                min={10}
                step={10}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Количество, шт</label>
              <NumberField
                value={tech.quantity}
                onChange={(v) => onTech({ quantity: v })}
                min={1}
                step={1}
              />
            </div>
            <div>
              <label className="label">Гибов (вручную)</label>
              <input type="number" className="field" placeholder="авто"
                value={tech.bendsOverride ?? ""} min={0} step={1}
                onChange={(e) => onTech({ bendsOverride: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label">Металл ₽/кг</label>
              <NumberField
                value={tech.metalPrice}
                onChange={(v) => onTech({ metalPrice: v })}
                min={0}
                step={0.5}
              />
            </div>
            <div>
              <label className="label">Гиб ₽/м</label>
              <NumberField
                value={tech.pricePerMeter}
                onChange={(v) => onTech({ pricePerMeter: v })}
                min={0}
                step={1}
              />
            </div>
            <div>
              <label className="label">Наладка ₽</label>
              <NumberField
                value={tech.setupCost}
                onChange={(v) => onTech({ setupCost: v })}
                min={0}
                step={10}
              />
            </div>
          </div>

          {/* Лазерная резка */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-[12px] font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={tech.laserEnabled ?? false}
                  onChange={(e) => onTech({ laserEnabled: e.target.checked })}
                  className="h-4 w-4 accent-amber-600"
                />
                <span>🔦 Лазерная резка контура</span>
              </label>
              {tech.laserEnabled && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-800">
                  вкл.
                </span>
              )}
            </div>
            {tech.laserEnabled && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">
                    Цена, ₽/м <span className="hint font-normal">(0 = авто)</span>
                  </label>
                  <NumberField
                    value={tech.laserPrice ?? 0}
                    onChange={(v) => onTech({ laserPrice: v })}
                    min={0}
                    step={5}
                    placeholder="авто"
                  />
                </div>
                <div>
                  <label className="label">
                    Врезок <span className="hint font-normal">на деталь</span>
                  </label>
                  <NumberField
                    value={tech.laserPierceCount ?? 0}
                    onChange={(v) => onTech({ laserPierceCount: v })}
                    min={0}
                    step={1}
                  />
                </div>
              </div>
            )}
          </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-[12px] font-bold text-slate-700">
              <input
                type="checkbox"
                checked={tech.allowRotate !== false}
                onChange={(e) => onTech({ allowRotate: e.target.checked })}
                className="h-4 w-4 accent-amber-600"
              />
              <span>Разрешить поворот при раскрое</span>
              <span className="hint font-normal">снимите, если направление проката критично</span>
            </label>
          </div>

<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input type="text" className="field" placeholder="Имя" value={client.name}
              onChange={(e) => onClient({ ...client, name: e.target.value })} />
            <input type="text" className="field" placeholder="Телефон" value={client.phone}
              onChange={(e) => onClient({ ...client, phone: e.target.value })} />
            <input type="text" className="field" placeholder="Email" value={client.email}
              onChange={(e) => onClient({ ...client, email: e.target.value })} />
          </div>

          <div className="rounded-lg bg-white px-3 py-2 font-mono text-[11.5px] font-semibold text-slate-600">
            Итого по файлам: {fmtMoney(list.reduce((s, e) => s + e.cost.total, 0))} · без НДС{" "}
            {fmtMoney(list.reduce((s, e) => s + e.cost.subtotal, 0))} · НДС {Math.round(VAT_RATE * 100)} %{" "}
            {fmtMoney(list.reduce((s, e) => s + e.cost.vat, 0))}
          </div>
        </div>
      </div>

      {/* Результаты разбора по каждому файлу */}
      {list.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-bold tracking-[0.08em] text-slate-400 uppercase">
              Расчёт по геометрии файлов ({list.length})
            </h3>
            <span className="font-mono text-[11px] text-slate-400">
              развёртка · гибы · вес · усилие · {fmt(tech.thickness)} мм
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {list.map((ev) => (
              <GeoCard
                key={ev.geom.fileId}
                ev={ev}
                calib={calib[ev.geom.fileId] ?? ""}
                onCalib={(v) => setCalib((c) => ({ ...c, [ev.geom.fileId]: v }))}
                title={titles[ev.geom.fileId] ?? ""}
                onTitle={(v) => setTitles((t) => ({ ...t, [ev.geom.fileId]: v }))}
                parts={partsMap[ev.geom.fileId]}
                partNames={partNames[ev.geom.fileId]}
                onPartNameChange={(idx, name) =>
                  setPartNames((s) => {
                    const fileNames = [...(s[ev.geom.fileId] ?? [])];
                    fileNames[idx] = name;
                    return { ...s, [ev.geom.fileId]: fileNames };
                  })
                }
                added={!!added[ev.geom.fileId]}
                hasBends={!!ev.geom.bends && ev.geom.bends.length > 0}
                onOpen3D={() => setOpen3D(ev.geom.fileId)}
                onAdd={() => {
                  const fileParts = partsMap[ev.geom.fileId] ?? [];
                  const names = partNames[ev.geom.fileId] ?? [];
                  if (fileParts.length > 1 && onAddParts) {
                    onAddParts(fileParts, names, titles[ev.geom.fileId] ?? ev.geom.name, client);
                  } else {
                    onAdd(ev, titles[ev.geom.fileId] ?? ev.geom.name, client);
                  }
                  setAdded((a) => ({ ...a, [ev.geom.fileId]: true }));
                  setTimeout(() => setAdded((a) => ({ ...a, [ev.geom.fileId]: false })), 1800);
                }}
                onRemove={() => onFiles(files.filter((x) => x.id !== ev.geom.fileId))}
              />
            ))}
          </div>
          <p className="text-[12px] leading-relaxed text-slate-400">
            Геометрия берётся непосредственно из файла: DXF — контуры LWPOLYLINE/LINE/ARC/SPLINE и INSERT-блоки;
            PDF — векторные пути оператора <span className="font-mono">constructPath</span> с кривыми Безье и матрицами CTM;
            сканы и фото — порог Отсу, заливка фона и трассировка внешнего контура. Линии гиба ищутся как длинные
            прямые отрезки внутри контура, параллельные осям. Точность развёртки и веса зависит от качества чертежа —
            при распознавании «частично» проверьте калибровку масштаба.
          </p>
        </div>
      )}

      {files.length === 0 && (
        <p className="text-[12px] leading-relaxed text-slate-400">
          Загрузите чертёж — калькулятор сам измерит габариты, посчитает площадь развёртки, найдёт линии гиба и
          определит вес, усилие гибки и стоимость. Для сканов укажите один реальный габарит детали, чтобы задать масштаб.
        </p>
      )}
      {/* Модальное окно 3D-просмотра */}
      {open3D && (() => {
        const g = geoms[open3D];
        const partsArr = partsMap[open3D] ?? [];
        if (!g || partsArr.length === 0) return null;
        const firstPart = partsArr[0];
        // Для 3D берём ПОЛНЫЙ внешний контур (не разрезанный по линиям гиба).
        // splitLoopsToParts режет деталь вдоль гибов — для 3D это не годится.
        const fullOuter = (g.rawLoops ?? [])[0]?.map((q: any) => ({ x: q.x, y: q.y })) ?? [];
        const polygon = fullOuter.length >= 3 ? fullOuter : firstPart.geom.rawLoops[0]?.map((q: any) => ({ x: q.x, y: q.y })) ?? [];
        // Фильтруем линии гиба: оставляем только те, чья середина внутри полигона.
        const bends = ((g.bends ?? []) as any[])
          .filter((b: any) => {
            const pt = { x: (b.from.x + b.to.x) / 2, y: (b.from.y + b.to.y) / 2 };
            let inside = false;
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
              const xi = polygon[i].x, yi = polygon[i].y;
              const xj = polygon[j].x, yj = polygon[j].y;
              const inter = (yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
              if (inter) inside = !inside;
            }
            return inside;
          })
          .map((b: any) => ({
            from: { x: b.from.x, y: b.from.y },
            to: { x: b.to.x, y: b.to.y },
          }));
        if (polygon.length < 3) return null;
        console.log("[3D] polygon:", polygon);
        console.log("[3D] bends:", bends);
        console.log("[3D] allBends(g):", (g as any).bends);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setOpen3D(null)}
          >
            <div
              className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div className="text-[13px] font-bold uppercase tracking-wide text-slate-700">
                  🧊 3D-модель · {titles[open3D] || g.name}
                </div>
                <button
                  type="button"
                  onClick={() => setOpen3D(null)}
                  className="rounded-lg px-3 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  ✕
                </button>
              </div>
              <div className="relative flex-1 min-h-0 bg-gradient-to-b from-slate-50 to-slate-100">
                <Part3DViewer
                  polygon={polygon}
                  bends={bends}
                  thickness={firstPart.thickness ?? tech.thickness}
                  angleDeg={90}
                />
              </div>
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
                {bends.length > 0 ? `Гибов: ${bends.length} · угол 90°` : "Гибов не найдено"}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
