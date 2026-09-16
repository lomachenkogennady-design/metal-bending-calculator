import { cartTotals, fmtMoney0, fmtWeightText, type CartItem } from "../lib/cart";
import { fmt, fmt0, VAT_RATE } from "../lib/bending";

interface Props {
  items: CartItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onExportPdf: () => void;
  onExportInvoice: () => void;
  onPrint: () => void;
  exporting: boolean;
}

export default function CartTable({ items, onRemove, onClear, onExportPdf, onExportInvoice, onPrint, exporting }: Props) {
  const tot = cartTotals(items);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-10 text-center">
        <div className="text-3xl opacity-40">🗂</div>
        <div className="mt-2 text-[14px] font-semibold text-slate-500">Смета пуста</div>
        <div className="text-[12px] text-slate-400">
          Настройте деталь на вкладке «Ручной расчёт» или загрузите чертежи — затем добавьте позицию кнопкой ниже.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1080px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-slate-50 text-left text-[10.5px] font-bold tracking-[0.06em] text-slate-500 uppercase">
              <th className="border-b border-slate-200 px-3 py-2.5">№</th>
              <th className="border-b border-slate-200 px-3 py-2.5">Наименование</th>
              <th className="border-b border-slate-200 px-3 py-2.5">Материал</th>
              <th className="border-b border-slate-200 px-3 py-2.5">Толщ.</th>
              <th className="border-b border-slate-200 px-3 py-2.5">Гибов</th>
              <th className="border-b border-slate-200 px-3 py-2.5">Развёртка</th>
              <th className="border-b border-slate-200 px-3 py-2.5">Длина</th>
              <th className="border-b border-slate-200 px-3 py-2.5">Кол-во</th>
              <th className="border-b border-slate-200 px-3 py-2.5">Вес</th>
              <th className="border-b border-slate-200 px-3 py-2.5">Металл</th>
              <th className="border-b border-slate-200 px-3 py-2.5">Гибка</th>
            <th className="px-3 py-2 text-right text-[11px] font-bold tracking-wider text-slate-500 uppercase whitespace-nowrap">Резка</th>
              <th className="border-b border-slate-200 px-3 py-2.5">Без НДС</th>
              <th className="border-b border-slate-200 px-3 py-2.5">НДС {Math.round(VAT_RATE * 100)}%</th>
              <th className="border-b border-slate-200 px-3 py-2.5">Итого</th>
              <th className="border-b border-slate-200 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id} className="transition hover:bg-amber-50/40">
                <td className="border-b border-slate-100 px-3 py-2.5 font-mono text-slate-400">{i + 1}</td>
                <td className="max-w-44 border-b border-slate-100 px-3 py-2.5">
                  <div className="truncate font-semibold text-slate-800" title={it.title}>{it.title}</div>
                  {it.files && it.files.length > 0 && (
                    <div className="truncate text-[10.5px] text-slate-400" title={it.files.join("; ")}>{it.files.join("; ")}</div>
                  )}
                </td>
                <td className="border-b border-slate-100 px-3 py-2.5 whitespace-nowrap">{it.material}</td>
                <td className="border-b border-slate-100 px-3 py-2.5 font-mono">{it.thickness ? `${fmt(it.thickness)}` : "—"}</td>
                <td className="border-b border-slate-100 px-3 py-2.5 font-mono">{it.bends ?? "—"}</td>
                <td className="border-b border-slate-100 px-3 py-2.5 font-mono">{it.flat ? `${fmt0(it.flat)}` : "—"}</td>
                <td className="border-b border-slate-100 px-3 py-2.5 font-mono">{it.length ? `${fmt0(it.length)}` : "—"}</td>
                <td className="border-b border-slate-100 px-3 py-2.5 font-mono">{fmt0(it.qty)}</td>
                <td className="border-b border-slate-100 px-3 py-2.5 font-mono">{fmtWeightText(it.weightBatch)}</td>
                <td className="border-b border-slate-100 px-3 py-2.5 font-mono whitespace-nowrap">{fmtMoney0(it.metal)}</td>
                <td className="border-b border-slate-100 px-3 py-2.5 font-mono whitespace-nowrap">{fmtMoney0(it.bending)}</td>
                <td className="border-b border-slate-100 px-3 py-2.5 font-mono whitespace-nowrap text-slate-500">{(it.laser ?? 0) > 0 ? fmtMoney0(it.laser!) : "—"}</td>
                <td className="border-b border-slate-100 px-3 py-2.5 font-mono whitespace-nowrap">{fmtMoney0(it.subtotal)}</td>
                <td className="border-b border-slate-100 px-3 py-2.5 font-mono whitespace-nowrap">{fmtMoney0(it.vat)}</td>
                <td className="border-b border-slate-100 px-3 py-2.5 font-mono font-bold whitespace-nowrap text-slate-900">{fmtMoney0(it.total)}</td>
                <td className="border-b border-slate-100 px-2 py-2.5">
                  <button onClick={() => onRemove(it.id)} title="Удалить позицию"
                    className="rounded-md px-1.5 py-1 text-slate-300 transition hover:bg-red-50 hover:text-red-500">✕</button>
                </td>
              </tr>
            ))}
            <tr className="bg-slate-900 text-white">
              <td className="px-3 py-3 text-right font-bold" colSpan={8}>ИТОГО:</td>
              <td className="px-3 py-3 font-mono font-bold">{fmtWeightText(tot.weight)}</td>
              <td className="px-3 py-3 font-mono font-bold whitespace-nowrap">{fmtMoney0(tot.metal)}</td>
              <td className="px-3 py-3 font-mono font-bold whitespace-nowrap">{fmtMoney0(tot.bending)}</td>
              <td className="px-3 py-3 font-mono font-bold whitespace-nowrap">{(tot.laser ?? 0) > 0 ? fmtMoney0(tot.laser!) : "—"}</td>
              <td className="px-3 py-3 font-mono font-bold whitespace-nowrap">{fmtMoney0(tot.subtotal)}</td>
              <td className="px-3 py-3 font-mono font-bold whitespace-nowrap">{fmtMoney0(tot.vat)}</td>
              <td className="px-3 py-3 font-mono text-base font-black whitespace-nowrap text-amber-400">{fmtMoney0(tot.total)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={onExportPdf}
          disabled={exporting}
          className="rounded-xl bg-slate-900 px-5 py-3 text-[14px] font-bold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 active:scale-[0.99] disabled:opacity-60"
        >
          {exporting ? "Готовим PDF…" : "⬇ Скачать смету (PDF)"}
        </button>
        <button
          onClick={onExportInvoice}
          disabled={exporting}
          className="rounded-xl bg-amber-600 px-5 py-3 text-[14px] font-bold text-white shadow-lg shadow-amber-600/25 transition hover:bg-amber-700 active:scale-[0.99] disabled:opacity-60"
        >
          🧾 Скачать счёт (PDF)
        </button>
        <button
          onClick={onPrint}
          className="rounded-xl border-2 border-slate-300 bg-white px-5 py-3 text-[14px] font-bold text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
        >
          🖨 Печать
        </button>
        <button
          onClick={onClear}
          className="ml-auto rounded-xl px-4 py-3 text-[13px] font-bold text-red-500 transition hover:bg-red-50 hover:text-red-700"
        >
          Очистить смету
        </button>
      </div>
    </div>
  );
}
