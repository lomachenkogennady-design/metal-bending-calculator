import type { ProfileGeometry } from "../lib/geometry";

interface Props {
  geom: ProfileGeometry;
  length: number;
  color: number;
}

// ТЕСТ: 3D полностью отключена, чтобы проверить причину перезагрузки
export default function Scene3D(_props: Props) {
  return (
    <div className="flex h-full min-h-[280px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <div className="text-sm text-slate-500">
        <div className="mb-2 text-4xl">🧪</div>
        <div className="font-bold text-slate-700">ТЕСТ: 3D отключена</div>
        <div className="mt-1">Если телефон не перезагружается — причина в WebGL/Three.js</div>
      </div>
    </div>
  );
}
