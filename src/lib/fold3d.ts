import * as THREE from "three";
import type { Pt } from "./extract";

export interface BendLine {
  from: Pt;
  to: Pt;
}

const EPS = 1e-6;

/** Клиппинг полигона полуплоскостью (a→b) по алгоритму Сазерленда–Ходжмана.
 *  Оставляет часть, где знак векторного произведения совпадает с keepPositive. */
function clipHalfPlane(poly: Pt[], a: Pt, b: Pt, keepPositive: boolean): Pt[] {
  const out: Pt[] = [];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sgn = keepPositive ? 1 : -1;
  const side = (p: Pt) => ((p.x - a.x) * dy - (p.y - a.y) * dx) * sgn;

  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const nxt = poly[(i + 1) % poly.length];
    const sc = side(cur);
    const sn = side(nxt);

    if (sc >= -EPS) out.push(cur);

    if ((sc > EPS && sn < -EPS) || (sc < -EPS && sn > EPS)) {
      const t = sc / (sc - sn);
      out.push({
        x: cur.x + t * (nxt.x - cur.x),
        y: cur.y + t * (nxt.y - cur.y),
      });
    }
  }
  return out;
}

function extrudePoly(poly: Pt[], thickness: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, p.y)));
  return new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 6,
  });
}

/** Ручное слияние неиндексированных геометрий по position/normal/uv. */
function mergeBuffers(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of flat) total += g.attributes.position.count;

  const hasN = flat.every((g) => g.attributes.normal);
  const hasUv = flat.every((g) => g.attributes.uv);

  const pos = new Float32Array(total * 3);
  const nor = hasN ? new Float32Array(total * 3) : null;
  const uv = hasUv ? new Float32Array(total * 2) : null;

  let po = 0;
  let uo = 0;
  for (const g of flat) {
    const p = g.attributes.position.array as Float32Array;
    pos.set(p, po);
    if (nor && g.attributes.normal) {
      nor.set(g.attributes.normal.array as Float32Array, po);
    }
    if (uv && g.attributes.uv) {
      uv.set(g.attributes.uv.array as Float32Array, uo);
      uo += g.attributes.uv.array.length;
    }
    po += p.length;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  if (nor) merged.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  if (uv) merged.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return merged;
}

/** Строит 3D-геометрию детали из плоского контура с гибами.
 *  Разрезает полигон по каждой линии гиба, выдавливает половины
 *  на толщину и поворачивает одну половину вокруг линии гиба. */
export function buildFoldedGeometry(
  polygon: Pt[],
  bendLines: BendLine[],
  thickness: number,
  angles: number | number[],
): THREE.BufferGeometry {
  const angleArr = Array.isArray(angles)
    ? angles
    : bendLines.map(() => angles as number);

  interface Piece {
    poly: Pt[];
    matrix: THREE.Matrix4;
  }
  let pieces: Piece[] = [{ poly: polygon, matrix: new THREE.Matrix4() }];

  for (let bi = 0; bi < bendLines.length; bi++) {
    const bend = bendLines[bi];
    const theta = THREE.MathUtils.degToRad(angleArr[bi] ?? 90);
    const ax = bend.from.x;
    const ay = bend.from.y;
    const dx = bend.to.x - ax;
    const dy = bend.to.y - ay;
    const len = Math.hypot(dx, dy);
    if (len < EPS) continue;

    const ux = dx / len;
    const uy = dy / len;
    const axis = new THREE.Vector3(ux, uy, 0).normalize();
    const rot = new THREE.Matrix4().makeRotationAxis(axis, theta);
    const t1 = new THREE.Matrix4().makeTranslation(-ax, -ay, 0);
    const t2 = new THREE.Matrix4().makeTranslation(ax, ay, 0);
    const foldM = new THREE.Matrix4().multiplyMatrices(t2, rot).multiply(t1);

    const next: Piece[] = [];
    for (const piece of pieces) {
      const halfA = clipHalfPlane(piece.poly, bend.from, bend.to, true);
      const halfB = clipHalfPlane(piece.poly, bend.from, bend.to, false);
      if (halfA.length < 3 || halfB.length < 3) {
        next.push(piece);
        continue;
      }
      next.push({ poly: halfA, matrix: piece.matrix.clone() });
      next.push({
        poly: halfB,
        matrix: new THREE.Matrix4().multiplyMatrices(piece.matrix, foldM),
      });
    }
    pieces = next;
  }

  const geos: THREE.BufferGeometry[] = [];
  for (const piece of pieces) {
    if (piece.poly.length < 3) continue;
    const g = extrudePoly(piece.poly, thickness);
    g.applyMatrix4(piece.matrix);
    geos.push(g);
  }

  let merged: THREE.BufferGeometry;
  if (geos.length === 0) {
    merged = extrudePoly(polygon, thickness);
  } else if (geos.length === 1) {
    merged = geos[0];
  } else {
    merged = mergeBuffers(geos);
  }

  merged.computeVertexNormals();

  merged.computeBoundingBox();
  const bb = merged.boundingBox!;
  merged.translate(
    -(bb.min.x + bb.max.x) / 2,
    -(bb.min.y + bb.max.y) / 2,
    -(bb.min.z + bb.max.z) / 2,
  );

  console.log("[fold3d] built:", {
    polygonPoints: polygon.length,
    bendLines: bendLines.length,
    angleDeg,
    pieces: pieces.length,
    vertices: merged.attributes.position.count,
  });

  return merged;
}

/** Диагональ ограничивающего бокса — для настройки камеры. */
export function geometryDiagonal(g: THREE.BufferGeometry): number {
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  return Math.max(
    1,
    Math.hypot(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z),
  );
}
