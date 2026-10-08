import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import type mongoose from "mongoose";
import { makeValentineDayController, projectValentineShared } from "./valentineDayPage.controller";
import type { IValentineDayPage } from "../models/ValentineDayPage";
import type { ValentineDaySlug } from "../config/valentineDays";

const NOW = new Date("2027-02-10T12:00:00.000Z");
const FUTURE = "2027-02-14T00:00:00.000Z";
const PAST = "2027-02-01T00:00:00.000Z";

function premiumDoc(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: "p1",
    userId: "owner-1",
    shareId: "share-1",
    day: "happy-hug-day-premium",
    recipientName: "Ishita",
    senderName: "Kabir",
    petName: "Ishu",
    letter: "the whole letter",
    photos: [{ url: "https://cdn.x/1.webp" }],
    gifs: { "ph1-window": "" },
    music: true,
    musicMode: "youtube",
    musicYoutubeId: "2Vv-BfVoq4g",
    musicStart: 0,
    endLine: "the end line",
    extras: { cafeSign: "secret" },
    premium: {
      voiceNote: "https://cdn.x/v.webm",
      voiceNoteSec: 12,
      voicePeaks: [1, 2],
      voiceCaption: "press play",
      songDropAt: 30,
      unlockAt: FUTURE,
      unlockTz: "Asia/Kolkata",
      allowReply: true,
      psLetter: "open only if",
    },
    reactions: {},
    password: "hash",
    passwordRaw: "raw",
    viewCount: 3,
    isPublished: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe("projectValentineShared — premium", () => {
  it("a sealed page gives a stranger only the teaser", () => {
    const out = projectValentineShared(premiumDoc(), { now: NOW });
    assert.deepEqual(out, {
      _id: "p1",
      shareId: "share-1",
      day: "happy-hug-day-premium",
      recipientName: "Ishita",
      senderName: "Kabir",
      petName: "Ishu",
      isPublished: true,
      createdAt: NOW,
      locked: true,
      premium: { unlockAt: FUTURE, unlockTz: "Asia/Kolkata" },
    });
    const json = JSON.stringify(out);
    for (const secret of ["the whole letter", "cdn.x", "secret", "2Vv-BfVoq4g", "the end line", "press play", "open only if", "hash", "raw"]) {
      assert.equal(json.includes(secret), false, secret);
    }
    // Another signed-in user is still a stranger.
    assert.equal(projectValentineShared(premiumDoc(), { now: NOW, viewerId: "someone-else" }).locked, true);
  });

  it("the owner sees the full page before the unlock; everyone sees it after", () => {
    const owner = projectValentineShared(premiumDoc(), { now: NOW, viewerId: "owner-1" });
    assert.equal(owner.letter, "the whole letter");
    assert.equal(owner.locked, false);
    assert.equal(owner.replySent, false);

    const opened = projectValentineShared(premiumDoc({ premium: { ...(premiumDoc().premium as object), unlockAt: PAST } }), { now: NOW });
    assert.equal(opened.letter, "the whole letter");
    assert.equal((opened.premium as Record<string, unknown>).psLetter, "open only if");
    for (const k of ["reactions", "password", "passwordRaw", "userId"]) assert.equal(k in opened, false, k);
  });

  it("replySent is the only reaction bit a recipient sees", () => {
    const out = projectValentineShared(
      premiumDoc({ premium: { unlockAt: "" }, reactions: { reply: { text: "private", at: NOW }, answer: "yes" } }),
      { now: NOW }
    );
    assert.equal(out.replySent, true);
    assert.equal(JSON.stringify(out).includes("private"), false);
  });

  it("a $2 page is unchanged — no premium, locked or replySent keys added", () => {
    const base = premiumDoc({ day: "happy-hug-day", premium: undefined, reactions: { reply: { text: "x", at: NOW } } });
    delete base.premium;
    const { reactions: _r, password: _p, passwordRaw: _pr, userId: _u, ...expected } = base;
    assert.deepEqual(projectValentineShared(base, { now: NOW }), expected);
    const out = projectValentineShared(base, { now: NOW });
    for (const k of ["premium", "locked", "replySent"]) assert.equal(k in out, false, k);
    // Even a $2 doc that somehow carried an unlockAt is never withheld.
    assert.equal(projectValentineShared({ ...base, premium: { unlockAt: FUTURE } }, { now: NOW }).letter, "the whole letter");
  });
});

// ── The handlers, against an in-memory model ─────────────────────────────────

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
  const created: Record<string, unknown>[] = [];
  const model = {
    created,
    create: async (d: Record<string, unknown>) => { created.push(d); return d; },
    findOne: (filter: Record<string, unknown>) => ({
      select: async () => (matches({ shareId: filter.shareId, isPublished: true }) ? doc : null),
    }),
    findOneAndUpdate: async (filter: Record<string, unknown>) =>
      matches({ shareId: filter.shareId, isPublished: true }) ? { ...doc, toObject: () => ({ ...doc }) } : null,
    updateOne: async (filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
      if (!matches(filter)) return { modifiedCount: 0 };
      for (const [k, v] of Object.entries(update.$set)) setPath(k, v);
      return { modifiedCount: 1 };
    },
  };
  return model;
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

function setup(slug: ValentineDaySlug, over: Record<string, unknown> = {}) {
  const doc = premiumDoc({ day: slug, ...over });
  const emails: Record<string, unknown>[] = [];
  const model = fakeModel(doc);
  const c = makeValentineDayController(slug, {
    model: model as unknown as mongoose.Model<IValentineDayPage>,
    findOwnerEmail: async () => "owner@example.com",
    sendAnswerEmail: async () => {},
    sendReplyEmail: async (o) => { emails.push(o); },
    buildShareUrl: async (id) => `https://example.test/${id}`,
    uploadAudio: async (_b, mime, folder) => ({ url: `https://cdn.test/${folder}/v.${mime.split("/")[1]}` }),
    now: () => NOW,
  });
  return { doc, emails, c, model };
}

const opened = (p: Partial<Record<string, unknown>> = {}) => ({ premium: { ...(premiumDoc().premium as object), unlockAt: PAST, ...p } });

describe("premium reply handler", () => {
  it("a $2 controller has no reply handler", () => {
    for (const slug of ["happy-hug-day", "happy-halloween", "happy-rose-day"] as const) {
      assert.equal(setup(slug).c.reply, undefined, slug);
    }
    assert.equal(typeof setup("happy-hug-day-premium").c.reply, "function");
  });

  it("first reply is recorded and emails the owner once; a second is not", async () => {
    const { c, doc, emails } = setup("happy-hug-day-premium", opened());
    const first = await call(c.reply!, { text: "  thank you\r\n\r\n\r\nso much ‮" });
    assert.equal(first.status, 200);
    assert.deepEqual(first.json, { success: true, recorded: true });
    const second = await call(c.reply!, { text: "overwrite?" });
    assert.deepEqual(second.json, { success: true, recorded: false });
    await flush();
    const reply = (doc.reactions as Record<string, unknown>).reply as Record<string, unknown>;
    assert.equal(reply.text, "thank you\n\nso much");
    assert.equal(reply.at, NOW);
    assert.equal(emails.length, 1);
    assert.equal(emails[0].reply, "thank you\n\nso much");
    assert.equal(emails[0].dayName, "Hug Day");
    assert.equal(emails[0].slug, "happy-hug-day-premium");
    assert.equal(emails[0].to, "owner@example.com");
  });

  it("an empty reply is a 400 and writes nothing", async () => {
    const { c, doc } = setup("happy-hug-day-premium", opened());
    assert.equal((await call(c.reply!, { text: " ​\n " })).status, 400);
    assert.equal((await call(c.reply!, {})).status, 400);
    assert.equal((doc.reactions as Record<string, unknown>).reply, undefined);
  });

  it("a sealed page refuses with 403", async () => {
    const { c, doc } = setup("happy-hug-day-premium");
    assert.equal((await call(c.reply!, { text: "hi" })).status, 403);
    assert.equal((doc.reactions as Record<string, unknown>).reply, undefined);
  });

  it("replies switched off refuse with 403", async () => {
    const { c, emails } = setup("happy-hug-day-premium", opened({ allowReply: false }));
    assert.equal((await call(c.reply!, { text: "hi" })).status, 403);
    await flush();
    assert.equal(emails.length, 0);
  });

  it("the owner replying to themself is not recorded", async () => {
    const { c, doc } = setup("happy-hug-day-premium", opened());
    const r = await call(c.reply!, { text: "testing" }, "owner-1");
    assert.deepEqual(r.json, { success: true, recorded: false, reason: "owner" });
    assert.equal((doc.reactions as Record<string, unknown>).reply, undefined);
  });

  it("an unpublished page is a 404", async () => {
    const { c } = setup("happy-hug-day-premium", { ...opened(), isPublished: false });
    assert.equal((await call(c.reply!, { text: "hi" })).status, 404);
  });
});

describe("premium getShared + create", () => {
  it("getShared withholds a sealed page from a stranger, not from the owner", async () => {
    const { c } = setup("happy-hug-day-premium");
    const stranger = await call(c.getShared, undefined);
    assert.equal((stranger.json.data as Record<string, unknown>).locked, true);
    assert.equal("letter" in (stranger.json.data as Record<string, unknown>), false);
    const owner = await call(c.getShared, undefined, "owner-1");
    assert.equal((owner.json.data as Record<string, unknown>).letter, "the whole letter");
  });

  it("create writes `premium` only on a premium slug, uploading a voice data URL", async () => {
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(32, 1)]).toString("base64");
    const p = setup("happy-hug-day-premium");
    await call(p.c.create, { letter: "x".repeat(4000), premium: { voiceNote: `data:audio/webm;base64,${webm}`, psLetter: "ps", unlockAt: FUTURE } }, "u9");
    const made = p.model.created[0];
    assert.equal((made.letter as string).length, 3000);
    const prem = made.premium as Record<string, unknown>;
    assert.equal(prem.voiceNote, "https://cdn.test/happy-hug-day-premium/users/u9/voice/v.webm");
    assert.equal(prem.psLetter, "ps");
    assert.equal(prem.unlockAt, FUTURE);

    const base = setup("happy-hug-day");
    await call(base.c.create, { letter: "x".repeat(4000), premium: { psLetter: "sneaky" } }, "u9");
    const plain = base.model.created[0];
    assert.equal("premium" in plain, false);
    assert.equal((plain.letter as string).length, 1500);
  });
});
