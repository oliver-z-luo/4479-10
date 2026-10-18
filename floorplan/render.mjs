#!/usr/bin/env node
// plans/*.json -> dist/index.html : one self-contained, offline, printable file.
// Zero dependencies.

import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boxOf, bbox, overlapArea, pointInPoly, sightline, zoneClearArea } from './geom.mjs';
import { combinations, isLayer } from './toggles.mjs';
import { loadDims, resolvePlan } from './dims.mjs';

const DIMS = loadDims();

const HERE = dirname(fileURLToPath(import.meta.url));
const PLANS = join(HERE, 'plans');
const DIST = join(HERE, 'dist');

const MARGIN = 28;          // inches of white space around the plan
const C = {
  wall: '#8e8e8e', wallEdge: '#111', window: '#1668cc', door: '#1aa34a',
  fixture: '#333', text: '#111', diff: '#d81b60', gone: '#b0b0b0',
  furn: '#7a6a52', furnFill: '#efeadf', zone: '#1668cc',
};

// plans/ also holds library files (the furniture catalog). A file with no
// "walls" array is a library, not a plan.
const isLibrary = (f) => {
  try { const j = JSON.parse(readFileSync(f, 'utf8')); return j.catalog === true || !Array.isArray(j.walls); }
  catch { return false; }
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = (v) => (Math.round(v * 1000) / 1000);
const ft = (inches) => {
  const t = Math.round(inches);
  return `${Math.floor(t / 12)}'${t % 12}"`;
};
const M = (inches) => inches * 0.0254;
const m2 = (sqin) => sqin * 0.00064516;
const metres = (inches) => `${M(inches).toFixed(2)}`;

// --- geometry helpers ------------------------------------------------------
const unit = (w) => {
  const dx = w.end[0] - w.start[0], dy = w.end[1] - w.start[1];
  const L = Math.hypot(dx, dy) || 1;
  return { u: [dx / L, dy / L], nrm: [-dy / L, dx / L], L };
};
const at = (w, t) => { const { u } = unit(w); return [w.start[0] + u[0] * t, w.start[1] + u[1] * t]; };
const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
const DIRS = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

function thicknessOf(plan, w) {
  return plan.wallTypes?.[w.type]?.thickness ?? w.thickness ?? 5;
}

function endsConnected(plan, w) {
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 0.26;
  const onSeg = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    if (!L2) return false;
    const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
    if (t < -1e-9 || t > 1 + 1e-9) return false;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)) <= 0.26;
  };
  const test = (p) => plan.walls.some((o) => o.id !== w.id &&
    (near(p, o.start) || near(p, o.end) || onSeg(p, o.start, o.end)));
  return [test(w.start), test(w.end)];
}

// --- svg pieces ------------------------------------------------------------
function wallBody(plan, w, openings, cls) {
  const t = thicknessOf(plan, w);
  const { u, nrm, L } = unit(w);
  const [cs, ce] = endsConnected(plan, w);
  const lo = cs ? -t / 2 : 0;
  const hi = ce ? L + t / 2 : L;

  // solid runs = the wall minus its openings
  const cuts = openings.filter((o) => o.wall === w.id)
    .map((o) => [o.offset, o.offset + o.width]).sort((a, b) => a[0] - b[0]);
  const runs = [];
  let cur = lo;
  for (const [a, b] of cuts) { if (a > cur) runs.push([cur, a]); cur = Math.max(cur, b); }
  if (cur < hi) runs.push([cur, hi]);

  let out = '';
  for (const [a, b] of runs) {
    if (b - a < 1e-6) continue;
    const p1 = add(at(w, a), nrm, -t / 2), p2 = add(at(w, b), nrm, -t / 2);
    const p3 = add(at(w, b), nrm, t / 2), p4 = add(at(w, a), nrm, t / 2);
    out += `<polygon class="${cls}" points="${[p1, p2, p3, p4].map((p) => `${n(p[0])},${n(p[1])}`).join(' ')}"/>`;
  }
  return out;
}

function windowSym(plan, w, o, cls) {
  const t = thicknessOf(plan, w);
  const { nrm } = unit(w);
  const a = at(w, o.offset), b = at(w, o.offset + o.width);
  const q = (k) => `${n(add(a, nrm, k)[0])},${n(add(a, nrm, k)[1])} ${n(add(b, nrm, k)[0])},${n(add(b, nrm, k)[1])}`;
  return `<polygon class="winbg" points="${q(-t / 2)} ${n(add(b, nrm, t / 2)[0])},${n(add(b, nrm, t / 2)[1])} ${n(add(a, nrm, t / 2)[0])},${n(add(a, nrm, t / 2)[1])}"/>`
    + `<polyline class="${cls}" points="${q(-t / 2)}"/>`
    + `<polyline class="${cls}" points="${q(-t / 6)}"/>`
    + `<polyline class="${cls}" points="${q(t / 6)}"/>`
    + `<polyline class="${cls}" points="${q(t / 2)}"/>`;
}

function arcPath(hinge, from, to, r) {
  const a1 = Math.atan2(from[1] - hinge[1], from[0] - hinge[0]);
  const a2 = Math.atan2(to[1] - hinge[1], to[0] - hinge[0]);
  let d = a2 - a1;
  while (d <= -Math.PI) d += 2 * Math.PI;
  while (d > Math.PI) d -= 2 * Math.PI;
  const sweep = d > 0 ? 1 : 0;
  return `M ${n(from[0])} ${n(from[1])} A ${n(r)} ${n(r)} 0 0 ${sweep} ${n(to[0])} ${n(to[1])}`;
}

function leafSwing(hinge, other, nd, width, cls) {
  const open = add(hinge, nd, width);
  return `<line class="${cls}" x1="${n(hinge[0])}" y1="${n(hinge[1])}" x2="${n(open[0])}" y2="${n(open[1])}"/>`
    + `<path class="${cls} arc" d="${arcPath(hinge, open, other, width)}"/>`;
}

