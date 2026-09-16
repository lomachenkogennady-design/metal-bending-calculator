import { useEffect, useMemo, useState } from "react";
import {
  MATERIALS,
  PROFILES,
  VAT_RATE,
  calculate,
  innerRadiusFromV,
} from "./lib/bending";
import { buildProfile, polygonLength } from "./lib/geometry";
import { itemFromCalc, itemFromExtracted, shortName, type CartItem } from "./lib/cart";
import type { EvalParams, FileEval, SourceFile } from "./lib/fileeval";
import { buildSummary } from "./lib/summary";
import { exportReportToPdf } from "./lib/exportPdf";
import { exportInvoiceToPdf } from "./lib/exportInvoice";
import { loadMode, saveMode, type DeviceMode } from "./lib/device";
import DeviceSwitch from "./components/DeviceSwitch";
import ManualTab from "./components/ManualTab";
import FilesTab from "./components/FilesTab";
import Results from "./components/Results";
import SummaryPanel from "./components/SummaryPanel";
import CartTable from "./components/CartTable";
import CuttingTab from "./components/CuttingTab";
import ReportPrint from "./components/ReportPrint";

const DEFAULT_INPUT = {
  materialId: "stainless",
  thickness: 2,
  profileId: "u",
  flanges: [40, 80, 40],
  angles: [90, 90],
  length: 1000,
  vMatrix: 16,
    bendMethod: "air" as "air" | "coining",
  quantity: 64,
  pressTon: 100,
  setupCost: 500,
  metalPrice: 0,
  pricePerMeter: 50,
  detailName: "",
  clientName: "",
  clientPhone: "",
  clientEmail: "",
};

function loadCart(): CartItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem("fireprom-cart") ?? "[]");
    if (!Array.isArray(raw)) return [];
    // Миграция: нормализуем старые записи — короткое имя, обрезаем длинные title
    return raw.map((it: any) => ({
      ...it,
      title: shortName(it.title || ""),
    }));
  } catch {
    return [];
  }
}

export default function App() {
  const [tab, setTab] = useState<"manual" | "files" | "cutting">("manual");
  const [mode, setMode] = useState<DeviceMode>(() => loadMode());
  const [input, setInput] = useState<typeof DEFAULT_INPUT>(() => {
    try {
      return { ...DEFAULT_INPUT, ...(JSON.parse(localStorage.getItem("fireprom-input") ?? "{}") as Partial<typeof DEFAULT_INPUT>) };
    } catch {
      return DEFAULT_INPUT;
    }
  });
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [cart, setCart] = useState<CartItem[]>(loadCart);
  const [exporting, setExporting] = useState(false);
  const [added, setAdded] = useState(false);
  // технологические параметры для расчёта по файлам
  const [fileTech, setFileTech] = useState<EvalParams>(() => {
    try {
      return { ...{ materialId: "stainless", thickness: 2, vMatrix: 16, quantity: 1, metalPrice: 0, pricePerMeter: 50, setupCost: 500, mode: "flat" as const, partLength: 1000, forceLength: false, bendsOverride: null, laserEnabled: false, laserPrice: 0, laserPierceCount: 0 }, ...JSON.parse(localStorage.getItem("fireprom-files-tech") ?? "{}") };
    } catch {
      return { materialId: "stainless", thickness: 2, vMatrix: 16, quantity: 1, metalPrice: 0, pricePerMeter: 50, setupCost: 500, mode: "flat", partLength: 1000, forceLength: false, bendsOverride: null };
    }
  });
  // живые оценки по загруженным файлам (для общей сводки)
  const [fileEvals, setFileEvals] = useState<FileEval[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem("fireprom-cart", JSON.stringify(cart));
      localStorage.setItem("fireprom-files-tech", JSON.stringify(fileTech));
      localStorage.setItem("fireprom-input", JSON.stringify(input));
    } catch { /* noop */ }
  }, [cart, fileTech, input]);

      useEffect(() => { saveMode(mode); }, [mode]);

  // Автоподстановка цены убрана — пользователь вводит вручную

