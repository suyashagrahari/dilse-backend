// ─── AI fill — train-ticket ──────────────────────────────────────────────────
//
// Paths address `mf: TicketData` in
// client/app/(templates)/train-ticket/hooks/useTrainTicketEditor.ts:49
// (`useState<TicketData>`), declared in
// client/app/(templates)/train-ticket/components/types.ts:61.
//
//   from / to: Place       — types.ts:56, a {code, name} object, so
//                            `from.code` and `from.name` are two leaves.
//   passengers: Passenger[] — types.ts:24. Array of OBJECTS; only `.name` is
//                            filled (seats, coach and waitlist codes are the
//                            sender's booking).
//   stations: Station[]    — types.ts:45. Array of OBJECTS, so `stations[2].name`
//                            and `stations[2].detail` are separate leaves. NOT
//                            a string[].
//   delay: {amount, reason} — types.ts:78, a plain object.
//   finePrint: string[]    — types.ts:79. A genuine array of STRINGS, so it is
//                            declared as ONE `list` field, not numbered paths.
//   departureAt / arrivalAt / chartPreparedAt — ISO timestamps collected through
//                            datetime pickers in IST. Never generated; see the
//                            note at the end.
//
// LEGAL, from types.ts:6 — every mark and code in this template is invented and
// the issuing authority is the fictional "Indian Hearts Railway (IHRCTC)".
// No guide below may lead the model toward a real carrier or ticketing portal.

import type { AiFillTemplateSchema } from "./types";

/** The route screen prints station names with an ellipsis and the detail
 *  right-aligned at 9px on one no-wrap line (RunningStatus.tsx:142,160). */
const STATION = 28;
const DETAIL = 30;

