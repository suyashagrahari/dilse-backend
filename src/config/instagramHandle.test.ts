import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInstagramHandle, profileInstagramUpdate, INSTAGRAM_REQUIRED_MSG } from "./instagramHandle";

const handle = (v: unknown) => {
  const r = parseInstagramHandle(v);
  return r.ok ? r.handle : null;
};

test("a plain handle is kept, lowercased", () => {
  assert.equal(handle("Priya.Sharma_21"), "priya.sharma_21");
});

test("whitespace and a leading @ are stripped", () => {
  assert.equal(handle("  @priya  "), "priya");
  assert.equal(handle("@@priya"), "priya");
});

test("a pasted profile URL yields its handle", () => {
  assert.equal(handle("https://www.instagram.com/priya.sharma/"), "priya.sharma");
  assert.equal(handle("https://instagram.com/Priya?igsh=abc123"), "priya");
  assert.equal(handle("instagram.com/priya"), "priya");
  assert.equal(handle("http://m.instagram.com/priya/#top"), "priya");
  assert.equal(handle("https://instagr.am/priya"), "priya");
});

test("a link to a post or reel is not a profile", () => {
  for (const v of ["https://www.instagram.com/p/Cx1abc/", "instagram.com/reel/xyz", "https://instagram.com/stories/priya/1"]) {
    const r = parseInstagramHandle(v);
    assert.equal(r.ok, false, v);
    assert.equal(!r.ok && r.reason, "invalid");
  }
});

test("empty, missing, bare @ and bare domain are 'empty' with the friendly message", () => {
  for (const v of [undefined, null, "", "   ", "@", "https://instagram.com/"]) {
    const r = parseInstagramHandle(v);
    assert.equal(r.ok, false, String(v));
    assert.equal(!r.ok && r.reason, "empty", String(v));
    assert.equal(!r.ok && r.message, INSTAGRAM_REQUIRED_MSG);
  }
});

test("Instagram's character and period rules are enforced", () => {
  assert.equal(handle("a".repeat(30)), "a".repeat(30));
  assert.equal(handle("a".repeat(31)), null);
  assert.equal(handle("priya-sharma"), null);
  assert.equal(handle("priya sharma"), null);
  assert.equal(handle("priyá"), null);
  assert.equal(handle(".priya"), null);
  assert.equal(handle("priya."), null);
  assert.equal(handle("pri..ya"), null);
  assert.equal(handle("pri.ya"), "pri.ya");
  assert.equal(handle("_"), "_");
});

test("profile update: an omitted field changes nothing", () => {
  assert.deepEqual(profileInstagramUpdate(undefined, "priya"), { ok: true, value: undefined });
});

test("profile update: a handle can be changed, and is normalised", () => {
  assert.deepEqual(profileInstagramUpdate("@NewName", "priya"), { ok: true, value: "newname" });
});

test("profile update: a stored handle cannot be cleared", () => {
  const r = profileInstagramUpdate("  ", "priya");
  assert.equal(r.ok, false);
});

test("profile update: a legacy influencer with no handle can still save (no lock-out)", () => {
  assert.deepEqual(profileInstagramUpdate("", undefined), { ok: true, value: undefined });
  assert.deepEqual(profileInstagramUpdate("", null), { ok: true, value: undefined });
});

test("profile update: an invalid handle is refused even for a legacy influencer", () => {
  assert.equal(profileInstagramUpdate("bad..name", undefined).ok, false);
});
