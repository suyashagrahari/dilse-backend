// ─── /admin/super/prospects/proofs — traction screenshots for outreach ───────
//
//   GET    /prospects/proofs             list (confirmed + waiting for confirmation)
//   POST   /prospects/proofs/upload      multipart "file" (+ optional replaceId):
//                                        sniff → strip/resize → S3 → vision reads
//                                        the numbers. Saved NOT active: nothing
//                                        is usable until the admin confirms.
//   PATCH  /prospects/proofs/:id         confirm / edit {source, periodLabel,
//                                        stats, caption, isDefault} → active
//   DELETE /prospects/proofs/:id         row + S3 object
//
// See services/outreachProof.service.ts and docs/influencer-prospects.md.

import { Request, Response } from "express";
import mongoose from "mongoose";
import OutreachProof, { type IOutreachProof } from "../models/OutreachProof";
import { audit } from "../services/adminAudit";
import {
  ProofInputError,
  extractProofStats,
  isProofKey,
  parseProofInput,
  processProofImage,
  proofAllowedNumbers,
  quotableStats,
  s3ProofStore,
  storeProofImage,
  type ExtractedProof,
  type ProofSnapshot,
  type ProofStore,
} from "../services/outreachProof.service";
import type { VisionCompletion } from "../services/prospectModel.service";
import { visionCompletion } from "../services/prospectModel.service";
import { env } from "../config/env";

const oid = (v: unknown) => (mongoose.Types.ObjectId.isValid(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null);

export function shapeProof(p: IOutreachProof) {
  return {
    id: String(p._id),
    imageUrl: p.imageUrl,
    width: p.imageWidth || 0,
    height: p.imageHeight || 0,
    source: p.source,
    periodLabel: p.periodLabel,
    stats: (p.stats || []).map((s) => ({ label: s.label, value: s.value })),
    /** What an email may quote (counts only). */
    quotable: quotableStats(p.stats || []).map((s) => s.value),
    caption: p.caption,
    isDefault: !!p.isDefault,
    active: !!p.active,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** The snapshot drafting / sending uses. */
export function proofSnapshot(p: IOutreachProof): ProofSnapshot {
  return {
    id: String(p._id),
    imageUrl: p.imageUrl,
    source: p.source,
    periodLabel: p.periodLabel,
    stats: (p.stats || []).map((s) => ({ label: s.label, value: s.value })),
    width: p.imageWidth || undefined,
    height: p.imageHeight || undefined,
  };
}

/** Injected in tests: the S3 store and the vision model. */
export const proofDeps: { store: ProofStore; vision: VisionCompletion } = { store: s3ProofStore, vision: visionCompletion };

/** GET /admin/super/prospects/proofs */
export const listProofs = async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await OutreachProof.find({}).sort({ isDefault: -1, active: -1, createdAt: -1 }).limit(50);
    res.json({ success: true, data: { proofs: rows.map(shapeProof), visionConfigured: !!env.OPENAI_API_KEY } });
  } catch (error) {
    console.error("List proofs error:", (error as Error)?.message);
    res.status(500).json({ success: false, error: "Could not load the screenshots" });
  }
};

/** POST /admin/super/prospects/proofs/upload — multipart file, optional replaceId */
export const uploadProof = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = (req as Request & { file?: { buffer: Buffer } }).file;
    if (!file?.buffer?.length) {
      res.status(400).json({ success: false, error: "Choose a screenshot to upload." });
      return;
    }
    const replaceId = req.body?.replaceId ? oid(req.body.replaceId) : null;
    const existing = replaceId ? await OutreachProof.findById(replaceId) : null;
    if (req.body?.replaceId && !existing) {
      res.status(404).json({ success: false, error: "That screenshot no longer exists." });
      return;
    }

    const img = await processProofImage(file.buffer);
    const stored = await storeProofImage(img, proofDeps.store);
    const extracted: ExtractedProof = env.OPENAI_API_KEY
      ? await extractProofStats(img, proofDeps.vision)
      : { source: "other", periodLabel: "", stats: [], caption: "", notes: "AI is off on this server (no OPENAI_API_KEY) — type the numbers in." };

    let proof: IOutreachProof;
    if (existing) {
      const oldKey = existing.imageKey;
      existing.set({ imageUrl: stored.url, imageKey: stored.key, imageWidth: img.width, imageHeight: img.height, contentType: img.contentType, active: false });
      proof = await existing.save();
      if (oldKey && isProofKey(oldKey)) proofDeps.store.delete(oldKey).catch((e) => console.warn("Old proof image not deleted:", (e as Error)?.message));
    } else {
      proof = await OutreachProof.create({
        imageUrl: stored.url,
        imageKey: stored.key,
        imageWidth: img.width,
        imageHeight: img.height,
        contentType: img.contentType,
        source: extracted.source,
        periodLabel: extracted.periodLabel,
        stats: extracted.stats,
        caption: extracted.caption,
        active: false,
        byEmail: req.userEmail || "",
      });
    }
    await audit(req, { action: "prospect.proof_uploaded", reason: `Traction screenshot ${existing ? "replaced" : "uploaded"} (${String(proof._id)}) → ${stored.url}` });
    res.json({ success: true, data: { proof: shapeProof(proof), extracted } });
  } catch (error) {
    if (error instanceof ProofInputError) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    const msg = (error as Error)?.message || "";
    console.error("Upload proof error:", msg);
    res.status(/S3 is not configured/.test(msg) ? 503 : 500).json({ success: false, error: /S3 is not configured/.test(msg) ? "Image storage (S3) is not configured on this server." : "Could not upload the screenshot." });
  }
};