export const trainTicket: AiFillTemplateSchema = {
  slug: "train-ticket",
  premise:
    "This is a railway ticket for a journey that is really a relationship: a PNR status page that flips from waitlisted to confirmed, a printed reservation slip with two names and adjacent seats, a running-status route whose stations are the things that have happened to them, and a plain letter underneath where the bureaucratic voice finally drops. Everything on it is invented — the railway, the train and the codes — so write it with the completely straight face of a real ticketing system and let the meaning leak out through what is being booked.",
  audience: "partner",
  fields: [
    {
      path: "pnr",
      label: "PNR number",
      kind: "text",
      max: 12,
      required: true,
      guide:
        "The passenger reference number printed at the top of the status page. Digits only, in two groups of four separated by a single space, so it scans as a real PNR. Build it out of a date that means something to them — the day they met, a birthday — rather than a random number. Nothing but digits and one space.",
      example: "1403 2023",
    },
    {
      path: "trainName",
      label: "Train name",
      kind: "text",
      max: 28,
      required: true,
      guide:
        "The name of the train, printed in capitals on the slip next to its number. Two words, ALL CAPS, ending in the register real named services use — EXPRESS, MAIL, SUPERFAST. The first word should be theirs: an inside word, a nickname, the place they are from. Under 28 characters.",
      example: "US EXPRESS",
    },
    {
      path: "from.code",
      label: "Origin — station code",
      kind: "text",
      max: 5,
      required: true,
      guide:
        "The three-letter station code for where the journey starts, in capitals, the way a real board abbreviates a city. It must be a plausible short form of the origin station name you are also writing. Three letters, occasionally four. Nothing else.",
      example: "BLR",
    },
    {
      path: "from.name",
      label: "Origin — station name",
      kind: "text",
      max: 28,
      required: true,
      guide:
        "Where the journey starts: the city the sender is actually in, written plainly. One or two words. This half of the ticket stays literal — it is the arrival that carries the joke.",
      example: "Bengaluru",
    },
    {
      path: "to.code",
      label: "Destination — station code",
      kind: "text",
      max: 5,
      required: true,
      guide:
        "The three-letter code for the destination, in capitals, abbreviated from the destination name below it. Three letters, occasionally four, nothing else.",
      example: "TRC",
    },
    {
      path: "to.name",
      label: "Destination — station name",
      kind: "text",
      max: 28,
      required: true,
      guide:
        "Where the train is going — and this one is not a city. Name the actual place the sender wants to end up: her terrace, her kitchen, the seat next to her, her city named as if it were a platform. Two or three words, written as straight-facedly as the origin. Under 28 characters, because it is also printed in capitals in the forwarded SMS copy.",
      example: "Your Terrace",
    },
    {
      path: "passengers[0].name",
      label: "Passenger 1 — name",
      kind: "text",
      max: 24,
      required: true,
      guide:
        "The first name on the reservation slip, printed the way a railway prints a passenger: FIRST NAME then a single initial, all capitals. Use the recipient's name here — she should be the first name she sees on the chart.",
      example: "ANANYA R",
    },
    {
      path: "passengers[1].name",
      label: "Passenger 2 — name",
      kind: "text",
      max: 24,
      required: true,
      guide:
        "The second name on the slip, in the same railway format — FIRST NAME then an initial, all capitals. This one is the sender. The two names sitting in the same coach are what makes the ticket print ADJACENT under the confirmation, which is the whole payoff.",
      example: "ROHAN K",
    },

    // ── The route. Six stops in the seeded form; the four that carry the story
    //    are filled, and each is given a different job on the timeline.
    {
      path: "stations[0].name",
      label: "Stop 1 — where it started",
      kind: "text",
      max: STATION,
      required: true,
      guide:
        "The first stop on the route: the beginning of them, named as a railway junction. Take a phrase from how they actually started — the first message, the question one of them asked — and put a station word on the end of it: Junction, Halt, Central, Terminal. Two or three words, under 28 characters. If the sender's story is in Hinglish, name the station in Hinglish.",
      example: "Kaha Ho Junction",
    },
    {
      path: "stations[0].detail",
      label: "Stop 1 — timing",
      kind: "text",
      max: DETAIL,
      required: true,
      guide:
        "The right-aligned timing printed against that stop, in the abbreviated form a running-status board uses: 'dep' or 'arr', then the date, then a 24-hour time. Use the real date this happened if the story gives one. Under 30 characters, on one line, no wrapping.",
      example: "dep 14 Mar 2023, 02:11",
    },
    {
      path: "stations[1].name",
      label: "Stop 2 — the first meeting",
      kind: "text",
      max: STATION,
      required: true,
      guide:
        "The second stop: the first time they were actually in the same place. Named as a station in the same style as the first — a phrase from that day plus a railway word. Two or three words, under 28 characters.",
      example: "Pehli Mulaqat",
    },
    {
      path: "stations[1].detail",
      label: "Stop 2 — timing",
      kind: "text",
      max: DETAIL,
      required: true,
      guide:
        "The timing against that stop, same abbreviated board format — 'dep', date, 24-hour time. Under 30 characters, one line.",
      example: "dep 02 Apr 2023, 18:40",
    },
    {
      path: "stations[2].name",
      label: "Stop 3 — the unscheduled one",
      kind: "text",
      max: STATION,
      required: true,
      guide:
        "The third stop, which is the joke: the thing that keeps happening and was never on the timetable — the argument they keep having, the plan that keeps collapsing. Name it as a Halt, because a halt is where a train stops when it was not supposed to. Two or three words, under 28 characters. Aim it at the sender or at the two of them together, never at her alone.",
      example: "Ladai Halt",
    },
    {
      path: "stations[2].detail",
      label: "Stop 3 — how many times",
      kind: "text",
      max: DETAIL,
      required: true,
      guide:
        "The right-aligned note against the unscheduled stop, and it is a count rather than a time — how many times this has happened, stated flatly and with a suspiciously precise number. Two or three words, under 30 characters.",
      example: "27 times",
    },
    {
      path: "stations[3].name",
      label: "Stop 4 — where they are now",
      kind: "text",
      max: STATION,
      required: true,
      guide:
        "The stop marked as the train's current location — where the two of them are right now. If they are apart, name the distance as a station; if they are waiting on something, name the waiting. Two or three words plus a railway word, under 28 characters.",
      example: "Long Distance Ghat",
    },
    {
      path: "stations[4].name",
      label: "Stop 5 — the next one",
      kind: "text",
      max: STATION,
      required: true,
      guide:
        "The next stop ahead of them, still upcoming on the board: the thing that is actually going to happen next — the visit, the move, the day they are counting down to. Two or three words, under 28 characters. Keep it to something real that is already planned rather than a promise about the whole future.",
      example: "Ghar Pe Milna",
    },

    {
      path: "delay.amount",
      label: "Running late by",
      kind: "text",
      max: 20,
      required: true,
      guide:
        "How late this train is running, printed in the delay strip. A duration in months or years rather than minutes — that mismatch is the joke. Two or three words, under 20 characters.",
      example: "4 months",
    },
    {
      path: "delay.reason",
      label: "Reason for delay",
      kind: "text",
      max: 60,
      required: true,
      guide:
        "The stated reason for the delay, in the flattest possible official language — the kind of phrase a railway uses precisely so it explains nothing. Under 60 characters, no apology, no emotion. The blankness is what makes it land.",
      example: "circumstances beyond our control",
    },
    {
      path: "finePrint",
      label: "Conditions of carriage",
      kind: "list",
      max: 6,
      itemMax: 200,
      required: true,
      guide:
        "The block of terms and conditions printed at the bottom of the slip at 6.5px, where it is deliberately almost too small to read — the contrast between the bureaucratic voice and what it is actually admitting is the whole payload. Write 5 or 6 clauses. Each one opens in immaculate railway legalese ('Passengers are advised…', 'This ticket is non-transferable…', 'No refund shall be admissible…') and then, in the second half of the same clause, quietly says something completely sincere about her. One or two sentences per clause, under 200 characters each. Never break the register to make the joke — the straight face is the joke.",
      example:
        "Passengers are advised to reach the platform 30 minutes prior to departure. I have been on this platform since March 2023.",
    },
    {
      path: "letter",
      label: "The letter under the slip",
      kind: "longtext",
      max: 900,
      required: true,
      guide:
        "The letter printed under the ticket, in plain readable serif, where the railway voice is dropped completely — the tonal drop is the point of the whole page. Three or four short paragraphs separated by blank lines, under 900 characters. Acknowledge that a ticket is a strange way to say this, say what the waiting has actually been like, and end at the platform. First person, spoken plainly, no railway metaphors in the last paragraph, and nothing that puts her under any obligation to answer.",
      example:
        "I know a ticket is a strange way to say this.\n\nBut every time I have refreshed a status page in two years it was because of a train that would eventually put me in the same room as you.\n\nSee you on the platform.",
    },
  ],
};

// Left out on purpose:
//
//   departureAt / arrivalAt / chartPreparedAt — ISO timestamps, collected through
//     datetime-local pickers pinned to Asia/Kolkata. departureAt drives the
//     boarding countdown and chartPreparedAt is a server-enforced gate that
//     withholds the names and the letter until it passes; a guessed date either
//     breaks the countdown or locks the page shut on the wrong day.
//   passengers[n].coach / seat / bookingStatus / currentStatus / berth / age —
//     the booking itself. Seats in the same coach are what print ADJACENT under
//     the confirmation, and bookingStatus seeds the waitlist ladder on screen 1;
//     both are numeric decisions the editor already defaults sensibly.
//   fare[] — the five fare lines. The seeded values ("worth it", "PRICELESS")
//     are register-setting rather than couple-specific, and the budget was worth
//     more spent on the route, which is a whole screen.
//   trainNo, classCode, quota — invented codes with sensible defaults.
