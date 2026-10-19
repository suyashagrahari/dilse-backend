import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express, { Router } from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { mountWeddingGuestOwner, mountWeddingGuestPublic } from "../routes/weddingGuest.routes";
import type { BlessingRecord, GuestPage, RsvpRecord, WeddingGuestDeps } from "./weddingGuest.controller";
import { RSVP_MAIL_BURST } from "../config/weddingShared";

// ── An in-memory world ──────────────────────────────────────────────────────

function world(slug: string, opts: { password?: string } = {}) {
  let seq = 0;
  const id = () => (++seq).toString(16).padStart(24, "0");
  const page: GuestPage = {
    _id: "p1",
    userId: "owner1",
    shareId: "share-1",
    recipientName: "Ananya",
    senderName: "Rohan",
    extras: { events: [{ id: "haldi", title: "Haldi" }, { id: "wedding", title: "Wedding" }] },
    password: opts.password ? "hashed" : "",
    comparePassword: async (c: string) => !opts.password || c === opts.password,
  };
  const rsvps: (RsvpRecord & { tokenHash: string; digestSentAt?: Date })[] = [];
  const blessings: BlessingRecord[] = [];
  const mails: { kind: "single" | "digest" | "blessing"; n: number; heads: number; text?: string }[] = [];
  let clock = new Date("2026-12-01T10:00:00Z");
  const deps: Partial<WeddingGuestDeps> = {
    findPublishedPage: async (s) => (s === page.shareId ? page : null),
    findOwnedPage: async (pid, uid) => (pid === "p1" && uid === "owner1" ? page : null),
    rsvps: {
      count: async () => rsvps.length,
      create: async (d) => {
        const r = { ...d, _id: id(), createdAt: clock, updatedAt: clock, emailed: false };
        rsvps.push(r);
        return r;
      },
      findForEdit: async (rid) => rsvps.find((r) => r._id === rid) ?? null,
      update: async (rid, set) => {
        const r = rsvps.find((x) => x._id === rid);
        if (!r) return null;
        Object.assign(r, set, { updatedAt: clock, emailed: false });
        return r;
      },
      countSince: async (_p, since) => rsvps.filter((r) => (r.updatedAt ?? r.createdAt) >= since).length,
      lastDigestAt: async () => rsvps.map((r) => r.digestSentAt).filter(Boolean).sort().pop() ?? null,
      unemailed: async () => rsvps.filter((r) => !r.emailed),
      markEmailed: async (ids, d) => {
        for (const r of rsvps) if (ids.includes(r._id)) r.emailed = true;
        if (d) { const r = rsvps.find((x) => x._id === d.id); if (r) r.digestSentAt = d.at; }
      },
      all: async () => [...rsvps],
    },
    blessings: {
      count: async () => blessings.length,
      create: async (d) => { const b = { _id: id(), name: d.name, message: d.message, approved: true, createdAt: clock }; blessings.push(b); return b; },
      approved: async () => blessings.filter((b) => b.approved).reverse(),
      all: async () => [...blessings].reverse(),
      setApproved: async (bid, _p, a) => { const b = blessings.find((x) => x._id === bid); if (b) b.approved = a; return b ?? null; },
    },
    ownerEmail: async () => "owner@example.com",
    shareUrl: async () => "https://subhsandesh.in/x",
    sendSingle: async (o) => { mails.push({ kind: "single", n: 1, heads: o.totals.heads }); },
    sendDigest: async (o) => { mails.push({ kind: "digest", n: o.rsvps.length, heads: o.totals.heads }); },
    sendBlessing: async (o) => { mails.push({ kind: "blessing", n: 1, heads: 0, text: `${o.name}: ${o.message}` }); },
    now: () => clock,
  };
  return { page, rsvps, blessings, mails, deps, tick: (ms: number) => { clock = new Date(clock.getTime() + ms); } };
}