/** PATCH /admin/super/prospects/proofs/:id — confirm / edit; makes it usable. */
export const updateProof = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = oid(req.params.id);
    const proof = id ? await OutreachProof.findById(id) : null;
    if (!proof) {
      res.status(404).json({ success: false, error: "That screenshot no longer exists." });
      return;
    }
    const input = parseProofInput(req.body || {});
    proof.set({ source: input.source, periodLabel: input.periodLabel, stats: input.stats, caption: input.caption, active: true });
    // The first confirmed proof becomes the default; asking for default moves it.
    const anyDefault = await OutreachProof.exists({ isDefault: true, active: true, _id: { $ne: proof._id } });
    if (input.isDefault || !anyDefault) {
      await OutreachProof.updateMany({ _id: { $ne: proof._id }, isDefault: true }, { $set: { isDefault: false } });
      proof.isDefault = true;
    } else if (req.body?.isDefault === false) {
      proof.isDefault = false;
    }
    await proof.save();
    await audit(req, { action: "prospect.proof_confirmed", reason: `Traction numbers confirmed (${String(proof._id)}): ${input.stats.map((s) => `${s.label} ${s.value}`).join(", ")} · ${input.periodLabel}` });
    res.json({ success: true, data: { proof: shapeProof(proof), allowedNumbers: proofAllowedNumbers(proof) } });
  } catch (error) {
    if (error instanceof ProofInputError) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    console.error("Update proof error:", (error as Error)?.message);
    res.status(500).json({ success: false, error: "Could not save the numbers." });
  }
};

/** DELETE /admin/super/prospects/proofs/:id */
export const deleteProof = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = oid(req.params.id);
    const proof = id ? await OutreachProof.findById(id) : null;
    if (!proof) {
      res.status(404).json({ success: false, error: "That screenshot no longer exists." });
      return;
    }
    await OutreachProof.deleteOne({ _id: proof._id });
    if (proof.imageKey && isProofKey(proof.imageKey)) {
      // Emails already queued carry their own snapshot; one still waiting
      // whose image is gone fails visibly at send time rather than silently.
      await proofDeps.store.delete(proof.imageKey).catch((e) => console.warn("Proof image not deleted:", (e as Error)?.message));
    }
    if (proof.isDefault) {
      const next = await OutreachProof.findOne({ active: true }).sort({ createdAt: -1 });
      if (next) await OutreachProof.updateOne({ _id: next._id }, { $set: { isDefault: true } });
    }
    await audit(req, { action: "prospect.proof_deleted", reason: `Traction screenshot deleted (${String(proof._id)})` });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete proof error:", (error as Error)?.message);
    res.status(500).json({ success: false, error: "Could not delete the screenshot." });
  }
};

/**
 * The proof a draft / preview / send asked for: `useNumbers: true` + `proofId`
 * (an ACTIVE proof). `attachImage` only for personal mail. null when off.
 */
export async function readProofChoice(body: Record<string, unknown> | undefined): Promise<{ proof: ProofSnapshot; attach: boolean } | null> {
  if (body?.useNumbers !== true) return null;
  const id = oid(body?.proofId);
  const p = id ? await OutreachProof.findOne({ _id: id, active: true }) : await OutreachProof.findOne({ isDefault: true, active: true });
  if (!p) return null;
  return { proof: proofSnapshot(p), attach: body?.attachImage === true };
}
