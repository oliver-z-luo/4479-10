// dimensions.json -> where every grid line actually sits, and how to move a
// plan drawn at the old positions onto the new ones. Zero dependencies.
//
// Plans are drawn in absolute inches. Each coordinate is pinned to a grid line
// (a wall centreline): exactly, when it sits on the line or on one of its
// faces, otherwise to the nearest line. When a room size changes, its grid
// line moves and everything pinned to it moves by the same amount, so a
// counter against a wall stays against it and keeps its size.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// --- expressions ------------------------------------------------------------
// The same expressions become Fusion user parameters, so keep them to names,
// numbers, + - * / and parentheses.
const SAFE = /^[\w\s+\-*/().]+$/;
export function evalExpr(expr, env) {
  if (!SAFE.test(expr)) throw new Error(`unsupported expression "${expr}"`);
  const names = [...new Set(expr.match(/[A-Za-z_]\w*/g) ?? [])];
  for (const nm of names) if (!(nm in env)) throw new Error(`unknown name "${nm}" in "${expr}"`);
  return Function(...names, `"use strict"; return (${expr});`)(...names.map((nm) => env[nm]));
}

export function loadDims(file = join(HERE, 'dimensions.json')) {
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const env = Object.fromEntries(Object.entries(d.params).map(([k, v]) => [k, v.value]));
  const lines = [...d.grids.x.map((g) => ({ ...g, axis: 'x' })), ...d.grids.y.map((g) => ({ ...g, axis: 'y' }))];
  // grid lines may refer to each other in any order; resolve until settled
  let left = lines.slice();
  while (left.length) {
    const next = left.filter((g) => {
      try { env[g.name] = evalExpr(g.expr, env); return false; } catch { return true; }
    });
    if (next.length === left.length) throw new Error(`grid lines can't be resolved: ${next.map((g) => g.name).join(', ')}`);
    left = next;
  }
  for (const g of lines) g.at = env[g.name];
  return { ...d, env, lines, x: lines.filter((g) => g.axis === 'x'), y: lines.filter((g) => g.axis === 'y') };
}

// --- pinning ----------------------------------------------------------------
const EPS = 0.01;
// which grid line a drawn coordinate belongs to, and its offset from it
export function pin(dims, axis, v) {
  const t = dims.env.wallT;
  const lines = dims[axis];
  for (const g of lines) for (const off of [0, -t / 2, t / 2])
    if (Math.abs(v - (g.drawnAt + off)) < EPS) return { g, off };
  let best = null;
  for (const g of lines) {
    const dist = Math.abs(v - g.drawnAt);
    if (!best || dist < best.dist) best = { g, dist };
  }
  return { g: best.g, off: v - best.g.drawnAt };
}
// a rectangle keeps its size: pin whichever edge sits on a wall face (or is
// nearest one) and move the whole thing with it
export function pinSpan(dims, axis, a, b) {
  const pa = pin(dims, axis, a), pb = pin(dims, axis, b);
  const exact = (p) => [0, dims.env.wallT / 2, -dims.env.wallT / 2].some((o) => Math.abs(p.off - o) < EPS);
  if (exact(pa)) return pa;
  if (exact(pb)) return { g: pb.g, off: pb.off - (b - a) };
  return Math.abs(pa.off) <= Math.abs(pb.off) ? pa : { g: pb.g, off: pb.off - (b - a) };
}

const move = (dims, axis, v) => { const p = pin(dims, axis, v); return p.g.at + p.off; };
const movePt = (dims, [x, y]) => [move(dims, 'x', x), move(dims, 'y', y)];
const moveRect = (dims, f) => {
  if (f.shape === 'circle') return { ...f, cx: move(dims, 'x', f.cx), cy: move(dims, 'y', f.cy) };
  const px = pinSpan(dims, 'x', f.x, f.x + f.w), py = pinSpan(dims, 'y', f.y, f.y + f.h);
  return { ...f, x: px.g.at + px.off, y: py.g.at + py.off };
};