function doorSym(plan, w, o, cls) {
  const t = thicknessOf(plan, w);
  const { u, nrm } = unit(w);
  const a = at(w, o.offset), b = at(w, o.offset + o.width);
  // white out the opening so the swing reads cleanly
  let out = `<polygon class="gap" points="`
    + [add(a, nrm, -t / 2), add(b, nrm, -t / 2), add(b, nrm, t / 2), add(a, nrm, t / 2)]
      .map((p) => `${n(p[0])},${n(p[1])}`).join(' ') + `"/>`;

  const nd = DIRS[o.swingTo] ?? nrm;

  if (o.style === 'pocket') {
    const dir = o.slideTo === 'end' ? 1 : -1;
    const s0 = o.slideTo === 'end' ? o.offset + o.width : o.offset;
    const p1 = at(w, s0), p2 = at(w, s0 + dir * o.width);
    const h = t / 6;
    out += `<polygon class="${cls} panel" points="`
      + [add(p1, nrm, -h), add(p2, nrm, -h), add(p2, nrm, h), add(p1, nrm, h)]
        .map((p) => `${n(p[0])},${n(p[1])}`).join(' ') + `"/>`;
    for (const j of [a, b])
      out += `<line class="${cls}" x1="${n(add(j, nrm, -t / 2)[0])}" y1="${n(add(j, nrm, -t / 2)[1])}" `
        + `x2="${n(add(j, nrm, t / 2)[0])}" y2="${n(add(j, nrm, t / 2)[1])}"/>`;
    return out;
  }

  if (o.style === 'accordion') {
    const segs = Math.max(4, o.leaves ?? 8);
    const amp = Math.min(t / 2.2, (o.width / segs) * 0.75);
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const base = at(w, o.offset + (i * o.width) / segs);
      pts.push(i === 0 || i === segs ? base : add(base, nrm, i % 2 ? amp : -amp));
    }
    out += `<polyline class="${cls}" points="${pts.map((p) => `${n(p[0])},${n(p[1])}`).join(' ')}"/>`;
    for (const j of [a, b])
      out += `<line class="${cls}" x1="${n(add(j, nrm, -t / 2)[0])}" y1="${n(add(j, nrm, -t / 2)[1])}" `
        + `x2="${n(add(j, nrm, t / 2)[0])}" y2="${n(add(j, nrm, t / 2)[1])}"/>`;
    return out;
  }

  if (o.style === 'bifold') {
    const halves = o.leaves ?? 2;
    const L = o.width / halves;
    for (let i = 0; i < halves; i++) {
      const s = at(w, o.offset + i * L), e = at(w, o.offset + (i + 1) * L);
      const apex = add(add(s, u, L / 2), nd, L / 2);
      out += `<polyline class="${cls}" points="${n(s[0])},${n(s[1])} ${n(apex[0])},${n(apex[1])} ${n(e[0])},${n(e[1])}"/>`;
    }
    const h = t / 6;
    out += `<polygon class="${cls} panel" points="`
      + [add(a, nrm, -h), add(b, nrm, -h), add(b, nrm, h), add(a, nrm, h)]
        .map((p) => `${n(p[0])},${n(p[1])}`).join(' ') + `"/>`;
    return out;
  }

  // hinged
  if (o.hinge === 'both' && (o.leaves ?? 1) === 2) {
    const mid = at(w, o.offset + o.width / 2);
    out += leafSwing(a, mid, nd, o.width / 2, cls);
    out += leafSwing(b, mid, nd, o.width / 2, cls);
  } else {
    const hinge = o.hinge === 'end' ? b : a;
    const other = o.hinge === 'end' ? a : b;
    out += leafSwing(hinge, other, nd, o.width, cls);
  }
  return out;
}

function fixtureSym(f, cls = '') {
  const k = `fx fx-${f.kind}${cls}`;
  let out, cx, cy, box;
  if (f.shape === 'circle') {
    out = `<circle class="${k}" cx="${n(f.cx)}" cy="${n(f.cy)}" r="${n(f.r)}"/>`;
    cx = f.cx; cy = f.cy; box = [f.r * 2, f.r * 2];
  } else {
    out = `<rect class="${k}" x="${n(f.x)}" y="${n(f.y)}" width="${n(f.w)}" height="${n(f.h)}" rx="1"/>`;
    if (f.kind === 'fireplace') {
      for (let d = -f.h; d < f.w; d += 5)
        out += `<line class="hatch" x1="${n(f.x + Math.max(d, 0))}" y1="${n(f.y + Math.max(-d, 0))}" `
          + `x2="${n(f.x + Math.min(d + f.h, f.w))}" y2="${n(f.y + Math.min(f.h, f.w - d))}"/>`;
      out += `<rect class="fx" x="${n(f.x + 4)}" y="${n(f.y + 9)}" width="${n(f.w - 4)}" height="${n(f.h - 18)}"/>`;
    }
    if (f.kind === 'shower')
      out += `<line class="fxthin" x1="${n(f.x)}" y1="${n(f.y)}" x2="${n(f.x + f.w)}" y2="${n(f.y + f.h)}"/>`
        + `<line class="fxthin" x1="${n(f.x + f.w)}" y1="${n(f.y)}" x2="${n(f.x)}" y2="${n(f.y + f.h)}"/>`;
    if (f.kind === 'pedestal-sink')
      out += `<ellipse class="fxthin" cx="${n(f.x + f.w / 2)}" cy="${n(f.y + f.h / 2)}" rx="${n(f.w * 0.36)}" ry="${n(f.h * 0.36)}"/>`;
    if (f.kind === 'hanging') // the rod, along the long side
      out += f.w > f.h
        ? `<line class="fxrod" x1="${n(f.x + 2)}" y1="${n(f.y + f.h / 2)}" x2="${n(f.x + f.w - 2)}" y2="${n(f.y + f.h / 2)}"/>`
        : `<line class="fxrod" x1="${n(f.x + f.w / 2)}" y1="${n(f.y + 2)}" x2="${n(f.x + f.w / 2)}" y2="${n(f.y + f.h - 2)}"/>`;
    if (f.kind === 'sink' && f.w > f.h)
      out += `<line class="fxthin" x1="${n(f.x + f.w / 2)}" y1="${n(f.y)}" x2="${n(f.x + f.w / 2)}" y2="${n(f.y + f.h)}"/>`;
    cx = f.x + f.w / 2; cy = f.y + f.h / 2; box = [f.w, f.h];
  }
  if (f.label) {
    const fs = Math.max(4, Math.min(7, box[0] * 0.92 / (f.label.length * 0.62), box[1] * 0.5));
    out += `<text class="fxlbl" x="${n(cx)}" y="${n(cy + fs * 0.35)}" font-size="${n(fs)}">${esc(f.label)}</text>`;
  }
  return out;
}

function furnitureSym(f, catalog, cls) {
  const spec = catalog?.[f.kind] ?? {};
  let out = `<rect class="fn${cls}" x="${n(f.x)}" y="${n(f.y)}" width="${n(f.w)}" height="${n(f.h)}" rx="1.5"/>`;
  const label = spec.label ?? f.kind;
  const fs = Math.min(7.5, (f.w * 0.86) / (label.length * 0.6), f.h * 0.42);
  if (fs >= 3.4)
    out += `<text class="fnlbl" x="${n(f.x + f.w / 2)}" y="${n(f.y + f.h / 2 + fs * 0.35)}" font-size="${n(fs)}" stroke-width="${n(fs * 0.26)}">${esc(label)}</text>`;
  return out;
}

