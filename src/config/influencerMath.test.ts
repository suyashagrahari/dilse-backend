import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveCommissionPercent,
  commissionPaise,
  pendingPaise,
  maskEmail,
  clampPercent,
} from "./influencerMath";

test("two ₹100 purchases at 30% earn ₹60", () => {
  const total = commissionPaise(10000, 30) + commissionPaise(10000, 30);
  assert.equal(total, 6000);
});

test("commission is floored to the paisa", () => {
  assert.equal(commissionPaise(9900, 33.33), 3299);
  assert.equal(commissionPaise(1, 30), 0);
});

test("zero, negative and non-finite amounts earn nothing", () => {
  assert.equal(commissionPaise(0, 30), 0);
  assert.equal(commissionPaise(-500, 30), 0);
  assert.equal(commissionPaise(NaN, 30), 0);
});

test("a per-influencer override beats the default, including an override of 0", () => {
  assert.equal(effectiveCommissionPercent(40, 30), 40);
  assert.equal(effectiveCommissionPercent(0, 30), 0);
  assert.equal(effectiveCommissionPercent(null, 30), 30);
  assert.equal(effectiveCommissionPercent(undefined, 30), 30);
});

test("percentages are clamped to 0–100", () => {
  assert.equal(clampPercent(150), 100);
  assert.equal(clampPercent(-5), 0);
  assert.equal(commissionPaise(10000, 250), 10000);
});

test("pending never goes negative", () => {
  assert.equal(pendingPaise(6000, 2000), 4000);
  assert.equal(pendingPaise(6000, 9000), 0);
});

test("emails are masked but recognisable", () => {
  assert.equal(maskEmail("priyanka@gmail.com"), "pr•••••a@gmail.com");
  assert.equal(maskEmail("ab@x.com"), "a•@x.com");
  assert.equal(maskEmail(""), "");
});
