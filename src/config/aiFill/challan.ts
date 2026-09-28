import type { AiFillTemplateSchema } from "./types";

/**
 * challan — a parody traffic-violation notice.
 *
 * Paths resolve against `ChallanData` in
 * client/app/(templates)/challan/components/types.ts.
 *
 * WHAT THE MODEL IS AND IS NOT ALLOWED NEAR
 *
 * The issuing authority on this page is invented end to end. The model writes
 * the fiction — the department's name, its motto, the statutes, the offences —
 * and it must never reach for the real thing. Every real emblem, motto,
 * department, portal and identity document is on `forbiddenOutput` below, which
 * is a deterministic post-generation deny-list: a field that trips it is
 * dropped and reported back as missing, so a slip costs one blank input rather
 * than a published page that impersonates a government.
 *
 * The structural fields stay out of the schema. `challanNo`, `issuedAt`,
 * `dueAt` and `officer.id` are identifiers and timestamps the renderer parses
 * and the editor seeds — a model rewriting them buys nothing and can break the
 * overdue logic. `offences[].fine` is a number the page prints, not prose.
 * `evidence.imageUrl` is a photograph and is therefore unreachable by
 * construction: `FieldKind` has no media member and `assertNoMediaPaths` would
 * refuse the path.
 *
 * `totalFine` IS here, and it is the joke the whole template turns on: it is
 * free text, and the correct answer is almost never a number.
 */
