---
name: 4479 W 10th Ave floor plan
description: A data-driven floor plan of the main floor, used to brief the renovation.
colors:
  change-magenta: "#d81b60"
  change-wash: "#fbe3ec"
  ink: "#111111"
  paper: "#f4f4f2"
  sheet: "#ffffff"
  rule: "#e0e0dc"
  rule-soft: "#ececea"
  hover-stone: "#e9e9e5"
  text-secondary: "#555555"
  text-tertiary: "#666666"
  window-blue: "#1668cc"
  door-green: "#1aa34a"
  wall-grey: "#8e8e8e"
  furniture-oat: "#efeadf"
  furniture-umber: "#7a6a52"
  outdoor-sand: "#f2f1ec"
  entry-red: "#d92b2b"
  tip-charcoal: "#1b1b1b"
  priority-high-bg: "#fde2e1"
  priority-high-text: "#a51d1d"
  priority-medium-bg: "#fbf0cc"
  priority-medium-text: "#7a5a00"
  priority-low-bg: "#e1f2e4"
  priority-low-text: "#1e6b2c"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.005em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "13.5px"
    fontWeight: 650
    lineHeight: 1.3
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  body-small:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.02em"
  item-id:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "11.5px"
    fontWeight: 700
    lineHeight: 1
  priority:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.05em"
  drawing-label:
    fontFamily: "Helvetica, Arial, sans-serif"
    letterSpacing: "0.02em"
rounded:
  pill: "4px"
  row: "7px"
  control: "9px"
  sheet: "10px"
  dialog: "14px"
  chip: "99px"
spacing:
  xxs: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "14px"
  xxl: "18px"
components:
  tab:
    textColor: "{colors.text-secondary}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  tab-selected:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
  tab-hover:
    backgroundColor: "{colors.hover-stone}"
    textColor: "{colors.ink}"
  sheet:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.sheet}"
    padding: "10px"
  chip:
    backgroundColor: "{colors.sheet}"
    textColor: "#333333"
    rounded: "{rounded.chip}"
    padding: "5px 8px"
  chip-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
  units-toggle:
    backgroundColor: "#e7e7e3"
    rounded: "{rounded.row}"
    padding: "2px"
  units-toggle-on:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "5px"
    padding: "4px 12px"
  priority-high:
    backgroundColor: "{colors.priority-high-bg}"
    textColor: "{colors.priority-high-text}"
    typography: "{typography.priority}"
    rounded: "{rounded.pill}"
    padding: "2px 5px"
  priority-medium:
    backgroundColor: "{colors.priority-medium-bg}"
    textColor: "{colors.priority-medium-text}"
    typography: "{typography.priority}"
    rounded: "{rounded.pill}"
    padding: "2px 5px"
  priority-low:
    backgroundColor: "{colors.priority-low-bg}"
    textColor: "{colors.priority-low-text}"
    typography: "{typography.priority}"
    rounded: "{rounded.pill}"
    padding: "2px 5px"
  alt-button:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.control}"
    padding: "9px 10px"
  focus-bar:
    backgroundColor: "{colors.change-wash}"
    textColor: "#444444"
    rounded: "{rounded.row}"
    padding: "6px 6px 6px 10px"
  tooltip:
    backgroundColor: "{colors.tip-charcoal}"
    textColor: "#f2f2f2"
    typography: "{typography.body-small}"
    rounded: "{rounded.row}"
    padding: "9px 11px"
---

# Design System: 4479 W 10th Ave floor plan

## Overview

**Creative North Star: "The Workbench"**

A plain, practical tool you work at. Tabs, toggles, filters and the scope list sit on a quiet stone-grey bench; the drawing is the piece being worked on, laid on a white sheet beside them. Nothing is decorative. Every colour on the page either means something on the drawing or marks a state of a control.

The page is dense but calm: small system type (11–14px), hairline rules instead of boxes, and almost no shadow. Its one loud voice is Change Magenta, which marks what the renovation alters, so a contractor or a relative can see the scope at a glance. The drawing keeps the conventions of an architect's plan (grey walls, blue windows, green door swings, a north arrow and a scale bar), but the tool around it stays approachable: it is not CAD software and never looks like it.

It is generated, offline and self-contained: one HTML file with system fonts, inline SVG and no external assets.

**Key Characteristics:**
- Sidebar of controls beside a drawing that always fits the window.
- Neutral warm greys; colour is reserved for drawing meaning and for change.
- Small, tight system type; a monospace face only for scope item IDs.
- Flat surfaces; shadows only on things that float (menus, tooltips, dialogs).
- Imperial and metric, switched in place.

