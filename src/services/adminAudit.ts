import { Request } from "express";
import mongoose from "mongoose";
import AdminAuditLog, { AuditAction } from "../models/AdminAuditLog";

/**
 * Keys whose values must never reach the audit log. The log is read by more
 * people than the action it records, so writing a password into it to prove a
 * password changed would leak it further than the reveal endpoint ever does.
 */
const REDACTED_KEYS = /password|passwordraw|token|otp|secret/i;

function redact(changes?: Record<string, { from: unknown; to: unknown }>) {
  if (!changes) return undefined;
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(changes)) {
    out[k] = REDACTED_KEYS.test(k) ? { from: "[redacted]", to: "[redacted]" } : v;
  }
  return out;
}

interface AuditInput {
  action: AuditAction;
  targetUserId?: string | mongoose.Types.ObjectId;
  targetUserEmail?: string;
  targetPageId?: string;
  targetTemplateType?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  reason?: string;
}

/**
 * Record a privileged action.
 *
 * Deliberately never throws: an audit write failing must not turn a completed
 * action into a 500 that suggests it did not happen. A failure is logged loudly
 * to stderr instead, where the process logs will catch it.
 *
 * Call it BEFORE reporting success, and for reads too — `reveal_password` and
 * `view_content` are the entries most worth having.
 */
export async function audit(req: Request, input: AuditInput): Promise<void> {
  try {
    await AdminAuditLog.create({
      actorId: req.impersonatorId || req.userId,
      actorEmail: req.userEmail || "unknown",
      action: input.action,
      targetUserId: input.targetUserId,
      targetUserEmail: input.targetUserEmail,
      targetPageId: input.targetPageId,
      targetTemplateType: input.targetTemplateType,
      changes: redact(input.changes),
      reason: input.reason,
      ip: (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() || req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
    });
  } catch (err) {
    console.error("[audit] FAILED to record", input.action, err);
  }
}

/** Build a `changes` map from two objects, keeping only fields that differ. */
export function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      out[k] = { from: before[k], to: after[k] };
    }
  }
  return out;
}
