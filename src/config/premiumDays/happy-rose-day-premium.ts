import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-rose-day-premium — "The Glasshouse Rose", the premium twin of happy-rose-day.
 *
 * Owned by this template's builder: edit only this file (and
 * config/aiFill/happy-rose-day-premium.ts). The extras below started as a literal copy of
 * happy-rose-day's; change them freely, then keep the client mirror and the
 * PINNED_KEYS entry in valentineDays.test.ts in step.
 *
 * Shared premium fields (voice note, scheduled unlock, reply, P.S. letter…)
 * are NOT extras — they live in the top-level `premium` sub-document
 * (see PremiumFields in ../valentineDays.ts).
 */
const config: ValentineDayConfig = {
  title: "The Glasshouse Rose",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: false,
  gifSlots: ["pr1-door", "pr2-thorn", "pr3-petals", "pr4-letter", "pr5-memories", "pr6-forever"],
  extras: [
    { key: "roseColor", kind: "enum", options: ["red", "pink", "lavender", "peach", "white", "yellow", "orange", "coral"], default: "red" },
    { key: "colorReason", kind: "text", max: 90 },
    { key: "roseCount", kind: "enum", options: ["1", "3", "7", "9", "11", "12", "99"], default: "1" },
    { key: "openingLine", kind: "text", max: 70 },
    { key: "petalStyle", kind: "enum", options: ["classic", "desi", "french"], default: "classic" },
    { key: "shayari", kind: "longtext", max: 160 },
    { key: "signOff", kind: "text", max: 30 },
  ],
};

export default config;
