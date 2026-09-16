import { cartTotals, type CartItem } from "../lib/cart";
import { nestOnSheets } from "../lib/nesting";
import { fmt0, VAT_RATE } from "../lib/bending";

const nf1 = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtW = (v: number) => {
  const abs = Math.abs(v);
  if (abs > 0 && abs < 0.1) return v.toFixed(3).replace(".", ",");
  return nf1.format(v);
};

const td: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  padding: "3px 4px",
  fontSize: 9,
  verticalAlign: "top",
  whiteSpace: "nowrap",
};
const th: React.CSSProperties = {
  ...td,
  background: "#f2f2f2",
  fontWeight: 700,
  fontSize: 8,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

export default function ReportPrint({ items, date }: { items: CartItem[]; date: Date }) {
  const tot = cartTotals(items);
  const client = items[0]?.client ?? { name: "", phone: "", email: "" };
  const dateStr = date.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
  const num = `КГ-${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  return (
    <div style={{ fontFamily: "Inter, Arial, sans-serif", padding: "20px 24px", color: "#0f172a" }}>
      {/* шапка */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "3px solid #0f172a", paddingBottom: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
              <path d="M7 23 L16 9 L25 23" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M11.5 23 L16 16 L20.5 23" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.3 }}>ООО «ФАЙЕРПРОМ»</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Гибка листового металла · лазерный раскрой · металлоконструкции</div>
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 11, color: "#475569", lineHeight: 1.6 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>СМЕТА № {num}</div>
          <div>от {dateStr}</div>
        </div>
      </div>

      {/* клиент */}
      <div style={{ display: "flex", gap: 24, margin: "16px 0 14px", fontSize: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Заказчик</div>
          <div style={{ fontWeight: 700 }}>{client.name || "—"}</div>
          <div style={{ color: "#475569" }}>{client.phone}{client.email ? ` · ${client.email}` : ""}</div>
        </div>
        <div style={{ flex: 1, minWidth: 220, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Позиций в расчёте</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{items.length}</div>
          <div style={{ color: "#475569" }}>общий вес партии: {tot.weight > 0 && tot.weight < 0.1
              ? `${(tot.weight * 1000).toFixed(1).replace(".", ",")} г`
              : `${fmtW(tot.weight)} кг`}</div>
        </div>
      </div>

      {/* таблица */}
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 26 }}>№</th>
            <th style={th}>Наимен.</th>
            <th style={th}>Матер.</th>
            <th style={th}>Толщ.</th>
            <th style={th}>Гибов</th>
            <th style={th}>Разв.</th>
            <th style={th}>Длина</th>
            <th style={th}>Кол.</th>
            <th style={th}>Вес</th>
            <th style={th}>Металл</th>
            <th style={th}>Гибка</th>
            <th style={th}>Резка</th>
            <th style={th}>Без НДС</th>
            <th style={th}>НДС {Math.round(VAT_RATE * 100)}%</th>
            <th style={th}>Итого</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id}>
              <td style={td}>{i + 1}</td>
              <td style={{ ...td, whiteSpace: "normal", minWidth: 140 }}>
                <div style={{ fontWeight: 700, wordBreak: "break-word", maxWidth: 180 }}>
                  {(it.title || "").length > 40
                    ? (it.title || "").slice(0, 38) + "…"
                    : it.title}
                </div>
                {(it.profile || it.note) && (
                  <div style={{ color: "#94a3b8", fontSize: 9, marginTop: 2 }}>
                    {[it.profile, it.note].filter(Boolean).join(" · ").slice(0, 70)}
                  </div>
                )}
              </td>
              <td style={td}>{it.material}</td>
              <td style={td}>{it.thickness ? `${String(it.thickness).replace(".", ",")} мм` : "—"}</td>
              <td style={td}>{it.bends ?? "—"}</td>
              <td style={td}>{it.flat ? `${fmt0(it.flat)} мм` : "—"}</td>
              <td style={td}>{it.length ? `${fmt0(it.length)} мм` : "—"}</td>
              <td style={td}>{fmt0(it.qty)}</td>
              <td style={td}>{fmtW(it.weightBatch)}</td>
              <td style={td}>{fmt0(it.metal)} ₽</td>
              <td style={td}>{fmt0(it.bending)} ₽</td>
              <td style={td}>{(it.laser ?? 0) > 0 ? `${fmt0(it.laser!)} ₽` : "—"}</td>
              <td style={td}>{fmt0(it.subtotal)} ₽</td>
              <td style={td}>{fmt0(it.vat)} ₽</td>
              <td style={{ ...td, fontWeight: 800 }}>{fmt0(it.total)} ₽</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...th, textAlign: "right" }} colSpan={8}>
              ИТОГО:
            </td>
            <td style={th}>{fmtW(tot.weight)}</td>
            <td style={th}>{fmt0(tot.metal)} ₽</td>
            <td style={th}>{fmt0(tot.bending)} ₽</td>
            <td style={th}>{(tot.laser ?? 0) > 0 ? `${fmt0(tot.laser!)} ₽` : "—"}</td>
            <td style={th}>{fmt0(tot.subtotal)} ₽</td>
            <td style={th}>{fmt0(tot.vat)} ₽</td>
            <td style={{ ...th, background: "#0f172a", color: "#fff", fontSize: 13 }}>{fmt0(tot.total)} ₽</td>
          </tr>
        </tbody>
      </table>

      {/* условия */}
      {items.length > 0 && (() => {
        const nestingParts = items
          .filter((it) => it.flat && it.length)
          .map((it, i) => ({
            id: it.id || `part-${i}`,
            title: it.title,
            width: it.flat!,
            height: it.length!,
            qty: it.qty,
          }));
        if (nestingParts.length === 0) return null;
        const nest = nestOnSheets(nestingParts);
        return (
          <div style={{ marginTop: 14, fontSize: 11, border: "1px solid #cbd5e1", borderRadius: 8, padding: "10px 14px", background: "#f8fafc" }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: "#0f172a" }}>
              РАСКРОЙ НА ЛИСТАХ {nest.sheetW}×{nest.sheetH} мм
            </div>
            <div style={{ display: "flex", gap: 20, marginBottom: 6 }}>
              <span>Листов: <b>{nest.sheetCount}</b></span>
              <span>Использование: <b>{(nest.utilization * 100).toFixed(1)} %</b></span>
              <span>Деталей: <b>{nest.sheets.reduce((s, sh) => s + sh.placed.length, 0)}</b></span>
            </div>
            <div style={{ fontSize: 10, color: "#64748b" }}>
              {nest.sheets.map((sh, i) => `Лист ${i + 1}: ${sh.placed.length} дет.`).join(" · ")}
            </div>
            {nest.unplaced.length > 0 && (
              <div style={{ marginTop: 6, color: "#b91c1c", fontSize: 10 }}>
                ⛔ Не размещено: {nest.unplaced.map((u) => u.title).join(", ")} — превышает габарит листа
              </div>
            )}
          </div>
        );
      })()}

      <div style={{ marginTop: 14, fontSize: 10.5, color: "#475569", lineHeight: 1.7, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px" }}>
        <b>Условия:</b> цены указаны на дату расчёта и не являются публичной офертой. Стоимость металла включает отходы раскроя 7 %.
        Наладка инструмента — {fmt0(tot.setup)} ₽ (при позиции партии от 10 шт. — бесплатно). Срок изготовления: от 3 рабочих дней.
        Расчёт развёртки выполнен по методике DIN 6935 (K-фактор), усилие гибки — по формуле воздушной гибки.
      </div>

      {/* подписи / контакты */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, fontSize: 11, color: "#334155" }}>
        <div>
          <div style={{ fontWeight: 700 }}>ООО «ФАЙЕРПРОМ»</div>
          <div>г. Санкт-Петербург, 5-й Верхний пер., 19Д</div>
          <div>+7 (921) 863-56-50 · san@fire-prom.ru · www.fire-prom.ru</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ marginBottom: 26 }}>Менеджер: ________________</div>
          <div>Дата: {dateStr}</div>
        </div>
      </div>
    </div>
  );
}
