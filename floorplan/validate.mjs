#!/usr/bin/env node
// Validates floor plan JSON. Zero dependencies.
//   node floorplan/validate.mjs              -> every plans/*.json
//   node floorplan/validate.mjs some.json    -> just that file
// Exits 1 if anything fails.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  polyArea as pArea, bbox, boxOf, overlapArea, overlaps, wallBoxes,
  swings, swingBox, boxAreaInSwing, boxAreaInPoly, pointAt, unitVec, sightline,
  zoneClearArea,
} from './geom.mjs';
import { combinations } from './toggles.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLANS = join(HERE, 'plans');

// Tolerances. Room dimensions printed on a real-estate plan are rounded to the
// inch and taken off different faces, so 1.5" is as tight as the source allows.
const DIM_TOL = 1.5;      // inches
const AREA_TOL = 0.03;    // fraction of the printed area
const JOIN_TOL = 0.26;    // inches; wall ends must coincide this closely
const WALK = 36;          // inches of clear approach in front of a doorway
const PULL_OUT = 30;      // inches behind a dining chair
const MIN_SEATS = 8;
const MIN_PLAY_SQFT = 25;


// plans/ also holds library files (the furniture catalog). A file with no
// "walls" array is a library, not a plan.
const isLibrary = (f) => {
  try { const j = JSON.parse(readFileSync(f, 'utf8')); return j.catalog === true || !Array.isArray(j.walls); }
  catch { return false; }
};

const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const pointInBox = (p, b) => p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1;
const polyArea = (p) => {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
};

function segsCross(p1, p2, p3, p4) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function pointOnSeg(p, a, b, tol) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  if (L2 === 0) return len(p, a) <= tol;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
  if (t < -1e-9 || t > 1 + 1e-9) return false;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)) <= tol;
}