function zoneSym(z, furniture, cls, idx) {
  const b = bbox(z.boundary);
  const pts = z.boundary.map((p) => `${n(p[0])},${n(p[1])}`).join(' ');
  let out = `<polygon class="zone${cls}" points="${pts}"/>`;
  // 45-degree hatch, clipped analytically to the box so it does not depend on
  // the renderer honouring clip-path
  const rect = z.boundary.length === 4;
  if (!rect) out += `<clipPath id="zc${idx}"><polygon points="${pts}"/></clipPath><g clip-path="url(#zc${idx})">`;
  for (let d = b.y0 - (b.x1 - b.x0); d < b.y1; d += 9) {
    const xa = Math.max(b.x0, b.x0 + b.y0 - d), xb = Math.min(b.x1, b.x0 + b.y1 - d);
    if (xb - xa < 0.5) continue;
    out += `<line class="zhatch" x1="${n(xa)}" y1="${n(d + xa - b.x0)}" x2="${n(xb)}" y2="${n(d + xb - b.x0)}"/>`;
  }
  if (!rect) out += `</g>`;
  return out;
}

function zoneLabel(z, furniture) {
  const b = bbox(z.boundary);
  const sqft = zoneClearArea(z, furniture);
  const lines = [(z.kind || 'zone').toUpperCase() + ' AREA', `${sqft.toFixed(0)} sq ft clear`];
  const fs = Math.max(4.5, Math.min(8, ((b.x1 - b.x0) * 0.9) / (14 * 0.58)));
  let out = '';
  lines.forEach((t, i) => {
    out += `<text class="zlbl" x="${n((b.x0 + b.x1) / 2)}" y="${n(b.y0 + fs * 1.25 + i * fs * 1.2)}" font-size="${n(fs)}" stroke-width="${n(fs * 0.28)}">${esc(t)}</text>`;
  });
  return out;
}

function roomLabel(r, furniture = []) {
  const xs = r.boundary.map((p) => p[0]), ys = r.boundary.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = x1 - x0, h = y1 - y0;
  let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (r.boundary.length > 4) cy = y0 + h * 0.42;

  const name = (r.name || '').trim();
  const imp = r.labelled?.text ?? '';
  const met = r.labelled ? `${metres(r.labelled.a)} \u00d7 ${metres(r.labelled.b)} m` : '';
  const setImp = [name, imp].filter(Boolean);
  const setMet = [name, met].filter(Boolean);
  if (!setImp.length) return '';

  // type scales with the room, so a closet does not shout as loud as the living room
  const cap = Math.min(8.6, 4.4 + Math.sqrt(w * h) / 26);
  const fit = (lines, along, across) => Math.max(3.2, Math.min(
    cap,
    (along * 0.92) / (Math.max(...lines.map((l) => l.length)) * 0.58),
    (across * 0.92) / (lines.length * 1.35)));

  // decide the orientation once, on the longer of the two unit sets, so the
  // label does not jump when you flip units
  const probe = setImp.concat(setMet).sort((a, b) => b.length - a.length)[0];
  const ref = [name, probe].filter(Boolean);
  const rotate = fit(ref, h, w) > fit(ref, w, h) + 0.15;
  // slide (and if need be shrink) the label to wherever it collides least
  let scale = 1;
  const mine = furniture.filter((f) => f.room === r.id).map(boxOf)
    .concat((r._fixtures ?? []).map(boxOf));
  if (mine.length) {
    const fsGuess = rotate ? fit(ref, h, w) : fit(ref, w, h);
    const lw = (rotate ? ref.length * 1.3 : Math.max(...ref.map((t) => t.length)) * 0.6) * fsGuess;
    const lh = (rotate ? Math.max(...ref.map((t) => t.length)) * 0.6 : ref.length * 1.3) * fsGuess;
    let best = null;
    search: for (const sc of [1, 0.85, 0.72]) for (const fx of [0.5, 0.22, 0.78, 0.36, 0.64]) for (const fy of [0.5, 0.16, 0.84, 0.32, 0.68]) {
      const px = x0 + w * fx, py = y0 + h * fy;
      const box = { x0: px - lw * sc / 2, x1: px + lw * sc / 2, y0: py - lh * sc / 2, y1: py + lh * sc / 2 };
      if (box.x0 < x0 || box.x1 > x1 || box.y0 < y0 || box.y1 > y1) continue;
      // an L-shaped room's bbox includes floor that is not in the room
      if (r.boundary.length > 4 && ![[box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1]]
        .every((c) => pointInPoly(c, r.boundary))) continue;
      const hit = mine.reduce((a, m) => a + overlapArea(box, m), 0);
      if (!best || hit < best.hit - 0.5) best = { hit, px, py, sc };
      if (hit === 0) break search;
    }
    if (best) { cx = best.px; cy = best.py; scale = best.sc; }
  }
  const tr = rotate ? ` transform="rotate(-90 ${n(cx)} ${n(cy)})"` : '';

  const block = (lines, cls) => {
    const fs = (rotate ? fit(lines, h, w) : fit(lines, w, h)) * scale;
    const total = lines.length * fs * 1.18;
    let g = `<g class="lbl${cls ? ' ' + cls : ''}"${tr}>`;
    lines.forEach((t, i) => {
      const y = cy - total / 2 + fs * 0.95 + i * fs * 1.18;
      g += `<text x="${n(cx)}" y="${n(y)}" font-size="${n(fs)}" stroke-width="${n(fs * 0.3)}">${esc(t)}</text>`;
    });
    return g + '</g>';
  };

  if (!met) return block(setImp, '');
  return block(setImp, 'u-imp') + block(setMet, 'u-met');
}

