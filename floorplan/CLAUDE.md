# floorplan/

## The rule

`plans/*.json` is the only thing that gets edited. The drawing is always
generated from it.

- Never edit `dist/index.html`. Never hand-tweak the generated SVG. `render.mjs`
  overwrites the whole file on every run.
- If the drawing is wrong, the JSON is wrong. Fix the JSON.
- After any change to a plan: `node floorplan/validate.mjs && node floorplan/render.mjs`.
  Validate first; a plan that doesn't validate doesn't get rendered.
- Zero runtime dependencies, and it stays that way. Plain Node scripts, one
  self-contained HTML file that opens offline.

## Units and origin

Inches, always — the original survey is imperial and `labelled.text` quotes its
labels verbatim. Metric is derived at render time; the page carries both and has
a ft/in ↔ metric switch. Don't convert the stored geometry.

When a room's size changes, update `labelled.text` (imperial string, shown
as-is) *and* `labelled.a` / `labelled.b` (inches, drive both the metric labels
and the validator) together.

Origin at the outside face of the north-west corner of the exterior walls;
`+x` east, `+y` south. Walls are centrelines; room boundaries are interior
faces.

## Never guess a dimension

Everything in `baseline.json` is either printed on `source/original.jpg` or
measured off it at 3.679 px/inch. If a new dimension can't be read from the
source, ask rather than inventing one. The places where the source contradicts
itself are listed in README.md — don't silently "fix" them.
