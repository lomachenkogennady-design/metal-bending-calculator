import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  buildFoldedGeometry,
  geometryDiagonal,
  type BendLine,
} from "../lib/fold3d";
import type { Pt } from "../lib/extract";

interface Props {
  polygon: Pt[];
  bends: BendLine[];
  thickness: number;
  angleDeg?: number;
  color?: number;
}

/** 3D-просмотр одной детали с гибами. Компактный Three.js без React Three Fiber. */
export default function Part3DViewer({
  polygon,
  bends,
  thickness,
  angleDeg = 90,
  color = 0xc9d2dc,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || polygon.length < 3) return;

    const geometry = buildFoldedGeometry(polygon, bends, thickness, angleDeg);
    const diag = geometryDiagonal(geometry);

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    let paused = false;
    const canvasEl = renderer.domElement;
    const onLost = (e: Event) => {
      e.preventDefault();
      paused = true;
    };
    const onRestored = () => {
      paused = false;
    };
    canvasEl.addEventListener("webglcontextlost", onLost, false);
    canvasEl.addEventListener("webglcontextrestored", onRestored, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / Math.max(mount.clientHeight, 1),
      diag / 100,
      diag * 100,
    );

    scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x8a93a5, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1.2, 1.6, 1.4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xf5b04c, 0.7);
    rim.position.set(-1.6, -0.6, -1.2);
    scene.add(rim);

    const mat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.55,
      roughness: 0.32,
      side: THREE.DoubleSide,
    });
    scene.add(new THREE.Mesh(geometry, mat));

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 25),
      new THREE.LineBasicMaterial({
        color: 0x1e293b,
        transparent: true,
        opacity: 0.4,
      }),
    );
    scene.add(edges);

    camera.position.set(diag * 0.9, diag * 0.7, diag * 1.1);
    camera.updateProjectionMatrix();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.5;
    controls.addEventListener("start", () => (controls.autoRotate = false));

    let lastFrame = 0;
    const interval = 1000 / 30;
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      if (paused) return;
      if (now - lastFrame < interval) return;
      lastFrame = now;
      controls.update();
      renderer.render(scene, camera);
    };
    requestAnimationFrame(loop);

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
      canvasEl.removeEventListener("webglcontextlost", onLost);
      canvasEl.removeEventListener("webglcontextrestored", onRestored);
      ro.disconnect();
      controls.dispose();
      geometry.dispose();
      mat.dispose();
      renderer.dispose();
      if (canvasEl.parentNode === mount) mount.removeChild(canvasEl);
    };
  }, [polygon, bends, thickness, angleDeg, color]);

  return <div ref={mountRef} className="h-full w-full" />;
}