// --- diff against baseline -------------------------------------------------
const COLLECTIONS = {
  walls: (w) => JSON.stringify([w.start, w.end, w.type, w.thickness ?? null]),
  openings: (o) => JSON.stringify([o.wall, o.offset, o.width, o.type, o.style ?? null,
    o.hinge ?? null, o.swingTo ?? null, o.slideTo ?? null, o.leaves ?? null]),
  furniture: (f) => JSON.stringify([f.room, f.kind, f.x, f.y, f.w, f.h, f.seats ?? null]),
  fixtures: (f) => JSON.stringify([f.room, f.kind, f.x ?? null, f.y ?? null, f.w ?? null, f.h ?? null,
    f.cx ?? null, f.cy ?? null, f.r ?? null, f.label ?? null]),
  zones: (z) => JSON.stringify([z.room, z.kind, z.boundary]),
};
function diff(base, plan) {
  const changed = new Set(), removed = { walls: [], openings: [], furniture: [], zones: [], fixtures: [] };
  if (!base || base === plan) return { changed, removed, any: false };
  for (const [kind, sg] of Object.entries(COLLECTIONS)) {
    // the baseline carries no furniture, so "differs from baseline" would light
    // up every piece and say nothing; only diff these once the baseline has them
    if ((kind === 'furniture' || kind === 'zones') && !(base[kind] ?? []).length) continue;
    const bm = new Map((base[kind] ?? []).map((x) => [x.id, x]));
    for (const x of plan[kind] ?? []) {
      const b = bm.get(x.id);
      if (!b || sg(b) !== sg(x)) changed.add(x.id);
      bm.delete(x.id);
    }
    for (const b of bm.values()) removed[kind].push(b);
  }
  // a wall whose openings changed is itself changed, and every opening on a
  // wall that moved is changed too — so the whole affected partition reads
  for (const o of removed.openings) changed.add(o.wall);
  for (const o of plan.openings ?? []) if (changed.has(o.id)) changed.add(o.wall);
  for (const o of plan.openings ?? []) if (changed.has(o.wall)) changed.add(o.id);
  const anyRemoved = Object.values(removed).some((a) => a.length > 0);
  return { changed, removed, any: changed.size > 0 || anyRemoved };
}

// --- one sheet -------------------------------------------------------------
function sheet(plan, base, catalog, sheetIdx, layers = [], labelFixtures = null) {
  const { changed, removed, any } = diff(base, plan);
  const d = (id) => (changed.has(id) ? ' is-diff' : '');

  const pts = [
    ...plan.walls.flatMap((w) => [w.start, w.end]),
    ...plan.rooms.flatMap((r) => r.boundary),
    ...(plan.envelope?.livingArea ?? []),
    ...(plan.envelope?.balcony ?? []),
  ];
  const x0 = Math.min(...pts.map((p) => p[0])) - MARGIN;
  const x1 = Math.max(...pts.map((p) => p[0])) + MARGIN;
  const y0 = Math.min(...pts.map((p) => p[1])) - MARGIN;
  const planBottom = Math.max(...pts.map((p) => p[1]));
  const y1 = planBottom + MARGIN + 34; // room for the scale bar

  let s = '';

  // balcony floor tint
  const bal = plan.rooms.find((r) => r.outdoor);
  if (bal) s += `<polygon class="outdoor" points="${bal.boundary.map((p) => `${n(p[0])},${n(p[1])}`).join(' ')}"/>`;

  // ghosts of anything the baseline had and this plan doesn't
  for (const w of removed.walls) s += wallBody(plan, w, [], 'wall ghost');

  for (const w of plan.walls) s += wallBody(plan, w, plan.openings, `wall${d(w.id)}`);
  for (const o of plan.openings) {
    const w = plan.walls.find((x) => x.id === o.wall);
    if (!w) continue;
    s += o.type === 'window'
      ? windowSym(plan, w, o, `win${d(o.id)}`)
      : doorSym(plan, w, o, `dr${d(o.id)}`);
  }
  (plan.zones ?? []).forEach((z, i) => { s += zoneSym(z, plan.furniture ?? [], d(z.id), `${sheetIdx}_${i}`); });
  for (const f of plan.fixtures ?? []) s += fixtureSym(f, d(f.id));
  // fixture-only toggles: both states drawn, the page shows one
  const baseFx = new Map((base.fixtures ?? []).map((f) => [f.id, COLLECTIONS.fixtures(f)]));
  for (const L of layers) {
    s += `<g class="tg-${L.id}-off">${L.off.map((f) => fixtureSym(f)).join('')}</g>`;
    s += `<g class="tg-${L.id}-on">`
      + (L.svc ?? []).map((v) => `<polyline class="svc" points="${v.points.map((q) => `${n(q[0])},${n(q[1])}`).join(' ')}"/>`).join('')
      + L.on.map((f) => fixtureSym(f, baseFx.get(f.id) === COLLECTIONS.fixtures(f) ? '' : ' is-diff')).join('') + `</g>`;
  }
  for (const f of plan.furniture ?? []) s += furnitureSym(f, catalog, d(f.id));
  for (const z of plan.zones ?? []) s += zoneLabel(z, plan.furniture ?? []);
  for (const r of plan.rooms) {
    r._fixtures = (labelFixtures ?? plan.fixtures ?? []).filter((f) => f.room === r.id);
    s += roomLabel(r, plan.furniture ?? []);
  }

  // sightlines from every seat to the centre of the play area, hidden by default
  const play = (plan.zones ?? []).find((z) => z.kind === 'play');
  if (play) {
    const pb = bbox(play.boundary);
    const c = [(pb.x0 + pb.x1) / 2, (pb.y0 + pb.y1) / 2];
    let g = '<g class="sightlines">';
    for (const f of (plan.furniture ?? []).filter((x) => (x.seats ?? 0) > 0)) {
      const b = boxOf(f);
      const from = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
      const inside = from[0] >= pb.x0 && from[0] <= pb.x1 && from[1] >= pb.y0 && from[1] <= pb.y1;
      const v = inside ? 'clear' : sightline(plan, from, c);
      g += `<line class="sl sl-${v}" x1="${n(from[0])}" y1="${n(from[1])}" x2="${n(c[0])}" y2="${n(c[1])}"/>`
        + `<circle class="sl-dot sl-${v}" cx="${n(from[0])}" cy="${n(from[1])}" r="2.6"/>`;
    }
    g += `<circle class="sl-hub" cx="${n(c[0])}" cy="${n(c[1])}" r="4.5"/></g>`;
    s += g;
  }

  // entry marker
  const entry = plan.openings.find((o) => o.isEntry);
  if (entry) {
    const w = plan.walls.find((x) => x.id === entry.wall);
    const { nrm } = unit(w);
    const c = at(w, entry.offset + entry.width / 2);
    const nd = DIRS[entry.swingTo] ? DIRS[entry.swingTo].map((v) => -v) : nrm;
    const tip = add(c, nd, 10), base2 = add(c, nd, 22);
    const side = [nd[1], -nd[0]];
    s += `<polygon class="entry" points="${n(tip[0])},${n(tip[1])} `
      + `${n(add(base2, side, 11)[0])},${n(add(base2, side, 11)[1])} `
      + `${n(add(base2, side, -11)[0])},${n(add(base2, side, -11)[1])}"/>`
      + `<text class="entrytxt" x="${n(add(base2, nd, 13)[0])}" y="${n(add(base2, nd, 13)[1])}" font-size="10">ENTRY</text>`;
  }

  // north arrow
  const nx = x1 - 22, ny = y0 + 22;
  s += `<g class="north"><circle cx="${n(nx)}" cy="${n(ny)}" r="13"/>`
    + `<polygon points="${n(nx)},${n(ny - 10)} ${n(nx - 5)},${n(ny + 7)} ${n(nx)},${n(ny + 2)} ${n(nx + 5)},${n(ny + 7)}"/>`
    + `<text x="${n(nx)}" y="${n(ny + 26)}" font-size="10">N</text></g>`;

  // scale bars, one per unit system
  const sbx = x0 + 10, sby = planBottom + 24;
  const bar = (cells, step, label, tick, cls) => {
    let g = `<g class="scale ${cls}">`;
    for (let i = 0; i < cells; i++)
      g += `<rect x="${n(sbx + i * step)}" y="${n(sby)}" width="${n(step)}" height="7" class="${i % 2 ? 'dark' : 'light'}"/>`;
    for (let i = 0; i <= cells; i++)
      g += `<text x="${n(sbx + i * step)}" y="${n(sby + 20)}" font-size="8.5">${tick(i)}</text>`;
    return g + `<text x="${n(sbx + cells * step + 19)}" y="${n(sby + 20)}" font-size="8.5" text-anchor="start">${label}</text></g>`;
  };
  s += bar(5, 24, 'feet', (i) => i * 2, 'u-imp');          // 5 x 2 ft = 10 ft
  s += bar(3, 39.3701, 'm', (i) => i, 'u-met');            // 3 x 1 m

  const svg = `<svg viewBox="${n(x0)} ${n(y0)} ${n(x1 - x0)} ${n(y1 - y0)}" `
    + `xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">${s}</svg>`;

  return { svg, any, removedCount: removed.walls.length + removed.openings.length, changedCount: changed.size };
}

