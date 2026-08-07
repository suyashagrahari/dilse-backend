/**
 * A first-pass profanity filter. Deliberately small, and deliberately honest
 * about it.
 *
 * This exists to raise a hand, not to slam a door. Its only job is to set the
 * `flagged` boolean on a contribution so the human moderation queue can show
 * that one first. Nothing in this codebase should ever use it to reject, hide,
 * or auto-publish anything — a contribution is published because the page owner
 * pressed approve, and for no other reason.
 *
 * What it will miss, by construction:
 *   - anything spaced out ("f u c k"), because punctuation is collapsed away
 *   - creative spellings not in the tiny list below
 *   - every language except English and the handful of Hinglish words here
 *   - anything abusive that happens to use ordinary words, which is most of it
 *
 * What it will get wrong in the other direction: real names and ordinary words
 * that collide with the list ("Dick"). That is an acceptable cost precisely
 * because the output is a hint for a person, not a verdict.
 *
 * Do not grow this into a moderation system. If real moderation is ever needed,
 * it belongs behind a service call, not in a string array.
 */

/**
 * The word list. Short, obvious, and not comprehensive — see the note above.
 * Entries must be lowercase a-z only; the normaliser below strips everything
 * else before matching, so an entry with punctuation in it can never match.
 */
const FLAGGED_WORDS: ReadonlySet<string> = new Set([
  // English
  "fuck",
  "shit",
  "bitch",
  "bastard",
  "cunt",
  "dick",
  "asshole",
  "whore",
  "slut",
  "rape",
  "retard",
  "nigger",
  "faggot",
  // Hinglish — the ones that actually turn up, romanised as people type them
  "chutiya",
  "chutiye",
  "madarchod",
  "behenchod",
  "bhenchod",
  "gaand",
  "randi",
  "lund",
  "harami",
  "kutiya",
]);

/**
 * The laziest possible leetspeak fold. Covers "sh1t" and "f@ck" and stops
 * there — anything cleverer is a losing arms race, and losing it quietly would
 * be worse than not playing.
 */
const LEET_FOLD: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

/** Trailing inflections stripped before matching, so "fucking" hits "fuck". */
const SUFFIXES = /(?:ing|ers|er|ed|es|s)$/;

/**
 * True if `text` contains a word from the small list above.
 *
 * Never throws and never trusts its input's type — it is called with values
 * that came straight off the wire.
 */
export function isProfane(text: string): boolean {
  if (typeof text !== "string" || text.length === 0) return false;

  const normalised = text
    .toLowerCase()
    .replace(/[013457@$]/g, (char) => LEET_FOLD[char] ?? char)
    // Everything that is not a letter becomes a separator. This is what makes
    // the filter blind to spaced-out spellings; that trade is on purpose.
    .replace(/[^a-z]+/g, " ")
    .trim();

  if (normalised.length === 0) return false;

  return normalised.split(" ").some((word) => {
    if (FLAGGED_WORDS.has(word)) return true;
    const stem = word.replace(SUFFIXES, "");
    return stem.length > 2 && FLAGGED_WORDS.has(stem);
  });
}
