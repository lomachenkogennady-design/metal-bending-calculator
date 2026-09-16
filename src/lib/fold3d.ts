import * as THREE from "three";
import type { Pt } from "./extract";

export interface BendLine {
  from: Pt;
  to: Pt;
}

/**
 * Строит 3D-геометрию детали из плоского контура с гибами.
 * Логика: экструзия плоского контура на толщину, затем поворот
 * одной половины вокруг каждой линии гиба на angleDeg градусов.
 */
export function buildFoldedGeometry(
  polygon: Pt[],
  bendLines: BendLine[],
  thickness: number,
  angleDeg: number,
): THREE.BufferGeometry {
  const shape = new THREE.Shape(
    polygon.map((p) => new THREE.Vector2(p.x, p.y)),
  );

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 6,
  });

  const theta = THREE.MathUtils.degToRad(angleDeg);

  for (const bend of bendLines) {
    const ax = bend.from.x;
    const ay = bend.from.y;
    const dx = bend.to.x - ax;
    const dy = bend.to.y - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const ux = dx / len;
    const uy = dy / len;
    const axis = new THREE.Vector3(ux, uy, 0).normalize();

    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const px = positions.getX(i);
      const py = positions.getY(i);
      const pz = positions.getZ(i);

      // Знаковая сторона от линии
      const side = (px - ax) * -uy + (py - ay) * ux;
      if (side > 1e-6) {
        const p = new THREE.Vector3(px - ax, py - ay, pz);
        p.applyAxisAngle(axis, theta);
        positions.setXYZ(i, p.x + ax, p.y + ay, p.z);
      }
    }
    positions.needsUpdate = true;
  }

  geometry.computeVertexNormals();

  // Центрируем вокруг начала координат для удобной камеры
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  geometry.translate(
    -(bb.min.x + bb.max.x) / 2,
    -(bb.min.y + bb.max.y) / 2,
    -(bb.min.z + bb.max.z) / 2,
  );

  return geometry;
}

/** Диагональ ограничивающего бокса — для настройки камеры */
export function geometryDiagonal(g: THREE.BufferGeometry): number {
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  return Math.max(
    1,
    Math.hypot(
      bb.max.x - bb.min.x,
      bb.max.y - bb.min.y,
      bb.max.z - bb.min.z,
    ),
  );
}