function validate(plan, label) {
  const fail = [], warn = [];
  const F = (m) => fail.push(m);
  const W = (m) => warn.push(m);

  for (const k of ['units', 'walls', 'openings', 'rooms']) {
    if (!plan[k]) F(`missing top-level "${k}"`);
  }
  if (fail.length) return { fail, warn };
  if (plan.units !== 'in') F(`units is "${plan.units}", expected "in"`);

  const dupes = (arr, what) => {
    const seen = new Set();
    for (const o of arr) {
      if (!o.id) F(`${what} with no id`);
      else if (seen.has(o.id)) F(`duplicate ${what} id "${o.id}"`);
      else seen.add(o.id);
    }
  };
  dupes(plan.walls, 'wall');
  dupes(plan.openings, 'opening');
  dupes(plan.rooms, 'room');
  dupes(plan.fixtures ?? [], 'fixture');

  const thick = (w) => (plan.wallTypes?.[w.type]?.thickness ?? w.thickness);

  // --- walls -------------------------------------------------------------
  for (const w of plan.walls) {
    if (!w.start || !w.end) { F(`wall "${w.id}" missing start/end`); continue; }
    const L = len(w.start, w.end);
    if (L < 1e-6) F(`wall "${w.id}" has zero length`);
    if (Math.abs(w.start[0] - w.end[0]) > 1e-9 && Math.abs(w.start[1] - w.end[1]) > 1e-9)
      F(`wall "${w.id}" is not axis-aligned`);
    if (!(thick(w) > 0)) F(`wall "${w.id}" has no resolvable thickness (type "${w.type}")`);
  }

  // every wall end must meet another wall, or be declared a free end
  for (const w of plan.walls) {
    for (const which of ['start', 'end']) {
      if (w[which === 'start' ? 'freeEndStart' : 'freeEndEnd']) continue;
      const p = w[which];
      if (!p) continue;
      const met = plan.walls.some((o) =>
        o.id !== w.id &&
        (len(p, o.start) <= JOIN_TOL || len(p, o.end) <= JOIN_TOL || pointOnSeg(p, o.start, o.end, JOIN_TOL)));
      if (!met) F(`wall "${w.id}" ${which} (${p}) does not meet any other wall `
        + `(declare "freeEnd${which === 'start' ? 'Start' : 'End'}": true if intentional)`);
    }
  }

  // --- openings ----------------------------------------------------------
  const byWall = new Map();
  for (const o of plan.openings) {
    const w = plan.walls.find((x) => x.id === o.wall);
    if (!w) { F(`opening "${o.id}" references unknown wall "${o.wall}"`); continue; }
    const L = len(w.start, w.end);
    if (!(o.width > 0)) F(`opening "${o.id}" has width ${o.width}`);
    if (o.offset < -1e-9)
      F(`opening "${o.id}" starts ${(-o.offset).toFixed(2)}" before the start of wall "${w.id}"`);
    if (o.offset + o.width > L + 1e-9)
      F(`opening "${o.id}" runs ${(o.offset + o.width - L).toFixed(2)}" past the end of wall "${w.id}" `
        + `(offset ${o.offset} + width ${o.width} > length ${L.toFixed(2)})`);
    if (!byWall.has(o.wall)) byWall.set(o.wall, []);
    byWall.get(o.wall).push(o);
  }
  for (const [wid, list] of byWall) {
    const s = [...list].sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < s.length; i++) {
      if (s[i].offset < s[i - 1].offset + s[i - 1].width - 1e-9)
        F(`openings "${s[i - 1].id}" and "${s[i].id}" overlap on wall "${wid}"`);
    }
  }

  // --- rooms -------------------------------------------------------------
  for (const r of plan.rooms) {
    const b = r.boundary;
    if (!Array.isArray(b) || b.length < 4) { F(`room "${r.id}" needs at least 4 boundary points`); continue; }
    if (len(b[0], b[b.length - 1]) < 1e-9)
      F(`room "${r.id}" repeats its first point at the end; the boundary is implicitly closed`);
    let open = false;
    for (let i = 0; i < b.length; i++) {
      const p = b[i], q = b[(i + 1) % b.length];
      if (len(p, q) < 1e-9) { F(`room "${r.id}" has a zero-length edge at vertex ${i}`); open = true; }
      else if (Math.abs(p[0] - q[0]) > 1e-9 && Math.abs(p[1] - q[1]) > 1e-9) {
        F(`room "${r.id}" edge ${i}->${i + 1} is not axis-aligned (${p} -> ${q}); the boundary does not close orthogonally`);
        open = true;
      }
    }
    if (!open) {
      if (polyArea(b) < 1e-6) F(`room "${r.id}" boundary encloses no area`);
      for (let i = 0; i < b.length; i++) for (let j = i + 2; j < b.length; j++) {
        if (i === 0 && j === b.length - 1) continue;
        if (segsCross(b[i], b[(i + 1) % b.length], b[j], b[(j + 1) % b.length]))
          F(`room "${r.id}" boundary self-intersects (edges ${i} and ${j})`);
      }
    }

    if (r.labelled) {
      const xs = b.map((p) => p[0]), ys = b.map((p) => p[1]);
      let w = Math.max(...xs) - Math.min(...xs);
      let h = Math.max(...ys) - Math.min(...ys);
      if (r.labelledSpan?.x) w = r.labelledSpan.x[1] - r.labelledSpan.x[0];
      if (r.labelledSpan?.y) h = r.labelledSpan.y[1] - r.labelledSpan.y[0];
      const { a, b: bb, text } = r.labelled;
      const d1 = Math.abs(a - w) + Math.abs(bb - h);
      const d2 = Math.abs(a - h) + Math.abs(bb - w);
      const [la, lb, ca, cb] = d1 <= d2 ? [a, bb, w, h] : [a, bb, h, w];
      if (Math.abs(la - ca) > DIM_TOL || Math.abs(lb - cb) > DIM_TOL)
        F(`room "${r.id}" is labelled ${text} (${a}" x ${bb}") but computes to ${ca}" x ${cb}" `
          + `(off by ${Math.abs(la - ca).toFixed(1)}" x ${Math.abs(lb - cb).toFixed(1)}", tolerance ${DIM_TOL}")`);
    }
  }

  // --- fixtures ----------------------------------------------------------
  for (const f of plan.fixtures ?? []) {
    const r = plan.rooms.find((x) => x.id === f.room);
    if (!r) { F(`fixture "${f.id}" references unknown room "${f.room}"`); continue; }
    const xs = r.boundary.map((p) => p[0]), ys = r.boundary.map((p) => p[1]);
    const [rx0, rx1, ry0, ry1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const [fx0, fx1, fy0, fy1] = f.shape === 'circle'
      ? [f.cx - f.r, f.cx + f.r, f.cy - f.r, f.cy + f.r]
      : [f.x, f.x + f.w, f.y, f.y + f.h];
    if (fx0 < rx0 - DIM_TOL || fx1 > rx1 + DIM_TOL || fy0 < ry0 - DIM_TOL || fy1 > ry1 + DIM_TOL)
      F(`fixture "${f.id}" (${fx0},${fy0})-(${fx1},${fy1}) falls outside room "${f.room}" `
        + `(${rx0},${ry0})-(${rx1},${ry1})`);
  }

  // --- furniture ---------------------------------------------------------
  const cat = plan.furnitureCatalog
    ? (() => { const f = join(PLANS, plan.furnitureCatalog);
        return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).kinds : null; })()
    : null;
  if (plan.furniture?.length && !cat)
    F(`plan has furniture but furnitureCatalog "${plan.furnitureCatalog ?? '(unset)'}" could not be read`);

  const furn = plan.furniture ?? [];
  const roomOf = (id) => plan.rooms.find((r) => r.id === id);

  for (const f of furn) {
    const spec = cat?.[f.kind];
    if (!spec) { F(`furniture "${f.id}" uses kind "${f.kind}", which is not in the catalog`); continue; }
    // never shrink below catalog size; w/h may be swapped but not reduced
    const got = [f.w, f.h].sort((a, b) => a - b), want = [spec.w, spec.d].sort((a, b) => a - b);
    if (Math.abs(got[0] - want[0]) > 0.01 || Math.abs(got[1] - want[1]) > 0.01)
      F(`furniture "${f.id}" is ${f.w}x${f.h} but the catalog says ${f.kind} is ${spec.w}x${spec.d} `
        + `(swap w/h if you need it turned, never resize)`);
    const seats = spec.seats ?? 0;
    if ((f.seats ?? 0) !== seats)
      F(`furniture "${f.id}" declares seats ${f.seats ?? 0}; the catalog says ${f.kind} seats ${seats}`);

    const r = roomOf(f.room);
    if (!r) { F(`furniture "${f.id}" references unknown room "${f.room}"`); continue; }
    const b = boxOf(f), rb = bbox(r.boundary);
    if (b.x0 < rb.x0 - 0.01 || b.x1 > rb.x1 + 0.01 || b.y0 < rb.y0 - 0.01 || b.y1 > rb.y1 + 0.01)
      F(`furniture "${f.id}" (${b.x0},${b.y0})-(${b.x1},${b.y1}) sticks out of room "${f.room}"`);
    else if (r.boundary.length > 4) {
      const inside = boxAreaInPoly(b, r.boundary, 1);
      const full = (b.x1 - b.x0) * (b.y1 - b.y0);
      if (inside < full - 1)
        F(`furniture "${f.id}" overhangs the non-rectangular part of room "${f.room}" `
          + `by ${(full - inside).toFixed(0)} sq in`);
    }

    // walls
    for (const w of plan.walls) for (const wb of wallBoxes(plan, w)) {
      const a = overlapArea(b, wb);
      if (a > 0.5) F(`furniture "${f.id}" overlaps wall "${w.id}" by ${a.toFixed(0)} sq in`);
    }
    // fixtures
    for (const fx of plan.fixtures ?? []) {
      const a = overlapArea(b, boxOf(fx));
      if (a > 0.5) F(`furniture "${f.id}" overlaps fixture "${fx.id}" by ${a.toFixed(0)} sq in`);
    }
    // hinged door swings
    for (const o of plan.openings) for (const sw of swings(plan, o)) {
      const a = boxAreaInSwing(b, sw, 1);
      if (a > 0.5) F(`furniture "${f.id}" sits in the swing of door "${o.id}" (${a.toFixed(0)} sq in)`);
    }
  }
  // furniture against furniture
  for (let i = 0; i < furn.length; i++) for (let j = i + 1; j < furn.length; j++) {
    const a = overlapArea(boxOf(furn[i]), boxOf(furn[j]));
    if (a > 0.5) F(`furniture "${furn[i].id}" and "${furn[j].id}" overlap by ${a.toFixed(0)} sq in`);
  }

  // --- clear approach in front of every doorway, the balcony and the kitchen
  // A doorway narrower than WALK needs its whole width clear for WALK deep; a
  // wide opening needs a WALK-wide lane somewhere along it.
  const approachTargets = plan.openings.filter((o) => o.type === 'door');
  for (const o of approachTargets) {
    const w = plan.walls.find((x) => x.id === o.wall);
    if (!w) continue;
    const { u, nrm } = unitVec(w);
    const lane = Math.min(o.width, WALK);
    for (const side of [1, -1]) {
      // only check sides that land inside a room with furniture in it
      const probe = pointAt(w, o.offset + o.width / 2);
      const pp = [probe[0] + nrm[0] * side * (WALK / 2 + 4), probe[1] + nrm[1] * side * (WALK / 2 + 4)];
      const room = plan.rooms.find((r) => r.boundary && pointInBox(pp, bbox(r.boundary)));
      if (!room || !furn.some((f) => f.room === room.id)) continue;
      let best = Infinity;
      for (let s = 0; s + lane <= o.width + 0.01; s += 2) {
        const p1 = pointAt(w, o.offset + s), p2 = pointAt(w, o.offset + s + lane);
        const box = {
          x0: Math.min(p1[0], p2[0]) + Math.min(0, nrm[0] * side * WALK),
          x1: Math.max(p1[0], p2[0]) + Math.max(0, nrm[0] * side * WALK),
          y0: Math.min(p1[1], p2[1]) + Math.min(0, nrm[1] * side * WALK),
          y1: Math.max(p1[1], p2[1]) + Math.max(0, nrm[1] * side * WALK),
        };
        let hit = 0;
        for (const f of furn) hit += overlapArea(box, boxOf(f));
        best = Math.min(best, hit);
      }
      if (best > 0.5)
        F(`door "${o.id}" has no ${lane}" x ${WALK}" clear approach on the ${side > 0 ? 'far' : 'near'} side `
          + `in room "${room.id}" — furniture blocks ${best.toFixed(0)} sq in of the best lane`);
    }
  }

  // --- 30" behind every dining chair ---------------------------------------
  for (const f of furn.filter((x) => x.kind === 'dining-chair')) {
    const t = plan.rooms.find((r) => r.id === f.room);
    const tb = t ? bbox(t.boundary) : null;
    const b = boxOf(f);
    // a chair is pulled out away from the table it faces; test all four sides
    const sides = [
      { x0: b.x0, x1: b.x1, y0: b.y0 - PULL_OUT, y1: b.y0 },
      { x0: b.x0, x1: b.x1, y0: b.y1, y1: b.y1 + PULL_OUT },
      { x0: b.x0 - PULL_OUT, x1: b.x0, y0: b.y0, y1: b.y1 },
      { x0: b.x1, x1: b.x1 + PULL_OUT, y0: b.y0, y1: b.y1 },
    ];
    const ok = sides.some((s) => {
      for (const g of furn) if (g.id !== f.id && overlapArea(s, boxOf(g)) > 0.5) return false;
      for (const w of plan.walls) for (const wb of wallBoxes(plan, w)) if (overlapArea(s, wb) > 0.5) return false;
      for (const fx of plan.fixtures ?? []) if (overlapArea(s, boxOf(fx)) > 0.5) return false;
      return true;
    });
    if (!ok) F(`dining chair "${f.id}" has no ${PULL_OUT}" clear on any side to pull out into`);
    void tb;
  }

  // --- seats ----------------------------------------------------------------
  const seatsOf = (ids) => furn.filter((f) => ids.includes(f.room))
    .reduce((n, f) => n + (f.seats ?? 0), 0);
  const totalSeats = furn.reduce((n, f) => n + (f.seats ?? 0), 0);
  const hostSeats = seatsOf(['living-room', 'dining-room']);
  if (furn.length && totalSeats < MIN_SEATS)
    F(`only ${totalSeats} seats in the plan; at least ${MIN_SEATS} are needed`);

  // --- play zones -----------------------------------------------------------
  const zoneReport = [];
  for (const z of plan.zones ?? []) {
    const r = roomOf(z.room);
    if (!r) { F(`zone "${z.id}" references unknown room "${z.room}"`); continue; }
    const clear = zoneClearArea(z, furn);
    zoneReport.push({ id: z.id, room: z.room, clear });
    if (z.kind === 'play' && clear < MIN_PLAY_SQFT)
      F(`play zone "${z.id}" has ${clear.toFixed(1)} sq ft of clear floor; at least ${MIN_PLAY_SQFT} is needed`);
  }

  // --- sightlines to the play area -----------------------------------------
  const sight = { clear: 0, glass: 0, blocked: 0, detail: [] };
  const play = (plan.zones ?? []).find((z) => z.kind === 'play');
  if (play) {
    const pb = bbox(play.boundary);
    const centre = [(pb.x0 + pb.x1) / 2, (pb.y0 + pb.y1) / 2];
    for (const f of furn.filter((x) => (x.seats ?? 0) > 0)) {
      const b = boxOf(f);
      const from = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
      const verdict = pointInBox(from, pb) ? 'clear' : sightline(plan, from, centre);
      sight[verdict] += f.seats;
      sight.detail.push({ id: f.id, room: f.room, seats: f.seats, verdict });
    }
  }

  // --- printed area ------------------------------------------------------
  const printed = plan.meta?.printedArea?.livingSqFt;
  if (printed && plan.envelope?.livingArea) {
    const sqft = polyArea(plan.envelope.livingArea) / 144;
    const off = Math.abs(sqft - printed) / printed;
    const msg = `living area computes to ${sqft.toFixed(0)} sq ft against the printed ${printed} sq ft `
      + `(${(off * 100).toFixed(1)}% off, tolerance ${(AREA_TOL * 100).toFixed(0)}%)`;
    if (off > AREA_TOL) F(msg); else W(msg);
  } else if (printed) {
    W(`printedArea.livingSqFt is ${printed} but there is no envelope.livingArea polygon to check it against`);
  }

  const bal = plan.meta?.printedArea?.balconySqFt;
  const balRoom = plan.rooms.find((r) => r.outdoor);
  if (bal && balRoom) {
    const sqft = polyArea(balRoom.boundary) / 144;
    if (Math.abs(sqft - bal) / bal > AREA_TOL)
      W(`balcony computes to ${sqft.toFixed(0)} sq ft against the printed ${bal} sq ft `
        + `(the source's own two balcony figures disagree: 11'11" x 3'10" is 46 sq ft, not 53)`);
  }

  return { fail, warn, stats: { totalSeats, hostSeats, zoneReport, sight, furniture: furn.length } };
}

// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const files = args.length
  ? args
  : readdirSync(PLANS).filter((f) => f.endsWith('.json'))
  .filter((f) => !isLibrary(join(PLANS, f))).sort().map((f) => join(PLANS, f));

if (!files.length) { console.error('no plan files found'); process.exit(1); }

let bad = 0;
const results = [];
for (const file of files) {
  const label = basename(file);
  let plan;
  try { plan = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { console.error(`\x1b[31mFAIL\x1b[0m ${label}\n  not valid JSON: ${e.message}`); bad++; continue; }

  // a plan with toggles is checked once per combination of them
  let combos;
  try { combos = plan.toggles ? combinations(plan) : [{ data: plan }]; }
  catch (e) { console.error(`\x1b[31mFAIL\x1b[0m ${label}\n  ${e.message}`); bad++; continue; }

  for (const c of combos) {
    const name = plan.toggles ? `${label} [${c.key || 'all off'}]` : label;
    const { fail, warn, stats } = validate(c.data, name);
    if (stats) results.push({ label: name, stats, ok: !fail.length });
    if (fail.length) {
      bad++;
      console.error(`\x1b[31mFAIL\x1b[0m ${name} — ${fail.length} problem${fail.length > 1 ? 's' : ''}`);
      for (const m of fail) console.error(`  \x1b[31mx\x1b[0m ${m}`);
    } else if (!plan.toggles) {
      console.log(`\x1b[32mPASS\x1b[0m ${name}`);
    }
    if (!plan.toggles || c === combos[0]) for (const m of warn) console.log(`  \x1b[33m!\x1b[0m ${m}`);
  }
  if (plan.toggles && combos.every((c) => results.find((r) => r.label === `${label} [${c.key || 'all off'}]`)?.ok !== false))
    console.log(`\x1b[32mPASS\x1b[0m ${label} (all ${combos.length} combinations of ${plan.toggles.length} toggles)`);
}

// --- side-by-side comparison of the plans that carry furniture -------------
const furnished = results.filter((r) => r.stats.furniture > 0);
if (furnished.length > 1) {
  const rows = [
    ['', ...furnished.map((r) => r.label.replace(/^option-|\.json$/g, ''))],
    ['seats (total)', ...furnished.map((r) => String(r.stats.totalSeats))],
    ['seats in living + dining', ...furnished.map((r) => String(r.stats.hostSeats))],
    ['play floor, clear', ...furnished.map((r) =>
      r.stats.zoneReport.map((z) => `${z.clear.toFixed(1)} sq ft (${z.room})`).join('; ') || '-')],
    ['seats w/ clear sightline', ...furnished.map((r) => String(r.stats.sight.clear))],
    ['seats seeing only thru glass', ...furnished.map((r) => String(r.stats.sight.glass))],
    ['seats with no sightline', ...furnished.map((r) => String(r.stats.sight.blocked))],
    ['failed checks', ...furnished.map((r) => (r.ok ? 'none' : 'see above'))],
  ];
  const wid = rows[0].map((_, i) => Math.max(...rows.map((r) => (r[i] ?? '').length)));
  console.log('\n\x1b[1mComparison\x1b[0m');
  rows.forEach((r, i) => {
    console.log('  ' + r.map((c, j) => (j ? (c ?? '').padStart(wid[j]) : (c ?? '').padEnd(wid[0]))).join('  '));
    if (i === 0) console.log('  ' + wid.map((w) => '-'.repeat(w)).join('  '));
  });
  for (const r of furnished) {
    const seen = r.stats.sight.detail.filter((d) => d.verdict !== 'blocked');
    console.log(`\n  ${r.label}: seats that can see the play area — `
      + (seen.length ? seen.map((d) => `${d.id} (${d.seats}, ${d.verdict})`).join(', ') : 'none'));
  }
}

if (bad) {
  console.error(`\n\x1b[31m${bad} plan check(s) failed validation.\x1b[0m`);
  process.exit(1);
}
console.log(`\n${files.length} plan(s) OK.`);