## Colors

A warm neutral bench and white sheet, a fixed set of drawing colours with plan meanings, and one magenta for change.

### Primary
- **Change Magenta** (`change-magenta`): marks what the renovation changes. Changed walls, doors, windows, fixtures and furniture on the drawing; scope item IDs; numbered room pins; selected room outlines; the preview icon. Its pale **Change Wash** (`change-wash`) backs the "focused on a room" bar, and translucent magenta fills highlight hovered and selected rooms.

### Drawing colours (fixed meanings)
- **Window Blue** (`window-blue`): windows and glazing, glass sightlines and planning zones on the drawing. Also the keyboard focus ring, the "compare" link and the photo-mark highlight.
- **Door Green** (`door-green`): door leaves and swings.
- **Wall Grey** (`wall-grey`): wall fill, outlined in ink.
- **Furniture Oat / Furniture Umber** (`furniture-oat`, `furniture-umber`): furniture fill and outline, with umber labels.
- **Outdoor Sand** (`outdoor-sand`): the balcony floor.
- **Entry Red** (`entry-red`): the entry arrow only.

### Neutral
- **Ink** (`ink`): text, wall outlines, pressed chips, the "current" badge.
- **Paper** (`paper`): the page background (the bench).
- **Sheet** (`sheet`): the drawing sheet, menus, dialogs, chips at rest.
- **Rule** (`rule`): borders and dividers. **Rule Soft** (`rule-soft`) separates list items.
- **Hover Stone** (`hover-stone`): hover background on tabs, the archive control and option rows.
- **Text Secondary / Tertiary** (`text-secondary`, `text-tertiary`): notes, sizes, captions and labels.
- **Tip Charcoal** (`tip-charcoal`): the dark tooltip.

### Status
- **Priority pills**: high (red on pale red), medium (ochre on pale yellow), low (green on pale green), to be decided (grey on pale grey). They appear only on scope items. Medium's pair also marks items that need sign-off.

### Named Rules
**The Change Magenta Rule.** Magenta means "this is different from today". Use it only for changes, scope items and the room they point to; never for decoration, buttons or general emphasis.

**The Plan Colours Rule.** Blue is glass, green is a door, grey is a wall, oat is furniture. A new drawing element reuses these meanings or gets a neutral; it never borrows a meaning colour for something else.

## Typography

**Body Font:** the system UI stack (`-apple-system`, BlinkMacSystemFont, Segoe UI, Helvetica, Arial)
**Label/Mono Font:** ui-monospace (SF Mono, Menlo) for scope item IDs only
**Drawing Font:** Helvetica / Arial inside the SVG

**Character:** native, compact and neutral; it reads as part of the device rather than as a brand.

### Hierarchy
- **Title** (650–700, 16px, 1.3): the address in the sidebar header (700) and dialog titles (650).
- **Headline** (650, 13.5px): room group headings in the scope list, with the room size beside them in 11.5px secondary text.
- **Body** (400, 14px, 1.45): the page default and the plan tabs.
- **Body small** (400–600, 12–13px): option labels, item titles (13px, 600), notes, menu descriptions.
- **Label** (600, 11px, 0.02em): section labels ("filter" rows, figure captions) in tertiary grey.
- **Item ID** (mono 700, 11.5px, magenta): scope item numbers such as `BR5`.
- **Priority** (700, 11px, 0.05em, uppercase): priority pills and the "current" badge.
- **Drawing labels** (Helvetica, 0.02em, haloed in white): room names and sizes, scaled to fit the room.

### Named Rules
**The Mono-for-IDs Rule.** Monospace is reserved for scope item IDs, so an ID reads the same in the list, on the drawing and in conversation with a trade.

## Layout

On desktop the page is a full-height grid: a 300px sidebar (header, then a scrolling column of controls, legend and footer) and a stage that fills the rest. Plan tabs sit on top of the stage like folder tabs on the drawing sheet, with the Archive menu at the far right. The drawing always fits the window; it never scrolls.

Spacing is tight and small: 2–8px inside controls, 12px between related groups, 18px sidebar padding and gaps, 14px around the stage.

At 860px and below everything stacks in one column. The tabs become an equal-width segmented control, the drawing fits the width, and the footer is hidden. On the Renovations tab the filters move above the drawing and the scope list below it, so the plan stays near the top.

Printing gives one letter-size page per plan: controls, tabs and legend are hidden and the drawing fills the page.

## Elevation & Depth

Flat. Depth comes from the paper/sheet contrast and 1px rules, not shadows. Shadows appear only on layers that float above the page: the Archive menu, tooltips, the preview dialog (over a dimmed backdrop), and the selected thumb of a segmented control.

