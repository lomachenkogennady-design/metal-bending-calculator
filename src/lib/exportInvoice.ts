import { jsPDF } from "jspdf";
import { cartTotals, groupItems, type CartItem } from "./cart";
import { REQUISITES, sumInWords } from "./requisites";
import robotoRegularUrl from "../assets/fonts/Roboto-Regular.ttf?url";
import robotoBoldUrl from "../assets/fonts/Roboto-Bold.ttf?url";

const nf0 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (v: number) => nf0.format(v);
const fmt2 = (v: number) => nf2.format(v);

async function loadFontBase64(url: string): Promise<string> {
  const buf = await fetch(url).then((r) => r.arrayBuffer());
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)) as unknown as number[]);
  }
  return btoa(bin);
}

export async function exportInvoiceToPdf(
  filename: string,
  items: CartItem[],
  invoiceNumber: string,
  date: Date = new Date(),
) {
  const R = REQUISITES;
  const grouped = groupItems(items);
  const tot = cartTotals(grouped);
  const client = items[0]?.client ?? { name: "", phone: "", email: "" };

  const pdf = new jsPDF("p", "mm", "a4");
  const [reg, bold] = await Promise.all([
    loadFontBase64(robotoRegularUrl),
    loadFontBase64(robotoBoldUrl),
  ]);
  pdf.addFileToVFS("Roboto-Regular.ttf", reg);
  pdf.addFileToVFS("Roboto-Bold.ttf", bold);
  pdf.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  pdf.addFont("Roboto-Bold.ttf", "Roboto", "bold");

  const F = "Roboto";
  const pageW = 210;
  const mx = 12, cw = pageW - mx * 2;
  let y = 14;

  const dateStr = date.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

  // ─── Банковская шапка (как в счёте 1С) ───
  // Строка 1: название банка | БИК | значение
  pdf.setFont(F, "normal");
  pdf.setFontSize(8.5);
  pdf.text(R.bank.name, mx, y);
  pdf.text("БИК", pageW - mx - 50, y);
  pdf.text(R.bank.bik, pageW - mx, y, { align: "right" });
  y += 4;

  // Строка 2: "Банк получателя" | Сч. № | корр. счёт
  pdf.text("Банк получателя", mx, y);
  pdf.text("Сч. №", pageW - mx - 50, y);
  pdf.text(R.bank.corrAccount, pageW - mx, y, { align: "right" });
  y += 4;

  // ─── Рамка получателя ───
  const boxH = 22;
  const boxY = y;
  const colSplit = mx + 125;

  pdf.setDrawColor(0);
  pdf.setLineWidth(0.3);
  pdf.rect(mx, boxY, cw, boxH);
  pdf.line(colSplit, boxY, colSplit, boxY + boxH);
  // Правая часть: 3 строки
  pdf.line(colSplit, boxY + 7.33, pageW - mx, boxY + 7.33);
  pdf.line(colSplit, boxY + 14.66, pageW - mx, boxY + 14.66);

  // Левая часть: получатель (без ИНН/КПП — они справа)
  pdf.setFont(F, "normal");
  pdf.setFontSize(7.5);
  pdf.text("Получатель", mx + 1.5, boxY + 3.5);
  pdf.setFont(F, "bold");
  pdf.setFontSize(10);
  pdf.text(R.company.fullName, mx + 1.5, boxY + 10);
  pdf.setFont(F, "normal");
  pdf.setFontSize(7);
  pdf.text(R.company.legalAddress, mx + 1.5, boxY + 14.5, {
    maxWidth: colSplit - mx - 3,
  });

  // Правая часть: ИНН / КПП / Сч. №
  const labelX = colSplit + 2;
  const valueX = pageW - mx - 2;

  pdf.setFont(F, "normal");
  pdf.setFontSize(7.5);
  pdf.text("ИНН", labelX, boxY + 4);
  pdf.setFont(F, "bold");
  pdf.setFontSize(9.5);
  pdf.text(R.company.inn, valueX, boxY + 4, { align: "right" });

  pdf.setFont(F, "normal");
  pdf.setFontSize(7.5);
  pdf.text("КПП", labelX, boxY + 11);
  pdf.setFont(F, "bold");
  pdf.setFontSize(9.5);
  pdf.text(R.company.kpp, valueX, boxY + 11, { align: "right" });

  pdf.setFont(F, "normal");
  pdf.setFontSize(7.5);
  pdf.text("Сч. №", labelX, boxY + 18);
  pdf.setFont(F, "bold");
  pdf.setFontSize(9.5);
  pdf.text(R.bank.account, valueX, boxY + 18, { align: "right" });

  y = boxY + boxH + 8;

  // ─── Заголовок счёта ───
  pdf.setFont(F, "bold");
  pdf.setFontSize(14);
  pdf.text(`Счёт на оплату № ${invoiceNumber} от ${dateStr}`, mx, y);
  y += 6;
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.5);
  pdf.line(mx, y, pageW - mx, y);
  y += 6;

  // ─── Поставщик ───
  pdf.setFontSize(9.5);
  pdf.setFont(F, "bold");
  pdf.text("Поставщик (Исполнитель):", mx, y);
  pdf.setFont(F, "normal");
  pdf.text(`${R.company.fullName}, ${R.company.legalAddress}`, mx + 60, y, { maxWidth: cw - 60 });
  y += 10;

  pdf.setFont(F, "bold");
  pdf.setFontSize(9.5);
  pdf.text("Покупатель (Заказчик):", mx, y);
  pdf.setFont(F, "normal");
  const clientLine = client.name
    ? `${client.name}${client.phone ? " · " + client.phone : ""}${client.email ? " · " + client.email : ""}`
    : "—";
  pdf.text(clientLine, mx + 60, y, { maxWidth: cw - 60 });
  y += 6;

  pdf.setFont(F, "normal");
  pdf.setFontSize(9);
  pdf.text("Основание:", mx, y);
  pdf.text("устная заявка покупателя", mx + 60, y);
  y += 6;

  // ─── Таблица ───
  const cols = [
    { key: "n",    label: "№",           w: 8,  align: "center" as const },
    { key: "name", label: "Товары (работы, услуги)", w: 78, align: "left" as const },
    { key: "qty",  label: "Кол-во",      w: 14, align: "right" as const },
    { key: "unit", label: "Ед.",         w: 10, align: "center" as const },
    { key: "price",label: "Цена",        w: 22, align: "right" as const },
    { key: "sum",  label: "Сумма",       w: cw - 8 - 78 - 14 - 10 - 22, align: "right" as const },
  ];
  const rowH = 7;

  const drawHeader = () => {
    pdf.setFillColor(238, 242, 247);
    pdf.rect(mx, y, cw, rowH, "F");
    pdf.setFont(F, "bold");
    pdf.setFontSize(8.5);
    let x = mx;
    cols.forEach((c) => {
      const tx = c.align === "right" ? x + c.w - 1.5 : c.align === "center" ? x + c.w / 2 : x + 1.5;
      pdf.text(c.label, tx, y + 4.8, { align: c.align });
      x += c.w;
    });
    pdf.setDrawColor(150, 160, 175);
    pdf.setLineWidth(0.25);
    pdf.rect(mx, y, cw, rowH);
    let vx = mx;
    cols.forEach((c) => { pdf.line(vx, y, vx, y + rowH); vx += c.w; });
    pdf.line(vx, y, vx, y + rowH);
    y += rowH;
    pdf.setFont(F, "normal");
    pdf.setFontSize(9);
  };

  drawHeader();

  grouped.forEach((it, i) => {
    const price = it.qty > 0 ? it.subtotal / it.qty : 0;
    const rowData = [
      String(i + 1),
      (it.title ?? "—").slice(0, 40) +
        ((it.laser ?? 0) > 0
          ? ` · лазер ${(it.laserLengthM ?? 0).toFixed(1).replace(".", ",")} м`
          : ""),
      fmt0(it.qty),
      "шт.",
      fmt2(price),
      fmt2(it.subtotal),
    ];
    let x = mx;
    cols.forEach((c, ci) => {
      const txt = rowData[ci];
      const tx = c.align === "right" ? x + c.w - 1.5 : c.align === "center" ? x + c.w / 2 : x + 1.5;
      pdf.text(txt, tx, y + 4.8, { align: c.align, maxWidth: c.w - 3 });
      x += c.w;
    });
    pdf.setDrawColor(226, 232, 240);
    pdf.line(mx, y + rowH, mx + cw, y + rowH);
    y += rowH;
  });

  // ─── Итого ───
  y += 2;
  const rowItogo = (label: string, value: string, boldText = false) => {
    pdf.setFont(F, boldText ? "bold" : "normal");
    pdf.setFontSize(10);
    pdf.text(label, pageW - mx - 60, y, { align: "right" });
    pdf.text(value, pageW - mx, y, { align: "right" });
    y += 5;
  };

  rowItogo("Итого:", fmt2(tot.subtotal));
  rowItogo(`В том числе НДС ${Math.round(R.vat * 100)}%:`, fmt2(tot.vat));
  rowItogo("Всего к оплате:", fmt2(tot.total), true);
  y += 4;

  // ─── Прописью ───
  pdf.setFont(F, "normal");
  pdf.setFontSize(9);
  pdf.text(`Всего наименований ${grouped.length}, на сумму ${fmt2(tot.total)} руб.`, mx, y);
  y += 5;
  pdf.setFont(F, "bold");
  pdf.text(sumInWords(tot.total), mx, y, { maxWidth: cw });
  y += 8;

  // ─── Условия оплаты ───
  pdf.setFont(F, "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(80);
  const terms = "Оплата данного счёта означает согласие с условиями поставки товара. Уведомление об оплате обязательно, " +
    "в противном случае не гарантируется наличие товара на складе. Товар отпускается по факту прихода денег на р/с Поставщика, " +
    "самовывозом, при наличии доверенности и паспорта.";
  const lines = pdf.splitTextToSize(terms, cw);
  pdf.text(lines, mx, y);
  y += lines.length * 3.5 + 6;
  pdf.setTextColor(0);

  // ─── Подписи ───
  pdf.setFont(F, "normal");
  pdf.setFontSize(9);
  pdf.text("Руководитель", mx, y);
  pdf.text(R.sign.director, mx + 40, y);
  pdf.line(mx + 38, y + 1, mx + 100, y + 1);
  pdf.text("Бухгалтер", pageW - mx - 80, y);
  pdf.text(R.sign.accountant, pageW - mx - 40, y);
  pdf.line(pageW - mx - 42, y + 1, pageW - mx, y + 1);

  // ─── Скачивание ───
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
