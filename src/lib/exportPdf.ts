import { jsPDF } from "jspdf";
import { cartTotals, groupItems, type CartItem } from "./cart";
import { nestOnSheets } from "./nesting";
import robotoRegularUrl from "../assets/fonts/Roboto-Regular.ttf?url";
import robotoBoldUrl from "../assets/fonts/Roboto-Bold.ttf?url";

const nf0 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (v: number) => nf0.format(v);
/** Вес: граммы для <0,1 кг, иначе кг */
const fmtWeight = (v: number) => {
  if (v > 0 && v < 0.1) return `${(v * 1000).toFixed(1).replace(".", ",")} г`;
  return `${nf1.format(v)} кг`;
};

async function loadFontAsBase64(url: string): Promise<string> {
  const buf = await fetch(url).then((r) => r.arrayBuffer());
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, Array.from(sub) as unknown as number[]);
  }
  return btoa(binary);
}

export async function exportReportToPdf(
  filename: string,
  items: CartItem[],
  date: Date = new Date(),
) {
  const grouped = groupItems(items);
  const tot = cartTotals(grouped);
  const allowRotate = (items[0] as any)?.allowRotate !== false;
  const client = items[0]?.client ?? { name: "", phone: "", email: "" };

  const pdf = new jsPDF("p", "mm", "a4");

  // Встраиваем шрифт с поддержкой кириллицы
  const [regularB64, boldB64] = await Promise.all([
    loadFontAsBase64(robotoRegularUrl),
    loadFontAsBase64(robotoBoldUrl),
  ]);
  pdf.addFileToVFS("Roboto-Regular.ttf", regularB64);
  pdf.addFileToVFS("Roboto-Bold.ttf", boldB64);
  pdf.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  pdf.addFont("Roboto-Bold.ttf", "Roboto", "bold");

  const FONT = "Roboto";
  const pageW = 210, pageH = 297, mx = 12, cw = pageW - mx * 2;
  let y = 16;

  const dateStr = date.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
  const num = `КГ-${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  pdf.setFont(FONT, "bold");
  pdf.setFontSize(16);
  pdf.text("ООО «ФАЙЕРПРОМ»", mx, y);
  pdf.setFont(FONT, "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(100);
  pdf.text("Гибка листового металла · лазерный раскрой · металлоконструкции", mx, y + 4.5);
  pdf.setTextColor(0);
  pdf.setFont(FONT, "bold");
  pdf.setFontSize(12);
  pdf.text(`СМЕТА № ${num}`, pageW - mx, y, { align: "right" });
  pdf.setFont(FONT, "normal");
  pdf.setFontSize(9);
  pdf.text(`от ${dateStr}`, pageW - mx, y + 4.5, { align: "right" });
  y += 9;
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.6);
  pdf.line(mx, y, pageW - mx, y);
  y += 7;

  pdf.setFontSize(9.5);
  pdf.text(`Заказчик: ${client.name || "—"}`, mx, y);
  y += 5;
  pdf.setTextColor(80);
  pdf.text(`Контакт: ${client.phone || "—"}${client.email ? " · " + client.email : ""}`, mx, y);
  pdf.text(`Позиций: ${grouped.length}  ·  вес партии: ${fmtWeight(tot.weight)}`, pageW - mx, y, { align: "right" });
  pdf.setTextColor(0);
  y += 8;

  type Col = { key: string; label: string; w: number; align: "left" | "right" | "center" };
  const cols: Col[] = [
    { key: "n",    label: "№",              w: 6,  align: "center" },
    { key: "name", label: "Наименование",   w: 46, align: "left" },
    { key: "mat",  label: "Материал",       w: 18, align: "left" },
    { key: "th",   label: "Толщ.",          w: 10, align: "center" },
    { key: "bnd",  label: "Гиб.",           w: 9,  align: "center" },
    { key: "fl",   label: "Разв., мм",      w: 14, align: "right" },
    { key: "len",  label: "Длина, мм",      w: 14, align: "right" },
    { key: "qty",  label: "Кол.",           w: 9,  align: "right" },
    { key: "wt",   label: "Вес",        w: 14, align: "right" },
    { key: "tot",  label: "Итого, ₽",       w: cw - 6 - 46 - 18 - 10 - 9 - 14 - 14 - 9 - 14, align: "right" },
  ];
  const rowH = 7;

  const cellText = (key: string, it: CartItem, i: number): string => {
    switch (key) {
      case "n":    return String(i + 1);
      case "name": return (it.title ?? "—").slice(0, 40);
      case "mat":  return it.material ?? "—";
      case "th":   return it.thickness ? `${String(it.thickness).replace(".", ",")} мм` : "—";
      case "bnd":  return it.bends != null ? String(it.bends) : "—";
      case "fl":   return it.flat ? fmt0(it.flat) : "—";
      case "len":  return it.length ? fmt0(it.length) : "—";
      case "qty":  return fmt0(it.qty);
      case "wt":   return fmtWeight(it.weightBatch);
      case "tot":  return fmt0(it.total);
      default:     return "";
    }
  };

  const drawHeader = () => {
    pdf.setFillColor(238, 242, 247);
    pdf.rect(mx, y, cw, rowH, "F");
    pdf.setFont(FONT, "bold");
    pdf.setFontSize(7.5);
    let x = mx;
    cols.forEach((c) => {
      const tx = c.align === "right" ? x + c.w - 1.5 : c.align === "center" ? x + c.w / 2 : x + 1.5;
      pdf.text(c.label, tx, y + 4.7, { align: c.align });
      x += c.w;
    });
    pdf.setDrawColor(150, 160, 175);
    pdf.setLineWidth(0.25);
    let vx = mx;
    cols.forEach((c) => {
      pdf.line(vx, y, vx, y + rowH);
      vx += c.w;
    });
    pdf.line(vx, y, vx, y + rowH);
    pdf.rect(mx, y, cw, rowH);
    y += rowH;
    pdf.setFont(FONT, "normal");
    pdf.setFontSize(8);
  };

  const ensureSpace = (need: number) => {
    if (y + need > pageH - 20) {
      pdf.addPage();
      y = 16;
      drawHeader();
    }
  };

  drawHeader();

  grouped.forEach((it, i) => {
    ensureSpace(rowH);
    let x = mx;
    cols.forEach((c) => {
      const txt = cellText(c.key, it, i);
      const tx = c.align === "right" ? x + c.w - 1.5 : c.align === "center" ? x + c.w / 2 : x + 1.5;
      pdf.text(txt, tx, y + 4.7, { align: c.align, maxWidth: c.w - 2 });
      x += c.w;
    });
    pdf.setDrawColor(180, 190, 205);
    pdf.line(mx, y + rowH, mx + cw, y + rowH);
    y += rowH;
  });

  // Разбивка стоимости перед ИТОГО
  y += 4;
  const breakdown: { label: string; value: number }[] = [
    { label: "Металл", value: tot.metal },
    { label: "Гибка", value: tot.bending },
    { label: "Лазерная резка", value: tot.laser ?? 0 },
    { label: "Наладка инструмента", value: tot.setup },
  ];
  const activeBreakdown = breakdown.filter((r) => r.value > 0);
  if (activeBreakdown.length > 0) {
    pdf.setFont(FONT, "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(50);
    activeBreakdown.forEach((r) => {
      pdf.text(r.label + ":", mx + cw - 60, y, { align: "right" });
      pdf.text(fmt0(r.value) + " ₽", mx + cw, y, { align: "right" });
      y += 5;
    });
    pdf.setDrawColor(200, 205, 215);
    pdf.setLineWidth(0.3);
    pdf.line(mx + cw - 100, y - 3, mx + cw, y - 3);
    y += 3;
    pdf.setTextColor(0);
  }

  ensureSpace(rowH + 2);
  pdf.setFillColor(15, 23, 42);
  pdf.setTextColor(255);
  pdf.setFont(FONT, "bold");
  pdf.setFontSize(9);
  pdf.rect(mx, y, cw, rowH, "F");
  pdf.text("ИТОГО:", mx + cw - 60, y + 4.8, { align: "right" });
  pdf.text(fmtWeight(tot.weight), mx + 60, y + 4.8, { align: "right" });
  pdf.text(`${fmt0(tot.total)} ₽`, mx + cw - 2, y + 4.8, { align: "right" });
  pdf.setTextColor(0);
  y += rowH + 8;

  // ─── Раскрой на листах со схемой ───
  const nestingParts = grouped
    .filter((it) => it.flat && it.length)
    .map((it, i) => ({
      id: it.id || `part-${i}`,
      title: it.title,
      width: it.flat!,
      height: it.length!,
      qty: it.qty,
    }));

  if (nestingParts.length > 0) {
    const nest = nestOnSheets(nestingParts);

    // Цвета для деталей (RGB 0-255, jsPDF принимает в этом формате)
    const COLORS: [number, number, number][] = [
      [245, 158, 11], [239, 68, 68], [59, 130, 246], [16, 185, 129], [139, 92, 246],
      [236, 72, 153], [6, 182, 212], [132, 204, 22], [249, 115, 22], [99, 102, 241],
    ];

    // Заголовок блока
    ensureSpace(40);
    pdf.setFont(FONT, "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(15, 23, 42);
    pdf.text(`Раскрой на листах ${nest.sheetW}×${nest.sheetH} мм`, mx, y);
    y += 4;
    pdf.setFont(FONT, "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(60);
    const totalPlaced = nest.sheets.reduce((s, sh) => s + sh.placed.length, 0);
    const rotatedCount = nest.sheets.reduce(
      (s, sh) => s + sh.placed.filter((p) => p.rot).length,
      0,
    );
    pdf.text(
      `Листов: ${nest.sheetCount}  ·  Использование: ${(nest.utilization * 100).toFixed(1)} %  ·  Деталей: ${totalPlaced}`,
      mx,
      y,
    );
    y += 4;

    // Статус поворота
    if (allowRotate) {
      pdf.setTextColor(180, 120, 20);
      pdf.text(
        `⟳ Поворот разрешён${rotatedCount > 0 ? `  ·  повёрнуто: ${rotatedCount} из ${totalPlaced}` : "  ·  поворот не потребовался"}`,
        mx,
        y,
      );
    } else {
      pdf.setTextColor(80, 90, 110);
      pdf.text(
        `▭ Поворот запрещён (направление проката)  ·  все детали в исходной ориентации`,
        mx,
        y,
      );
    }
    y += 5;
    pdf.setTextColor(0);

    // Параметры отрисовки
    const sheetsPerRow = 2;
    const gapX = 6, gapY = 12;
    const sheetW_draw = (cw - gapX * (sheetsPerRow - 1)) / sheetsPerRow;
    const scaleFactor = sheetW_draw / nest.sheetW;
    const sheetH_draw = nest.sheetH * scaleFactor;

    // Сколько рядов помещается на одной странице (с запасом на подпись снизу)
    const rowHeight = sheetH_draw + gapY;
    const availableHeight = pageH - 20 - y;
    const rowsPerPage = Math.max(1, Math.floor(availableHeight / rowHeight));

    let currentPageStartY = y;

    for (let i = 0; i < nest.sheets.length; i++) {
      const sh = nest.sheets[i];
      const col = i % sheetsPerRow;
      const rowOnPage = Math.floor(i / sheetsPerRow) % rowsPerPage;

      // Новый ряд с нуля — проверяем, помещается ли на текущей странице
      if (col === 0 && rowOnPage === 0 && i > 0) {
        const nextRowY = currentPageStartY + 0;
        if (nextRowY + sheetH_draw + 6 > pageH - 15) {
          pdf.addPage();
          currentPageStartY = 16;
        }
      }

      const sx = mx + col * (sheetW_draw + gapX);
      const sy = currentPageStartY + rowOnPage * rowHeight;

      // Подпись листа
      pdf.setFont(FONT, "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(60);
      pdf.text(`Лист ${sh.index} / ${nest.sheetCount}  (${sh.placed.length} дет.)`, sx, sy - 1.5);

      // Рамка листа
      pdf.setDrawColor(120, 130, 145);
      pdf.setLineWidth(0.3);
      pdf.setFillColor(245, 247, 250);
      pdf.rect(sx, sy, sheetW_draw, sheetH_draw, "FD");

      // Детали
      sh.placed.forEach((part, pi) => {
        // Визуальный зазор 0.4 мм на бумаге (на экране/печати видно разделение)
        const visGap = 0.4;
        const px = sx + part.x * scaleFactor + visGap;
        const py = sy + part.y * scaleFactor + visGap;
        const pw = Math.max(0.5, part.w * scaleFactor - visGap * 2);
        const ph = Math.max(0.5, part.h * scaleFactor - visGap * 2);

        const [r, g, b] = COLORS[pi % COLORS.length];
        pdf.setFillColor(r, g, b);
        pdf.setDrawColor(40, 50, 65);
        pdf.setLineWidth(0.15);
        pdf.rect(px, py, pw, ph, "FD");

        if (pw > 12 && ph > 4) {
          pdf.setFont(FONT, "normal");
          pdf.setFontSize(5.5);
          pdf.setTextColor(255, 255, 255);
          pdf.text(String(part.title || "").slice(0, 12), px + pw / 2, py + ph / 2 + 1, {
            align: "center",
            maxWidth: pw - 2,
          });
        }
      });

      // Размеры листа
      pdf.setFont(FONT, "normal");
      pdf.setFontSize(6);
      pdf.setTextColor(120, 130, 145);
      pdf.text(`${nest.sheetW} мм`, sx + sheetW_draw / 2, sy + sheetH_draw + 3, { align: "center" });
      pdf.text(`${nest.sheetH}`, sx - 2, sy + sheetH_draw / 2 + 1, { align: "right" });

      // Если это последний лист в ряду — сдвигаем y после завершения ряда
      if (col === sheetsPerRow - 1 || i === nest.sheets.length - 1) {
        // Ничего не делаем — y обновим после всего блока
      }
    }

    // Сдвигаем y ниже всех нарисованных рядов
    const totalRows = Math.ceil(nest.sheets.length / sheetsPerRow);
    const rowsOnFirstPage = Math.min(totalRows, rowsPerPage);
    y = currentPageStartY + rowsOnFirstPage * rowHeight + 6;

    // Легенда (если есть разные детали)
    if (nest.sheets.length > 0) {
      const uniqueParts = Array.from(new Map(nestingParts.map((p) => [p.id, p])).values());
      pdf.setFont(FONT, "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(80);
      let lx = mx;
      uniqueParts.slice(0, 6).forEach((up, i) => {
        const [r, g, b] = COLORS[i % COLORS.length];
        pdf.setFillColor(r, g, b);
        pdf.rect(lx, y - 2, 3, 3, "F");
        pdf.setTextColor(40);
        pdf.text(`${up.title.slice(0, 20)} · ${up.width}×${up.height}`, lx + 4, y);
        lx += 4 + pdf.getTextWidth(`${up.title.slice(0, 20)} · ${up.width}×${up.height}`) + 6;
        if (lx > pageW - mx - 30) {
          lx = mx;
          y += 4;
        }
      });
      y += 6;
      pdf.setTextColor(0);
    }

    // Предупреждение о неразмещённых
    if (nest.unplaced.length > 0) {
      pdf.setFont(FONT, "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(180, 20, 20);
      pdf.text(
        `⛔ Не размещено на листе: ${nest.unplaced.map((u) => u.title).join(", ")}`,
        mx,
        y,
        { maxWidth: cw },
      );
      y += 5;
      pdf.setTextColor(0);
    }
  }

  // ─── Условия ───
  ensureSpace(20);
  pdf.setFont(FONT, "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(90);
  const cond =
    "Условия: цены указаны на дату расчёта и не являются публичной офертой. Стоимость металла включает отходы раскроя 7 %. " +
    `Наладка инструмента — ${fmt0(tot.setup)} ₽ (при партии от 10 шт. — бесплатно). Срок изготовления: от 3 рабочих дней. ` +
    "Расчёт развёртки выполнен по методике DIN 6935 (K-фактор), усилие гибки — по формуле воздушной гибки.";
  const condLines = pdf.splitTextToSize(cond, cw);
  pdf.text(condLines, mx, y);
  y += condLines.length * 4 + 6;

  pdf.setTextColor(50);
  pdf.setFontSize(9);
  pdf.text("ООО «ФАЙЕРПРОМ»", mx, y);
  pdf.text("г. Санкт-Петербург, 5-й Верхний пер., 19Д", mx, y + 4);
  pdf.text("+7 (921) 863-56-50 · san@fire-prom.ru · www.fire-prom.ru", mx, y + 8);
  pdf.text(`Менеджер: ________________     Дата: ${dateStr}`, pageW - mx, y + 8, { align: "right" });

  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 1500);
}