// --- build -----------------------------------------------------------------
const files = readdirSync(PLANS).filter((f) => f.endsWith('.json'))
  .filter((f) => !isLibrary(join(PLANS, f)))
  .sort((a, b) => (a === 'baseline.json' ? -1 : b === 'baseline.json' ? 1 : a.localeCompare(b)));

// also read archived plans
const ARCHIVED = join(PLANS, 'archived');
const archivedFiles = existsSync(ARCHIVED)
  ? readdirSync(ARCHIVED).filter((f) => f.endsWith('.json'))
      .filter((f) => !isLibrary(join(ARCHIVED, f)))
      .sort((a, b) => a.localeCompare(b))
  : [];

if (!files.length && !archivedFiles.length) { console.error('no plans/*.json found'); process.exit(1); }

const plans = files.map((f) => ({ file: f, id: f.replace(/\.json$/, ''), archived: false, data: resolvePlan(JSON.parse(readFileSync(join(PLANS, f), 'utf8')), DIMS) }));
const archivedPlans = archivedFiles.map((f) => ({ file: f, id: 'archived/' + f.replace(/\.json$/, ''), archived: true, data: resolvePlan(JSON.parse(readFileSync(join(ARCHIVED, f), 'utf8')), DIMS) }));
// baseline first, then plans with toggles (the live decisions), then the rest
const rank = (p) => (p.id === 'baseline' ? 0 : p.data.toggles ? 1 : 2);
plans.sort((a, b) => rank(a) - rank(b));
const allPlans = [...plans, ...archivedPlans];
const base = allPlans.find((p) => p.id === 'baseline')?.data ?? allPlans[0].data;
const meta = base.meta ?? {};

const catalogFile = allPlans.map((p) => p.data.furnitureCatalog).find(Boolean);
const catalog = catalogFile && existsSync(join(PLANS, catalogFile))
  ? JSON.parse(readFileSync(join(PLANS, catalogFile), 'utf8')).kinds : null;
// a plan with toggles becomes one sheet per combination, all under one tab
const layerSpecs = (p, data) => (p.data.toggles ?? []).filter(isLayer).map((t) => ({
  id: t.id,
  off: (data.fixtures ?? []).filter((f) => (t.remove?.fixtures ?? []).includes(f.id)),
  on: t.add?.fixtures ?? [],
  svc: t.add?.services ?? [],
}));
const expanded = allPlans.flatMap((p) => {
  if (!p.data.toggles) return [{ ...p, group: p.id, name: p.data.name }];
  return combinations(p.data, { structuralOnly: true }).map((c) => {
    const layers = layerSpecs(p, c.data);
    const swapped = new Set(layers.flatMap((L) => L.off.map((f) => f.id)));
    const data = { ...c.data, fixtures: (c.data.fixtures ?? []).filter((f) => !swapped.has(f.id)) };
    // room labels dodge every state of every layer, so they never jump
    const labelFixtures = (c.data.fixtures ?? []).concat(layers.flatMap((L) => L.on));
    return { ...p, group: p.id, id: `${p.id}~${c.key}`, name: p.data.name, data, layers, labelFixtures };
  });
});
const sheets = expanded.map((p, i) => ({ ...p, ...sheet(p.data, base, catalog, i, p.layers, p.labelFixtures) }));
const layerIds = [...new Set(allPlans.flatMap((p) => (p.data.toggles ?? []).filter(isLayer).map((t) => t.id)))];
const toggled = Object.fromEntries(allPlans.filter((p) => p.data.toggles).map((p) => [p.id, {
  order: p.data.toggles.filter((t) => !isLayer(t)).map((t) => t.id),
  layers: p.data.toggles.filter(isLayer).map((t) => t.id),
  on: Object.fromEntries(p.data.toggles.map((t) => [t.id, t.default !== false])),
}]));

