// ─── Template catalogue: labels and REST bases, keyed by templateType ────────
//
// `TEMPLATE_LOOKUPS` in `controllers/share.controller.ts` is the single list of
// which templates exist — model, templateType, editor route. It is deliberately
// the only such list. What it does NOT carry is the two things every surface
// outside the share resolver needs:
//
//   • a human label   — the admin analytics table, the template-popularity
//                       chart, the user-detail page list, the profile card
//   • its REST base   — the route prefix a page is updated or deleted through
//
// Those live here rather than on the lookup entries so this file stays free of
// mongoose: `share.controller` imports these helpers, and if the metadata lived
// alongside the models the import would have to run the other way and close a
// cycle.
//
// ── WHY DERIVATION, NOT A SECOND LIST ───────────────────────────────────────
//
// Both helpers DERIVE from the templateType and consult a map only for the
// exceptions. That is the whole point. The maps below are incomplete by design
// and a template missing from them still gets a correct REST base and a
// readable label — so a new template appears in analytics, in the admin panel
// and in a user's profile the moment it is added to TEMPLATE_LOOKUPS, with no
// second place to remember.
//
// The alternative was what this replaces: a 14-entry `ALL_PAGE_MODELS` in
// `admin.controller` and a 6-model list in `analytics.controller`, each with a
// comment asking the next person to keep it in sync. Thirty of forty-three
// templates were missing from the admin panel and thirty-seven from the
// platform totals. Nothing failed; the numbers were just quietly wrong, which
// is the failure mode a sync-me comment always produces.

/**
 * Labels for the admin surfaces. Short, and unambiguous when two templates are
 * neighbours in a list — both rakhi templates are titled "Happy Raksha Bandhan"
 * on the site itself, which is unusable in a table where they sit one row
 * apart, so they are named for who receives them.
 *
 * Anything absent falls through to title-casing the templateType.
 */
const LABELS: Record<string, string> = {
  birthday: "Birthday",
  "birthday-gf": "Birthday GF",
  valentine: "Valentine",
  holi: "Holi",
  eid: "Eid",
  wedding: "Wedding",
  reception: "Reception",
  shaadi: "Shaadi Card",
  "christian-wedding": "Christian Wedding",
  "love-gf": "Love GF",
  darling: "Darling",
  "apology-dashboard": "Apology Dashboard",
  "missyou-gf": "Miss You GF",
  "bouquet-gf": "Bouquet GF",
  "court-of-love": "Court of Love",
  proposal: "Proposal",
  "court-marriage": "Court Marriage",
  "hold-my-hand": "Hold My Hand",
  "train-ticket": "Train Ticket",
  "legal-notice": "Legal Notice",
  "kundli-milan": "Kundli Milan",
  "vending-machine": "Vending Machine",
  catch: "Catch",
  "happy-rose-day": "Rose Day",
  "happy-propose-day": "Propose Day",
  "happy-chocolate-day": "Chocolate Day",
  "happy-teddy-day": "Teddy Day",
  "happy-promise-day": "Promise Day",
  "happy-hug-day": "Hug Day",
  "happy-kiss-day": "Kiss Day",
  "happy-valentines-day": "Valentine's Day",
  "happy-halloween": "Happy Halloween",
  "dandiya-partner": "Be My Dandiya Partner",
  sorry: "I'm Sorry",
  "happy-birthday": "Happy Birthday",
  "birthday-premium": "Birthday Surprise ✦ Premium",
  "miss-you": "I Miss You",
  "miss-you-premium": "Miss You ✦ Premium",
  "will-you-be-mine": "Will You Be Mine?",
  "sorry-premium": "I'm Sorry ✦ Premium",
  "digital-bouquet": "Digital Bouquet ✦",
  "royal-wedding-invitation": "Royal Wedding Invitation 👑",
  "proposal-premium": "The Proposal ✦ Premium",
  "happy-anniversary": "Happy Anniversary",
  "anniversary-premium": "Anniversary ✦ Premium",
  "happy-diwali": "Happy Diwali",
  "happy-rose-day-premium": "Rose Day ✦ Premium",
  "happy-propose-day-premium": "Propose Day ✦ Premium",
  "happy-chocolate-day-premium": "Chocolate Day ✦ Premium",
  "happy-teddy-day-premium": "Teddy Day ✦ Premium",
  "happy-promise-day-premium": "Promise Day ✦ Premium",
  "happy-hug-day-premium": "Hug Day ✦ Premium",
  "happy-kiss-day-premium": "Kiss Day ✦ Premium",
  "happy-valentines-day-premium": "Valentine's Day ✦ Premium",
  "happy-halloween-premium": "Happy Halloween ✦ Premium",
  flags: "Red Flag, Green Flag",
  "date-invitation": "Date Invitation",
  "photo-puzzle": "Photo Puzzle",
  loveflix: "LoveFlix",
  rewind: "Rewind",
  streak: "Streak",
  dedication: "Dedication",
  searched: "Searched",
  capsule: "Capsule",
  us: "Us",
  product: "Product",
  watch: "Watch",
  call: "Caller ID",
  recharge: "Recharge",
  challan: "Challan",
  nutrition: "Nutrition Facts",
  app: "App Listing",
  "profile-pro": "Endorsements",
  "raksha-bandhan": "Rakhi for Bhai",
  "raksha-bandhan-sister": "Rakhi for Behna",
};

/**
 * Every template is mounted at `/{templateType}-pages` in `routes/index.ts`
 * except this one, whose route was named after the card and whose type was not.
 * Verified against the mount list — do not add speculative entries here; a
 * wrong base sends a delete to a collection that does not hold the page.
 */
const API_BASES: Record<string, string> = {
  shaadi: "shaadi-card-pages",
};

const titleCase = (slug: string): string =>
  slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

/** Human label for a templateType. Never empty. */
export const templateLabel = (templateType: string): string =>
  LABELS[templateType] || titleCase(templateType);

/**
 * REST base for a templateType, WITHOUT a leading slash — e.g. `darling-pages`,
 * which the client joins onto the API origin to update or delete a page.
 */
export const templateApiBase = (templateType: string): string =>
  API_BASES[templateType] || `${templateType}-pages`;
