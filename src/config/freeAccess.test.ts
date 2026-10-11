import { test } from "node:test";
import assert from "node:assert/strict";
import { entitlementFrom, parseFreeAccessBody, parsePaysBody, FREE_ACCESS_NOTE_MAX } from "./freeAccess";

test("entitlementFrom: the rule table", () => {
  assert.equal(entitlementFrom(null), null);
  assert.equal(entitlementFrom({ role: "normal" }), null);
  assert.equal(entitlementFrom({ role: "admin" }), null, "plain admins pay");
  assert.equal(entitlementFrom({ role: "superadmin" }), "super_admin");
  assert.equal(entitlementFrom({ role: "superadmin", paysAsCustomer: false }), "super_admin");
  assert.equal(entitlementFrom({ role: "superadmin", paysAsCustomer: true }), null);
  assert.equal(entitlementFrom({ role: "normal", freeAccess: { enabled: true } }), "free_access");
  assert.equal(entitlementFrom({ role: "normal", freeAccess: { enabled: false } }), null);
  assert.equal(entitlementFrom({ role: "normal", paysAsCustomer: true, freeAccess: { enabled: true } }), "free_access");
  // A paying super admin who also carries a stale grant record is free through it.
  assert.equal(entitlementFrom({ role: "superadmin", paysAsCustomer: true, freeAccess: { enabled: true } }), "free_access");
});

test("parsePaysBody accepts only a boolean", () => {
  assert.deepEqual(parsePaysBody({ paysAsCustomer: true }), { ok: true, value: { paysAsCustomer: true } });
  assert.deepEqual(parsePaysBody({ paysAsCustomer: false }), { ok: true, value: { paysAsCustomer: false } });
  for (const bad of [undefined, null, {}, { paysAsCustomer: "true" }, { paysAsCustomer: 1 }, { paysAsCustomer: null }]) {
    assert.equal(parsePaysBody(bad).ok, false, JSON.stringify(bad));
  }
});

test("parseFreeAccessBody: enabled must be boolean, note optional, trimmed and bounded", () => {
  assert.deepEqual(parseFreeAccessBody({ enabled: true }), { ok: true, value: { enabled: true, note: "" } });
  assert.deepEqual(parseFreeAccessBody({ enabled: false, note: "  collab  " }), { ok: true, value: { enabled: false, note: "collab" } });
  assert.deepEqual(parseFreeAccessBody({ enabled: true, note: null }), { ok: true, value: { enabled: true, note: "" } });
  for (const bad of [undefined, {}, { enabled: "yes" }, { enabled: 1 }, { enabled: true, note: 5 }, { enabled: true, note: { $ne: 1 } }]) {
    assert.equal(parseFreeAccessBody(bad).ok, false, JSON.stringify(bad));
  }
  assert.equal(parseFreeAccessBody({ enabled: true, note: "x".repeat(FREE_ACCESS_NOTE_MAX) }).ok, true);
  assert.equal(parseFreeAccessBody({ enabled: true, note: "x".repeat(FREE_ACCESS_NOTE_MAX + 1) }).ok, false);
});
