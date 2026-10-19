#!/usr/bin/env node
// plans/baseline.json + dimensions.json -> dist/fusion-build.py
//
// A Fusion script that builds the floor in 3D with every edge bound to a
// Fusion user parameter, using the same names as dimensions.json. Change a
// parameter in Fusion (Modify > Change Parameters) and the model follows; or
// change dimensions.json, regenerate and re-run, and the parameters are
// updated in place. Run it from Fusion's Scripts and Add-ins, or through the
// Fusion MCP. Zero dependencies.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDims, pin, pinSpan } from './dims.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const plan = JSON.parse(readFileSync(join(HERE, 'plans', process.argv[2] ?? 'baseline.json'), 'utf8'));
const dims = loadDims();

// --- expressions ------------------------------------------------------------
const num = (v) => String(Math.round(v * 1000) / 1000);
const withOff = (name, off) => {
  const t = dims.env.wallT;
  if (Math.abs(off) < 1e-6) return name;
  if (Math.abs(off - t / 2) < 1e-6) return `${name} + wallT/2`;
  if (Math.abs(off + t / 2) < 1e-6) return `${name} - wallT/2`;
  return off > 0 ? `${name} + ${num(off)} in` : `${name} - ${num(-off)} in`;
};
const at = (axis, v) => { const p = pin(dims, axis, v); return withOff(p.g.name, p.off); };
const plus = (expr, d) => (Math.abs(d) < 1e-6 ? expr : d > 0 ? `${expr} + ${num(d)} in` : `${expr} - ${num(-d)} in`);
const val = (axis, v) => { const p = pin(dims, axis, v); return p.g.at + p.off; };

// --- parameters, in dependency order ----------------------------------------
const params = Object.entries(dims.params).map(([k, v]) => [k, `${v.value} in`, `${v.status}: ${v.note ?? ''}`.slice(0, 200)]);
const grids = [];
{
  let left = dims.lines.slice(); const known = new Set(Object.keys(dims.params));
  while (left.length) {
    const ready = left.filter((g) => (g.expr.match(/[A-Za-z_]\w*/g) ?? []).every((nm) => known.has(nm)));
    for (const g of ready) { grids.push([g.name, g.expr, `grid: ${g.note}`]); known.add(g.name); }
    left = left.filter((g) => !ready.includes(g));
  }
}

// --- solids -----------------------------------------------------------------
// every solid is a plan rectangle (or circle) extruded from bottom to top
const solids = [];
const rect = (o) => solids.push({ shape: 'rect', ...o });

const thick = (w) => (w.type === 'railing' ? ['railT', dims.env.railT] : ['wallT', dims.env.wallT]);
for (const w of plan.walls) {
  const [tn, t] = thick(w);
  const horiz = w.start[1] === w.end[1];
  const [a, b] = horiz ? [w.start[0], w.end[0]] : [w.start[1], w.end[1]];
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const along = horiz ? 'x' : 'y', across = horiz ? 'y' : 'x';
  const c = horiz ? w.start[1] : w.start[0];
  const e = {
    lo: `${at(along, lo)} - ${tn}/2`, hi: `${at(along, hi)} + ${tn}/2`,
    clo: `${at(across, c)} - ${tn}/2`, chi: `${at(across, c)} + ${tn}/2`,
  };
  const v = { lo: val(along, lo) - t / 2, hi: val(along, hi) + t / 2, clo: val(across, c) - t / 2, chi: val(across, c) + t / 2 };
  rect({
    id: w.id, comp: 'Shell', group: w.type === 'railing' ? 'Railing' : 'Walls', op: 'new',
    x: horiz ? [e.lo, e.hi] : [e.clo, e.chi], y: horiz ? [e.clo, e.chi] : [e.lo, e.hi],
    xv: horiz ? [v.lo, v.hi] : [v.clo, v.chi], yv: horiz ? [v.clo, v.chi] : [v.lo, v.hi],
    z: ['-floorT', w.type === 'railing' ? 'railingH' : 'wallTop'],
  });
}

const H = dims.openingHeights;
for (const o of plan.openings) {
  const w = plan.walls.find((x) => x.id === o.wall);
  const [tn, t] = thick(w);
  const horiz = w.start[1] === w.end[1];
  const along = horiz ? 'x' : 'y', across = horiz ? 'y' : 'x';
  const s = horiz ? w.start[0] : w.start[1], e = horiz ? w.end[0] : w.end[1];
  const dir = e > s ? 1 : -1;
  const sExpr = at(along, s), sVal = val(along, s);
  const [d0, d1] = dir > 0 ? [o.offset, o.offset + o.width] : [-o.offset - o.width, -o.offset];
  const c = horiz ? w.start[1] : w.start[0];
  const cExpr = at(across, c), cVal = val(across, c);
  const [sill, head] = H[o.id] ?? H[o.type];
  const alongE = [plus(sExpr, d0), plus(sExpr, d1)], alongV = [sVal + d0, sVal + d1];
  const cut = [`${cExpr} - ${tn}/2 - 0.25 in`, `${cExpr} + ${tn}/2 + 0.25 in`], cutV = [cVal - t / 2 - 0.25, cVal + t / 2 + 0.25];
  rect({
    id: o.id, comp: 'Shell', group: 'Walls', op: 'cut',
    x: horiz ? alongE : cut, y: horiz ? cut : alongE, xv: horiz ? alongV : cutV, yv: horiz ? cutV : alongV, z: [sill, head],
  });
  // glass in windows and the balcony doors
  if (o.type === 'window' || o.id === 'dr-balcony') {
    const g = [`${cExpr} - 0.5 in`, `${cExpr} + 0.5 in`], gV = [cVal - 0.5, cVal + 0.5];
    rect({
      id: `glass-${o.id}`, comp: 'Glazing', op: 'new', frosted: o.id === 'win-partition',
      x: horiz ? alongE : g, y: horiz ? g : alongE, xv: horiz ? alongV : gV, yv: horiz ? gV : alongV, z: [sill, head],
    });
  }
}

