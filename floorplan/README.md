# 4479 W 10th Ave — main floor plan

A floor plan you change by editing data. The drawing is generated; it is never
drawn by hand.

```
floorplan/
  plans/baseline.json   the plan as surveyed — the single source of truth
  plans/*.json          alternative layouts (options)
  dimensions.json       master sizes: rooms, walls, ceiling, openings, fixtures
  finishes.json         colours and materials for the Fusion model
  validate.mjs          checks the geometry, fails loudly
  render.mjs            plans/*.json -> dist/index.html
  fusion.mjs            baseline + dimensions -> dist/fusion-build.py (3D)
  dist/index.html       the drawing: one self-contained file, opens offline
  dist/fusion-build.py  the Fusion script: builds the floor in 3D
  source/original.jpg   the scanned plan everything was transcribed from
                        (kept locally only; not in the repository)
```

## The one rule

**`plans/*.json`, `dimensions.json` and `finishes.json` are the only things you
edit.** Never edit `dist/index.html`, and
never hand-tweak the SVG — the next `render.mjs` run overwrites it. If the
drawing is wrong, the JSON is wrong.

## Running it

Node 18+. No dependencies, nothing to install.

```sh
node floorplan/validate.mjs    # check every plan; exits 1 on any problem
node floorplan/render.mjs      # write floorplan/dist/index.html
open floorplan/dist/index.html
```

Always validate before you render. `dist/index.html` is self-contained — email
it, drop it in a message, open it with no network.

## Dimensions: correcting sizes once you measure

The listing plan is a good guess, not a survey. Every size you might correct
lives in **`dimensions.json`**: room widths and depths, wall thickness, ceiling
height, door and window heights, counter and fixture heights. Each entry says
where its value came from: `printed` (on the listing plan), `drawn` (measured
off it), `estimated` (judged from the listing photos or a standard size) or
`measured`.

When you measure something, change its `value`, set `status` to `measured`,
then validate and render. The website and the Fusion model both follow.

