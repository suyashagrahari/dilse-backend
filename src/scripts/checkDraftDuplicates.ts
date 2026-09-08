// ─── Does publishing leave a duplicate draft behind? ─────────────────────────
//
// READ-ONLY. Counts nothing but documents; writes nothing.
//
// The question: when someone builds a page and publishes it, does the row they
// built become the published page, or does a second row get created — leaving
// the first behind as a draft that will never be finished?
//
// Two rows are expected to look like this: same owner, same template, created
// within a short window of each other, one `isPublished: false` and one true.
// The draft autosave POSTs first and remembers the id; publish is supposed to
// PUT that same id. A race between the two would produce exactly this pair.
//
// Run: npx tsx src/scripts/checkDraftDuplicates.ts

import mongoose from "mongoose";
import { env } from "../config/env";
import { TEMPLATE_REGISTRY } from "../services/templateRegistry";

interface Row {
  _id: unknown;
  userId?: unknown;
  isPublished?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

async function main(): Promise<void> {
  const uri = env.MONGODB_URI;
  console.log("database:", (uri.split("/").pop() || "").split("?")[0], "(read-only)\n");
  await mongoose.connect(uri);

  let totalDrafts = 0;
  let totalPublished = 0;
  const suspects: string[] = [];

  for (const entry of TEMPLATE_REGISTRY) {
    const rows = (await entry.model
      .find({}, { userId: 1, isPublished: 1, createdAt: 1, updatedAt: 1 })
      .lean()) as unknown as Row[];

    const drafts = rows.filter((r) => r.isPublished !== true);
    const published = rows.filter((r) => r.isPublished === true);
    totalDrafts += drafts.length;
    totalPublished += published.length;

    // Group by owner: a duplicate can only be a duplicate within one account.
    const byOwner = new Map<string, Row[]>();
    for (const r of rows) {
      const k = String(r.userId ?? "(none)");
      if (!byOwner.has(k)) byOwner.set(k, []);
      byOwner.get(k)!.push(r);
    }

    for (const [owner, group] of byOwner) {
      if (owner === "(none)") continue;
      const d = group.filter((r) => r.isPublished !== true);
      const p = group.filter((r) => r.isPublished === true);
      if (d.length === 0 || p.length === 0) continue;

      // Closest draft/published pair by creation time.
      for (const draft of d) {
        for (const pub of p) {
          const dt = draft.createdAt ? new Date(draft.createdAt).getTime() : 0;
          const pt = pub.createdAt ? new Date(pub.createdAt).getTime() : 0;
          if (!dt || !pt) continue;
          const gapMin = Math.abs(pt - dt) / 60000;
          // Within an hour and in the same account is the shape of "they built
          // it once and it became two rows", as opposed to two genuine pages
          // made on different days.
          if (gapMin <= 60) {
            suspects.push(
              `${entry.templateType.padEnd(30)} owner=${owner.slice(-6)} ` +
                `gap=${gapMin.toFixed(1)}min draft=${String(draft._id).slice(-6)} pub=${String(pub._id).slice(-6)}`
            );
          }
        }
      }
    }
  }

  console.log("totals across all", TEMPLATE_REGISTRY.length, "templates:");
  console.log("  drafts   :", totalDrafts);
  console.log("  published:", totalPublished);

  console.log(
    `\ndraft + published pairs in one account within an hour: ${suspects.length}`
  );
  for (const s of suspects.slice(0, 40)) console.log("  " + s);
  if (suspects.length === 0) {
    console.log("  none — publishing promotes the row it built rather than making a second one");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
