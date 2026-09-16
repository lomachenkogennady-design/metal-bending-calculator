import type { DeviceMode } from "../lib/device";

interface Props {
  mode: DeviceMode;
  onChange: (mode: DeviceMode) => void;
}

export default function DeviceSwitch({ mode, onChange }: Props) {
  const target: DeviceMode = mode === "mobile" ? "desktop" : "mobile";
  const label = mode === "mobile" ? "Версия для ПК" : "Мобильная версия";
  const icon = mode === "mobile" ? "🖥" : "📱";

  return (
    <button
      type="button"
      onClick={() => onChange(target)}
      className="hidden items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] font-semibold text-slate-200 transition hover:bg-white/10 sm:inline-flex"
      title={`Переключить на ${label.toLowerCase()}`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
