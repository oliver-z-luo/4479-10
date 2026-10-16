// Shared geometry for validate.mjs and render.mjs. Part of the project, not a
// dependency. Everything is in inches on the plan origin.

export const polyArea = (p) => {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
};

export const bbox = (pts) => ({
  x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])),
  y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])),
});

/** Axis-aligned box for a furniture piece or rect fixture. */
export const boxOf = (f) => (f.shape === 'circle'
  ? { x0: f.cx - f.r, x1: f.cx + f.r, y0: f.cy - f.r, y1: f.cy + f.r }
  : { x0: f.x, x1: f.x + f.w, y0: f.y, y1: f.y + f.h });

export const overlapArea = (a, b) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
  Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

export const overlaps = (a, b, tol = 0.01) => overlapArea(a, b) > tol;

const DIRS = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

export const unitVec = (w) => {
  const dx = w.end[0] - w.start[0], dy = w.end[1] - w.start[1];
  const L = Math.hypot(dx, dy) || 1;
  return { u: [dx / L, dy / L], nrm: [-dy / L, dx / L], L };
};
export const pointAt = (w, t) => {
  const { u } = unitVec(w);
  return [w.start[0] + u[0] * t, w.start[1] + u[1] * t];
};

export const thicknessOf = (plan, w) =>
  plan.wallTypes?.[w.type]?.thickness ?? w.thickness ?? 5;

/** The solid body of a wall, as boxes, with its openings cut out. */
export function wallBoxes(plan, w) {
  const t = thicknessOf(plan, w);
  const { u, L } = unitVec(w);
  const cuts = plan.openings.filter((o) => o.wall === w.id)
    .map((o) => [o.offset, o.offset + o.width]).sort((a, b) => a[0] - b[0]);
  const runs = [];
  let cur = 0;
  for (const [a, b] of cuts) { if (a > cur) runs.push([cur, a]); cur = Math.max(cur, b); }
  if (cur < L) runs.push([cur, L]);
  const horiz = Math.abs(u[0]) > 0.5;
  return runs.map(([a, b]) => {
    const p = pointAt(w, a), q = pointAt(w, b);
    return horiz
      ? { x0: Math.min(p[0], q[0]), x1: Math.max(p[0], q[0]), y0: p[1] - t / 2, y1: p[1] + t / 2 }
      : { x0: p[0] - t / 2, x1: p[0] + t / 2, y0: Math.min(p[1], q[1]), y1: Math.max(p[1], q[1]) };
  });
}

/**
 * The quarter-discs swept by a hinged door's leaves. Each is {hinge, r, along, nd}
 * where `along` points at the closed position and `nd` at the open position.
 */
export function swings(plan, o) {
  if (o.type !== 'door' || (o.style ?? 'hinged') !== 'hinged') return [];
  const w = plan.walls.find((x) => x.id === o.wall);
  if (!w) return [];
  const { u, nrm } = unitVec(w);
  const nd = DIRS[o.swingTo] ?? nrm;
  const a = pointAt(w, o.offset), b = pointAt(w, o.offset + o.width);
  const neg = [-u[0], -u[1]];
  if (o.hinge === 'both' && (o.leaves ?? 1) === 2)
    return [{ hinge: a, r: o.width / 2, along: u, nd }, { hinge: b, r: o.width / 2, along: neg, nd }];
  return o.hinge === 'end'
    ? [{ hinge: b, r: o.width, along: neg, nd }]
    : [{ hinge: a, r: o.width, along: u, nd }];
}

/** Bounding box of a swing, for a quick reject. */
export const swingBox = (s) => {
  const xs = [s.hinge[0], s.hinge[0] + s.along[0] * s.r, s.hinge[0] + s.nd[0] * s.r];
  const ys = [s.hinge[1], s.hinge[1] + s.along[1] * s.r, s.hinge[1] + s.nd[1] * s.r];
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

/** Is a point inside the swept quarter-disc? */
export const inSwing = (s, p) => {
  const dx = p[0] - s.hinge[0], dy = p[1] - s.hinge[1];
  if (dx * dx + dy * dy > s.r * s.r) return false;
  return dx * s.along[0] + dy * s.along[1] >= -1e-9 && dx * s.nd[0] + dy * s.nd[1] >= -1e-9;
};

/** Area of a box that falls inside a swing, sampled. */
export function boxAreaInSwing(box, s, step = 1) {
  if (!overlaps(box, swingBox(s))) return 0;
  let a = 0;
  for (let x = box.x0 + step / 2; x < box.x1; x += step)
    for (let y = box.y0 + step / 2; y < box.y1; y += step)
      if (inSwing(s, [x, y])) a += step * step;
  return a;
}

/** Does a point lie inside an axis-aligned polygon? */
export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) &&
        p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Area of a box that falls inside an axis-aligned polygon, by sampling columns. */
export function boxAreaInPoly(box, poly, step = 1) {
  let a = 0;
  for (let x = box.x0 + step / 2; x < box.x1; x += step)
    for (let y = box.y0 + step / 2; y < box.y1; y += step)
      if (pointInPoly([x, y], poly)) a += step * step;
  return a;
}

const segHit = (p1, p2, p3, p4) => {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};

/**
 * Classify the straight line from a to b:
 *   'clear'   - crosses no solid wall and no glazing
 *   'glass'   - crosses no solid wall but passes through at least one window
 *   'blocked' - crosses a solid wall
 * Furniture is ignored; this is about the shell, not the contents.
 */
export function sightline(plan, a, b) {
  let glass = false;
  for (const w of plan.walls) {
    if (w.type === 'railing') continue;
    const { L } = unitVec(w);
    const cuts = plan.openings.filter((o) => o.wall === w.id)
      .map((o) => ({ a: o.offset, b: o.offset + o.width, type: o.type }))
      .sort((x, y) => x.a - y.a);
    let cur = 0;
    const spans = [];
    for (const c of cuts) {
      if (c.a > cur) spans.push({ a: cur, b: c.a, solid: true });
      spans.push({ a: c.a, b: c.b, solid: false, type: c.type });
      cur = Math.max(cur, c.b);
    }
    if (cur < L) spans.push({ a: cur, b: L, solid: true });
    for (const s of spans) {
      if (!segHit(a, b, pointAt(w, s.a), pointAt(w, s.b))) continue;
      if (s.solid) return 'blocked';
      if (s.type === 'window') glass = true;
    }
  }
  return glass ? 'glass' : 'clear';
}

/** A play mat is the play surface, not clutter standing on it. */
export const PLAY_SURFACE = new Set(['play-mat']);

/** Clear floor inside a zone, in square feet, ignoring the play surface itself. */
export function zoneClearArea(zone, furniture = []) {
  let covered = 0;
  for (const f of furniture) {
    if (PLAY_SURFACE.has(f.kind)) continue;
    covered += boxAreaInPoly(boxOf(f), zone.boundary, 1);
  }
  return (polyArea(zone.boundary) - covered) / 144;
}
