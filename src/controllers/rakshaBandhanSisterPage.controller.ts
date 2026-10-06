import { Request, Response } from "express";
import RakshaBandhanSisterPage from "../models/RakshaBandhanSisterPage";
import type {
  IMemory,
  IAccount,
  IAccountRow,
  ILifafa,
  RakhiStyle,
} from "../models/RakshaBandhanSisterPage";
import { checkPublishAccess } from "../services/publishGate.service";
import { transformMediaPayload } from "../services/mediaProcessor.service";

/**
 * The five rakhi ids the client offers her, mirrored from `RAKHI_STYLES` in
 * client/app/(templates)/happy-rakshabandhan-to-sister/components/types.ts.
 *
 * Kept as an allow-list rather than a mongoose enum because the field's resting
 * state is "" (she has not tied one yet) — see the note on the model. Anything
 * off this list is dropped and the reply is still saved: an unrecognised id is a
 * client that has drifted, and refusing her words over a thread colour would be
 * the wrong trade.
 */
const RAKHI_STYLE_IDS: RakhiStyle[] = ["phool", "chandan", "nazar", "moti", "kalava"];

const MAX_MEMORIES = 12;
/**
 * Per side of the statement, not for both together.
 *
 * The screen is designed around two rows for her and three for him, and that
 * asymmetry is deliberate — equal columns read as a scorecard. It is NOT enforced
 * here, though. A cap that truncated his fourth row would silently delete
 * something a brother had typed and watched appear in his own preview, and the
 * cost of the layout absorbing one extra line is nothing next to that. This
 * number exists to bound the document, not to police the design.
 */
const MAX_ACCOUNT_ROWS = 6;
const MAX_GREETING_LINES = 6;
const MAX_VOW_LINES = 8;
/**
 * Her reply is longer than his brother-template counterpart's 120 characters on
 * purpose. There, the sister receives a promise, which is one line by nature.
 * Here she is answering a letter, and a letter answered in a tweet reads as a
 * shrug. It is still a note and not an essay — the reply renders inside a
 * fixed card on the last screen.
 */
const MAX_REPLY = 400;

function str(input: unknown, max: number): string {
  return typeof input === "string" ? input.slice(0, max) : "";
}

function sanitizeGreeting(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((l) => str(l, 200))
    .filter((l) => l.trim().length > 0)
    .slice(0, MAX_GREETING_LINES);
}

function sanitizeVow(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((l) => str(l, 200))
    .filter((l) => l.trim().length > 0)
    .slice(0, MAX_VOW_LINES);
}

/**
 * The envelope: a figure and a line, and deliberately no payment rail.
 *
 * `upiId` and `qrImageUrl` used to be read here and are gone from the model. Any
 * such key in the body is now dropped on the floor by this whitelist, which is
 * the behaviour we want — the money on this template flows FROM the builder TO
 * the reader, and a UPI QR or `upi://pay` link encodes a PAYEE, so either handle
 * would be wrong on her page. See the `Lifafa` interface in the client's
 * `components/types.ts`. Do not add them back.
 */
function sanitizeLifafa(input: unknown): ILifafa {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    // A string, not a number: the shagun figures are "501"/"1100"/"5001" and
    // some brothers write words. Parsing would drop the digit that matters.
    amount: str(o.amount, 24).trim(),
    note: str(o.note, 200),
  };
}

function sanitizeAccountRows(input: unknown): IAccountRow[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((r) => {
      const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      return { label: str(o.label, 60), value: str(o.value, 40) };
    })
    // A row with no label is half a line of a ledger and renders as a stray
    // figure with nothing to attach it to. A row with a label and no value is
    // fine — the screen prints the dots and stops, which reads as unpayable.
    .filter((r) => r.label.trim().length > 0)
    .slice(0, MAX_ACCOUNT_ROWS);
}