### Shadow Vocabulary
- **Menu** (`0 10px 28px rgba(0,0,0,.13), 0 1px 3px rgba(0,0,0,.08)`): the Archive dropdown.
- **Tooltip** (`0 6px 18px rgba(0,0,0,.18), 0 1px 3px rgba(0,0,0,.12)`): option info tips.
- **Dialog** (`0 24px 60px rgba(0,0,0,.28), 0 2px 8px rgba(0,0,0,.12)`): the preview dialog.
- **Thumb** (`0 1px 2px rgba(0,0,0,.12)`): the selected unit toggle (and the selected mobile tab, `0 1px 3px rgba(0,0,0,.14)`).

### Named Rules
**The Flat Bench Rule.** Anything that sits in the page is flat. Only things that float over it get a shadow.

## Shapes

Gently rounded and consistent: 4px on pills and badges, 7px on rows and small controls, 9px on tabs and alternative buttons, 10px on the drawing sheet, menus and photo frames, 14px on the dialog, and fully round chips and room pins. The drawing sheet's top-left corner is square where the selected tab joins it. Borders are 1px hairlines in Rule; the drawing itself uses square-cut wall corners.

## Components

### Plan tabs
- **Style:** folder tabs (9px top corners) on the drawing sheet. At rest: secondary text with no background. Hover: Hover Stone. Selected: white sheet, rule border, ink, 600 weight, joined to the sheet.
- **Mobile:** an equal-width segmented control on a light grey track; the selected segment is white with a thumb shadow.

### Archive menu
- **Style:** a quiet "Archive · count" control at the end of the tab row that opens a white menu (10px corners, menu shadow). Each entry is a bold name over a two-line clamped description.

### Units toggle
- **Style:** a segmented control (ft/in, metric) on a light grey track; the active side is white, ink, 600 weight, with a thumb shadow.

### Filter chips
- **Style:** fully round, white, 1px border, 12px text with an optional colour dot and a small count. Pressed: solid ink with white text.

### Option toggles
- **Style:** checkbox rows (ink accent colour) with a round "i" button that opens a dark tooltip below the row. Rows take Hover Stone on hover.

### Scope item (signature)
- **Structure:** magenta mono ID, item title (13px, 600) and a priority pill on one line; a secondary note and tags indented under the title; a "preview" button pushed to the right.
- **Grouping:** items are grouped by room under a 13.5px heading with the room's size, separated by Rule Soft lines.
- **On the drawing:** a numbered magenta pin marks the room; hovering or selecting highlights the room in translucent magenta and the matching list items.

### Alternative button
- **Style:** a full-width white card-like button (9px corners, 1px border) with a bold name, a secondary description and a blue "compare" link on the right. It opens the alternatives side by side, with the current one outlined in ink and badged "current".

### Preview dialog
- **Style:** a centred white dialog (14px corners, dialog shadow, dimmed backdrop) with a sticky header (ID, title, close button) and a grid of plan crops and photos. It fades and rises in over 0.18s, with no motion for reduced-motion users.

### Drawing
- **Walls** grey with ink outlines; **windows** as triple blue lines; **doors** in green with swing arcs, sliding panels or bifold zigzags; **fixtures** as white shapes with grey outlines and short labels (FR, DW, WH); **overhead** items (upper cabinets, shelves, rods) dashed grey; **furniture** in oat and umber; **changes** redrawn in Change Magenta with a pale magenta wall fill; removed walls as dashed grey ghosts. Room labels give name and size in the active units. A north arrow, a scale bar and the red entry arrow complete the sheet.

## Do's and Don'ts

### Do:
- **Do** keep the drawing the largest thing on screen; on desktop it fits the window without scrolling.
- **Do** reserve Change Magenta (#d81b60) for what the renovation changes and the scope items that describe it.
- **Do** keep plan colours to their meanings: blue glass, green doors, grey walls, oat furniture.
- **Do** show every size in both imperial and metric via the units toggle.
- **Do** use hairline rules and the paper/sheet contrast for structure; keep surfaces flat.
- **Do** use system fonts and inline SVG only, so the page stays one offline file.

### Don't:
- **Don't** make it decorative or cute: no illustrations, playful type or child-themed styling, even though the home is planned around a toddler.
- **Don't** make it look like CAD software: no dense toolbars, icon-only control strips or expert-only panels.
- **Don't** use magenta for buttons, links or emphasis that isn't a change.
- **Don't** add shadows to things that sit in the page.
- **Don't** load web fonts, icon fonts or external images.
