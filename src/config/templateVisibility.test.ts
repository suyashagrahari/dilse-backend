import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_HIDDEN, adminVisibilityView, effectiveDefaultHidden, hiddenFrom, reachableFrom } from "./templateVisibility";
import { defaultSeason, dropSlugs, isInDrop, type SeasonDrop, type SeasonMode, type SeasonView } from "./seasonSale";

// Reachability = live in the gallery OR in the active (Halloween) drop. These
// cover the pure rule; `isTemplateReachable` only adds the two cached reads.

const season = ({ mode = "halloween", ...drop }: Partial<SeasonDrop & { mode: SeasonMode }> = {}): SeasonView => {
  const d = defaultSeason();
  return { ...d, mode, drops: { ...d.drops, halloween: { ...d.drops.halloween, ...drop } } };
};

test("hidden + in the drop + halloween mode → reachable", () => {
  assert.equal(reachableFrom("happy-halloween", false, season()), true);
  assert.equal(reachableFrom("happy-halloween-premium", false, season()), true);
});

test("hidden + in the drop, but the mode is off or valentine → not reachable", () => {
  assert.equal(reachableFrom("happy-halloween", false, season({ mode: "off" })), false);
  assert.equal(reachableFrom("happy-halloween", false, season({ mode: "valentine" })), false);
});

test("hidden + not in the drop → not reachable", () => {
  assert.equal(reachableFrom("happy-rose-day", false, season()), false);
});

test("live → reachable whatever the season", () => {
  for (const s of [season(), season({ mode: "off" }), season({ mode: "valentine" }), null]) {
    assert.equal(reachableFrom("happy-birthday", true, s), true);
  }
});

test("the sale switch only controls the discount, not drop membership", () => {
  assert.equal(reachableFrom("happy-halloween", false, season({ saleEnabled: false })), true);
});

test("no season answer and an empty slug are never reachable through the drop", () => {
  assert.equal(reachableFrom("happy-halloween", false, null), false);
  assert.equal(reachableFrom("", true, season()), false);
});

test("drop lookups are case-insensitive and trimmed", () => {
  assert.equal(isInDrop("  HAPPY-HALLOWEEN ", season()), true);
  assert.deepEqual(dropSlugs(season({ saleSlugs: ["Happy-Halloween"] })), ["happy-halloween"]);
  assert.deepEqual(dropSlugs(season({ mode: "off" })), []);
});

// ── The admin screen must agree with the public hidden list ─────────────────
//
// /admin/templates resolves each row as `row ? row.live : !defaultHidden.has(slug)`.
// It used to receive the raw DEFAULT_HIDDEN on every host, so staging showed
// thirty-odd live templates as "Hidden · default". These pin the admin view to
// `hiddenFrom` — the rule `hiddenSlugs()` serves publicly — on both hosts.

const adminHidden = (view: ReturnType<typeof adminVisibilityView>, rowsMap: Map<string, boolean>, slugs: string[]) => {
  const def = new Set(view.defaultHidden);
  return slugs.filter((s) => (rowsMap.has(s) ? !rowsMap.get(s) : def.has(s))).sort();
};

const sampleRows = new Map<string, boolean>([
  ["digital-bouquet", true], // a default-hidden template switched on
  ["happy-diwali", false], // a default-hidden template pinned hidden
  ["challan", false], // an old template switched off
  ["happy-birthday-gf", true], // an old template pinned live
]);
const universe = [...new Set([...DEFAULT_HIDDEN, ...sampleRows.keys(), "nutrition", "watch", "wedding-invitation"])];

for (const apex of [false, true]) {
  test(`admin state equals the public hidden list (${apex ? "apex" : "staging / laptop"})`, () => {
    const view = adminVisibilityView(sampleRows, apex);
    assert.deepEqual(adminHidden(view, sampleRows, universe), view.hidden.filter((s) => universe.includes(s)));
    assert.deepEqual(view.hidden, hiddenFrom(sampleRows, apex));
    assert.equal(view.isApex, apex);
    assert.deepEqual(view.apexDefaultHidden, [...DEFAULT_HIDDEN].sort());
  });
}

test("off the apex the default hides nothing — new templates are live on staging", () => {
  assert.deepEqual(effectiveDefaultHidden(false), []);
  const view = adminVisibilityView(new Map(), false);
  assert.deepEqual(view.defaultHidden, []);
  assert.deepEqual(view.hidden, []);
  for (const s of ["wedding-invitation", "digital-bouquet", "palace-door-wedding-invitation"]) {
    assert.equal((view.hidden as string[]).includes(s), false, s);
  }
});

test("on the apex the default hides DEFAULT_HIDDEN until a row says otherwise", () => {
  const view = adminVisibilityView(new Map([["wedding-invitation", true]]), true);
  assert.deepEqual(view.defaultHidden, [...DEFAULT_HIDDEN].sort());
  assert.equal(view.hidden.includes("wedding-invitation"), false);
  assert.equal(view.hidden.includes("palace-door-wedding-invitation"), true);
});

test("a row overrules the default in both directions on both hosts", () => {
  for (const apex of [false, true]) {
    const h = hiddenFrom(new Map([["nutrition", false], ["happy-diwali", true]]), apex);
    assert.equal(h.includes("nutrition"), true);
    assert.equal(h.includes("happy-diwali"), false);
  }
});
