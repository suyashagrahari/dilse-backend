import { test } from "node:test";
import assert from "node:assert/strict";
import { isFreeForViewer } from "./whoPays";

test("switch off: nobody is free, India included", () => {
  assert.equal(isFreeForViewer({ chargeOnlyAbroad: false, country: "IN", source: "ip" }), false);
  assert.equal(isFreeForViewer({ chargeOnlyAbroad: false, country: "US", source: "ip" }), false);
});

test("switch on: India is free, abroad pays", () => {
  assert.equal(isFreeForViewer({ chargeOnlyAbroad: true, country: "IN", source: "ip" }), true);
  assert.equal(isFreeForViewer({ chargeOnlyAbroad: true, country: "IN", source: "cdn" }), true);
  assert.equal(isFreeForViewer({ chargeOnlyAbroad: true, country: "US", source: "ip" }), false);
  assert.equal(isFreeForViewer({ chargeOnlyAbroad: true, country: "AE", source: "ip" }), false);
});

test("switch on: an unknown country pays — a missing geo database must not make everything free", () => {
  assert.equal(isFreeForViewer({ chargeOnlyAbroad: true, country: null, source: "unknown" }), false);
  assert.equal(isFreeForViewer({ chargeOnlyAbroad: true, country: "IN", source: "unknown" }), false);
  assert.equal(isFreeForViewer({ chargeOnlyAbroad: true, country: null, source: "ip" }), false);
});

test("a super admin's test override counts like a real lookup", () => {
  assert.equal(isFreeForViewer({ chargeOnlyAbroad: true, country: "IN", source: "debug" }), true);
  assert.equal(isFreeForViewer({ chargeOnlyAbroad: true, country: "US", source: "debug" }), false);
});