const style = `
*{box-sizing:border-box}
body{margin:0;background:#f4f4f2;color:#111;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
h1{font-size:16px;margin:0 0 2px;letter-spacing:.005em;line-height:1.3}
.sub{font-size:12px;color:#555}
::selection{background:#111;color:#fff}
:focus-visible{outline:2px solid #1668cc;outline-offset:2px}
button{font:inherit;color:inherit}
.tnum{font-variant-numeric:tabular-nums}

/* shell: sidebar + stage; the drawing always fits the window */
.app{display:grid;grid-template-columns:300px minmax(0,1fr);height:100vh;height:100dvh}
aside{display:flex;flex-direction:column;gap:18px;padding:18px 18px 14px;overflow-y:auto;border-right:1px solid #e0e0dc;scrollbar-width:thin}
.stage{min-width:0;min-height:0;padding:14px;display:flex}
.sheet{display:none;flex:1;min-width:0;min-height:0;background:#fff;border:1px solid #e0e0dc;border-radius:10px;padding:10px}
.sheet.on{display:flex}
svg{display:block;width:100%;height:100%}
.label{font-size:11px;font-weight:600;color:#666;margin:0 0 6px;letter-spacing:.02em}

/* plan list */
.tabs{display:flex;flex-direction:column;gap:1px}
.tab{text-align:left;font-size:13.5px;padding:7px 10px;border:0;background:none;border-radius:7px;cursor:pointer;color:#444;transition:background .12s,color .12s}
.tab:hover{background:#eaeae6;color:#111}
.tab[aria-selected=true]{background:#fff;color:#111;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08),0 0 0 1px #e0e0dc}

.archive{margin-top:6px}
.archive summary{list-style:none;display:flex;align-items:center;gap:6px;font-size:12.5px;color:#666;cursor:pointer;padding:6px 10px;border-radius:7px;user-select:none}
.archive summary::-webkit-details-marker{display:none}
.archive summary:hover{background:#eaeae6;color:#111}
.archive.active summary{color:#111;font-weight:600}
.archive .count{font-size:11px;min-width:18px;padding:0 5px;border-radius:9px;background:#dcdcd7;color:#444;text-align:center;font-weight:500}
.archive svg{width:12px;height:12px;margin-left:auto;transition:transform .15s}
.archive[open] summary svg{transform:rotate(180deg)}
.menu{padding:2px 0 0 8px}
.menu button{display:block;width:100%;text-align:left;border:0;background:none;padding:6px 10px;border-radius:7px;cursor:pointer}
.menu button:hover{background:#eaeae6}
.menu button[aria-current=true]{background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.08),0 0 0 1px #e0e0dc}
.menu b{display:block;font-size:13px;font-weight:600}
.menu small{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:11.5px;color:#666;margin-top:1px;line-height:1.4}

/* this plan */
.ctx{display:flex;flex-direction:column;gap:12px}
.ctx[hidden]{display:none}
.desc{margin:0;font-size:12.5px;color:#444;line-height:1.5}
.badge{display:inline-block;font-size:11px;font-weight:600;color:#7a5a00;background:#fbf0cc;border-radius:4px;padding:1px 6px;margin-right:6px;vertical-align:1px}
.controls{display:flex;flex-direction:column;gap:12px}
.controls{gap:2px}
.opt{position:relative;display:flex;align-items:center;gap:6px;border-radius:7px}
.opt:hover{background:#eaeae6}
.opt label{flex:1;display:flex;align-items:center;gap:9px;padding:5px 6px;font-size:13px;cursor:pointer;user-select:none}
.opt input{width:15px;height:15px;margin:0;accent-color:#111;cursor:pointer}
.info{flex:none;display:grid;place-items:center;width:22px;height:22px;margin-right:4px;border:0;border-radius:50%;background:none;color:#777;cursor:pointer}
.info:hover,.info[aria-expanded=true]{background:#dcdcd7;color:#111}
.info svg{width:15px;height:15px}
.tip{display:none;position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:5;background:#1b1b1b;color:#f2f2f2;
  font-size:12px;line-height:1.5;padding:9px 11px;border-radius:7px;box-shadow:0 6px 18px rgba(0,0,0,.18),0 1px 3px rgba(0,0,0,.12)}
.tip.open,.info:hover+.tip,.info:focus-visible+.tip{display:block}
.key{display:none;flex-direction:column;gap:4px;font-size:11.5px;color:#555;padding-left:30px}
body.sight .key{display:flex}
.key i{display:inline-block;width:18px;height:0;border-top:2px solid;vertical-align:middle;margin-right:6px}

/* units + legend */
.units{align-self:flex-start;display:flex;padding:2px;border-radius:7px;background:#e7e7e3}
.units button{font-size:12px;padding:4px 12px;border:0;background:transparent;border-radius:5px;cursor:pointer;color:#666}
.units button[aria-pressed=true]{background:#fff;color:#111;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.12)}
.legend{display:flex;flex-direction:column;gap:5px;font-size:11.5px;color:#555}
.legend i{display:inline-block;width:18px;height:0;border-top:3px solid;vertical-align:middle;margin-right:7px}
.legend .d{display:none}
.legend.on .d{display:inline}
footer{margin-top:auto;font-size:10.5px;color:#6b6b6b;line-height:1.45;overflow-wrap:anywhere}
footer code{font-size:10px}

/* narrow screens: stack, plan fits the width */
@media (max-width:860px){
  .app{display:block;height:auto}
  aside{border-right:0;padding:14px 16px 4px;gap:14px;overflow:visible}
  .tabs{flex-direction:row;overflow-x:auto;scrollbar-width:none;gap:4px;padding-right:24px;
    -webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent)}
  .tabs::-webkit-scrollbar{display:none}
  .tab{flex:none;white-space:nowrap}
  .stage{padding:4px 10px 10px}
  .sheet{padding:4px}
  svg{height:auto}
  .legend{flex-direction:row;flex-wrap:wrap;gap:4px 14px}
  footer{display:none}
}

.wall{fill:${C.wall};stroke:${C.wallEdge};stroke-width:1.6;stroke-linejoin:miter}
.wall.ghost{fill:none;stroke:${C.gone};stroke-width:2;stroke-dasharray:7 5}
.gap{fill:#fff;stroke:none}
.winbg{fill:#fff;stroke:none}
.win{fill:none;stroke:${C.window};stroke-width:1.6}
.dr{fill:none;stroke:${C.door};stroke-width:2.1;stroke-linecap:round}
.dr.arc{stroke-width:1.5}
.dr.panel{fill:#fff;stroke-width:1.5}
.fx{fill:#fff;stroke:${C.fixture};stroke-width:1.3}
.fx-shelf,.fx-hanging{fill:#fafafa;stroke:#999;stroke-width:1}
.fxrod{stroke:#888;stroke-width:1;stroke-dasharray:3 2}
.fx.fx-upper-cabinet{fill:none;stroke:#888;stroke-width:1;stroke-dasharray:3 2}
.fx.fx-shelf-above{fill:none;stroke:#888;stroke-width:1;stroke-dasharray:3 2}
.fx-chase{fill:#d8d8d8;stroke:#777;stroke-width:1}
.fx-counter{fill:#fafafa}
.hatch{stroke:#555;stroke-width:1}
.fn{fill:${C.furnFill};stroke:${C.furn};stroke-width:1.7}
.fnlbl{text-anchor:middle;paint-order:stroke;stroke:${C.furnFill};stroke-linejoin:round;fill:#5a4f3d;font-family:Helvetica,Arial,sans-serif;letter-spacing:.02em}
.zone{fill:#e3eefb;stroke:${C.zone};stroke-width:1.6;stroke-dasharray:6 4}
.zhatch{stroke:${C.zone};stroke-width:0.9;opacity:.33}
.zlbl{text-anchor:middle;paint-order:stroke;stroke:#fff;stroke-linejoin:round;fill:#14538f;font-family:Helvetica,Arial,sans-serif;letter-spacing:.04em}
.sightlines{display:none}
body.sight .sightlines{display:inline}
.sl{stroke-width:1.6}
.sl-clear{stroke:#0f9d58}
.sl-glass{stroke:#1668cc;stroke-dasharray:7 4}
.sl-blocked{stroke:#d93025;stroke-dasharray:3 5;opacity:.75}
.sl-dot{stroke:none}
.sl-clear.sl-dot{fill:#0f9d58}.sl-glass.sl-dot{fill:#1668cc}.sl-blocked.sl-dot{fill:#d93025}
.sl-hub{fill:#fff;stroke:#111;stroke-width:1.8}
.fxthin{stroke:#333;stroke-width:1;fill:none}
.fxlbl{text-anchor:middle;fill:#333;font-family:Helvetica,Arial,sans-serif;paint-order:stroke;stroke:#fff;stroke-width:2.4;stroke-linejoin:round}
.outdoor{fill:#f2f1ec;stroke:none}
.lbl text{text-anchor:middle;fill:${C.text};font-family:Helvetica,Arial,sans-serif;letter-spacing:.02em;paint-order:stroke;stroke:#fff;stroke-linejoin:round}
.entry{fill:#d92b2b}
.entrytxt{text-anchor:middle;fill:#111;font-family:Helvetica,Arial,sans-serif}
.north circle{fill:none;stroke:#555;stroke-width:1.3}
.north polygon{fill:#333}
.north text{text-anchor:middle;fill:#333;font-family:Helvetica,Arial,sans-serif}
.scale rect{stroke:#333;stroke-width:1}
.scale .light{fill:#fff}.scale .dark{fill:#333}
.scale text{text-anchor:middle;fill:#333;font-family:Helvetica,Arial,sans-serif}

.is-diff.wall{fill:#fbd7e4;stroke:${C.diff};stroke-width:2.4}
.is-diff.win{stroke:${C.diff}}
.is-diff.dr{stroke:${C.diff}}
.is-diff.dr.panel{fill:#fff;stroke:${C.diff}}
.svc{fill:none;stroke:${C.diff};stroke-width:1.3;stroke-dasharray:4 3;stroke-linecap:round;stroke-linejoin:round}
.is-diff.fx{stroke:${C.diff};stroke-width:1.8}
.is-diff.fn{stroke:${C.diff};stroke-width:2.4}
.is-diff.zone{stroke:${C.diff}}

.u-met{display:none}
body.metric .u-imp{display:none}
body.metric .u-met{display:inline}
${layerIds.map((k) => `.tg-${k}-on{display:none}body.tg-${k} .tg-${k}-on{display:inline}body.tg-${k} .tg-${k}-off{display:none}`).join('\n')}
@page{size:letter portrait;margin:11mm}
@media print{
  body{background:#fff}
  .app{display:block;height:auto}
  aside{border:0;padding:0 0 6px;gap:6px}
  nav,.units,.controls,.key,.legend,.label{display:none !important}
  .stage{padding:0}
  .sheet{display:none !important;border:0;padding:0}
  .sheet.on{display:block !important}
  svg{height:auto;max-height:225mm}
  footer{margin-top:0}
}}`;