async function serve(slug: string, w: ReturnType<typeof world>) {
  const app = express();
  app.use(express.json());
  const r = Router();
  mountWeddingGuestPublic(r, slug, null, w.deps);
  r.use((req, _res, next) => { req.userId = req.headers["x-test-user"] as string; next(); });
  mountWeddingGuestOwner(r, slug, null, w.deps);
  app.use("/w", r);
  const server: Server = await new Promise((ok) => { const s = app.listen(0, () => ok(s)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/w`;
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(base + path, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text); } catch { /* csv */ }
    return { status: res.status, json, text, headers: res.headers };
  };
  return { server, call };
}

const flush = () => new Promise((r) => setTimeout(r, 30));

describe("wedding guests: RSVP + owner", () => {
  const w = world("wedding-invitation-premium");
  let s: Awaited<ReturnType<typeof serve>>;
  before(async () => { s = await serve("wedding-invitation-premium", w); });
  after(() => s.server.close());

  it("records an RSVP, emails the owner with totals, and lets the guest edit it with the token", async () => {
    const r = await s.call("POST", "/share/share-1/rsvp", { guestName: "Meera", attending: "yes", guests: 3, events: ["haldi", "x"] });
    assert.equal(r.status, 201);
    assert.equal(typeof r.json.editToken, "string");
    await flush();
    assert.deepEqual(w.mails.at(-1), { kind: "single", n: 1, heads: 3 });

    const bad = await s.call("PUT", `/share/share-1/rsvp/${r.json.rsvpId}`, { guestName: "Meera", attending: "no" }, { "x-rsvp-token": "nope" });
    assert.equal(bad.status, 403);
    const ok = await s.call("PUT", `/share/share-1/rsvp/${r.json.rsvpId}`, { guestName: "Meera", attending: "maybe", guests: 2 }, { "x-rsvp-token": String(r.json.editToken) });
    assert.equal(ok.status, 200);
    assert.equal((ok.json.rsvp as { attending: string }).attending, "maybe");
    assert.equal(w.rsvps.length, 1);
  });

  it("swallows honeypot submissions", async () => {
    const before = w.rsvps.length;
    const r = await s.call("POST", "/share/share-1/rsvp", { guestName: "Bot", attending: "yes", website: "x" });
    assert.equal(r.status, 200);
    assert.equal(w.rsvps.length, before);
  });

  it("gives the owner totals, per-event heads and a CSV; nobody else", async () => {
    await s.call("POST", "/share/share-1/rsvp", { guestName: "Kabir", attending: "yes", guests: 2, events: ["wedding", "haldi"] });
    const g = await s.call("GET", "/p1/guests", undefined, { "x-test-user": "owner1" });
    assert.equal(g.status, 200);
    const data = g.json.data as { totals: { heads: number; perEvent: Record<string, number> }; rsvps: { guestName: string }[] };
    assert.equal(data.totals.heads, 2);
    assert.deepEqual(data.totals.perEvent, { wedding: 2, haldi: 2 });
    assert.equal(data.rsvps[0].guestName, "Kabir");
    assert.equal((await s.call("GET", "/p1/guests", undefined, { "x-test-user": "intruder" })).status, 404);
    const csv = await s.call("GET", "/p1/guests.csv", undefined, { "x-test-user": "owner1" });
    assert.match(csv.headers.get("content-type") ?? "", /text\/csv/);
    assert.ok(csv.text.includes("Kabir"));
  });

  it("blessings are off on a tier without them", async () => {
    assert.equal((await s.call("POST", "/share/share-1/blessing", { name: "A", message: "Bless" })).status, 404);
  });
});

describe("wedding guests: digest throttle", () => {
  it("switches to one digest when a burst arrives", async () => {
    const w = world("wedding-invitation");
    const s = await serve("wedding-invitation", w);
    try {
      // 12 = the per-IP limit; enough for 10 singles, one digest, one held.
      for (let i = 0; i < RSVP_MAIL_BURST + 2; i++) {
        await s.call("POST", "/share/share-1/rsvp", { guestName: `G${i}`, attending: "yes", guests: 1 });
        await flush();
      }
      const singles = w.mails.filter((m) => m.kind === "single").length;
      const digests = w.mails.filter((m) => m.kind === "digest");
      assert.equal(singles, RSVP_MAIL_BURST);
      assert.equal(digests.length, 1, "one digest within the hour");
      assert.equal(digests[0].n, 1);
      assert.equal(w.rsvps.filter((r) => !r.emailed).length, 1, "the 12th waits for the next digest");
    } finally {
      s.server.close();
    }
  });
});

describe("wedding guests: password gate + blessings", () => {
  const w = world("royal-wedding-invitation", { password: "lotus" });
  let s: Awaited<ReturnType<typeof serve>>;
  before(async () => { s = await serve("royal-wedding-invitation", w); });
  after(() => s.server.close());

  it("refuses writes and reads without the page password", async () => {
    const r = await s.call("POST", "/share/share-1/rsvp", { guestName: "A", attending: "yes" });
    assert.equal(r.status, 401);
    assert.equal(r.json.needsPassword, true);
    assert.equal((await s.call("GET", "/share/share-1/blessings")).status, 401);
    assert.equal((await s.call("POST", "/share/share-1/rsvp", { guestName: "A", attending: "yes", password: "lotus" })).status, 201);
  });

  it("posts blessings, shows approved ones only, lets the owner hide one", async () => {
    const b = await s.call("POST", "/share/share-1/blessing", { name: "Nani", message: "सदा सुखी रहो", password: "lotus" });
    assert.equal(b.status, 201);
    await flush();
    // The owner is mailed every blessing.
    assert.deepEqual(w.mails.filter((m) => m.kind === "blessing").map((m) => m.text), ["Nani: सदा सुखी रहो"]);
    const bid = (b.json.blessing as { id: string }).id;
    const list = await s.call("GET", "/share/share-1/blessings", undefined, { "x-page-password": "lotus" });
    assert.equal((list.json.blessings as unknown[]).length, 1);
    const hide = await s.call("PATCH", `/p1/blessings/${bid}`, { approved: false }, { "x-test-user": "owner1" });
    assert.equal(hide.status, 200);
    const after = await s.call("GET", "/share/share-1/blessings", undefined, { "x-page-password": "lotus" });
    assert.equal((after.json.blessings as unknown[]).length, 0);
  });

  it("404s an unknown invitation", async () => {
    assert.equal((await s.call("POST", "/share/nope/rsvp", { guestName: "A", attending: "yes" })).status, 404);
  });
});

describe("wedding guests: rate limit", () => {
  it("caps RSVPs per IP + page", async () => {
    const w = world("wedding-invitation");
    const s = await serve("wedding-invitation", w);
    try {
      const codes: number[] = [];
      for (let i = 0; i < 14; i++) codes.push((await s.call("POST", "/share/share-1/rsvp", { guestName: `G${i}`, attending: "no" })).status);
      assert.equal(codes.filter((c) => c === 201).length, 12);
      assert.equal(codes.at(-1), 429);
      // A different page is a different bucket.
      assert.equal((await s.call("POST", "/share/other/rsvp", { guestName: "G", attending: "no" })).status, 404);
    } finally {
      s.server.close();
    }
  });
});
