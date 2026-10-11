import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-chocolate-day-premium — "The Sweetheart Chocolate Factory", the premium twin of happy-chocolate-day.
 *
 * A bright, candy-pastel chocolate factory made for her: she scratches a golden ticket, packs six kawaii truffles
 * into her box (each flavour comes with a reason), unwraps a giant bar that is her photo, dips their photos in
 * chocolate, plays a 15-second catch game whose score is "{n} {catchPrize}", melts a chocolate heart to find the
 * heart line and the letter, opens a music box with the voice note, takes the bigger half of the last piece, then
 * pulls the chocolate-fountain lever: on the song's chorus a chocolate river carries her photos into the box. Ends on
 * a "Box of Us" keepsake with a coupon.
 *
 * The client mirror is client/app/(templates)/_valentine/days/happy-chocolate-day-premium.ts (same keys and limits);
 * PINNED_KEYS in ../valentineDays.test.ts pins the order. houseName, openingLine, flavours, boxLine, heartLine,
 * sinceDate and signOff keep their v2 keys. The chorus second is the shared premium.songDropAt, not an extra.
 */
const config: ValentineDayConfig = {
  title: "The Sweetheart Chocolate Factory",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: false,
  gifSlots: ["sf1-ticket", "sf2-box", "sf3-catch", "sf4-melt", "sf5-share", "sf6-yay"],
  extras: [
    /** The factory's name: on the golden ticket, the bar's wrapper and the keepsake box. Blank = "{sender}'s Chocolate Factory". */
    { key: "houseName", kind: "text", max: 28 },
    /** The fine print on her golden ticket. */
    { key: "openingLine", kind: "text", max: 60 },
    /** The six truffles she packs: flavour + the reason it's in the box (blank = a house pick). */
    {
      key: "flavours",
      kind: "objlist",
      maxItems: 6,
      item: [
        { key: "name", kind: "text", max: 24 },
        { key: "reason", kind: "text", max: 60 },
      ],
    },
    /** The label on her full box (and on the finale's box of photos). */
    { key: "boxLine", kind: "text", max: 60 },
    /** What each chocolate caught in the game is worth ("kisses I owe you"). */
    { key: "catchPrize", kind: "text", max: 28 },
    /** Under the chocolate heart she melts, right before the letter. */
    { key: "heartLine", kind: "text", max: 60 },
    /** When she takes the bigger half of the last piece. */
    { key: "lastPiece", kind: "text", max: 60 },
    /** Free text ("2022", "our first monsoon"), printed as "est. …". */
    { key: "sinceDate", kind: "text", max: 24 },
    { key: "signOff", kind: "text", max: 40 },
    /** The coupon in her keepsake. */
    { key: "coupon", kind: "text", max: 50 },
  ],
};

export default config;
