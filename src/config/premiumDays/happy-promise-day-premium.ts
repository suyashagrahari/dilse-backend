import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-promise-day-premium — "Signed, Sealed, Promised", the premium twin of happy-promise-day.
 *
 * A promise drawn up as a deed on ivory paper: two "Whereas…" lines, the
 * promises typed in clause by clause on a typewriter, the letter as Schedule
 * A (initialled), both people sign, and the deed is sealed in an envelope
 * with wax pressed with their initials on the song's drop.
 *
 * Owned by this template's builder: edit only this file (and
 * config/aiFill/happy-promise-day-premium.ts). Extras mirror the client's
 * _valentine/days/happy-promise-day-premium.ts (same keys + limits) and the
 * PINNED_KEYS entry in valentineDays.test.ts. envelopeLine, promises and
 * bigPromise keep the $2 keys so an upgrade carries them over.
 *
 * Shared premium fields (voice note, scheduled unlock, reply, P.S. letter…)
 * are NOT extras — they live in the top-level `premium` sub-document
 * (see PremiumFields in ../valentineDays.ts).
 */
const config: ValentineDayConfig = {
  title: "Signed, Sealed, Promised",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: false,
  gifSlots: ["ps1-desk", "ps2-sealed"],
  extras: [
    /** Typed under their name on the sealed envelope (the gate). */
    { key: "envelopeLine", kind: "text", max: 60 },
    /** Two lines: how it started, what you've known since. */
    { key: "whereas", kind: "list", maxItems: 2, minItems: 2, itemMax: 90 },
    { key: "promises", kind: "list", maxItems: 7, minItems: 3, itemMax: 90 },
    /** The last clause, set above both signatures. */
    { key: "bigPromise", kind: "longtext", max: 140 },
    /** YYYY-MM-DD; "in force since … · N days". */
    { key: "sinceDate", kind: "text", max: 10 },
    { key: "witnessLine", kind: "text", max: 90 },
    /** Initials pressed into the wax (blank = both first initials). */
    { key: "monogram", kind: "text", max: 5 },
    { key: "waxColour", kind: "enum", options: ["oxblood", "midnight", "forest", "blush"], default: "oxblood" },
    { key: "replyLine", kind: "text", max: 80 },
  ],
};

export default config;
