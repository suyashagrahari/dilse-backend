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

const MISS_YOU_PREMIUM_PERKS = [
  "A little plane writes their name in the sky over your two cities",
  "A radio of your voice notes, a picnic for two, a message in a bottle",
  "Your letter, your photos and a countdown to the day you meet",
  "They answer “Video call tonight?”, and you get to see it",
];

const PROPOSAL_PREMIUM_PERKS = [
  "A wax-sealed invitation and fairy lights that spell out your words",
  "A carousel of your story, a love lock counting your days together",
  "A flower that always ends on 'loves me', your letter on a ribbon",
  "A ring box rises with your promise, then the big question",
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
  "missyou-gf": {
    from: "missyou-gf",
    to: "miss-you-premium",
    title: "Miss You ✦ Premium",
    perks: MISS_YOU_PREMIUM_PERKS,
  },
  "miss-you": {
    from: "miss-you",
    to: "miss-you-premium",
    title: "Miss You ✦ Premium",
    perks: MISS_YOU_PREMIUM_PERKS,
  },
  proposal: {
    from: "proposal",
    to: "proposal-premium",
    title: "The Proposal ✦ Premium",
    perks: PROPOSAL_PREMIUM_PERKS,
  },
  "will-you-be-mine": {
    from: "will-you-be-mine",
    to: "proposal-premium",
    title: "The Proposal ✦ Premium",
    perks: PROPOSAL_PREMIUM_PERKS,
  },
  "happy-anniversary": {
    from: "happy-anniversary",
    to: "anniversary-premium",
    title: "Anniversary ✦ Premium: The Book of Us",
    perks: [
      "Film-style opening titles with your two names",
      "A time machine through your years, your firsts on a record player",
      "A quilt of your photos and reasons, your letter bound as a little book",
      "Lanterns of promises for next year, and your year in numbers",
    ],
  },
  "happy-halloween": {
    from: "happy-halloween",
    to: "happy-halloween-premium",
    title: "Halloween ✦ Premium: Boo-tiful Night",
    perks: [
      "A ghost pops out of a haunted mailbox with your letter",
      "Catch candies of treats and cute dares, carve a pumpkin together",
      "Ghosts hide your photos, a love potion casts one spell",
      "'Will you be my boo?' and a Boo License keepsake",
    ],
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
