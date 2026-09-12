export type Point = Readonly<{ x: number; y: number }>;
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function polygonArea(points: readonly Point[]): number {
  return (
    Math.abs(
      points.reduce((sum, point, i) => {
        const next = points[(i + 1) % points.length];
        return sum + point.x * next.y - next.x * point.y;
      }, 0),
    ) / 2
  );
}
export const medianGeometry = (() => {
  const A = { x: 230, y: 70 },
    B = { x: 135, y: 305 },
    C = { x: 585, y: 305 };
  const M = { x: (B.x + C.x) / 2, y: B.y };
  const H = { x: A.x, y: B.y };
  const ratio = distance(A, B) / (distance(A, B) + distance(A, C));
  // Angle-bisector theorem BL / LC = AB / AC; use the exact foot, not a hand-drawn estimate.
  const L = { x: B.x + (C.x - B.x) * ratio, y: B.y };
  return { A, B, C, M, H, L };
})();
