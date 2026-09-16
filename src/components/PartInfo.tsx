interface Props {
  thickness: number;
  widthMm: number;
  heightMm: number;
  flatMm?: number;
  lengthMm?: number;
  nBends: number;
  flangeWidths?: number[];
  angleLabel?: string;
}

export default function PartInfo({
  thickness,
  widthMm,
  heightMm,
  flatMm,
  lengthMm,
  nBends,
  flangeWidths,
  angleLabel,
}: Props) {
  return (
    <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-lg border border-slate-200 bg-white/85 px-3 py-2 text-[11px] leading-relaxed shadow-sm backdrop-blur-sm">
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        <span className="text-slate-500">Толщина:</span>
        <span className="font-semibold text-slate-800">{thickness} мм</span>

        <span className="text-slate-500">Сечение:</span>
        <span className="font-semibold text-slate-800">
          {Math.round(widthMm)}×{Math.round(heightMm)} мм
        </span>

        {typeof lengthMm === "number" && (
          <>
            <span className="text-slate-500">Длина:</span>
            <span className="font-semibold text-slate-800">{Math.round(lengthMm)} мм</span>
          </>
        )}

        {typeof flatMm === "number" && (
          <>
            <span className="text-slate-500">Развёртка:</span>
            <span className="font-semibold text-slate-800">{Math.round(flatMm)} мм</span>
          </>
        )}

        {flangeWidths && flangeWidths.length > 0 && (
          <>
            <span className="text-slate-500">Полки:</span>
            <span className="font-semibold text-slate-800">
              {flangeWidths.map((v) => Math.round(v)).join(" + ")} мм
            </span>
          </>
        )}

        <span className="text-slate-500">Гибов:</span>
        <span className="font-semibold text-slate-800">{nBends}</span>

        {angleLabel && (
          <>
            <span className="text-slate-500">Углы:</span>
            <span className="font-semibold text-orange-600">{angleLabel}</span>
          </>
        )}
      </div>
    </div>
  );
}
