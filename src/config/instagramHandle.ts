// ─── Instagram handle: parse what people paste, validate what Instagram allows ─
//
// The influencer's Instagram username is compulsory: it is shown on their invite
// page so followers know the link really is theirs. People paste it every way
// imaginable — "@name", "name ", "https://www.instagram.com/name/?igsh=…" — so
// this accepts all of those and keeps only the handle.
//
// Instagram's own rules: 1–30 characters, letters, digits, "." and "_" only; a
// period may not start or end the name, and two periods may not sit together.
// Handles are case-insensitive, so they are stored lowercased.
//
// The client mirrors this in `client/lib/instagramHandle.ts` — keep them in step.

export const INSTAGRAM_MAX = 30;

const HANDLE_RE = /^[a-z0-9._]{1,30}$/;
/** Paths on instagram.com that are not profiles (a post, a reel, a story…). */
const NOT_A_PROFILE = new Set(["p", "reel", "reels", "stories", "explore", "tv", "accounts", "direct", "about", "legal"]);

export type InstagramResult =
  | { ok: true; handle: string }
  | { ok: false; reason: "empty" | "invalid"; message: string };

export const INSTAGRAM_REQUIRED_MSG = "Add your Instagram username — it shows on your invite page so followers know it's you.";

export function parseInstagramHandle(raw: unknown): InstagramResult {
  let s = String(raw ?? "").trim();
  // A pasted profile link: keep the first path segment.
  const url = s.match(/^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:instagram\.com|instagr\.am)(?:\/(.*))?$/i);
  if (url) {
    const seg = (url[1] || "").split(/[/?#]/)[0];
    if (NOT_A_PROFILE.has(seg.toLowerCase())) {
      return { ok: false, reason: "invalid", message: "That's a link to a post, not a profile. Paste just your username." };
    }
    s = seg;
  }
  s = s.replace(/^@+/, "").trim().toLowerCase();

  if (!s) return { ok: false, reason: "empty", message: INSTAGRAM_REQUIRED_MSG };
  if (s.length > INSTAGRAM_MAX) {
    return { ok: false, reason: "invalid", message: `Instagram usernames are at most ${INSTAGRAM_MAX} characters.` };
  }
  if (!HANDLE_RE.test(s)) {
    return { ok: false, reason: "invalid", message: "Instagram usernames use only letters, numbers, periods and underscores." };
  }
  if (s.startsWith(".") || s.endsWith(".")) {
    return { ok: false, reason: "invalid", message: "An Instagram username can't start or end with a period." };
  }
  if (s.includes("..")) {
    return { ok: false, reason: "invalid", message: "An Instagram username can't have two periods in a row." };
  }
  return { ok: true, handle: s };
}

/**
 * The profile-update rule. Joining requires a handle; editing one may change it
 * but never clear it. An influencer who joined while the field was optional has
 * none stored — they must still be able to save their UPI ID, so an empty value
 * from them is "no change" (the dashboard nudges them to add it), not a 400.
 *
 * `value: undefined` means leave the stored handle as it is.
 */
export function profileInstagramUpdate(
  raw: unknown,
  current: string | null | undefined
): { ok: true; value: string | undefined } | { ok: false; message: string } {
  if (raw === undefined) return { ok: true, value: undefined };
  const r = parseInstagramHandle(raw);
  if (r.ok) return { ok: true, value: r.handle };
  if (r.reason === "empty") {
    return current
      ? { ok: false, message: "Your Instagram username can't be removed — you can change it to a new one." }
      : { ok: true, value: undefined };
  }
  return { ok: false, message: r.message };
}
