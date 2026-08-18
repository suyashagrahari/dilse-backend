import type { AiFillTemplateSchema } from "./types";

/**
 * bouquet-gf — "Build a Bouquet".
 *
 * Paths resolve against `BouquetData` in
 * client/app/(templates)/bouquet-gf/components/types.ts, held as `mf` in
 * useBouquetEditor.ts (line 45).
 *
 * Only the four text leaves are declared. `mode`, `flowers`, `greenery`,
 * `arrangementSeed` and `deedEnabled` are direct visual choices the sender makes
 * by tapping blooms — nothing a story can be read into — so they stay out.
 * `deedClauses` is a plain string[] rendered as the certificate's numbered rows
 * (DeedOfDevotion.tsx caps it at 6), so it is declared once as a list.
 */
export const bouquetGf: AiFillTemplateSchema = {
  slug: "bouquet-gf",
  audience: "partner",
  premise:
    "The sender hand-ties a bouquet stem by stem, and the page animates it opening for the recipient before scrolling to a card that reads 'Dear ___,' with his message beneath it. Attached is an optional 'Deed of Devotion' — a mock legal certificate, complete with seal and stamp, that names her 'The Beloved' and him 'The Devotee' and lists his pledges as numbered clauses; the joke only works if the clauses are tiny, specific and domestic while the layout stays deadpan and official.",
  fields: [
    {
      path: "recipientName",
      label: "Who it's for",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "Printed in violet script as 'Dear ___,' above the message, and again on the certificate as The Beloved. Use the name he actually calls her — first name or the pet name from his story — kept short, because it is set large in a script face. No formal or full legal names.",
    },
    {
      path: "senderName",
      label: "Who it's from",
      kind: "text",
      max: 40,
      guide:
        "The signature under the card, and the name of 'The Devotee' on the certificate. His name or the way he signs to her. Under about 25 characters.",
    },
    {
      path: "message",
      label: "The card message",
      kind: "longtext",
      max: 600,
      required: true,
      guide:
        "The note tucked into the flowers. This is a card, not a letter — 2 or 3 short paragraphs, 250 to 450 characters, separated by blank lines (the page renders each line break as its own paragraph). The register that suits this template is 'no occasion, no reason, I just saw these and thought of you': light, unforced, specific to her. Pull one concrete detail from the sender's story so it can't have been written for anyone else. Do not build it around an apology, a request, or anything she has to answer.",
      example: "No occasion. I passed a flower stall and every single one looked like something you'd stop and photograph, so here they are.",
    },
    {
      path: "deedClauses",
      label: "Deed of Devotion clauses",
      kind: "list",
      max: 4,
      itemMax: 90,
      guide:
        "The numbered pledges on the mock certificate. Give 3 or 4 of them, each under 70 characters, and keep the deadpan-legal-document joke alive by making each one absurdly small and completely concrete: the chore he'll always take, the snack he'll always surrender, the text he'll always send first. Domestic beats grand — 'first and last text of every day' works, 'to love you forever' does not, because the whole gag is a solemn seal on trivial promises. Mine the sender's story for the actual running jokes between them. Each may end in one small symbol or emoji. Never pledge anything that binds HER to something, and never write a clause that reads as a demand dressed up as a promise.",
      example: "Clause the third: the last samosa is, and remains, hers ✿",
    },
  ],
};
