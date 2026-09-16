import { useState, useEffect, useRef } from "react";

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  className?: string;
}

export default function NumberField({
  value,
  onChange,
  min = 0,
  max,
  step,
  placeholder = "0",
  className = "field",
}: Props) {
  const [text, setText] = useState<string>(() =>
    value === 0 || value == null ? "" : String(value)
  );

  // Отслеживаем, что мы последний раз отправили наружу — чтобы не перезаписывать text зря
  const lastEmitted = useRef<number>(value);

  // Синхронизация, только если value изменилось "извне" (пресет, сброс, смена толщины)
  useEffect(() => {
    if (value !== lastEmitted.current) {
      setText(value === 0 || value == null ? "" : String(value));
      lastEmitted.current = value;
    }
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        // 1. Только цифры и одна точка/запятая
        let raw = e.target.value.replace(",", ".").replace(/[^0-9.]/g, "");

        // 2. Схлопываем лишние точки
        const parts = raw.split(".");
        if (parts.length > 2) raw = parts[0] + "." + parts.slice(1).join("");

        // 3. Убираем ведущие нули, КРОМЕ случая когда после нуля идёт точка или пусто
        //    "0500" → "500", "00" → "0", "0.5" → "0.5", "0" → "0"
        if (/^0+[0-9]/.test(raw)) {
          raw = raw.replace(/^0+/, "");
        }

        setText(raw);

        if (raw === "" || raw === ".") {
          onChange(0);
          lastEmitted.current = 0;
          return;
        }
        let n = Number(raw);
        if (!isFinite(n)) return;
        if (min != null) n = Math.max(min, n);
        if (max != null) n = Math.min(max, n);
        onChange(n);
        lastEmitted.current = n;
      }}
      onBlur={() => {
        const n = text === "" || text === "." ? 0 : Number(text);
        let final = n;
        if (step) final = Math.round(n / step) * step;
        if (min != null) final = Math.max(min, final);
        if (max != null) final = Math.min(max, final);
        setText(final === 0 ? "" : String(final));
        if (final !== value) {
          onChange(final);
          lastEmitted.current = final;
        }
      }}
    />
  );
}
