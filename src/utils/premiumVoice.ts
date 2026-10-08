// ─── Premium voice note: body value → a stored https URL ─────────────────────
//
// The premium editor records a short voice note in the browser and sends it as
// a `data:audio/...;base64,` URL (or, once uploaded, the https link back). The
// bytes are sniffed — the declared type is a client's claim — and only a small
// set of audio containers browsers actually record is accepted. Anything else,
// or any failure on the way, stores "" and the save still succeeds (same rule
// as callPage.controller's resolveVoiceUrl: a lost voice note never costs the
// sender their page).

import { parseAnyDataUrl, sniffMedia } from "../services/mediaSniff";
import { uploadAudioBuffer } from "../services/mediaProcessor.service";
import { PREMIUM_LIMITS, premiumVoiceUrl, premiumVoiceUrlShape } from "../config/valentineDays";

export type AudioUploader = (buffer: Buffer, mimeType: string, folder: string) => Promise<{ url: string }>;

export const PREMIUM_VOICE_MIMES: ReadonlySet<string> = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
]);

export const premiumVoiceFolder = (slug: string, userId: unknown): string =>
  `${slug}/users/${String(userId || "anonymous")}/voice`;

export async function resolvePremiumVoice(
  raw: unknown,
  userId: unknown,
  slug: string,
  upload: AudioUploader = uploadAudioBuffer
): Promise<string> {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  if (/^https:\/\//i.test(value)) return premiumVoiceUrl(value);
  if (!/^data:audio\//i.test(value)) return "";

  // Base64 is 4/3 of the payload: refuse to even decode something that cannot fit.
  if (value.length > Math.ceil((PREMIUM_LIMITS.voiceBytes * 4) / 3) + 256) {
    console.warn(`[premium voice] ${slug}: data URL too large, dropped`);
    return "";
  }
  try {
    const parsed = parseAnyDataUrl(value);
    if (!parsed) return "";
    if (parsed.buffer.length > PREMIUM_LIMITS.voiceBytes) {
      console.warn(`[premium voice] ${slug}: ${parsed.buffer.length} bytes exceeds the cap, dropped`);
      return "";
    }
    const sniffed = sniffMedia(parsed.buffer, parsed.declaredMime);
    // fromBytes: every recorder container has a magic number, so a verdict
    // resting only on the declared type is a payload we refuse.
    if (sniffed.kind !== "audio" || !sniffed.fromBytes || !PREMIUM_VOICE_MIMES.has(sniffed.mimeType)) {
      console.warn(`[premium voice] ${slug}: rejected ${sniffed.kind} ${sniffed.mimeType || parsed.declaredMime}`);
      return "";
    }
    const uploaded = await upload(parsed.buffer, sniffed.mimeType, premiumVoiceFolder(slug, userId));
    return premiumVoiceUrlShape(uploaded?.url);
  } catch (error) {
    console.error(`[premium voice] ${slug}: upload error`, error);
    return "";
  }
}
