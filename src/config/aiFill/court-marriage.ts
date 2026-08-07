import type { AiFillTemplateSchema } from "./types";

/**
 * Court Marriage Certificate — AI form-fill schema.
 *
 * `mf` is `CertificateData` (client `app/(templates)/court-marriage/components/types.ts`).
 * The certificate is one sheet of typewritten registry paper: two parties, a
 * middle block of dot-leader rows, a clerk's margin note, three witness lines
 * and a seal. The dot-leader rows are the entire joke, which is why eight of
 * the fifteen slots go to them.
 *
 * Deliberately NOT declared, and why:
 *  - `partyA.name` / `partyB.name` — names the sender types in the composer.
 *  - `partyA.age` / `partyB.age` — a guessed age printed on a certificate is an
 *    error, not a joke, and no story reliably states it.
 *  - `certificateNo` — a format-sensitive registry ID that also seeds every ink
 *    wobble on the page; the generated default is already correct.
 *  - `photoUrl`, `registrarSignaturePath`, `witnesses[i].signaturePath` — media
 *    and drawn ink. The model never writes these (rule 1).
 *  - `certificateState` — lifecycle, not content.
 *  - `witnesses[2].name` — the third slot is designed to print as a blank ruled
 *    line waiting to be signed, and that blank is part of the artwork.
 */
export const courtMarriage: AiFillTemplateSchema = {
  slug: "court-marriage",
  premise:
    "The sender has issued a mock court-marriage certificate for the two of them: one sheet of registry paper, typed in Courier, with an official seal, a registrar's signature and three witness lines. Every laugh comes from deadpan bureaucracy applied to private domestic detail — a clerk solemnly recording how many arguments they have survived — so the register is always flat, official and fond, and the sender is always the one the paperwork embarrasses.",
  audience: "partner",
  fields: [
    // ── The dot-leader block: the body of the certificate ────────────────────
    {
      path: "fields[0].label",
      label: "Entry 1 — label",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "The label on the first dot-leader row in the middle of the certificate. Write it exactly as a registry form would — a noun phrase in Title Case, no trailing colon (the dots are drawn for you) — but about the two of them: 'Known to each other since', 'Cups of chai on record'. Under 40 characters. Make this first row the plain, factual one; the funny rows come after it.",
      example: "Known to each other since",
    },
    {
      path: "fields[0].value",
      label: "Entry 1 — value",
      kind: "text",
      max: 24,
      required: true,
      guide:
        "What the clerk typed opposite entry one. The value column is narrow and fixed so the dots line up: under 24 characters. A number with its unit reads best — '847 days', '3 years'. Deadpan, never a sentence.",
    },
    {
      path: "fields[1].label",
      label: "Entry 2 — label",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "The second dot-leader row, and the one that must point at the SENDER'S own failing rather than the recipient's — 'Times the first party was late', 'Arguments conceded by the second party'. Under 40 characters, still in registry Title Case. Aiming this row at the person receiving the certificate is the one thing this template must never do.",
    },
    {
      path: "fields[1].value",
      label: "Entry 2 — value",
      kind: "text",
      max: 24,
      required: true,
      guide:
        "The value opposite entry two. Under 24 characters. A count that is comically high about the sender is the joke — the bigger the number against themselves, the better it lands.",
    },
    {
      path: "fields[2].label",
      label: "Entry 3 — label",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "The third row, taken from something small and specific in the sender's story — the blanket, the playlist, the walk, the shared plate. Still phrased as an official entry a clerk would file. Under 40 characters. Fond, never pointed.",
    },
    {
      path: "fields[2].value",
      label: "Entry 3 — value",
      kind: "text",
      max: 24,
      required: true,
      guide:
        "The value opposite entry three. Under 24 characters. A number, a date, or a two-word verdict typed as though it were routine.",
    },
    {
      path: "fields[3].label",
      label: "Entry 4 — label",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "The last dot-leader row, which is the punchline of the block — set it up so the value can be the flat, final answer ('Objections upheld', 'Grounds for annulment found'). Under 40 characters.",
    },
    {
      path: "fields[3].value",
      label: "Entry 4 — value",
      kind: "text",
      max: 24,
      required: true,
      guide:
        "The value opposite entry four: the payoff, and it always lands in the couple's favour. Under 24 characters — 'None', 'Nil', '0'. One word is stronger than three here.",
    },

    // ── The clerk's margin note ──────────────────────────────────────────────
    {
      path: "objectionCount",
      label: "Objections received",
      kind: "number",
      guide:
        "Printed as the clerk's handwritten margin note beside the entries: how many objections the registry received to this union. A small, funny whole number between 0 and 99 that suits the story — nosy relatives, the one friend who said it would never work. It is always objections RAISED and never objections upheld, so it can be as high as the joke needs. Do not name who objected.",
    },

    // ── Registry particulars ─────────────────────────────────────────────────
    {
      path: "registeredOn",
      label: "Registered on",
      kind: "date",
      guide:
        "The date typed as the day of registration, as YYYY-MM-DD. Use the day the two of them actually became a couple if the sender's story states it — an anniversary standing in as a registration date is the whole conceit. If the story names no date at all, leave this empty rather than inventing one; a wrong date on a certificate reads as a mistake, not a joke.",
    },
    {
      path: "knownSinceDays",
      label: "Known since (days)",
      kind: "number",
      guide:
        "How many days the two have known each other, printed as a plain whole number. Only work this out when the story gives a real starting point — an actual date, 'three years ago', 'since college in 2019'. If it does not, leave this empty. Keep it consistent with whatever you typed in the first dot-leader row; two different durations on one certificate is the sort of thing people notice.",
    },
    {
      path: "partyA.city",
      label: "First party — city",
      kind: "text",
      max: 40,
      guide:
        "The city recorded for the first person named on the certificate. City name only, no state and no country, under 40 characters. Fill it only when the sender's story actually names where they live — the demo default is a real city and leaving it wrong is worse than leaving it blank.",
    },
    {
      path: "partyB.city",
      label: "Second party — city",
      kind: "text",
      max: 40,
      guide:
        "The city recorded for the second person named on the certificate. Same rule: city name only, under 40 characters, and only when the story says it. If the two of them are in different cities and the story makes that clear, say so here — a long-distance certificate is a better joke than a tidy one.",
    },

    // ── Witnesses ────────────────────────────────────────────────────────────
    {
      path: "witnesses[0].name",
      label: "Witness 1",
      kind: "text",
      max: 30,
      guide:
        "The name printed under the first witness signature. Fill this only when the sender's story actually names someone who was there — the friend who introduced them, the sibling who knew first, the dog. Under 30 characters. A witness name invented from nothing turns a certificate meant for one specific person into a stranger's page, so leaving this empty is a perfectly good outcome.",
    },
    {
      path: "witnesses[1].name",
      label: "Witness 2",
      kind: "text",
      max: 30,
      guide:
        "The second witness name, same rule — only somebody the story names, under 30 characters. Never use either of the couple's own names here, and never invent a filler name to complete the row; the third slot is meant to stay blank, and a second blank costs nothing.",
    },
  ],
};
