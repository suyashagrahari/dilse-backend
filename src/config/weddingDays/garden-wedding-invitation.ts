import type { ValentineDayConfig } from "../valentineDays";

/**
 * garden-wedding-invitation — Mughal Garden Wedding Invitation 🦚, a wedding design on Royal's limits
 * (config/weddingShared.ts WEDDING_TIER_LIMITS): pink gazebos, a peacock, lotus fountains and lanterns in a pastel watercolour garden.
 *
 * Same fields as royal-wedding-invitation, so the wedding guest routes (RSVP
 * per function, blessings wall) and the owner dashboard work unchanged.
 * recipientName = the bride, senderName = the groom, letter = the English
 * invitation, photos = one pool of 40 (story chapters and family cards point
 * into it by 1-based index). No question is asked. Light themes only.
 *
 * Client mirror: client/app/(templates)/_valentine/days/garden-wedding-invitation.ts (same keys
 * and limits; PINNED_KEYS in valentineDays.test.ts pins them).
 */
const config: ValentineDayConfig = {
  title: "Mughal Garden Wedding Invitation",
  maxPhotos: 40,
  letterMax: 1500,
  asksQuestion: false,
  gifSlots: [],
  extras: [
    /** Light themes only. */
    { key: "theme", kind: "enum", options: ["blush", "champagne", "powder"], default: "blush" },
    /** Which language the page opens in (guests can switch). */
    { key: "lang", kind: "enum", options: ["en", "hi"], default: "en" },
    { key: "nameOrder", kind: "enum", options: ["bride", "groom"], default: "bride" },
    { key: "hindiMessage", kind: "longtext", max: 700 },
    { key: "brideFamily", kind: "text", max: 120 },
    { key: "groomFamily", kind: "text", max: 120 },
    { key: "brideNote", kind: "text", max: 100 },
    { key: "groomNote", kind: "text", max: 100 },
    /** "With the blessings of" — grandparents. */
    { key: "blessingsOf", kind: "text", max: 160 },
    /** 1-based index into photos; 0 = none. */
    { key: "bridePhoto", kind: "number", min: 0, max: 40, default: 0 },
    { key: "groomPhoto", kind: "number", min: 0, max: 40, default: 0 },
    { key: "muhurat", kind: "text", max: 60 },
    { key: "hashtag", kind: "text", max: 40 },
    /** The functions; `id` is a short stable slug the guests' RSVPs refer to. All text. */
    {
      key: "events",
      kind: "objlist",
      maxItems: 8,
      minItems: 1,
      item: [
        { key: "id", kind: "text", max: 24 },
        { key: "title", kind: "text", max: 40 },
        { key: "date", kind: "text", max: 10 },
        { key: "time", kind: "text", max: 5 },
        { key: "endTime", kind: "text", max: 5 },
        { key: "venue", kind: "text", max: 80 },
        { key: "address", kind: "text", max: 140 },
        { key: "mapUrl", kind: "text", max: 400 },
        { key: "dressCode", kind: "text", max: 60 },
        { key: "dressColor", kind: "text", max: 7 },
        { key: "note", kind: "text", max: 200 },
      ],
    },
    {
      key: "story",
      kind: "objlist",
      maxItems: 8,
      item: [
        { key: "when", kind: "text", max: 24 },
        { key: "title", kind: "text", max: 60 },
        { key: "line", kind: "text", max: 240 },
        { key: "photo", kind: "number", min: 0, max: 40, default: 0 },
      ],
    },
    /** Good to know: "Heading: text" lines. */
    { key: "things", kind: "list", maxItems: 6, itemMax: 180 },
    { key: "gettingThere", kind: "longtext", max: 500 },
    /** A YouTube link for the pre-wedding film (the client extracts the id). */
    { key: "videoUrl", kind: "text", max: 200 },
    { key: "rsvpBy", kind: "text", max: 10 },
    { key: "maxGuests", kind: "number", min: 1, max: 10, default: 4 },
    /** Read by weddingGuest.controller: the RSVP accepts a meal choice only when true. */
    { key: "rsvpMeal", kind: "bool", default: true },
    { key: "blessings", kind: "bool", default: true },
    /** Open with the Shri Ganesh invocation (false = the couple's monogram). */
    { key: "invocation", kind: "bool", default: true },
  ],
};

export default config;