/**
 * The two columns are sanitized independently and neither is allowed to inherit
 * the other's rows. If the body sends only one side — an older client, a partial
 * save — the missing side comes back empty rather than mirrored, because a
 * statement showing her column twice would be exactly the scorecard this screen
 * was built to avoid.
 */
function sanitizeAccount(input: unknown): IAccount {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    sheOwes: sanitizeAccountRows(o.sheOwes),
    heOwes: sanitizeAccountRows(o.heOwes),
  };
}

function sanitizeMemories(input: unknown): IMemory[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((m) => {
      const o = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
      return {
        imageUrl: str(o.imageUrl, 600),
        caption: str(o.caption, 200),
        year: str(o.year, 8),
      };
    })
    // A memory IS its photograph; a caption with no image renders an empty frame.
    .filter((m) => m.imageUrl.trim().length > 0)
    .slice(0, MAX_MEMORIES);
}

function buildContent(b: Record<string, unknown>) {
  return {
    sisterName: str(b.sisterName, 120),
    brotherName: str(b.brotherName, 120),
    // `!== false` and not `Boolean(...)`: a body from an older client, or one
    // that simply omits the toggle, has `undefined` here, and elder is the safe
    // reading — `Boolean(undefined)` would demote every such page's didi to
    // behna. The client's `dbToSisterData` resolves it the same way.
    sisterIsElder: b.sisterIsElder !== false,
    photoUrl: str(b.photoUrl, 600),
    greeting: sanitizeGreeting(b.greeting),
    vow: sanitizeVow(b.vow),
    vowSince: str(b.vowSince, 120),
    lifafa: sanitizeLifafa(b.lifafa),
    account: sanitizeAccount(b.account),
    memories: sanitizeMemories(b.memories),
    letter: str(b.letter, 2000),
    festivalDate: /^\d{4}-\d{2}-\d{2}$/.test(String(b.festivalDate || ""))
      ? String(b.festivalDate)
      : "2026-08-28",
  };
}