const ft = (inches) => { const t = Math.round(inches); return `${Math.floor(t / 12)}'${t % 12}"`; };

// Move a plan onto the current dimensions. With every value at its drawn
// default this returns the plan unchanged.
export function resolvePlan(plan, dims) {
  const p = structuredClone(plan);
  const walls = (ws) => (ws ?? []).map((w) => ({ ...w, start: movePt(dims, w.start), end: movePt(dims, w.end) }));
  const polys = (zs) => (zs ?? []).map((z) => (z.boundary ? { ...z, boundary: z.boundary.map((q) => movePt(dims, q)) } : z));
  const services = (vs) => (vs ?? []).map((v) => ({ ...v, points: v.points.map((q) => movePt(dims, q)) }));

  if (p.walls) p.walls = walls(p.walls);
  if (p.fixtures) p.fixtures = p.fixtures.map((f) => moveRect(dims, f));
  if (p.furniture) p.furniture = p.furniture.map((f) => moveRect(dims, f));
  if (p.zones) p.zones = polys(p.zones);
  if (p.services) p.services = services(p.services);
  if (p.envelope) for (const k of ['livingArea', 'balcony'])
    if (Array.isArray(p.envelope[k])) p.envelope[k] = p.envelope[k].map((q) => movePt(dims, q));
  for (const t of p.toggles ?? []) if (t.add) {
    if (t.add.walls) t.add.walls = walls(t.add.walls);
    if (t.add.fixtures) t.add.fixtures = t.add.fixtures.map((f) => moveRect(dims, f));
    if (t.add.services) t.add.services = services(t.add.services);
  }
  // rooms: move the corners; where a room's size changed, its label follows
  p.rooms = (p.rooms ?? []).map((r) => {
    const span = (pts, axis, i) => { const v = pts.map((q) => q[i]); return Math.max(...v) - Math.min(...v); };
    const before = [span(r.boundary, 'x', 0), span(r.boundary, 'y', 1)];
    const out = { ...r, boundary: r.boundary.map((q) => movePt(dims, q)) };
    if (r.labelledSpan?.x) { before[0] = r.labelledSpan.x[1] - r.labelledSpan.x[0]; out.labelledSpan = { ...r.labelledSpan, x: r.labelledSpan.x.map((v) => move(dims, 'x', v)) }; }
    const after = [out.labelledSpan?.x ? out.labelledSpan.x[1] - out.labelledSpan.x[0] : span(out.boundary, 'x', 0), span(out.boundary, 'y', 1)];
    if (r.labelled && (Math.abs(after[0] - before[0]) > EPS || Math.abs(after[1] - before[1]) > EPS)) {
      const parts = String(r.labelled.text).split(' x ');
      const a = r.labelled.a + (after[0] - before[0]), b = r.labelled.b + (after[1] - before[1]);
      out.labelled = {
        ...r.labelled, a, b,
        text: `${Math.abs(after[0] - before[0]) > EPS ? ft(a) : parts[0]} x ${Math.abs(after[1] - before[1]) > EPS ? ft(b) : parts[1]}`,
      };
    }
    return out;
  });
  return p;
}

// Sanity checks for validate.mjs. Room sizes and order are checked on the
// resolved plans themselves (rooms must still close and match their labels).
export function checkDims(dims) {
  const fail = [];
  for (const [k, v] of Object.entries(dims.params))
    if (typeof v.value !== 'number' || v.value < 0) fail.push(`param ${k} must be a number >= 0`);
  for (const g of dims.lines) if (!(g.at > 0)) fail.push(`grid ${g.name} resolves to ${g.at}`);
  return fail;
}

// true once any room size differs from what the plans were drawn at
export const isEdited = (dims) => dims.lines.some((g) => Math.abs(g.at - g.drawnAt) > EPS);
