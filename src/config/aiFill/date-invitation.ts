import type { AiFillTemplateSchema } from "./types";

/**
 * Date Invitation — AI form-fill schema.
 *
 * `mf` is `DateInviteData` (client `app/(templates)/date-invitation/components/types.ts`).
 *
 * This is the most restrained schema in the batch, on purpose. The plan is
 * PHYSICAL: the recipient is going to walk to these places. Every venue name,
 * address and coordinate on this page is a thing a real person navigates to,
 * so the model writes none of them. It writes the invitation's voice and the
 * reasons behind the stops, and nothing that could send anybody anywhere.
 *
 * Deliberately NOT declared, and why:
 *  - `meetingPoint.name` / `.address` / `.lat` / `.lng`, `stops[i].name` /
 *    `.address` / `.lat` / `.lng` — real places, real navigation. An invented
 *    venue is a person standing on a corner that does not exist.
 *  - `startsAt`, `durationMins`, `stops[i].arriveAt`, `stops[i].durationMins` —
 *    scheduling facts only the sender knows. A wrong time is a missed date.
 *  - `walkingLevel`, `stops[i].dressNote` — logistics the sender knows and the
 *    model cannot; a wrong "bring a jacket" is worse than no note.
 *  - `stops[i].surprise` — a reveal switch; defaulting it wrong leaks the plan.
 *  - `rsvp`, `proposedDate`, `currentStopIndex`, `arrivedAt` — recipient-owned
 *    state. The sender never writes these and neither does the model.
 *  - `photos` — media (rule 1).
 *  - `senderName` / `recipientName` — names the sender types in the composer.
 */
export const dateInvitation: AiFillTemplateSchema = {
  slug: "date-invitation",
  premise:
    "The sender has planned an entire date — a meeting point and a run of stops with times — and this page is the invitation to it. It arrives sealed: the recipient can accept, decline or counter-propose another day, the venues stay hidden until the date actually begins, and then they unlock one at a time as the evening moves. Because a real person has to answer it, and because they will physically walk this route, nothing here may pressure them into a yes and nothing may invent a place.",
  audience: "partner",
  fields: [
    {
      path: "note",
      label: "One line under it all",
      kind: "text",
      max: 120,
      required: true,
      guide:
        "The single line printed under the invitation — the whole pitch, in the sender's voice, and the only place on the card that sounds like a person. Under 120 characters. Say what kind of evening it is and how little is being asked of them. It must make saying yes easy and saying no just as easy: no 'you can't say no', no 'I've already booked it', no counting of effort already spent. Leave the door genuinely open.",
      example: "I planned the whole thing. You just have to show up.",
    },
    {
      path: "dressCode",
      label: "Dress",
      kind: "text",
      max: 70,
      guide:
        "The dress line on the invitation. Under 70 characters, and phrased as practical help rather than a requirement — it exists so they know whether there is walking, not so they know how to look. 'Something you can walk in' is exactly the register. Never comment on their appearance, never specify what would look good on them, and never make it sound like a condition of coming.",
    },
    {
      path: "stops[0].why",
      label: "Stop 1 — why this place",
      kind: "longtext",
      max: 380,
      guide:
        "The reason the sender chose the first stop, revealed to the recipient only once they arrive there — this is the emotional payload of the whole itinerary and it gets room on screen. Two to four sentences, second person, about why THIS place for THIS person. CRITICAL: you do not know where the sender is taking them. Write this only when their story actually names the place or says why it matters; if it does not, leave it empty for the sender rather than writing a reason for a venue you cannot see. Never invent a venue name, an address, a landmark or a neighbourhood — the recipient walks to whatever the sender typed, not to whatever you imagined.",
      example:
        "You told me once that you judge a place by whether they let you sit for two hours on one coffee. They do.",
    },
    {
      path: "stops[1].why",
      label: "Stop 2 — why this place",
      kind: "longtext",
      max: 380,
      guide:
        "Why the second stop, shown when they get there. Two to four sentences. This one is usually the quieter, in-between part of an evening, so let it be smaller than the others — an observation about them rather than a set piece. Same hard rule: only write it if the sender's story gives you the place or the reason, and never name a venue, street or address yourself.",
    },
    {
      path: "stops[2].why",
      label: "Stop 3 — why this place",
      kind: "longtext",
      max: 380,
      guide:
        "Why the third stop. Two to four sentences. Treat this as the one the day was planned around and let it carry the most feeling of the four — what the sender pictured happening here, in plain language. Same hard rule: only from what the story actually says, and never invent a place, a route or a time.",
    },
    {
      path: "stops[3].why",
      label: "Stop 4 — why this place",
      kind: "longtext",
      max: 380,
      guide:
        "Why the last stop, where the evening lands. Two to four sentences, and it can close a loop the earlier stops opened — the place something happened before, a rematch, an old argument being picked up on purpose. Same hard rule: only from the story, never an invented venue. Do not end it by asking for anything or by hinting at what comes after the date.",
    },
    {
      path: "closingLine",
      label: "The closing line",
      kind: "text",
      max: 120,
      guide:
        "The last line on the page, shown only after the date is over and every stop has been visited — the recipient reads this having actually been there. Under 120 characters, past tense, the sound of somebody who had a good time. It is a memory, not a follow-up: no question in it, no request for a next time, no scorekeeping about who planned what.",
      example: "Four hours, four stops, and I'd do the whole thing again tomorrow.",
    },
  ],
};
