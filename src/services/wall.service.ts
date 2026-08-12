// ─── Wall service ────────────────────────────────────────────────────────────
//
// Deriving a display name, screening it, and removing entries.

import WallEntry from "../models/WallEntry";
import { wallTemplateByType, WallTemplate } from "../config/wallTemplates";

/**
 * The first name, and nothing else.
 *
 * "Suyash Agrahari" → "Suyash". "meera" → "Meera". A one-word name is returned
 * whole rather than treated as an error — plenty of people have exactly one
 * name, and the Wall must render them, not reject them.
 *
 * Anything that is not a letter, a mark, an apostrophe or a hyphen is dropped,
 * so an emoji or a stray "@" in a name field cannot reach the public page.
 * Marks are kept deliberately: stripping them would mangle every Devanagari,
 * Tamil or Arabic name into nonsense.
 */
export function firstNameOf(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const first = raw.trim().split(/\s+/)[0] ?? "";
  const cleaned = first.replace(/[^\p{L}\p{M}'-]/gu, "").slice(0, 40);
  if (!cleaned) return "";
  // Only touch case for names written in a cased script; Devanagari has none,
  // and toUpperCase on a script without case is a no-op that costs nothing.
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Words that must never render as a name on a public page.
 *
 * ── MATCHED AS WHOLE TOKENS, NEVER AS SUBSTRINGS ────────────────────────────
 *
 * Substring profanity matching against human names is notoriously broken: it
 * rejects Shitole (a common Marathi surname), Dickson, Kumari, Fukui, Cockburn
 * and hundreds of others. Because this only ever screens a single first name,
 * an exact case-insensitive token match is both sufficient and far safer — a
 * real person's name is not silently refused because it contains three letters
 * that spell something else.
 *
 * A hit does not delete anything. It routes the entry to the moderation queue
 * as `removed`, where a human can reverse it. False positives are recoverable;
 * that is the point of keeping the list short and the match exact.
 */
const BLOCKED_NAMES = new Set(
  [
    "fuck", "fucker", "fucking", "shit", "bitch", "bastard", "cunt", "slut",
    "whore", "rape", "rapist", "nigger", "nigga", "faggot", "retard", "chutiya",
    "madarchod", "behenchod", "bhenchod", "randi", "gaandu", "harami", "lauda",
    "bhosdike", "kutiya", "admin", "null", "undefined",
  ].map((w) => w.toLowerCase())
);

/** True when a derived first name must not be published as-is. */
export function isBlockedName(name: string): boolean {
  return BLOCKED_NAMES.has(name.trim().toLowerCase());
}

export interface DerivedNames {
  creatorFirstName: string;
  recipientFirstName: string;
  blocked: boolean;
}

/**
 * Read the two names off a creation document.
 *
 * The document is read here and thrown away; nothing but the two first names
 * survives into the WallEntry.
 */
export function deriveNames(doc: Record<string, unknown>, tpl: WallTemplate): DerivedNames {
  const creatorFirstName = firstNameOf(doc[tpl.creatorField]);
  const recipientFirstName = firstNameOf(doc[tpl.recipientField]);
  return {
    creatorFirstName,
    recipientFirstName,
    blocked: isBlockedName(creatorFirstName) || isBlockedName(recipientFirstName),
  };
}

/**
 * Drop the Wall entry for a creation that no longer exists.
 *
 * A hard delete rather than a status change: a removed creation's entry has no
 * reason to survive in any state, and leaving a `removed` row behind would keep
 * two names on our servers after the only record that justified holding them is
 * gone.
 *
 * Safe to call for a template that is not Wall-eligible, and safe to call when
 * no entry exists — both are no-ops.
 */
export async function removeWallEntryForPage(templateType: string, pageId: string): Promise<void> {
  if (!wallTemplateByType(templateType)) return;
  try {
    await WallEntry.deleteOne({ templateType, pageId });
  } catch (err) {
    // Never let Wall bookkeeping fail the delete the user actually asked for.
    console.error("[wall] failed to remove entry for", templateType, pageId, err);
  }
}
