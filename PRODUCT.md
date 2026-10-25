# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **The household (primary):** two adults, both in software, renovating their own condo at 4479 W 10th Ave, Vancouver. They own the plan, edit its data and make every decision.
- **Designer / contractor:** works from the page to understand the agreed scope (what changes, where, at what size) and to quote, plan and build it.
- **Family and friends:** shown the page to see what the renovation will look like. They read it; they don't act on it.

People look at it on a phone (quick checks, links shared in messages) and on a desktop or laptop (detailed work next to the JSON).

## Product Purpose

A floor plan of the main floor that changes when its data changes. The drawing is never drawn by hand: plans, sizes and finishes live in JSON, and the page and a 3D Fusion model are generated from them.

Its main job now is **briefing the build**: presenting the renovation scope clearly enough for a designer or contractor to act on it, with sizes they can trust. It still carries the options that led there (Renovations toggles, the Furniture view, archived options) and the Existing plan for comparison.

Success: a trade can read the scope and sizes off the page without a follow-up call, and nothing on it is guessed without saying so.

## Positioning

A plan that is edited as data and regenerated, not redrawn. Every size records where it came from (printed on the listing plan, drawn off it, estimated, or measured on site), and correcting one measurement moves every wall, fixture and piece of furniture that depends on it, on the page and in the 3D model.

## Operating Context

- Tabs: **Existing** (the home today, with listing photos per room), **Renovations** (scope, with toggles), **Furniture view**, plus an Archive of earlier options.
- `floorplan/intent.md` holds the household's goals and priorities (Montessori-led, no TV, every room earns its space, ready for a second child, a permanent workspace, hosting up to 8). Layout and scope decisions trace back to it.
- On-site measuring replaces listing-plan sizes over time (`dimensions.json` status `measured`).
- Published to GitHub Pages on every push to `main`, after validation passes.
- Strata approval is required for wall and door changes, but the strata council is not an audience for this page.

## Capabilities and Constraints

- Plain Node scripts, zero runtime dependencies. One self-contained HTML file that opens offline and can be emailed or messaged.
- `plans/*.json`, `dimensions.json` and `finishes.json` are the only edited sources; `dist/` is always generated. A plan that doesn't validate isn't rendered or published.
- Inches internally; the page shows imperial and metric with a switch.
- Never guess a dimension: one that can't be read from the source or measured is asked for, not invented. Places where the listing plan contradicts itself are recorded in `floorplan/README.md`, not silently fixed.
- Room names match the listing plan's labels (Office Bedroom is Yuna's room; Bedroom is the playroom; Storage is the office).

## Brand Commitments

None visual. Copy is plain, direct English.

## Evidence on Hand

- Listing floor plan (`floorplan/source/original.jpg`): local only, never published, because it shows the unit number and the realtor's branding. Credit: REV Studio Photography / Tammy Jin, RE/MAX Crest Realty.
- Listing photos per room: `source/4479-photos` (web-sized copies shown on the Existing tab).
- Reference photos for proposed built-ins and fixtures: `floorplan/refs/`.
- No on-site measurements yet; every size is printed, drawn or estimated until measured.

## Product Principles

1. **Trust over polish.** Show where every size came from; never present an estimate as a measurement.
2. **Data is the source.** Fix the JSON, not the drawing.
3. **Readable by someone who wasn't in the room.** A contractor or a relative should understand the scope without the household explaining it.
4. **Decisions trace to intent.md.** If a change can't be traced there, it doesn't belong, or intent.md is missing something.
5. **Works anywhere, offline.** One file, no dependencies, legible on a phone.

## Accessibility & Inclusion

No product-specific requirement established.