export const createRakshaBandhanSisterPage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const content = buildContent(await transformMediaPayload(req.body || {}, { template: "raksha-bandhan-sister", userId: req.userId }));
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const page = await RakshaBandhanSisterPage.create({
      userId: req.userId,
      ...content,
      password,
    });
    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create raksha bandhan sister page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyRakshaBandhanSisterPages = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const pages = await RakshaBandhanSisterPage.find({ userId: req.userId }).sort({
      updatedAt: -1,
    });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my raksha bandhan sister pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getRakshaBandhanSisterPage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const page = await RakshaBandhanSisterPage.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }
    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get raksha bandhan sister page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateRakshaBandhanSisterPage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const page = await RakshaBandhanSisterPage.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const b = (await transformMediaPayload(req.body || {}, { template: "raksha-bandhan-sister", userId: req.userId })) as Record<string, unknown>;
    const content = buildContent(b);
    page.sisterName = content.sisterName;
    page.brotherName = content.brotherName;
    page.sisterIsElder = content.sisterIsElder;
    page.photoUrl = content.photoUrl;
    page.greeting = content.greeting;
    page.vow = content.vow;
    page.vowSince = content.vowSince;
    page.lifafa = content.lifafa;
    page.account = content.account;
    page.memories = content.memories;
    page.letter = content.letter;
    page.festivalDate = content.festivalDate;
    if (typeof b.password === "string" && b.password !== "") page.password = b.password;

    // `reply` and `rakhiPicked` are intentionally NOT settable here. They are
    // his sister's, they arrive through the public share route, and his editor
    // never loaded them — so an owner-side write would not merely let him
    // rewrite her answer, it would blank it on the very next save. The client's
    // `sisterDataToBody` omits them for the same reason; this is the half of
    // that rule that a modified request body cannot get around.

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update raksha bandhan sister page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishRakshaBandhanSisterPage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const page = await RakshaBandhanSisterPage.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({ req,
      userId: String(req.userId),
      templateType: "raksha-bandhan-sister",
      pageId: String(page._id),
      isAlreadyPublished: !!page.isPublished,
    });
    if (!gate.allowed) {
      res.status(gate.httpStatus).json({ success: false, error: gate.error, pricing: gate.pricing });
      return;
    }

    page.isPublished = true;
    await page.save();

    const { buildShareUrl } = await import("../utils/shareUrl");
    const shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    res.json({ success: true, data: { shareId: page.shareId, shareUrl } });
  } catch (error) {
    console.error("Publish raksha bandhan sister page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedRakshaBandhanSisterPage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const page = await RakshaBandhanSisterPage.findOne({
      shareId: req.params.shareId,
      isPublished: true,
    });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({
      success: true,
      data: safeData,
      hasPassword: !!page.password,
      templateType: "raksha-bandhan-sister",
    });
  } catch (error) {
    console.error("Get shared raksha bandhan sister page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyRakshaBandhanSisterPagePassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await RakshaBandhanSisterPage.findOne({
      shareId: req.params.shareId,
      isPublished: true,
    });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(password || "");
    if (match) res.json({ success: true, verified: true });
    else res.status(401).json({ success: false, verified: false, error: "Wrong password" });
  } catch (error) {
    console.error("Verify raksha bandhan sister page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

/**
 * POST /raksha-bandhan-sister-pages/share/:shareId/reply — PUBLIC.
 *
 * His sister is not a user of this site and should not have to become one to
 * answer him. So this route is unauthenticated, and its safety comes entirely
 * from being as narrow as it is possible to make it:
 *
 *   • addressed only by the unguessable shareId, on a published page
 *   • writes exactly two fields — her note, capped at 400 characters, and the id
 *     of the rakhi she tied, which must be one of five known strings
 *   • WRITE-ONCE — a filled reply is never overwritten
 *
 * The write-once rule is what stops the obvious abuse: without it, anyone with
 * the link could replace her answer with anything they liked, and he would have
 * no way of knowing it had changed. It is checked against the STORED value
 * rather than a client flag, because the client is the thing being defended
 * against.
 *
 * `rakhiPicked` is written in the same call and under the same rule, which is
 * also why it is not a route of its own: which rakhi she chose and what she
 * wrote are one act on her screen, and two endpoints would leave a page that
 * had a tied rakhi and no reply, or the reverse, whenever a request dropped.
 */
export const submitSisterReply = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await RakshaBandhanSisterPage.findOne({
      shareId: req.params.shareId,
      isPublished: true,
    });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (page.reply && page.reply.trim().length > 0) {
      // Not an error from her side — she simply already answered. Returning the
      // stored reply, and the rakhi stored with it, lets the client render what
      // she wrote rather than a failure she cannot act on.
      res.json({
        success: true,
        data: { reply: page.reply, rakhiPicked: page.rakhiPicked, alreadySubmitted: true },
      });
      return;
    }

    const b = (req.body || {}) as Record<string, unknown>;
    const reply = str(b.reply, MAX_REPLY).trim();
    if (!reply) { res.status(400).json({ success: false, error: "Nothing to save" }); return; }

    // An unrecognised id is dropped rather than stored or rejected: the rakhi is
    // decoration on his side of the page and her words are the payload, so a
    // client that has drifted should still not cost her the reply. `rakhiStyle()`
    // on the client falls back to the first style for an empty value.
    const picked = str(b.rakhiPicked, 40).trim() as RakhiStyle;
    if (RAKHI_STYLE_IDS.includes(picked)) page.rakhiPicked = picked;

    page.reply = reply;
    page.replyAt = new Date();
    await page.save();

    res.json({
      success: true,
      data: { reply: page.reply, rakhiPicked: page.rakhiPicked, alreadySubmitted: false },
    });
  } catch (error) {
    console.error("Submit sister reply error:", error);
    res.status(500).json({ success: false, error: "Failed to save reply" });
  }
};

export const deleteRakshaBandhanSisterPage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const page = await RakshaBandhanSisterPage.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete raksha bandhan sister page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