export const challan: AiFillTemplateSchema = {
  slug: "challan",
  audience: "partner",
  premise:
    "A parody traffic e-challan issued by a wholly invented body — the Department of Heart Traffic, Republic of Us — for offences against the sender's heart. The recipient does not read this notice, they settle it: pay it or contest it, and either way the joke opens into something sincere. It only works if the document looks bureaucratically boring and completely real in its FORM while every word in it is fiction: invented department, invented statutes, invented officer, invented plate. It is a notice, never an identity document, and it carries a visible disclaimer that it has no legal effect. Write it in the flat, clipped register of a real enforcement form — then drop the register entirely for the two closing messages, which are the sender speaking honestly.",
  forbiddenOutput: [
    // The emblem, the motto, and the state
    "Satyameva Jayate",
    "सत्यमेव जयते",
    "Ashoka",
    "Ashok Stambh",
    "Ashoka Chakra",
    "Lion Capital",
    "State Emblem",
    "Emblem of India",
    "National Emblem",
    "Government of India",
    "Republic of India",
    "Tiranga",
    // Transport portals, registries and marks
    "Parivahan",
    "mParivahan",
    "RTO",
    "Regional Transport Office",
    "Vahan",
    "Sarathi",
    "FASTag",
    "NHAI",
    "MoRTH",
    "Ministry of Road Transport",
    "Motor Vehicles Department",
    "Transport Department",
    "DigiLocker",
    // Identity documents — the line this template exists to hold
    "Aadhaar",
    "Aadhar",
    "UIDAI",
    "PAN card",
    "driving licence",
    "driving license",
    "Voter ID",
    "passport",
    "registration certificate",
    // Real forces and real law
    "Delhi Police",
    "Mumbai Police",
    "Kolkata Police",
    "Chennai Police",
    "Hyderabad Police",
    "Bengaluru Traffic Police",
    "Bangalore Traffic Police",
    "Pune Traffic Police",
    "Traffic Police",
    "Highway Patrol",
    "Indian Police Service",
    "Motor Vehicles Act",
    "Indian Penal Code",
    "Bharatiya Nyaya Sanhita",
    "IPC",
    "CrPC",
    // Held name
    "Aditi",
  ],
  fields: [
    // ── The invented authority ───────────────────────────────────────────────
    {
      path: "authority.name",
      label: "Issuing authority",
      kind: "text",
      max: 60,
      required: true,
      guide:
        "The invented department printed largest in the letterhead. Must read like a real government body and be obviously fictional at the same time: a real-sounding noun phrase built out of the language of the relationship. Never name, echo, or abbreviate any real police force, transport office or ministry.",
      example: "Department of Heart Traffic",
    },
    {
      path: "authority.department",
      label: "Issuing wing",
      kind: "text",
      max: 60,
      guide:
        "The smaller sub-line under the authority name — the specific wing that issued this notice. Bureaucratic and over-specific, the way a real enforcement letterhead names a division nobody has heard of. Parenthetical if it helps.",
      example: "Enforcement Wing (Emotional Offences)",
    },
    {
      path: "authority.state",
      label: "Jurisdiction",
      kind: "text",
      max: 40,
      guide:
        "The invented state or republic this authority governs — a place that does not exist, named for the two people involved. One short line. Never a real state, city, union territory or country.",
      example: "Republic of Us",
    },
    {
      path: "authority.motto",
      label: "Authority motto",
      kind: "text",
      max: 60,
      required: true,
      guide:
        "The small motto engraved under the seal, in Devanagari, written for THIS relationship — a mock-solemn maxim about her, or about the sender's failure to behave. Must be invented; never a real national, state, or institutional motto in any script.",
      example: "प्रेम पथ पर धीरे चलिए",
    },
    // ── The accused and the officer ──────────────────────────────────────────
    {
      path: "accused.address",
      label: "Address on record",
      kind: "text",
      max: 120,
      guide:
        "The address printed against her name. Written the way an official form flattens a place into a line, but the place is one only the two of them would recognise — a floor, a landmark, a door. Never a real, complete, locatable street address.",
      example: "Second floor, the flat with the loud fan, near the tea stall",
    },
    {
      path: "accused.vehicleNo",
      label: "Vehicle number",
      kind: "text",
      max: 24,
      guide:
        "The joke registration plate in the vehicle field. Uppercase, spaced like a plate, with a word or a date smuggled into the middle block so it reads as a plate and lands as a line. Must be obviously invented and must not be a plausible real registration.",
      example: "KA 01 LUV 2023",
    },
    {
      path: "officer.name",
      label: "Issuing officer",
      kind: "text",
      max: 60,
      guide:
        "The name signed at the bottom of the notice. The sender, rendered as an officer — either their own name in official form, or a straight-faced alias that gives them away.",
      example: "R. Menon",
    },
    {
      path: "officer.post",
      label: "Officer's post",
      kind: "text",
      max: 60,
      guide:
        "The rank and posting printed under the signature. Real-sounding rank, invented force. Keep it short enough to sit on one line under a signature.",
      example: "Sub-Inspector, Heart Traffic",
    },
    // ── Where and what the camera caught ─────────────────────────────────────
    {
      path: "location",
      label: "Place of offence",
      kind: "text",
      max: 120,
      required: true,
      guide:
        "The single line naming where this happened, in the clipped form-filling register a real notice uses — place, then time, comma-separated, no sentence. It should be a place from their actual story, specific enough that she knows exactly which night this is. This line does more work than any other short field on the page.",
      example: "Near her house, 11:40 PM",
    },
    {
      path: "evidence.plateText",
      label: "Plate reading",
      kind: "text",
      max: 24,
      guide:
        "The characters shown enlarged in the cropped NUMBER PLATE inset beside the camera frame. Should match the vehicle number on the notice, uppercase, spaced as a plate is spaced.",
      example: "KA 01 LUV 2023",
    },
    {
      path: "evidence.timestamp",
      label: "Camera timestamp",
      kind: "text",
      max: 40,
      guide:
        "The timestamp burned into the corner of the camera frame. Free text printed exactly as written, never parsed — use the dense DD/MM/YYYY HH:MM:SS form a road camera stamps, and make the time late enough to be incriminating.",
      example: "14/03/2026 23:41:07",
    },
    // ── The offences ─────────────────────────────────────────────────────────
    {
      path: "offences[0].section",
      label: "Offence 1 — section",
      kind: "text",
      max: 60,
      required: true,
      guide:
        "The invented statute this offence is booked under, formatted the way a real section citation is formatted: a section number, a sub-clause letter, and the name of a made-up act. Never cite a real act, code or section number.",
      example: "Sec 12(b), Heart Traffic Act",
    },
    {
      path: "offences[0].description",
      label: "Offence 1 — description",
      kind: "text",
      max: 140,
      required: true,
      guide:
        "The charge itself, written as a real notice writes one: a noun phrase in the passive-official register, no jokes signalled, no exclamation. The comedy comes entirely from a tender or ridiculous act being described in enforcement language. Start with the strongest one.",
      example: "Occupying the sender's thoughts without a valid permit",
    },
    {
      path: "offences[0].note",
      label: "Offence 1 — note",
      kind: "text",
      max: 140,
      guide:
        "The small italic aside under the charge, in the voice of the officer adding a remark to the file. One clause. This is where the specific memory goes — the detail that proves this notice was written about her and no one else.",
      example: "Repeat offence. Third instance recorded this month.",
    },
    {
      path: "offences[1].section",
      label: "Offence 2 — section",
      kind: "text",
      max: 60,
      guide:
        "Invented statute for the second charge, in the same citation format and from the same made-up act as the first, with a different section number.",
      example: "Sec 7(a), Heart Traffic Act",
    },
    {
      path: "offences[1].description",
      label: "Offence 2 — description",
      kind: "text",
      max: 140,
      guide:
        "The second charge. Same flat enforcement register. Must be a different kind of offence from the first — if the first is about presence, make this one about speed, signal, or conduct.",
      example: "Exceeding the permitted rate of being missed",
    },
    {
      path: "offences[1].note",
      label: "Offence 2 — note",
      kind: "text",
      max: 140,
      guide:
        "Italic officer's remark under the second charge. One clause, dry, specific to their story.",
      example: "Measured over a distance of four hundred kilometres.",
    },
    {
      path: "offences[2].section",
      label: "Offence 3 — section",
      kind: "text",
      max: 60,
      guide:
        "Invented statute for the third charge, same format and same fictional act, different section number.",
      example: "Sec 4(c), Heart Traffic Act",
    },
    {
      path: "offences[2].description",
      label: "Offence 3 — description",
      kind: "text",
      max: 140,
      guide:
        "The third charge. Keep the register identical; vary only the subject. By now the list should be building a picture of one particular person.",
      example: "Failure to signal before changing everything",
    },
    {
      path: "offences[2].note",
      label: "Offence 3 — note",
      kind: "text",
      max: 140,
      guide:
        "Italic officer's remark under the third charge. One clause. Dry to the end.",
      example: "No indication was given at any point.",
    },
    {
      path: "offences[3].section",
      label: "Offence 4 — section",
      kind: "text",
      max: 60,
      guide:
        "Invented statute for an optional fourth charge, same format and act. Leave empty if three charges already say it.",
      example: "Sec 19, Heart Traffic Act",
    },
    {
      path: "offences[3].description",
      label: "Offence 4 — description",
      kind: "text",
      max: 140,
      guide:
        "An optional fourth charge, and the place to put the softest one — the offence that is really a compliment. Still written flat, still no wink.",
      example: "Unauthorised occupation of a reserved space",
    },
    {
      path: "offences[3].note",
      label: "Offence 4 — note",
      kind: "text",
      max: 140,
      guide:
        "Italic officer's remark under the fourth charge. One clause, and the driest of the four.",
      example: "Space was reserved for her. Offence stands regardless.",
    },
    // ── The total, and how to settle it ──────────────────────────────────────
    {
      path: "totalFine",
      label: "Total fine payable",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "THE ONE FIELD THE WHOLE PAGE TURNS ON. It is FREE TEXT printed exactly as written, never a sum of the individual fines and almost never a number. The correct answer is what the sender actually wants: a thing she can pay with, stated in three or four plain words, sitting in the box where a rupee amount belongs. Lowercase. No currency symbol, no digits, no punctuation.",
      example: "one date",
    },
    {
      path: "settlement.methods[0].label",
      label: "Settlement option 1",
      kind: "text",
      max: 60,
      required: true,
      guide:
        "The first row on the settlement sheet — how she can pay this off. Named the way a payment app names a rail: a short noun phrase, title case, no verb. Concrete and doable this week.",
      example: "Dinner, Paid In Person",
    },
    {
      path: "settlement.methods[0].sub",
      label: "Settlement option 1 — detail",
      kind: "text",
      max: 120,
      guide:
        "The small grey second line under the option, in the voice of a payment app's fine print — processing time, conditions, a caveat. Deadpan.",
      example: "Settles immediately. No refunds.",
    },
    {
      path: "settlement.methods[1].label",
      label: "Settlement option 2",
      kind: "text",
      max: 60,
      guide:
        "The second settlement row. A different kind of payment from the first — if the first is an outing, make this one time, attention, or an admission.",
      example: "One Uninterrupted Evening",
    },
    {
      path: "settlement.methods[1].sub",
      label: "Settlement option 2 — detail",
      kind: "text",
      max: 120,
      guide:
        "Fine print under the second option. Same flat payment-app voice, one line.",
      example: "Phones surrendered at the door.",
    },
    {
      path: "settlement.methods[2].label",
      label: "Settlement option 3",
      kind: "text",
      max: 60,
      guide:
        "The third settlement row, and the one that can be smallest — the cheapest possible way to make this go away.",
      example: "A Reply Before Midnight",
    },
    {
      path: "settlement.methods[2].sub",
      label: "Settlement option 3 — detail",
      kind: "text",
      max: 120,
      guide:
        "Fine print under the third option. One line, deadpan, faintly hopeful underneath.",
      example: "Partial settlement. Balance carried forward.",
    },
    // ── The two sincere endings ──────────────────────────────────────────────
    {
      path: "paidMessage",
      label: "Message after she pays",
      kind: "list",
      max: 4,
      itemMax: 240,
      required: true,
      guide:
        "THE EMOTIONAL PAYLOAD, shown in a serif OUTSIDE the document once she settles the challan. Everything before this is a form; here the sender stops performing and talks. 2 to 4 short paragraphs, 200 to 500 characters total. Drop the enforcement voice completely — no sections, no fines, no callbacks to the offences, no jokes. One concrete detail from their story so these lines could not have been written about anybody else. End without asking for anything.",
      example:
        "You didn't even ask what it was for. You just paid it.",
    },
    {
      path: "contestMessage",
      label: "Message if she contests it",
      kind: "list",
      max: 4,
      itemMax: 240,
      required: true,
      guide:
        "THE OTHER ENDING, shown when she fights the notice and the objection is upheld. Same serif, same honesty, same length — 2 to 4 paragraphs, 200 to 500 characters — but a different sender: this one is conceding. The charges are dropped because she was right, or because it was never really about the charges. Warm, a little disarmed, not sulking. Again no legal register and no jokes, and it must not simply restate the paid message in other words.",
      example:
        "Objection upheld. You were right, and I withdraw all of it except the part where I miss you.",
    },
    // ── The main letter ──────────────────────────────────────────────────────
    {
      path: "letter",
      label: "Officer's personal remarks (the main letter)",
      kind: "longtext",
      max: 1200,
      guide:
        "THE MAIN LETTER. It is revealed at the very end, after she has paid or contested and the camera evidence has been reviewed, printed as the 'Officer's personal remarks' on a final court order and sealed with a stamp. The first line may keep one dry beat of the enforcement voice (a case number, 'having reviewed the evidence', 'the officer notes for the record') and then the sender drops the act completely and writes to her as themselves. Open with her name on its own line, then two to four short paragraphs, then sign off with the sender's name on the last line. One concrete shared memory from the story and one thing the sender has never said out loud. Simple warm English, no lists, no emojis, no rhymes, and no fines, sections or legal threats once the act is dropped. Line breaks between paragraphs.",
      example:
        "Meera,\n\nHaving reviewed all the footage, the officer has one remark for the record, and it is not about traffic.\n\nYou walked into my life at 11:40 on a Tuesday with a box of momos nobody ordered, and I have been a better, calmer, happier person every single day since.\n\nNo fine. Just stay.\n\nKabir",
    },
  ],
};