const activeSheets = allPlans.filter((p) => !p.archived);
const archivedSheets = allPlans.filter((p) => p.archived);
const planName = (p) => p.data.name ?? p.id.replace('archived/', '');

const tabs = `<nav class="plans" aria-label="Plans"><p class="label">Plans</p><div class="tabs" role="tablist" aria-orientation="vertical">`
  + activeSheets.map((p) => `<button type="button" class="tab" role="tab" data-plan="${esc(p.id)}" aria-selected="false">${esc(planName(p))}</button>`).join('')
  + `</div>`
  + (archivedSheets.length
    ? `<details class="archive"><summary>Archive <span class="count">${archivedSheets.length}</span>`
      + `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></summary>`
      + `<div class="menu">`
      + archivedSheets.map((p) => `<button type="button" data-plan="${esc(p.id)}" aria-current="false"><b>${esc(planName(p))}</b>`
        + (p.data.meta?.optionNote ? `<small>${esc(p.data.meta.optionNote)}</small>` : '') + `</button>`).join('')
      + `</div></details>`
    : '')
  + `</nav>`;

const infoIcon = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.3"/>`
  + `<circle cx="8" cy="5" r=".9" fill="currentColor"/><path d="M8 7.3v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
let tipN = 0;
const opt = (attrs, label, note, on) => {
  const id = `tip${tipN++}`;
  return `<div class="opt"><label><input type="checkbox" ${attrs}${on ? ' checked' : ''}><span>${esc(label)}</span></label>`
    + (note ? `<button type="button" class="info" aria-label="About ${esc(label)}" aria-expanded="false" aria-controls="${id}">${infoIcon}</button>`
      + `<div class="tip" id="${id}" role="tooltip">${esc(note)}</div>` : '')
    + `</div>`;
};

const hasPlay = (p) => (p.data.zones ?? []).some((z) => z.kind === 'play');
const descOf = (p) => p.data.meta?.optionNote
  ?? (p.data.toggles ? 'Tick a change to show it on the plan. Changes are drawn in magenta.'
    : p.id === 'baseline' ? 'The plan as surveyed. Every other plan is compared against this one.' : '');

const contexts = allPlans.map((p) => `<div class="ctx" data-group="${esc(p.id)}" hidden>`
  + `<p class="desc">${p.archived ? '<span class="badge">Archived</span>' : ''}${esc(descOf(p))}</p>`
  + (p.data.toggles ? `<div class="controls" role="group" aria-label="Changes">`
    + p.data.toggles.map((t) => opt(`data-toggle="${esc(t.id)}"`, t.label, t.note, t.default !== false)).join('') + `</div>` : '')
  + (hasPlay(p) ? `<div class="controls">${opt('data-sight', 'Sightlines', 'A line from every seat to the centre of the play area.', false)}</div>`
    + `<div class="key"><span><i style="border-color:#0f9d58"></i>clear view</span>`
    + `<span><i style="border-color:#1668cc;border-top-style:dashed"></i>through glass only</span>`
    + `<span><i style="border-color:#d93025;border-top-style:dotted"></i>blocked by a wall</span></div>` : '')
  + `</div>`).join('');

const units = `<div class="units" role="group" aria-label="Units">`
  + `<button type="button" data-unit="imperial" aria-pressed="true">ft / in</button>`
  + `<button type="button" data-unit="metric" aria-pressed="false">metric</button></div>`;

const dual = (impTxt, metTxt) => `<span class="u-imp">${impTxt}</span><span class="u-met">${metTxt}</span>`;
const bits = [];
if (meta.printedArea?.livingSqFt)
  bits.push(dual(`${meta.printedArea.livingSqFt} sq ft`, `${m2(meta.printedArea.livingSqFt * 144).toFixed(1)} m&sup2;`));
if (meta.printedArea?.balconySqFt)
  bits.push(`balcony ` + dual(`${meta.printedArea.balconySqFt} sq ft`, `${m2(meta.printedArea.balconySqFt * 144).toFixed(1)} m&sup2;`));
if (meta.ceilingHeight)
  bits.push(`ceiling ` + dual(esc(ft(meta.ceilingHeight)), `${M(meta.ceilingHeight).toFixed(2)} m`));

const legend = `<div class="legend" id="legend">`
  + `<span class="d"><i style="border-color:${C.diff}"></i>changed from baseline</span>`
  + `<span class="d"><i style="border-color:${C.gone};border-top-style:dashed"></i>removed</span>`
  + `<span><i style="border-color:${C.door}"></i>doors</span>`
  + `<span><i style="border-color:${C.window}"></i>windows</span>`
  + (allPlans.some((p) => (p.data.furniture ?? []).length) ? `<span><i style="border-color:${C.furn}"></i>furniture</span>` : '')
  + (JSON.stringify(allPlans.map((p) => [p.data.fixtures, p.data.toggles])).match(/"kind":"(hanging|shelf-above|upper-cabinet)"/)
    ? `<span><i style="border-color:#888;border-top-style:dashed;border-top-width:2px"></i>overhead: upper cabinets, shelves, rods</span>` : '')
  + `</div>`;

const diffCounts = Object.fromEntries(sheets.map((s) => [s.id, { any: s.any, c: s.changedCount, r: s.removedCount }]));

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(meta.title ?? 'Floor plan')} — ${esc(meta.floor ?? '')}</title>
<style>${style}</style></head><body>
<div class="app">
<aside>
  <div>
    <h1>${esc(meta.title ?? 'Floor plan')}</h1>
    <div class="sub tnum">${[esc(meta.floor ?? '')].concat(bits).filter(Boolean).join(' &middot; ')}</div>
  </div>
  ${tabs}
  ${contexts}
  ${units}
  ${legend}
  <footer>Drawn to scale from <code>plans/${esc(files.join(', plans/'))}</code>${archivedFiles.length ? ` and <code>plans/archived/${esc(archivedFiles.join(', plans/archived/'))}</code>` : ''}. Dimensions are those printed on the original survey; not a legal survey.</footer>
</aside>
<main class="stage">
${sheets.map((s) => `<section class="sheet" data-plan="${esc(s.id)}" aria-label="${esc(s.name ?? s.id)}">${s.svg}</section>`).join('\n')}
</main>
</div>
<script>
var DIFF=${JSON.stringify(diffCounts)};
var TOG=${JSON.stringify(toggled)};
var PLANS=${JSON.stringify(allPlans.map((p) => p.id))};
var layerIds=${JSON.stringify(layerIds)};
var cur;
function $$(q){return Array.prototype.slice.call(document.querySelectorAll(q))}
function sheetOf(g){
  var t=TOG[g]; if(!t)return g;
  return g+'~'+t.order.filter(function(k){return t.on[k]}).join('+');
}
var arch=document.querySelector('.archive');
function show(g){
  cur=g; var id=sheetOf(g);
  $$('.sheet').forEach(function(s){s.classList.toggle('on',s.dataset.plan===id)});
  $$('.tab').forEach(function(b){var on=b.dataset.plan===g;b.setAttribute('aria-selected',String(on));
    if(on){var t=b.parentNode;t.scrollLeft=Math.max(0,b.offsetLeft-t.offsetLeft-t.clientWidth/2+b.offsetWidth/2)}});
  $$('.menu button').forEach(function(b){b.setAttribute('aria-current',String(b.dataset.plan===g))});
  $$('.ctx').forEach(function(c){c.hidden=c.dataset.group!==g});
  if(arch){var a=g.indexOf('archived/')===0;arch.classList.toggle('active',a);if(a)arch.open=true}
  var t=TOG[g], lay=false;
  layerIds.forEach(function(k){var on=!!(t&&t.layers.indexOf(k)>=0&&t.on[k]);document.body.classList.toggle('tg-'+k,on);lay=lay||on});
  document.getElementById('legend').classList.toggle('on',!!(DIFF[id]||{}).any||lay);
  try{localStorage.setItem('fp-plan',g)}catch(e){}
}
$$('.tab,.menu button').forEach(function(b){b.addEventListener('click',function(){show(b.dataset.plan)})});
$$('[data-toggle]').forEach(function(b){b.addEventListener('change',function(){
  TOG[b.closest('.ctx').dataset.group].on[b.dataset.toggle]=b.checked; show(cur);
})});
$$('[data-sight]').forEach(function(b){b.addEventListener('change',function(){
  document.body.classList.toggle('sight',b.checked);
  $$('[data-sight]').forEach(function(x){x.checked=b.checked});
})});
function closeTips(except){$$('.info').forEach(function(i){if(i!==except){i.setAttribute('aria-expanded','false');i.nextElementSibling.classList.remove('open')}})}
$$('.info').forEach(function(i){i.addEventListener('click',function(e){
  e.stopPropagation(); closeTips(i);
  var open=i.getAttribute('aria-expanded')!=='true';
  i.setAttribute('aria-expanded',String(open)); i.nextElementSibling.classList.toggle('open',open);
})});
document.addEventListener('click',function(){closeTips()});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeTips()});
function setUnit(u){
  document.body.classList.toggle('metric',u==='metric');
  $$('.units button').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.unit===u))});
  try{localStorage.setItem('fp-unit',u)}catch(e){}
}
$$('.units button').forEach(function(b){b.addEventListener('click',function(){setUnit(b.dataset.unit)})});
var start=PLANS[0];
try{setUnit(localStorage.getItem('fp-unit')==='metric'?'metric':'imperial');var sp=localStorage.getItem('fp-plan');if(PLANS.indexOf(sp)>=0)start=sp}catch(e){}
show(start);
</script>
</body></html>`;

mkdirSync(DIST, { recursive: true });
writeFileSync(join(DIST, 'index.html'), html);
console.log(`dist/index.html  (${(html.length / 1024).toFixed(0)} KB, ${sheets.length} plan${sheets.length > 1 ? 's' : ''}: ${sheets.map((s) => s.id).join(', ')})`);