const result = useMemo(() => calculate(input), [input]);
  const geom = useMemo(() => {
    const prof = PROFILES.find((p) => p.id === input.profileId) ?? PROFILES[0];
    const inputFlanges = Array.isArray(input.flanges) ? input.flanges : [];
    const flanges = inputFlanges.length === prof.flanges.length && inputFlanges.length > 0 ? inputFlanges : prof.flanges;
    if (!flanges?.length) {
      console.warn("buildProfile: пустой flanges", { prof, input });
      return null;
    }
    try {
      return buildProfile({ ...prof, flanges }, input.thickness, innerRadiusFromV(input.vMatrix), input.angles);
    } catch (e) {
      console.error("buildProfile упал:", e, { prof, flanges, input });
      return null;
    }
  }, [input.profileId, input.thickness, input.vMatrix, input.flanges, input.angles]);

  const cutLength = useMemo(
    () => (geom ? polygonLength(geom.polygon) : 0),
    [geom],
  );

  const resultWithCut = useMemo(() => {
    if (cutLength > 0) {
      return calculate({ ...input, cutLengthMm: cutLength });
    }
    return result;
  }, [input, cutLength, result]);

  const patch = (p: Partial<typeof input>) => setInput((s) => ({ ...s, ...p }));

  const addCalcPosition = () => {
    setCart((c) => [...c, itemFromCalc(input, result)]);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
    setTimeout(() => document.getElementById("smeta")?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
  };

  // Позиция, рассчитанная по геометрии загруженного файла
  const addExtractedPosition = (
    ev: FileEval,
    title: string,
    client: { name: string; phone: string; email: string }
  ) => {
    const mat = MATERIALS.find((m) => m.id === fileTech.materialId);
    setCart((c) => [
      ...c,
      itemFromExtracted(ev, title, client, fileTech.quantity, mat?.short ?? "", fileTech.thickness),
    ]);
    setTimeout(() => document.getElementById("smeta")?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
  };

  // Несколько деталей из одного DXF (после splitLoopsToParts)
  const addExtractedParts = (
    evs: FileEval[],
    names: string[],
    title: string,
    client: { name: string; phone: string; email: string },
  ) => {
    const mat = MATERIALS.find((m) => m.id === fileTech.materialId);
    setCart((c) => [
      ...c,
      ...evs.map((ev, idx) => {
        const custom = (names[idx] ?? "").trim();
        const partTitle = custom
          ? `${title} · ${custom}`
          : `${title} · деталь ${idx + 1}`;
        return itemFromExtracted(
          ev,
          partTitle,
          client,
          fileTech.quantity,
          mat?.short ?? "",
          fileTech.thickness,
        );
      }),
    ]);
    setTimeout(() => document.getElementById("smeta")?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
  };

  const reportItems: CartItem[] = cart.length
    ? cart
    : [itemFromCalc(input, result)];

  const doExport = async () => {
    console.log("[doExport] НАЖАТА кнопка Экспорт PDF");
    setExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 60));
      console.log("[doExport] вызываю exportReportToPdf, позиций:", reportItems.length);
      await exportReportToPdf(`smeta-fireprom-${new Date().toISOString().slice(0, 10)}.pdf`, reportItems);
      console.log("[doExport] PDF готов");
    } catch (e) {
      console.error("[doExport] ОШИБКА:", e);
    } finally {
      setExporting(false);
    }
  };

  const doExportInvoice = async () => {
    setExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 60));
      // Авто-нумерация: стартуем с 151 (у заказчика был 150)
      const KEY = "fireprom-invoice-counter";
      let num = 151;
      try {
        const saved = localStorage.getItem(KEY);
        if (saved) num = Math.max(151, parseInt(saved, 10) || 151);
      } catch { /* noop */ }
      const today = new Date();
      const dateShort = today.toISOString().slice(0, 10);
      await exportInvoiceToPdf(
        `schet-fireprom-${num}-${dateShort}.pdf`,
        reportItems,
        String(num),
        today,
      );
      try { localStorage.setItem(KEY, String(num + 1)); } catch { /* noop */ }
    } catch (e) {
      console.error("[doExportInvoice] ОШИБКА:", e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Шапка */}
      <header className="blueprint-grid-dark sticky top-0 z-40 border-b border-white/10 bg-ink text-white no-print">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <img
                  src="/metal-bending-calculator/logo.jpg"
                  alt="ФАЙЕРПРОМ"
                  className="h-11 w-11 rounded-full object-contain shadow-lg shadow-amber-500/20"
                />
            <div>
              <div className="text-[15px] leading-tight font-black tracking-wide">ООО «ФАЙЕРПРОМ»</div>
              <div className="text-[11px] font-medium text-slate-400">гибка металла · лазерный раскрой · сварка</div>
            </div>
          </div>
          <div className="hidden items-center gap-6 text-[13px] font-semibold text-slate-300 md:flex">
            <span className="rounded-full border border-white/15 px-3 py-1 font-mono text-[11px] text-amber-400">
              онлайн-расчёт 24/7
            </span>
            <a href="tel:+79218635650" className="transition hover:text-white">+7 (921) 863-56-50</a>
            <DeviceSwitch mode={mode} onChange={setMode} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        {/* Заголовок */}
        <div className="animate-rise pt-8 pb-6 sm:pt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[26px] leading-tight font-black tracking-tight text-slate-900 sm:text-[34px]">
                Калькулятор гибки листового металла
              </h1>
              <p className="mt-1.5 max-w-2xl text-[14px] font-medium text-slate-500">
                Развёртка по DIN 6935, усилие гибки, подбор V-матрицы, 3D-модель и стоимость партии
                с НДС {Math.round(VAT_RATE * 100)} % — прямо в браузере.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["развёртка", "усилие, т", "V-матрица", "3D-модель", "DXF / PDF"].map((chip) => (
                <span key={chip} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-bold text-slate-500">
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Вкладки */}
        <div className="no-print mb-6 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {([
            ["manual", "Ручной расчёт"],
            ["files", "Файлы DXF / PDF"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`relative rounded-lg px-5 py-2.5 text-[13px] font-bold transition sm:px-7 ${
                tab === id ? "text-slate-900" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {tab === id && (
                <span className="absolute inset-0 rounded-lg bg-amber-100 shadow-[inset_0_0_0_1.5px_rgba(245,158,11,0.5)]" />
              )}
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>

        {/* Ввод */}
        <div className="no-print animate-fadein rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" key={tab}>
          {tab === "cutting" ? (
            <CuttingTab items={cart.length > 0 ? cart : reportItems} />
          ) : tab === "manual" ? (
            <ManualTab input={input} onChange={patch} onAdd={addCalcPosition} added={added} />
          ) : (
            <FilesTab
              files={files}
              onFiles={setFiles}
              onAdd={addExtractedPosition}
              onAddParts={addExtractedParts}
              client={{ name: input.clientName, phone: input.clientPhone, email: input.clientEmail }}
              onClient={(c) => patch({ clientName: c.name, clientPhone: c.phone, clientEmail: c.email })}
              tech={fileTech}
              onTech={(p) => setFileTech((s) => ({ ...s, ...p }))}
              onEvals={setFileEvals}
            />
          )}
        </div>

        {/* Результаты */}
        {tab === "manual" && geom && <Results input={input} result={resultWithCut} geom={geom} />}

        {/* Сводка всех данных */}
        {(cart.length > 0 || fileEvals.length > 0 || result.ok) && (
          <SummaryPanel
            summary={buildSummary({
              manualInput: input,
              manualResult: result,
              fileEvals,
              cart,
            })}
          />
        )}

        {/* Смета */}
        <section id="smeta" className="no-print mt-10 scroll-mt-20">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[20px] font-black tracking-tight text-slate-900">Смета заказа</h2>
            <span className="rounded-full bg-slate-900 px-3 py-1 font-mono text-[11px] font-bold text-amber-400">
              {cart.length} поз.
            </span>
          </div>
          <CartTable
            items={cart}
            onRemove={(id) => setCart((c) => c.filter((i) => i.id !== id))}
            onClear={() => setCart([])}
            onExportPdf={doExport}
            onExportInvoice={doExportInvoice}
            onPrint={() => window.print()}
            exporting={exporting}
          />
        </section>

        {/* Методика */}
        <section className="no-print mt-10 rounded-xl border border-slate-200 bg-white/70 p-5 text-[12.5px] leading-relaxed text-slate-500">
          <div className="mb-1.5 text-[11px] font-bold tracking-[0.08em] text-slate-400 uppercase">Методика расчёта</div>
          Развёртка: <span className="font-mono font-semibold text-slate-700">L = Σполок − Σ(BD)</span>, где вычет на гиб{" "}
          <span className="font-mono font-semibold text-slate-700">BD = 2·tan(φ/2)·(R+t) − φ·(R + K·t)</span>, K-фактор — по R/t
          (0,33…0,5). Усилие воздушной гибки: <span className="font-mono font-semibold text-slate-700">F = 1,33·Rm·t²·L / V</span>.
          Внутренний радиус при воздушной гибке: <span className="font-mono font-semibold text-slate-700">R ≈ 0,16·V</span>.
          Минимальная полка: <span className="font-mono font-semibold text-slate-700">V/2 + t</span>. Стоимость металла
          учитывает отходы раскроя 7 %. Расчёт носит справочный характер и не является публичной офертой.
        </section>
      </main>

      {/* Подвал */}
      <footer className="no-print border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-6 px-4 py-8 sm:px-6">
          <div>
            <div className="text-[15px] font-black text-slate-900">ООО «ФАЙЕРПРОМ»</div>
            <div className="mt-1 text-[12.5px] text-slate-500">
              г. Санкт-Петербург, 5-й Верхний пер., 19Д<br />
              Производство: гибка листового металла до 6 м, лазерный раскрой, сварка, сборка
            </div>
          </div>
          <div className="text-[12.5px] text-slate-500">
            <a href="tel:+79218635650" className="block font-bold text-slate-900 hover:text-amber-700">+7 (921) 863-56-50</a>
            <a href="mailto:san@fire-prom.ru" className="block font-semibold hover:text-amber-700">san@fire-prom.ru</a>
            <span className="block">Пн–Пт 8:00–18:00</span>
          </div>
        </div>
      </footer>

      {/* Скрытый отчёт для PDF/печати */}
      <div id="report">
        <ReportPrint items={reportItems} date={new Date()} />
      </div>
    </div>
  );
}
