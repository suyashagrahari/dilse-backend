// ─── Newest first, or oldest first ───────────────────────────────────────────
//
// Four admin lists — drafts, feedback, conversations and contact inquiries —
// were all hardcoded to newest-first. That is the right default and the wrong
// only-option: "what just came in" and "what has been sitting here longest" are
// different questions, and the second one is how a backlog gets cleared.
//
// ── WHY A NAMED ORDER AND NOT A FIELD NAME ──────────────────────────────────
//
// The client sends `sort=newest|oldest`, never a column. Three reasons:
//
//   1. The four lists do not agree on which field means "recent". A
//      conversation's recency is `lastMessageAt` — a thread from March that
//      somebody replied to an hour ago IS recent — while a draft's is
//      `createdAt`. Letting the client name the field means every panel has to
//      know that, and one of them will get it wrong.
//   2. A field name from a query string reaches Mongo's sort spec. Accepting an
//      arbitrary one invites sorting by an unindexed path, which turns a paged
//      list into a collection scan.
//   3. Two values can be validated by comparison. Anything unrecognised falls
//      back to the default rather than erroring, because a list that refuses to
//      load because a dropdown carried an odd value is worse than one sorted
//      the way it always was.

export type SortOrder = "newest" | "oldest";

export const DEFAULT_SORT: SortOrder = "newest";

/** The requested order, or the default for anything unrecognised. */
export function parseSortOrder(value: unknown): SortOrder {
  return String(value ?? "").trim().toLowerCase() === "oldest" ? "oldest" : DEFAULT_SORT;
}

/** Mongo's direction for that order: -1 newest first, 1 oldest first. */
export function sortDirection(order: SortOrder): 1 | -1 {
  return order === "oldest" ? 1 : -1;
}

/**
 * A Mongo sort spec for one field.
 *
 * `_id` is appended as a tiebreak. Without it, rows sharing a timestamp — a
 * seeded batch, or two feedbacks in the same second — can come back in a
 * different order on each request, which shows up as a row appearing on both
 * page 1 and page 2 while another is never seen at all.
 */
export function sortSpec(field: string, order: SortOrder): Record<string, 1 | -1> {
  const dir = sortDirection(order);
  return { [field]: dir, _id: dir };
}
