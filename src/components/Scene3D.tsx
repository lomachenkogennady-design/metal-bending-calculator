import { Component, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CalcInput, CalcResult } from "../lib/bending";
import type { ProfileGeometry, Pt } from "../lib/geometry";
import PartInfo from "./PartInfo";

interface Props {
  geom: ProfileGeometry;
  length: number;
  color: number;
  input: CalcInput;
  result: CalcResult;
}

class Boundary extends Component<{ children: ReactNode }, { err: string | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(e: any) {
    return { err: String(e?.message ?? e) };
  }
  render() {
    if (this.state.err) {
      return (
        <div className="flex h-full items-center justify-center p-4 text-center">
          <div className="text-sm text-red-600">
            <div className="mb-1 font-bold">Ошибка 3D</div>
            <div className="font-mono text-[11px] break-all">{this.state.err}</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Scene3DInner({ geom, length, color, input, result }: Props) {
  const [viewMode, setViewMode] = useState<"2d" | "3d">("3d");
  const [err, setErr] = useState<string | null>(null);
  const mountRef = useRef<HTMLDivElement>(null);

  const info = useMemo(() => {
    const bb = geom.bbox ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const flangeWidths: number[] = [];
    const mp = Array.isArray(geom.moldPoints) ? geom.moldPoints : [];
    for (let i = 0; i < mp.length - 1; i++) {
      const a = mp[i], b = mp[i + 1];
      flangeWidths.push(Math.hypot(b.x - a.x, b.y - a.y));
    }
    const angles = Array.isArray(input.angles) ? input.angles : [];
    return {
      thickness: Number(input.thickness) || 0,
      widthMm: bb.maxX - bb.minX,
      heightMm: bb.maxY - bb.minY,
      flatMm: Number(result.flat) || 0,
      lengthMm: Number(input.length) || 0,
      nBends: Number(result.nBends) || 0,
      flangeWidths,
      angleLabel: angles
        .slice(0, Number(result.nBends) || 0)
        .map((a) => `${a}°`)
        .join(" / "),
    };
  }, [geom, result, input]);

  useEffect(() => {
    if (viewMode !== "3d") return;
    const mount = mountRef.current;
    if (!mount) return;
    const poly = Array.isArray(geom.polygon) ? geom.polygon : [];
    if (poly.length < 3) {
      setErr("Пустой полигон сечения");
      return;
    }

    setErr(null);
    let geometry: THREE.BufferGeometry;
    try {
      const shape = new THREE.Shape(
        poly.map((p) => new THREE.Vector2(p.x, p.y)),
      );
      geometry = new THREE.ExtrudeGeometry(shape, {
        depth: length,
        bevelEnabled: false,
        curveSegments: 12,
      });
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      const bb = geometry.boundingBox!;
      geometry.translate(
        -(bb.min.x + bb.max.x) / 2,
        -(bb.min.y + bb.max.y) / 2,
        -(bb.min.z + bb.max.z) / 2,
      );
    } catch (e: any) {
      console.error("[Scene3D] Extrude failed:", e);
      setErr(String(e?.message ?? e));
      return;
    }

    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    const diag = Math.max(
      1,
      Math.hypot(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z),
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    let paused = false;
    const onLost = (e: Event) => { e.preventDefault(); paused = true; };
    const onRestored = () => { paused = false; };
    renderer.domElement.addEventListener("webglcontextlost", onLost);
    renderer.domElement.addEventListener("webglcontextrestored", onRestored);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      40,
      mount.clientWidth / Math.max(mount.clientHeight, 1),
      diag / 500,
      diag * 50,
    );
    scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x8a93a5, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(1.2, 1.6, 1.4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xf5b04c, 0.7);
    rim.position.set(-1.6, -0.6, -1.2);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffffff, 0.7);
    fill.position.set(-1.0, 0.5, -1.5);
    scene.add(fill);

    const mat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.55,
      roughness: 0.32,
      side: THREE.DoubleSide,
    });
    scene.add(new THREE.Mesh(geometry, mat));

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 20),
      new THREE.LineBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.45 }),
    );
    scene.add(edges);

    camera.position.set(diag * 0.6, diag * 0.45, diag * 0.8);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.addEventListener("start", () => (controls.autoRotate = false));

    let lastFrame = 0;
    const interval = 1000 / 30;
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (paused) return;
      if (now - lastFrame < interval) return;
      lastFrame = now;
      controls.update();
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onRestored);
      ro.disconnect();
      controls.dispose();
      geometry.dispose();
      mat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [geom, length, color, viewMode]);

  const svg2d = useMemo(() => {
    const poly = Array.isArray(geom.polygon) ? geom.polygon : [];
    if (poly.length < 3) return null;
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const pad = 48, targetW = 640, targetH = 400;
    const scale = Math.min(targetW / w, targetH / h);
    const vw = w * scale + pad * 2;
    const vh = h * scale + pad * 2;
    const X = (x: number) => pad + (x - minX) * scale;
    const Y = (y: number) => vh - pad - (y - minY) * scale;
    const pathD =
      "M " + poly.map((p) => `${X(p.x).toFixed(2)} ${Y(p.y).toFixed(2)}`).join(" L ") + " Z";
    return { w, h, vw, vh, X, Y, minX, minY, maxX, maxY, pathD };
  }, [geom]);

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Профиль · t={info.thickness} мм · {info.lengthMm} мм
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("2d")}
            className={`rounded-md px-3 py-1 text-[11px] font-bold transition ${
              viewMode === "2d" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
            }`}
          >📐 2D</button>
          <button
            type="button"
            onClick={() => setViewMode("3d")}
            className={`rounded-md px-3 py-1 text-[11px] font-bold transition ${
              viewMode === "3d" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
            }`}
          >🧊 3D</button>
        </div>
      </div>
      <div className="relative flex-1 min-h-0">
        <div className={`absolute inset-0 ${viewMode === "3d" ? "" : "hidden"}`}>
          <div ref={mountRef} className="absolute inset-0" />
          {err && (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
              <div className="text-sm text-red-600">
                <div className="mb-1 font-bold">Ошибка 3D</div>
                <div className="font-mono text-[11px] break-all">{err}</div>
              </div>
            </div>
          )}
          <PartInfo {...info} />
          <span className="pointer-events-none absolute left-2 top-2 z-10 rounded border border-slate-200 bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
            🧊 3D
          </span>
        </div>
        <div
          className={`absolute inset-0 flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 ${
            viewMode === "2d" ? "" : "hidden"
          }`}
        >
          {svg2d ? (
            <svg viewBox={`0 0 ${svg2d.vw} ${svg2d.vh}`} className="max-h-full max-w-full" preserveAspectRatio="xMidYMid meet">
              <defs>
                <pattern id="grid2d" width="24" height="24" patternUnits="userSpaceOnUse">
                  <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect x="0" y="0" width={svg2d.vw} height={svg2d.vh} fill="url(#grid2d)" />
              <path
                d={svg2d.pathD}
                fill="rgba(37,99,235,0.10)"
                stroke="#1e293b"
                strokeWidth="1.6"
                strokeLinejoin="round"
                fillRule="evenodd"
              />
              <text x={(svg2d.X(svg2d.minX) + svg2d.X(svg2d.maxX)) / 2} y={svg2d.Y(svg2d.minY) + 32} textAnchor="middle" fontSize="12" fill="#475569" fontFamily="ui-monospace,monospace">
                {Math.round(svg2d.w)} мм
              </text>
              <text x={svg2d.X(svg2d.minX) - 28} y={(svg2d.Y(svg2d.minY) + svg2d.Y(svg2d.maxY)) / 2} textAnchor="middle" fontSize="12" fill="#475569" fontFamily="ui-monospace,monospace" transform={`rotate(-90 ${svg2d.X(svg2d.minX) - 28} ${(svg2d.Y(svg2d.minY) + svg2d.Y(svg2d.maxY)) / 2})`}>
                {Math.round(svg2d.h)} мм
              </text>
            </svg>
          ) : (
            <div className="text-sm text-slate-400">Нет данных</div>
          )}
          <PartInfo {...info} />
          <span className="absolute left-2 top-2 rounded border border-slate-200 bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
            📐 2D · сечение
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Scene3D(props: Props) {
  return (
    <Boundary>
      <Scene3DInner {...props} />
    </Boundary>
  );
}
