// ─── Free birthday page → Birthday Surprise ✦ Premium ────────────────────────
//
// The other upgrade paths (config/upgradePaths.ts): Birthday GF and the $2
// Happy Birthday both offer "Birthday Surprise ✦ Premium" at publish. Unlike
// the bouquet (whose arrangement maps field by field, bouquetUpgrade.service),
// these free pages have little in common with the premium storybook beyond the
// names, the words and the photos. So the words they wrote are turned into a
// STORY and run through the same story fill every template's "✨ Write it for
// me" uses (storyFill.service + the target's aiFill schema): the model fills
// the premium page's wishes, milestones, reasons, cake line, ticket… from
// what the sender actually wrote, never inventing events the story lacks.
//
// What comes back is a PATCH (schema path → value) the browser lays over the
// premium template's demo (lib/upgrade/compose.ts), plus the carried letter.
// Names and photos are carried by the browser itself: photos never travel
// here, and a page without photos gets none.
//
// Only what the sender wrote counts: the free templates' own demo lines (the
// sample wish, the sample quiz) are dropped before the story is built, so the
// model is not handed placeholder text as if it were theirs.

import { getSchema } from "../config/aiFill";
import { fillFromStory, type FillPeople } from "./storyFill.service";

const MAX_STORY = 3800;

const str = (v: unknown, max = 600): string => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "");
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Birthday GF's sample content (client birthday-gf/components/types.ts DEMO_DATA). */
const BGF_DEMO = new Set(
  [
    "Wishing you a birthday filled with love, laughter, and cherished memories to last a lifetime.",
    "You bring so much joy and light into the world. May this special day be as wonderful as you are!",
    "What is the birthday person's favourite colour?",
    "What would the birthday person pick as a birthday dessert?",
    "What superpower would the birthday person choose?",
    "What is the most embarrassing thing that happened to you this year?",
    "What is your biggest dream for this coming year?",
    "Sing Happy Birthday to yourself right now!",
    "Do your best birthday dance move for 10 seconds!",
    "Who is the last person you texted today?",
    "Make a birthday wish out loud — share it with everyone!",
  ].map((s) => s.toLowerCase()),
);
const isBgfDemo = (s: string) => BGF_DEMO.has(s.trim().toLowerCase());

export interface UpgradeStory {
  story: string;
  people: FillPeople;
  /** Their own letter, kept word for word on the premium page when it is long enough. */
  letter: string;
}

/** Birthday GF payload → the story of what they wrote. */
export function birthdayGfStory(raw: unknown): UpgradeStory {
  const d = obj(raw);
  const to = str(d.recipientName, 30);
  const from = str(d.senderName, 30);
  const who = to || "them";
  const lines: string[] = [`It is ${who}'s birthday${from ? ` and ${from} is making them a birthday surprise` : ""}.`];

  const wish = str(d.birthdayWish, 800);
  const message = str(d.personalMessage, 1500);
  if (wish && !isBgfDemo(wish)) lines.push(`The birthday wish ${from || "the sender"} wrote for ${who}:\n${wish}`);
  if (message && !isBgfDemo(message)) lines.push(`Their personal message to ${who}:\n${message}`);

  const captions = arr(d.galleryPhotos).map((p) => str(obj(p).caption, 140)).filter(Boolean);
  if (captions.length) lines.push(`Captions they wrote under their photos together:\n${captions.map((c) => `- ${c}`).join("\n")}`);

  const quiz = arr(d.quizQuestions)
    .map((q) => {
      const o = obj(q);
      const question = str(o.question, 160);
      const options = arr(o.options).map((x) => str(x, 80));
      const right = options[Math.max(0, Math.min(options.length - 1, Number(o.correct) || 0))] || "";
      return question && !isBgfDemo(question) && right ? `- ${question} → ${right}` : "";
    })
    .filter(Boolean);
  if (quiz.length) lines.push(`Things ${from || "the sender"} knows about ${who} (quiz questions they wrote, with the right answer):\n${quiz.join("\n")}`);

  const dares = arr(d.truthDareQuestions).map((t) => str(obj(t).text, 160)).filter((t) => t && !isBgfDemo(t));
  if (dares.length) lines.push(`Playful truth-or-dare prompts they wrote for ${who}:\n${dares.map((t) => `- ${t}`).join("\n")}`);

  return {
    story: lines.join("\n\n").slice(0, MAX_STORY),
    people: { userName: from || undefined, partnerName: to || undefined },
    letter: message && !isBgfDemo(message) ? message : "",
  };
}