How it works: every wall sits on a named grid line (`X_PBR` is the Primary
Bedroom's east wall, `Y_S` the south wall, and so on), and each grid line is
defined from room sizes in order, west to east and north to south:

```
X_PBR = X_W + wallT + primaryW      (west wall + 9'3" bedroom)
X_LR  = X_PBR + wallT + livingW     (+ 11'11" living room)
X_E   = X_LR + wallT + officeW      (+ 9'0" office)
```

Change `livingW` and everything east of the living room moves with it. Every
wall end, room corner, fixture and piece of furniture in `plans/*.json` is
pinned to its nearest grid line, so a counter against a wall stays against it
and keeps its size, and room labels update to the new size. At the default
values the output is exactly the drawing as transcribed.

Two sizes are derived rather than set: the Primary Bedroom hall (it's what is
left between the walk-in closet and the bedroom's east wall) and the Dining
Room depth (what's left of the living/dining space below `livingD`). A room
whose size doesn't come out right once measured usually means a neighbouring
value needs correcting.

## The Fusion model

`node floorplan/fusion.mjs` writes `dist/fusion-build.py`, which builds the
baseline in Autodesk Fusion: walls to the ceiling with doors and windows cut
at their heights, glass (frosted in the Office/Bedroom wall), a floor body per
room, kitchen counters and upper cabinets, bath fixtures, laundry and closet
shelving. No furniture.

Every edge is bound to a Fusion user parameter with the same name as in
`dimensions.json`, so you can also resize directly in Fusion
(Modify > Change Parameters).

**Cut-away view:** a section called **Wall cut** (browser > Analysis) slices off
everything above `cutH` (48" by default), so you can look down into every
room; click its eye to turn it on or off. The **Cut iso** named view (browser >
Named Views) brings back the matching camera. Named views only store the
camera, so the cut itself is the section's eye.

Parameters that exist only in Fusion:

- `cutH`: height of the Wall cut section.
- `wallTop`: how high the walls are modelled; leave it at `ceilingH`.
- `pad`: keeps the model off the sketch origin. Leave it.

Components: **Shell** (walls, railing), **Glazing**, **Floors**, **Kitchen**,
**Baths**, **Living**, **Storage**. Hide any of them to see past it.

Finishes come from **`finishes.json`**: named appearances from Fusion's library
(re-coloured where needed) assigned to rooms, fixture kinds and walls. It
starts as the unit is today, per the listing photos.

To rebuild after changing `dimensions.json` or `finishes.json`: regenerate,
then run `dist/fusion-build.py` in Fusion (Utilities > Scripts and Add-ins, or
through the Fusion MCP). It updates the parameters in place and rebuilds the
generated components; anything you add in other components is left alone.
Renovation options will go on top of this as separate components.

## Units

The page has a **ft / in ↔ metric** switch next to the plan tabs. It swaps every
room dimension, the header figures and the scale bar; your choice is remembered
in the browser and is what prints. Both sets of labels are baked into the file,
so the switch works offline.

The JSON itself stays in **inches**, because that is what the original survey is
dimensioned in and `labelled.text` quotes those labels verbatim. Metric is
derived at render time from `labelled.a` / `labelled.b`.

## Making an option

```sh
cp floorplan/plans/baseline.json floorplan/plans/option-a.json
```

Edit `option-a.json`, then:

```sh
node floorplan/validate.mjs && node floorplan/render.mjs
```

The page grows a switcher across the top. On any plan that isn't the baseline,
**walls and openings that differ from the baseline are drawn in magenta**, and
anything the baseline had that the option removed is ghosted in dashed grey. A
legend appears automatically.

Set `"name"` in the option file — that's what the switcher button says.

To throw an option away, delete the file and re-render.

### Toggles

A plan can carry a `"toggles"` array instead of being split into one file per
combination. Each toggle has an `id`, a `label`, optional `default` (on unless
`false`) and `note`, and `remove` / `add` lists of `walls`, `openings` or
`fixtures` (removed by id, added whole). The validator checks every combination;
the page gets one tab with an on/off switch per toggle.

A toggle that touches walls or openings is *structural*: the page pre-draws
every combination of those. A toggle that only swaps `fixtures` or adds
`services` (pipe runs: `id`, `kind`, `points`, drawn dashed) is a *layer*:
drawn once and shown or hidden in the browser, so adding more of them doesn't
multiply the file size.

### Furniture and zones

Two arrays beyond the shell:

- **`fixtures`** — built in and not going anywhere: counters, the tub, the
  water heater. Already in the baseline.
- **`furniture`** — movable. `id`, `room`, `kind`, `shape: "rect"`, `x`/`y`/`w`/`h`
  in inches on the same origin, plus `seats: n` on anything you sit on. Always
  axis-aligned: to turn a piece, swap `w` and `h`. There is no rotation field.
- **`zones`** — an area rather than an object: `id`, `room`, `kind` (`"play"`),
  and a `boundary` polygon. Drawn hatched, labelled with its clear floor.

Every piece of furniture takes its size from **`plans/furniture-catalog.json`**
via `kind`. The validator rejects a piece whose `w`/`h` is not the catalog size
(swapped is fine, shrunk is not), so nothing quietly gets smaller to fit. Add a
new kind to the catalog before using it. A plan points at the catalog with
`"furnitureCatalog": "furniture-catalog.json"`.

A play zone's clear floor ignores the play mat itself — the mat is the play
surface, not something standing on it.

### Options on file

- `renovations.json` — the baseline with independent changes, each ticked
  on and off from the sidebar (all on by default). Sizes of new fixtures are
  proposals, not from the survey.
  - **Moved door** — the Bedroom door moves from the foyer side to the
    dining-room wall, swinging into the Bedroom.
  - **Double door** — the Office Bedroom / Bedroom partition rebuilt solid,
    with a 5'0" double door (two 30" leaves) centred in it, swinging south.
  - **Primary bath** — tub replaced by a shower in the same 30" x 58"
    footprint, toilet with a bidet seat, 52" double vanity with two sinks.
  - **Walk-in closet** — 24" hanging on the west wall, 14" shelves on the
    north wall, door swing kept clear.
  - **Bedroom closet** — hanging on the left, 16" shelves on the right.
  - **Shared bath vanity** — 32" x 21" with a sink, the most the wall allows
    while keeping 15" from the toilet's centre.
  - **Laundry** — washer and dryer unstacked side by side (24" compact units)
    with a 12" shelf above.
  - **Heat pump** — ductless multi-zone: outdoor unit on the balcony's east
    wall, wall heads in the Office Bedroom, Living Room (fireplace wall) and
    Primary Bedroom, refrigerant lines dashed.
  - **Pantry** — reach-in shelving: 14" across the back wall, 12" returns on
    either side of the door.
- `archived/option-a-double-door.json`, `archived/option-b-folding-wall.json` —
  shelved options, still viewable under **Archive** on the page.
- `option-c-play-living.json` — furnished; the visit play area is in the living
  room. 43 sq ft clear.
- `option-d-play-bedroom.json` — furnished; the visit play area is in the
  bedroom, with two armchairs in there so adults can talk while watching.
  30 sq ft clear.

C and D both carry the **double-door partition** (Option A, now the Double door toggle) — that decision
is made. They are identical apart from the play decision: same walls, same
openings, and every piece of furniture that is not part of that decision is in
the same position in both. The guest futon is rolled up in the bedroom closet,
so it takes no floor in either.

Use the **sightlines** button to overlay, for each seat, a line to the centre of
the play area — green where it is clear, blue dashed where it only passes
through glass, red dashed where a solid wall blocks it.

### What the dining room can seat

Five to six at the table, never eight. A 72x36 table (the largest that clears
the room's 76" depth) takes three chairs on each long side, but an end chair
needs 170" of width to pull out and the room has 143". The plan uses three
chairs and a backless bench that tucks fully under.

### What to change

Everything is in **inches**, on an origin at the outside face of the north-west
corner of the exterior walls. `+x` is east, `+y` is south.

- **Move a wall** — change its `start` / `end`. Walls are centrelines. Any wall
  end has to land on another wall, or the validator rejects it (add
  `"freeEndStart": true` / `"freeEndEnd": true` for a deliberate stub).
- **Move a door or window** — change `offset` (distance from the wall's `start`)
  or `width`. `swingTo` is a compass direction; `hinge` is `start`, `end` or
  `both`. `style` is `hinged`, `pocket` or `bifold`.
- **Resize a room** — change its `boundary` polygon *and* its `labelled`
  dimensions, or validation fails. Room boundaries are interior faces.
  `labelled.a` / `labelled.b` are inches and drive the metric labels;
  `labelled.text` is the imperial string shown as-is, so keep the two in step.
- **Move a fixture** — `x`/`y`/`w`/`h`, or `cx`/`cy`/`r` for circles.

If you move a wall, you almost always have to update the two rooms either side
of it and their labels. The validator will tell you if you forget.

## What validate.mjs checks

Fails on: a room boundary that doesn't close orthogonally or self-intersects; a
wall end that meets no other wall; an opening that runs past the end of its wall
or overlaps another opening on the same wall; a room whose computed size differs
from its printed label by more than 1.5"; a living area more than 3% from the
1098 sq ft printed on the original. Also: duplicate ids, non-axis-aligned walls,
fixtures outside their room.

With furniture it additionally fails on: a piece outside its room or not at its
catalog size; a piece overlapping a wall, a fixture, another piece, or the swing
of a hinged door; a doorway without a 36" clear approach; a dining chair with
nowhere to pull out into; fewer than 8 seats; a play zone with under 25 sq ft of
clear floor. It then prints a comparison of every furnished plan: seats, play
floor, and how many seats can see the play area.

Warnings (not failures) are printed for the two places where the original survey
disagrees with itself — see below.

## Known imprecision in the source

The baseline reproduces every printed dimension to within 1". Where it can't
match the original exactly, that's because the original doesn't agree with
itself:

- **Area.** The geometry computes to 1116 sq ft against the printed 1098
  (+1.6%).
- **Balcony.** Printed as 53 sq ft, but its own printed 11'11" x 3'10" is
  46 sq ft.
- **Hall (6'11") and Kitchen (8'9").** Both labels are about one wall thickness
  larger than the interior faces. Both rooms have a fully open side and the
  label matches if you measure across the opening to the far face. Encoded as
  `labelledSpan`.
- **Wall thickness** is not printed anywhere. Every wall on the original is
  drawn at the same thickness, which measures 7". That's what the model uses for
  exterior walls, party walls and partitions alike.
- **The wall between Office Bedroom and Bedroom** is drawn as 97" of glazing in a
  108" wall. Transcribed as an interior window wall, which is what it looks like.
- **The hatched box on the living room's west wall** is unlabelled on the plan.
  The listing photos show an electric fireplace with a mantel, in a
  wallpapered panel.

Dimensions come from a marketing floor plan, not a survey. Don't order cabinets
off it.
