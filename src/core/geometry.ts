import type { Point } from "./types";
export type XY = { x: number; y: number };
const R = 6371008.8;
export const rad = (d: number) => (d * Math.PI) / 180;
export const deg = (r: number) => (r * 180) / Math.PI;
export const bearing = (a: XY, b: XY) =>
  (deg(Math.atan2(b.x - a.x, b.y - a.y)) + 360) % 360;
export const distance = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);

export function projection(origin: Point) {
  const scale = R * Math.cos(rad(origin.lat));
  return {
    to: (p: Point): XY => ({
      x: rad(p.lng - origin.lng) * scale,
      y: rad(p.lat - origin.lat) * R,
    }),
    from: (p: XY): Point => ({
      lng: origin.lng + deg(p.x / scale),
      lat: origin.lat + deg(p.y / R),
    }),
  };
}
export function pointValid(p: unknown): p is Point {
  return (
    !!p &&
    typeof p === "object" &&
    Number.isFinite((p as Point).lng) &&
    Number.isFinite((p as Point).lat) &&
    Math.abs((p as Point).lng) <= 180 &&
    Math.abs((p as Point).lat) <= 80
  );
}
export function area(ring: XY[]) {
  return (
    Math.abs(
      ring.reduce((sum, p, i) => {
        const q = ring[(i + 1) % ring.length];
        return sum + p.x * q.y - q.x * p.y;
      }, 0),
    ) / 2
  );
}
function cross(a: XY, b: XY, c: XY) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function on(a: XY, b: XY, p: XY) {
  return (
    Math.abs(cross(a, b, p)) < 1e-7 &&
    p.x >= Math.min(a.x, b.x) - 1e-7 &&
    p.x <= Math.max(a.x, b.x) + 1e-7 &&
    p.y >= Math.min(a.y, b.y) - 1e-7 &&
    p.y <= Math.max(a.y, b.y) + 1e-7
  );
}
export function intersects(a: XY, b: XY, c: XY, d: XY) {
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 &&
      cross(c, d, a) * cross(c, d, b) < 0) ||
    on(a, b, c) ||
    on(a, b, d) ||
    on(c, d, a) ||
    on(c, d, b)
  );
}
export function selfIntersects(points: XY[], closed: boolean) {
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++)
    for (let j = i + 1; j < count; j++) {
      if (j === i + 1 || (closed && i === 0 && j === count - 1)) continue;
      if (
        intersects(
          points[i],
          points[(i + 1) % points.length],
          points[j],
          points[(j + 1) % points.length],
        )
      )
        return true;
    }
  return false;
}
export function nearest(p: XY, line: XY[]) {
  let best = line[0],
    bestDistance = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1],
      b = line[i],
      dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
    const q = { x: a.x + t * dx, y: a.y + t * dy },
      length = distance(p, q);
    if (length < bestDistance) {
      best = q;
      bestDistance = length;
    }
  }
  return best;
}
export function sampleSegment(a: XY, b: XY, spacing: number) {
  const count = Math.max(1, Math.ceil(distance(a, b) / spacing));
  if (count > 10000) throw new Error("Too many points / 航点过多，请增加间距");
  return Array.from({ length: count + 1 }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / count,
    y: a.y + ((b.y - a.y) * i) / count,
  }));
}
export function offsetLine(line: XY[], offset: number) {
  const normals = line.slice(1).map((p, i) => {
    const a = line[i],
      length = distance(a, p);
    return { x: -(p.y - a.y) / length, y: (p.x - a.x) / length };
  });
  return line.map((p, i) => {
    const before = normals[Math.max(0, i - 1)],
      after = normals[Math.min(i, normals.length - 1)];
    const sum = { x: before.x + after.x, y: before.y + after.y },
      norm = Math.hypot(sum.x, sum.y);
    if (norm < 1e-6)
      throw new Error("Sharp reversal in facade / 立面折线急转折，请拆分规划");
    const bisector = { x: sum.x / norm, y: sum.y / norm },
      dot = bisector.x * after.x + bisector.y * after.y;
    if (Math.abs(dot) < 0.25)
      throw new Error("Acute facade corner / 立面拐角过尖，请拆分规划");
    return {
      x: p.x + (bisector.x * offset) / dot,
      y: p.y + (bisector.y * offset) / dot,
    };
  });
}
