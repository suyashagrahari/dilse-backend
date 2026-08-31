// ─── The owner changing their own page's password ────────────────────────────
//
// A share password is the thing standing between a link and the page behind it.
// Until now the only ways to change one were to reopen the template's builder and
// re-save, or to ask a super admin. Neither is a thing to ask of somebody who
// just wants to rotate the word they gave the wrong cousin.
//
// ── WHY A DEDICATED ENDPOINT AND NOT THE TEMPLATE'S OWN PUT ─────────────────
//
// Every template's `PUT /:id` already accepts a `password` field, so this looked
// like it needed no server work at all. Two reasons it does:
//
//   1. Those routes now sit behind `requireTemplateAccess`. A template that gets
//      switched off — a seasonal page after its season — would take its owners'
//      ability to manage their own published pages with it. Reads and the
//      recipient's routes were deliberately left open for exactly that reason
//      (see `middleware/templateGate`); this belongs on the same side of the
//      line. A page you already own and have already shared must stay
//      manageable.
//   2. `PUT /:id` is the content endpoint. Sending it a lone `password` field
//      means every one of 43 controllers has to be trusted not to treat absent
//      fields as deletions. One narrow endpoint that touches one field is a much
//      smaller thing to be sure about.
//
// ── WHY THERE IS NO AUDIT ENTRY ─────────────────────────────────────────────
//
// The audit log records privileged actions taken BY staff ON someone. This is a
// person changing their own password on their own page, which is ordinary use.
// The super-admin equivalent in `superAdmin.controller.ts` is audited because
// there the actor and the owner are different people.

import { Request, Response } from "express";
import mongoose from "mongoose";
import {
  templateByType,
  supportsPassword,
  supportsPasswordRaw,
} from "../services/templateRegistry";

/** Matches the super-admin path's limit, so the two cannot disagree. */
const MAX_LENGTH = 128;

/**
 * Long enough to be worth having, short enough not to annoy.
 *
 * The builders themselves accept anything, so an existing page may carry a
 * one-character password. That is not retroactively rejected — this only governs
 * what may be set from here, and a floor of four keeps somebody from replacing a
 * real password with "1" while believing the page is still protected.
 */
const MIN_LENGTH = 4;

/**
 * PUT /api/my-pages/:templateType/:pageId/password
 *
 * `{ password: "sunflower" }` sets it. `{ password: "" }` removes it, and the
 * page then opens for anyone with the link.
 */
export const setMyPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const templateType = String(req.params.templateType || "").trim();
    const pageId = String(req.params.pageId || "").trim();

    const entry = templateByType(templateType);
    if (!entry) {
      res.status(404).json({ success: false, error: "Unknown template" });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(pageId)) {
      res.status(400).json({ success: false, error: "Invalid pageId" });
      return;
    }
    if (!supportsPassword(entry)) {
      res.status(400).json({
        success: false,
        error: `"${entry.label}" pages do not use a password.`,
      });
      return;
    }

    // Ownership is the whole authorisation story here, and it is expressed in the
    // query rather than checked afterwards — so there is no path that loads
    // somebody else's page and then decides what to do about it.
    const doc = await entry.model.findOne({
      _id: new mongoose.Types.ObjectId(pageId),
      userId: new mongoose.Types.ObjectId(String(req.userId)),
    });

    // 404 and not 403: telling a caller that a page exists but is not theirs
    // confirms the id. They cannot act on it either way.
    if (!doc) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    const raw = typeof req.body?.password === "string" ? req.body.password.trim() : "";
    const clearing = raw === "";

    if (!clearing) {
      if (raw.length < MIN_LENGTH) {
        res.status(400).json({
          success: false,
          error: `Password must be at least ${MIN_LENGTH} characters.`,
        });
        return;
      }
      if (raw.length > MAX_LENGTH) {
        res.status(400).json({ success: false, error: `Password is too long (max ${MAX_LENGTH}).` });
        return;
      }
    }

    const d = doc as unknown as Record<string, unknown>;

    if (clearing) {
      d.password = "";
      // ── Why passwordRaw has to be cleared by hand ─────────────────────────
      //
      // The model's pre-save hook is `if (isModified("password") && this.password)`.
      // Setting the password to "" fails the second half, so the hook does not
      // run — and `passwordRaw` keeps the OLD plaintext. The page would open
      // without a password while still storing the last one in the clear.
      if (supportsPasswordRaw(entry)) d.passwordRaw = "";
    } else {
      // Assign and save so the pre-save hook hashes it. Writing through
      // `updateOne` would store the plaintext as though it were a hash, and every
      // later unlock attempt would then bcrypt-compare against it and fail.
      d.password = raw;
    }

    await doc.save();

    res.json({
      success: true,
      data: { hasPassword: !clearing, passwordRaw: clearing ? "" : raw },
      message: clearing
        ? "Password removed — anyone with the link can open this page."
        : "Password updated.",
    });
  } catch (error) {
    console.error("Set my page password error:", error);
    res.status(500).json({ success: false, error: "Could not update the password" });
  }
};
