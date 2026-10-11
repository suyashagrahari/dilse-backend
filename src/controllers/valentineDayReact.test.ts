import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import type mongoose from "mongoose";
import { makeValentineDayController, projectValentineShared } from "./valentineDayPage.controller";
import type { IValentineDayPage } from "../models/ValentineDayPage";

/**
 * The react beacon, end to end through the handler, against an in-memory
 * stand-in for the day's model. The stand-in implements exactly the Mongo
 * semantics the handler relies on: `{ "reactions.x": null }` matches a missing
 * or null field, and `modifiedCount` reports whether the write landed.
 */
function fakeModel(doc: Record<string, unknown>) {
  const get = (path: string) => path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], doc);
  const setPath = (path: string, v: unknown) => {
    const keys = path.split(".");
    let o = doc as Record<string, unknown>;
    for (const k of keys.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>;
    o[keys[keys.length - 1]] = v;
  };
  const matches = (filter: Record<string, unknown>) =>
    Object.entries(filter).every(([k, v]) => {
      if (k === "_id") return true;
      const cur = get(k);
      return v === null ? cur === null || cur === undefined : cur === v;
    });
  return {
    findOne: (filter: Record<string, unknown>) => ({
      select: async () => (matches({ shareId: filter.shareId, isPublished: true }) ? doc : null),
    }),
    updateOne: async (filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
      if (!matches(filter)) return { modifiedCount: 0 };
      for (const [k, v] of Object.entries(update.$set)) setPath(k, v);
      return { modifiedCount: 1 };
    },
  } as unknown as mongoose.Model<IValentineDayPage>;
}

function call(handler: (req: Request, res: Response) => Promise<void>, body: unknown, userId?: string) {
  return new Promise<{ status: number; json: Record<string, unknown> }>((resolve) => {
    let status = 200;
    const res = {
      status(s: number) { status = s; return this; },
      json(j: Record<string, unknown>) { resolve({ status, json: j }); return this; },
    } as unknown as Response;
    const req = { params: { shareId: "share-1" }, body, userId } as unknown as Request;
    void handler(req, res);
  });
}

const flush = () => new Promise((r) => setTimeout(r, 10));

function setup(slug: "happy-propose-day" | "happy-rose-day" | "dandiya-partner", extras: Record<string, unknown> = {}) {
  const doc: Record<string, unknown> = {
    _id: "p1", userId: "owner-1", shareId: "share-1", isPublished: true,
    recipientName: "Ishita", senderName: "Kabir", extras: { question: "Will you be mine, forever? 💍", ...extras }, reactions: {},
  };
  const emails: Record<string, unknown>[] = [];
  const c = makeValentineDayController(slug, {
    model: fakeModel(doc),
    findOwnerEmail: async () => "owner@example.com",
    sendAnswerEmail: async (o) => { emails.push(o); },
    buildShareUrl: async (id) => `https://example.test/${id}`,
  });
  return { doc, emails, c };
}

