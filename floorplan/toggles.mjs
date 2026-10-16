// A plan can carry "toggles": independent changes the page switches on and off.
// Each toggle removes and/or adds walls, openings, fixtures and services
// (pipe and cable runs, drawn as polylines) by id. Every
// combination is a complete plan of its own, so validate.mjs checks each one.
//
// render.mjs only pre-draws combinations of the *structural* toggles (the ones
// that touch walls or openings, which change how walls are cut). A toggle that
// only swaps fixtures is a layer: drawn once and shown or hidden on the page.

const KINDS = ['walls', 'openings', 'fixtures', 'services'];

export const isLayer = (t) => ['walls', 'openings'].every((k) => !t.remove?.[k]?.length && !t.add?.[k]?.length);

export function combinations(plan, { structuralOnly = false } = {}) {
  const toggles = (plan.toggles ?? []).filter((t) => !structuralOnly || !isLayer(t));
  const out = [];
  for (let mask = 0; mask < 1 << toggles.length; mask++) {
    const on = toggles.filter((_, i) => mask & (1 << i));
    const data = structuredClone(plan);
    delete data.toggles;
    for (const t of on) {
      for (const k of KINDS) {
        const rm = t.remove?.[k] ?? [];
        for (const id of rm)
          if (!(data[k] ?? []).some((e) => e.id === id))
            throw new Error(`toggle "${t.id}" removes ${k} "${id}", which isn't in the plan`);
        data[k] = (data[k] ?? []).filter((e) => !rm.includes(e.id)).concat(t.add?.[k] ?? []);
      }
    }
    out.push({ key: on.map((t) => t.id).join('+'), on: on.map((t) => t.id), data });
  }
  return out;
}
