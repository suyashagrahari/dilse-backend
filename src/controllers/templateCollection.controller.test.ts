import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express, { Router, type Request, type Response } from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import {
  validateCollection,
  mountTemplateCollections,
  publicCollections,
  invalidateCollectionCache,
  MAX_COLLECTION_ITEMS,
  type CollectionDeps,
  type CollectionItem,
  type CollectionKey,
  type CollectionRecord,
} from "./templateCollection.controller";

// ── validateCollection ──────────────────────────────────────────────────────

describe("validateCollection", () => {
  it("lower-cases, trims and keeps order", () => {
    const r = validateCollection("wedding", { items: [{ slug: " Shaadi-Card ", group: "Indian" }, { slug: "birthday" }] });
    assert.deepEqual(r, { ok: true, items: [{ slug: "shaadi-card", group: "indian" }, { slug: "birthday" }] });
  });

  it("de-duplicates, keeping the first position and group", () => {
    const r = validateCollection("wedding", {
      items: [{ slug: "a", group: "court" }, { slug: "b" }, { slug: "A", group: "indian" }],
    });
    assert.deepEqual(r, { ok: true, items: [{ slug: "a", group: "court" }, { slug: "b" }] });
  });

  it("accepts bare slug strings and drops an empty group", () => {
    const r = validateCollection("wedding", { items: ["reception", { slug: "x", group: "" }, { slug: "y", group: null }] });
    assert.deepEqual(r, { ok: true, items: [{ slug: "reception" }, { slug: "x" }, { slug: "y" }] });
  });

  it("accepts an empty list (a place with nothing in it)", () => {
    assert.deepEqual(validateCollection("wedding", { items: [] }), { ok: true, items: [] });
  });

  it("rejects a missing or non-array items", () => {
    assert.equal(validateCollection("wedding", {}).ok, false);
    assert.equal(validateCollection("wedding", null).ok, false);
    assert.equal(validateCollection("wedding", { items: "a,b" }).ok, false);
  });

  it("rejects bad slugs", () => {
    for (const slug of ["", "-lead", "has space", "../etc", "a".repeat(81), "emoji-✨"]) {
      const r = validateCollection("wedding", { items: [{ slug }] });
      assert.equal(r.ok, false, `slug ${JSON.stringify(slug)} should fail`);
    }
  });

  it("rejects an unknown group and a non-string group", () => {
    const r = validateCollection("wedding", { items: [{ slug: "a", group: "birthday" }] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /indian, christian, reception, court, rishta/);
    assert.equal(validateCollection("wedding", { items: [{ slug: "a", group: 3 }] }).ok, false);
  });

  it("rejects non-object items", () => {
    assert.equal(validateCollection("wedding", { items: [42] }).ok, false);
    assert.equal(validateCollection("wedding", { items: [["a"]] }).ok, false);
  });

  it(`caps the list at ${MAX_COLLECTION_ITEMS}`, () => {
    const ok = Array.from({ length: MAX_COLLECTION_ITEMS }, (_, i) => ({ slug: `t${i}` }));
    assert.equal(validateCollection("wedding", { items: ok }).ok, true);
    assert.equal(validateCollection("wedding", { items: [...ok, { slug: "one-more" }] }).ok, false);
  });
});

// ── Handlers over an in-memory store ────────────────────────────────────────

function memory() {
  const store = new Map<CollectionKey, CollectionRecord>();
  const audits: { action: string; changes?: unknown }[] = [];
  const deps: CollectionDeps = {
    find: async (k) => store.get(k) ?? null,
    save: async (k, items: CollectionItem[], email) => {
      const rec = { items, updatedByEmail: email, updatedAt: new Date() };
      store.set(k, rec);
      return rec;
    },
    remove: async (k) => {
      const prev = store.get(k) ?? null;
      store.delete(k);
      return prev;
    },
    audit: async (_req, input) => {
      audits.push({ action: input.action, changes: input.changes });
    },
  };
  return { store, audits, deps };
}

describe("template collection routes", () => {
  let server: Server;
  let base = "";
  let mem = memory();

  // A stand-in for requireSuperAdmin: the header names the role.
  const guard = (req: Request, res: Response, next: () => void) => {
    const role = req.headers["x-test-role"];
    if (role !== "superadmin") {
      res.status(403).json({ success: false, error: "Super Admin access required" });
      return;
    }
    req.userEmail = "boss@example.com";
    next();
  };

  before(async () => {
    const app = express();
    app.use(express.json());
    const r = Router();
    mountTemplateCollections(r, guard, {
      find: (k) => mem.deps.find(k),
      save: (k, i, e) => mem.deps.save(k, i, e),
      remove: (k) => mem.deps.remove(k),
      audit: (q, i) => mem.deps.audit(q, i),
    });
    app.use("/api/admin", r);
    server = await new Promise((ok) => {
      const s = app.listen(0, () => ok(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/template-collections`;
  });

  after(() => new Promise<void>((ok) => server.close(() => ok())));

  beforeEach(() => {
    mem = memory();
    invalidateCollectionCache();
  });

  const call = async (method: string, path: string, body?: unknown, role = "superadmin") => {
    const res = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", "x-test-role": role },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as { success: boolean; error?: string; data?: any } };
  };

  it("403s for anyone but a super admin, on every verb", async () => {
    for (const method of ["GET", "PUT", "DELETE"]) {
      const r = await call(method, "/wedding", method === "PUT" ? { items: [] } : undefined, "admin");
      assert.equal(r.status, 403, method);
    }
    assert.equal(mem.store.size, 0);
  });

  it("GET answers null while the place is automatic", async () => {
    const r = await call("GET", "/wedding");
    assert.equal(r.status, 200);
    assert.equal(r.json.data.collection, null);
    assert.deepEqual(r.json.data.groups, ["indian", "christian", "reception", "court", "rishta"]);
  });

  it("404s an unknown place", async () => {
    assert.equal((await call("GET", "/birthday")).status, 404);
    assert.equal((await call("PUT", "/birthday", { items: [] })).status, 404);
  });

  it("PUT stores the cleaned list, audits it, and GET reads it back", async () => {
    const put = await call("PUT", "/wedding", {
      items: [{ slug: "Birthday", group: "indian" }, { slug: "shaadi-card", group: "indian" }, { slug: "birthday" }],
    });
    assert.equal(put.status, 200);
    assert.deepEqual(put.json.data.collection.items, [
      { slug: "birthday", group: "indian" },
      { slug: "shaadi-card", group: "indian" },
    ]);
    assert.equal(put.json.data.collection.updatedByEmail, "boss@example.com");
    assert.deepEqual(mem.audits.map((a) => a.action), ["template.set_collection"]);
    const get = await call("GET", "/wedding");
    assert.deepEqual(get.json.data.collection.items, put.json.data.collection.items);
  });

  it("PUT rejects a bad body with 400 and stores nothing", async () => {
    const r = await call("PUT", "/wedding", { items: [{ slug: "a", group: "birthday" }] });
    assert.equal(r.status, 400);
    assert.equal(r.json.success, false);
    assert.equal(mem.store.size, 0);
    assert.equal(mem.audits.length, 0);
  });

  it("DELETE resets to automatic and audits only when something was saved", async () => {
    await call("DELETE", "/wedding");
    assert.equal(mem.audits.length, 0);
    await call("PUT", "/wedding", { items: [{ slug: "a" }] });
    const del = await call("DELETE", "/wedding");
    assert.equal(del.status, 200);
    assert.equal(del.json.data.collection, null);
    assert.equal(mem.store.size, 0);
    assert.deepEqual(mem.audits.map((a) => a.action), ["template.set_collection", "template.clear_collection"]);
  });

  it("the public read follows writes immediately (cache invalidated)", async () => {
    const pub = () => publicCollections(mem.deps);
    assert.deepEqual(await pub(), { wedding: null, "gallery-exclude": null });
    await call("PUT", "/wedding", { items: [{ slug: "x", group: "court" }] });
    // The route wrote through the same store; the cache was dropped by the write.
    assert.deepEqual(await pub(), { wedding: { items: [{ slug: "x", group: "court" }] }, "gallery-exclude": null });
    await call("DELETE", "/wedding");
    assert.deepEqual(await pub(), { wedding: null, "gallery-exclude": null });
  });

  // ── gallery-exclude: the live templates kept off the main gallery ─────────

  it("gallery-exclude: 403s for anyone but a super admin, on every verb", async () => {
    for (const method of ["GET", "PUT", "DELETE"]) {
      const r = await call(method, "/gallery-exclude", method === "PUT" ? { items: ["a"] } : undefined, "admin");
      assert.equal(r.status, 403, method);
    }
    assert.equal(mem.store.size, 0);
  });

  it("gallery-exclude: lower-cases, de-dupes, takes no groups, and is public", async () => {
    const put = await call("PUT", "/gallery-exclude", {
      items: ["Palace-Door-Wedding-Invitation", { slug: "happy-birthday" }, { slug: "palace-door-wedding-invitation" }],
    });
    assert.equal(put.status, 200);
    assert.deepEqual(put.json.data.groups, []);
    assert.deepEqual(put.json.data.collection.items, [{ slug: "palace-door-wedding-invitation" }, { slug: "happy-birthday" }]);
    const pub = await publicCollections(mem.deps);
    assert.deepEqual(pub["gallery-exclude"], { items: [{ slug: "palace-door-wedding-invitation" }, { slug: "happy-birthday" }] });
    // Independent of the wedding place.
    assert.equal(pub.wedding, null);
  });

  it("gallery-exclude: rejects a group, a bad slug and more than the cap", async () => {
    assert.equal((await call("PUT", "/gallery-exclude", { items: [{ slug: "a", group: "indian" }] })).status, 400);
    assert.equal((await call("PUT", "/gallery-exclude", { items: [{ slug: "../etc" }] })).status, 400);
    const tooMany = Array.from({ length: MAX_COLLECTION_ITEMS + 1 }, (_, i) => `t${i}`);
    assert.equal((await call("PUT", "/gallery-exclude", { items: tooMany })).status, 400);
    assert.equal(mem.store.size, 0);
  });

  it("gallery-exclude: an empty list is valid (everything listed) and DELETE clears it", async () => {
    const put = await call("PUT", "/gallery-exclude", { items: [] });
    assert.equal(put.status, 200);
    assert.deepEqual(put.json.data.collection.items, []);
    const del = await call("DELETE", "/gallery-exclude");
    assert.equal(del.json.data.collection, null);
  });
});