describe("valentine react beacon", () => {
  it("rejects unknown events", async () => {
    const { c } = setup("happy-propose-day");
    assert.equal((await call(c.react, { event: "hacked" })).status, 400);
  });

  it("opened is recorded once; replays change nothing", async () => {
    const { c, doc } = setup("happy-rose-day");
    const first = await call(c.react, { event: "opened" });
    assert.equal(first.json.recorded, true);
    const at = (doc.reactions as Record<string, unknown>).openedAt;
    assert.ok(at instanceof Date);
    const again = await call(c.react, { event: "opened" });
    assert.equal(again.json.recorded, false);
    assert.equal((doc.reactions as Record<string, unknown>).openedAt, at);
  });

  it("answered: first wins, the owner is emailed exactly once, dodges kept from the first", async () => {
    const { c, doc, emails } = setup("happy-propose-day");
    assert.equal((await call(c.react, { event: "answered", noDodges: 4 })).json.recorded, true);
    assert.equal((await call(c.react, { event: "answered", noDodges: 0 })).json.recorded, false);
    await flush();
    const r = doc.reactions as Record<string, unknown>;
    assert.equal(r.answer, "yes");
    assert.equal(r.noDodges, 4);
    assert.equal(emails.length, 1);
    assert.equal(emails[0].noDodges, 4);
    assert.equal(emails[0].dayName, "Propose Day");
    assert.equal(emails[0].question, "Will you be mine, forever? 💍");
  });

  it("a day that asks no question records an answer but sends no email", async () => {
    const { c, emails } = setup("happy-rose-day");
    assert.equal((await call(c.react, { event: "answered" })).json.recorded, true);
    await flush();
    assert.equal(emails.length, 0);
  });

  it("answer no: refused on a yes-only page (the default), nothing written", async () => {
    const { c, doc, emails } = setup("dandiya-partner");
    const r = await call(c.react, { event: "answered", answer: "no", noDodges: 4 });
    assert.equal(r.status, 400);
    await flush();
    assert.equal((doc.reactions as Record<string, unknown>).answer, undefined);
    assert.equal(emails.length, 0);
    // An explicit yesOnly page refuses it too; a yes still lands.
    const y = setup("dandiya-partner", { answerMode: "yesOnly" });
    assert.equal((await call(y.c.react, { event: "answered", answer: "no" })).status, 400);
    assert.equal((await call(y.c.react, { event: "answered", answer: "yes" })).json.recorded, true);
  });

  it("answer no on a noAfterTries page: recorded once, gentle email, and a later yes cannot flip it", async () => {
    const { c, doc, emails } = setup("dandiya-partner", { answerMode: "noAfterTries", noTries: "5" });
    assert.equal((await call(c.react, { event: "answered", answer: "no", noDodges: 5 })).json.recorded, true);
    assert.equal((await call(c.react, { event: "answered", answer: "yes" })).json.recorded, false);
    await flush();
    const r = doc.reactions as Record<string, unknown>;
    assert.equal(r.answer, "no");
    assert.ok(r.answeredAt instanceof Date);
    assert.equal(r.noDodges, 5);
    assert.equal(emails.length, 1);
    assert.equal(emails[0].answer, "no");
  });

  it("first write wins the other way too: yes, then no changes nothing", async () => {
    const { c, doc } = setup("dandiya-partner", { answerMode: "noAfterTries" });
    assert.equal((await call(c.react, { event: "answered" })).json.recorded, true);
    assert.equal((await call(c.react, { event: "answered", answer: "no" })).json.recorded, false);
    assert.equal((doc.reactions as Record<string, unknown>).answer, "yes");
  });

  it("an unknown answer is a 400", async () => {
    const { c } = setup("dandiya-partner", { answerMode: "noAfterTries" });
    assert.equal((await call(c.react, { event: "answered", answer: "maybe" })).status, 400);
  });

  it("the owner opening their own link is not a reaction", async () => {
    const { c, doc } = setup("happy-propose-day");
    const r = await call(c.react, { event: "opened" }, "owner-1");
    assert.equal(r.json.recorded, false);
    assert.equal((doc.reactions as Record<string, unknown>).openedAt, undefined);
  });

  it("the response never echoes reactions, and the shared projection strips them", async () => {
    const { c } = setup("happy-propose-day");
    const r = await call(c.react, { event: "completed", count: 14 });
    assert.equal("reactions" in r.json, false);
    const shared = projectValentineShared({ a: 1, reactions: { answer: "yes" }, password: "h", passwordRaw: "p", userId: "owner-1" });
    assert.deepEqual(shared, { a: 1 });
    // A stranger signed in as someone else gets the same.
    assert.deepEqual(projectValentineShared({ a: 1, reactions: { answer: "no" }, userId: "owner-1" }, { viewerId: "someone" }), { a: 1 });
  });

  it("the signed-in owner gets an ownerView (answer + when), never the rest of the reactions", () => {
    const at = new Date("2026-10-11T10:00:00Z");
    const shared = projectValentineShared(
      { a: 1, reactions: { answer: "no", answeredAt: at, noDodges: 4, reply: { text: "x" }, openedAt: at }, userId: "owner-1" },
      { viewerId: "owner-1" },
    );
    assert.deepEqual(shared, { a: 1, ownerView: { openedAt: at, answer: "no", answeredAt: at, noDodges: 4 } });
  });
});
