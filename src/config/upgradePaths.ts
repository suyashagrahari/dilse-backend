// ─── Free → premium upgrade paths ────────────────────────────────────────────
//
// A free template can offer its premium sibling at the moment of publishing:
// "Before you send it, see it in Premium". The visitor's own content is carried
// across (an AI rewrites it into the premium template's richer fields) and they
// land on the premium editor in preview, with a way back to publish the free one.
//
// One row per pair. `from` is the free template's slug, `to` the premium one's.
// Whether an offer is switched on lives in the UpgradeSetting collection (super
// admin → Upgrades); a pair with no row is ON.

export interface UpgradePath {
  from: string;
  to: string;
  /** The premium template's name, as the offer shows it. */
  title: string;
  /** What premium adds, in the visitor's words (the offer's bullet list). */
  perks: string[];
}

const BIRTHDAY_PREMIUM_PERKS = [
  "A pop-up birthday storybook with their name on the cover",
  "Wishes, your story's milestones and the reasons you love them",
  "They bake a cake, scratch a golden ticket and open your letter",
  "Your photos in a photo-booth strip, and a keepsake to download",
];

export const UPGRADE_PATHS: Readonly<Record<string, UpgradePath>> = {
  "bouquet-gf": {
    from: "bouquet-gf",
    to: "digital-bouquet",
    title: "Digital Bouquet ✦ Premium",
    perks: [
      "Delivered in a gift box they unwrap with a ribbon pull",
      "Your flowers bloom stem by stem, each with your own line",
      "A real love letter card, a song and a keepsake to download",
      "They react back, and you get to see it",
    ],
  },
  "birthday-gf": {
    from: "birthday-gf",
    to: "birthday-premium",
    title: "Birthday Surprise ✦ Premium",
    perks: BIRTHDAY_PREMIUM_PERKS,
  },
  "happy-birthday": {
    from: "happy-birthday",
    to: "birthday-premium",
    title: "Birthday Surprise ✦ Premium",
    perks: BIRTHDAY_PREMIUM_PERKS,
  },
  "apology-dashboard": {
    from: "apology-dashboard",
    to: "sorry-premium",
    title: "I'm Sorry ✦ Premium",
    perks: [
      "A little bear knocks at their door with your apology",
      "They water a wilted flower, heal a cracked heart, open fortune cookies",
      "Your letter sails to them as a paper boat, your photos on a washing line",
      "They sign your peace promises and keep a Peace Treaty",
    ],
  },
};

export const upgradePathFrom = (from: string): UpgradePath | null =>
  Object.prototype.hasOwnProperty.call(UPGRADE_PATHS, from) ? UPGRADE_PATHS[from] : null;

/** Events the client may report. Anything else is dropped. */
export const UPGRADE_EVENTS = [
  "shown",
  "try_clicked",
  "preview_ready",
  "preview_failed",
  "edit_opened",
  "back_to_free",
  "free_chosen",
  "dismissed",
  "free_published",
  "premium_published",
] as const;
export type UpgradeEventName = (typeof UPGRADE_EVENTS)[number];
export const isUpgradeEvent = (v: unknown): v is UpgradeEventName =>
  typeof v === "string" && (UPGRADE_EVENTS as readonly string[]).includes(v);