/** Happy Birthday ($2, the Valentine's engine) payload → the story of what they wrote. */
export function happyBirthdayStory(raw: unknown): UpgradeStory {
  const d = obj(raw);
  const to = str(d.recipientName, 30);
  const from = str(d.senderName, 30);
  const who = to || "them";
  const lines: string[] = [`It is ${who}'s birthday${from ? ` and ${from} is making them a birthday surprise` : ""}.`];
  const pet = str(d.petName, 24);
  if (pet) lines.push(`${from || "The sender"} calls ${who} "${pet}".`);
  const letter = str(d.letter, 2000);
  if (letter) lines.push(`The birthday letter ${from || "the sender"} wrote:\n${letter}`);

  // Every line of text they set on the page: wishes, coupons, lines…
  const extras = obj(d.extras);
  const bits: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 3 || bits.length > 30) return;
    if (typeof v === "string") {
      const s = v.trim();
      // Enum keys ("queen", "romantic") are choices, not their words.
      if (s.length >= 12) bits.push(s.slice(0, 160));
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else if (v && typeof v === "object") Object.values(v).forEach((x) => walk(x, depth + 1));
  };
  walk(extras, 0);
  if (bits.length) lines.push(`Other lines they wrote on the page:\n${bits.map((b) => `- ${b}`).join("\n")}`);

  const notes = arr(d.photos)
    .map((p) => [str(obj(p).caption, 100), str(obj(p).note, 200)].filter(Boolean).join(": "))
    .filter(Boolean);
  if (notes.length) lines.push(`What they wrote about their photos together:\n${notes.map((n) => `- ${n}`).join("\n")}`);
  const end = str(d.endLine, 90);
  if (end) lines.push(`Their closing line: ${end}`);

  return {
    story: lines.join("\n\n").slice(0, MAX_STORY),
    people: { userName: from || undefined, partnerName: to || undefined },
    letter,
  };
}

export const STORY_BUILDERS: Readonly<Record<string, (raw: unknown) => UpgradeStory>> = {
  "birthday-gf": birthdayGfStory,
  "happy-birthday": happyBirthdayStory,
};

export interface StoryUpgradeResult {
  /** Schema path → value, laid over the target's demo by the browser. */
  patch: Record<string, unknown>;
  source: "ai" | "carried";
}

/** Their words → a patch for the premium template. Falls back to their letter alone. */
export async function upgradeViaStory(from: string, to: string, raw: unknown): Promise<StoryUpgradeResult> {
  const build = STORY_BUILDERS[from];
  const schema = getSchema(to);
  if (!build || !schema) throw new Error(`No story upgrade from ${from} to ${to}`);
  const s = build(raw);
  const carried: Record<string, unknown> = s.letter.length >= 30 ? { letter: s.letter } : {};
  // Nothing of theirs beyond the names: the premium demo's own words stay.
  if (s.story.split("\n\n").length <= 1) return { patch: carried, source: "carried" };
  try {
    const r = await fillFromStory({ schema, story: s.story, people: s.people, hints: { occasion: "birthday" } });
    // Their own letter beats a rewrite of it.
    return { patch: { ...r.patch, ...carried }, source: "ai" };
  } catch {
    return { patch: carried, source: "carried" };
  }
}
