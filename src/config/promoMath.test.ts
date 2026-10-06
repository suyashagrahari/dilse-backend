import { test } from "node:test";
import assert from "node:assert/strict";
import { isPromoLive, isPromoEnded, parseStartInput, endsAtFrom } from "./promoMath";

const now = new Date("2026-10-06T12:00:00Z");
const later = new Date("2026-10-16T12:00:00Z");
const earlier = new Date("2026-10-01T12:00:00Z");

test("live only when switched on AND the clock has not run out", () => {
  assert.equal(isPromoLive({ enabled: true, endsAt: later }, now), true);
  assert.equal(isPromoLive({ enabled: false, endsAt: later }, now), false);
  assert.equal(isPromoLive({ enabled: true, endsAt: earlier }, now), false);
  assert.equal(isPromoLive({ enabled: true, endsAt: null }, now), false);
  assert.equal(isPromoLive(null, now), false);
});

test("the end instant itself is over, not live", () => {
  assert.equal(isPromoLive({ enabled: true, endsAt: now }, now), false);
  assert.equal(isPromoEnded({ enabled: true, endsAt: now }, now), true);
});

test("ended means on but run out; a switched-off promo is neither", () => {
  assert.equal(isPromoEnded({ enabled: true, endsAt: earlier }, now), true);
  assert.equal(isPromoEnded({ enabled: false, endsAt: earlier }, now), false);
  assert.equal(isPromoEnded({ enabled: true, endsAt: later }, now), false);
});

test("start input: whole hours from 1 to 30 days, known styles only", () => {
  assert.deepEqual(parseStartInput({ durationHours: 240, style: "sale" }), { durationHours: 240, style: "sale" });
  assert.deepEqual(parseStartInput({ durationHours: 72 }), { durationHours: 72, style: "sale" });
  assert.ok("error" in parseStartInput({ durationHours: 0 }));
  assert.ok("error" in parseStartInput({ durationHours: 721 }));
  assert.ok("error" in parseStartInput({ durationHours: 1.5 }));
  assert.ok("error" in parseStartInput({ durationHours: "ten" }));
  assert.ok("error" in parseStartInput({ durationHours: 24, style: "<script>" }));
  assert.ok("error" in parseStartInput(undefined));
});

test("10 days from now is exactly 240 hours", () => {
  assert.equal(endsAtFrom(now, 240).toISOString(), later.toISOString());
});