// rectilinear polygon -> rectangles, by horizontal bands
function rects(poly) {
  const ys = [...new Set(poly.map((p) => p[1]))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < ys.length - 1; i++) {
    const ym = (ys[i] + ys[i + 1]) / 2;
    const xs = [];
    for (let k = 0; k < poly.length; k++) {
      const [p, q] = [poly[k], poly[(k + 1) % poly.length]];
      if (p[0] === q[0] && (p[1] - ym) * (q[1] - ym) < 0) xs.push(p[0]);
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) out.push([xs[k], ys[i], xs[k + 1], ys[i + 1]]);
  }
  // merge bands with the same span
  for (let i = out.length - 1; i > 0; i--) {
    const a = out[i - 1], b = out[i];
    if (a[0] === b[0] && a[2] === b[2] && a[3] === b[1]) { a[3] = b[3]; out.splice(i, 1); }
  }
  return out;
}
const rectFrom = (r, o) => rect({
  ...o, x: [at('x', r[0]), at('x', r[2])], y: [at('y', r[1]), at('y', r[3])],
  xv: [val('x', r[0]), val('x', r[2])], yv: [val('y', r[1]), val('y', r[3])],
});

for (const r of plan.rooms)
  rects(r.boundary).forEach((q, i) => rectFrom(q, { id: `${r.id}${i ? '-' + i : ''}`, comp: 'Floors', group: r.id, op: 'new', z: ['-floorT', '0'] }));
if (plan.envelope?.livingArea)
  rects(plan.envelope.livingArea).forEach((q, i) => rectFrom(q, { id: `slab${i ? '-' + i : ''}`, comp: 'Floors', group: 'Slab', op: 'new', z: ['-floorT - 4 in', '-floorT'] }));

const COMP = { kitchen: 'Kitchen', 'bath-main': 'Baths', 'bath-second': 'Baths', 'living-room': 'Living' };
const compOf = (room) => COMP[room] ?? 'Storage';
const FH = dims.fixtureHeights;
for (const f of plan.fixtures) {
  let z = FH[f.kind];
  if (!z) continue;
  // anything that runs to the ceiling is cut with the walls
  if (z[1] === 'ceilingH') z = [z[0], 'wallTop'];
  if (f.shape === 'circle') {
    solids.push({ shape: 'circle', id: f.id, comp: compOf(f.room), op: 'new', kind: f.kind,
      cx: at('x', f.cx), cy: at('y', f.cy), r: `${num(f.r)} in`, cxv: val('x', f.cx), cyv: val('y', f.cy), rv: f.r, z });
    continue;
  }
  const px = pinSpan(dims, 'x', f.x, f.x + f.w), py = pinSpan(dims, 'y', f.y, f.y + f.h);
  rect({
    id: f.id, comp: compOf(f.room), op: 'new', kind: f.kind,
    x: [withOff(px.g.name, px.off), withOff(px.g.name, px.off + f.w)], y: [withOff(py.g.name, py.off), withOff(py.g.name, py.off + f.h)],
    xv: [px.g.at + px.off, px.g.at + px.off + f.w], yv: [py.g.at + py.off, py.g.at + py.off + f.h], z,
  });
}

// Fusion can't bind a zero-length dimension, and the building's outside corner
// sits on the origin; shift the model off it with a Fusion-only parameter.
const PAD = 12;
params.unshift(['pad', `${PAD} in`, 'Fusion only: keeps every edge off the sketch origin.']);
params.push(['wallTop', 'ceilingH', 'Fusion only: wall height drawn. Leave at ceilingH; use the Wall cut section to see in.']);
params.push(['cutH', '48 in', 'Fusion only: height of the Wall cut section (Analysis > Wall cut in the browser).']);
for (const g of grids) if (g[0] === 'X_W' || g[0] === 'Y_N') g[1] = `pad + ${g[1]}`;
for (const s of solids) {
  if (s.xv) s.xv = s.xv.map((v) => v + PAD);
  if (s.yv) s.yv = s.yv.map((v) => v + PAD);
  if (s.cxv !== undefined) { s.cxv += PAD; s.cyv += PAD; }
}

// --- emit ---------------------------------------------------------------------
const py = readFileSync(join(HERE, 'fusion-build.template.py'), 'utf8')
  .replace('__PARAMS__', JSON.stringify(params.concat(grids)))
  .replace('__SOLIDS__', JSON.stringify(solids))
  .replace('__PLAN__', JSON.stringify(plan.name ?? 'plan'))
  .replace('__FINISHES__', readFileSync(join(HERE, 'finishes.json'), 'utf8'));
mkdirSync(join(HERE, 'dist'), { recursive: true });
writeFileSync(join(HERE, 'dist', 'fusion-build.py'), py);
console.log(`dist/fusion-build.py  (${params.length + grids.length} parameters, ${solids.length} solids)`);
