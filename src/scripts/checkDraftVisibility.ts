// ─── Can a super admin actually see every draft somebody made? ───────────────
//
// READ-ONLY. Counts only; writes nothing, deletes nothing.
//
// `/admin/drafts` promises "every unpublished page across all 43 templates".
// Two things in that path can hide a row, and neither of them announces itself:
//
//   1. THE QUERY. It is `{ isPublished: false }`, and a document where the
//      field is MISSING does not match that — `false` and absent are different
//      in Mongo. Every model declares `default: false`, so Mongoose sets it on
//      create; but a document written before that default existed, or by
//      anything that bypassed Mongoose, would be invisible forever.
//
//   2. THE OWNER FILTER. `getDrafts` drops rows whose creator cannot be read:
//      `rows.filter((r) => r.userEmail)`. That is deliberate — a draft with no
//      readable owner cannot be written to, and showing it as a row with an
//      empty address is an invitation to click Send and get an error — but it
//      means a draft whose `userId` is missing, or whose account has been
//      deleted, silently disappears from the panel.
//
// This measures both, so "the super admin can see the drafts" is a number
// rather than a belief.
//
// Note on what is NOT a defect: a draft made by somebody who never signed in
// has no row here at all. Anonymous work lives in the browser's IndexedDB and
// is promoted to a real document the moment they sign up or log in — see
// `client/lib/draft/adopt.ts`. There is nothing for this script, or the panel,
// to find until that happens.
//
// Run: npx tsx src/scripts/checkDraftVisibility.ts

import mongoose from "mongoose";
import { env } from "../config/env";
import { TEMPLATE_REGISTRY } from "../services/templateRegistry";
import User from "../models/User";

const pad = (v: unknown, n: number) => String(v).padStart(n);

async function main(): Promise<void> {
  const uri = env.MONGODB_URI;
  // Named out loud, like every other script here: running a count against the
  // wrong database and reporting the answer is worse than not running it.
  console.log("database:", (uri.split("/").pop() || "").split("?")[0]);
  await mongoose.connect(uri);

  console.log("templates in the registry:", TEMPLATE_REGISTRY.length, "\n");

  let schemaProblems = 0;
  let totals = { all: 0, drafts: 0, missingFlag: 0, noOwnerId: 0 };
  const owners = new Set<string>();
  const lines: string[] = [];

  for (const entry of TEMPLATE_REGISTRY) {
    const path = entry.model.schema.path("isPublished") as
      | { options?: { default?: unknown } }
      | undefined;

    if (!path) {
      console.log("  PROBLEM: no isPublished path on", entry.templateType);
      schemaProblems++;
    } else if (path.options?.default !== false) {
      console.log(
        `  PROBLEM: isPublished default is ${String(path.options?.default)} on`,
        entry.templateType
      );
      schemaProblems++;
    }

    const [all, drafts, missingFlag, noOwnerId] = await Promise.all([
      entry.model.countDocuments({}),
      entry.model.countDocuments({ isPublished: false }),
      entry.model.countDocuments({ isPublished: { $exists: false } }),
      entry.model.countDocuments({
        isPublished: false,
        $or: [{ userId: { $exists: false } }, { userId: null }],
      }),
    ]);

    totals = {
      all: totals.all + all,
      drafts: totals.drafts + drafts,
      missingFlag: totals.missingFlag + missingFlag,
      noOwnerId: totals.noOwnerId + noOwnerId,
    };

    if (drafts > 0) {
      for (const id of await entry.model.distinct("userId", { isPublished: false })) {
        if (id) owners.add(String(id));
      }
      lines.push(
        `  ${entry.templateType.padEnd(26)} ${pad(drafts, 4)} draft(s) of ${pad(all, 4)}` +
          (noOwnerId ? `   ${noOwnerId} with NO userId` : "")
      );
    }
  }

  console.log("\nschema problems:", schemaProblems);
  console.log("pages in total:       ", totals.all);
  console.log("unpublished (drafts): ", totals.drafts);
  console.log("isPublished MISSING:  ", totals.missingFlag, "— invisible to the panel");
  console.log("drafts with no userId:", totals.noOwnerId, "— dropped by the panel\n");
  console.log(lines.join("\n") || "  (no drafts in any template)");

  const ids = [...owners].filter((id) => mongoose.Types.ObjectId.isValid(id));
  const live = await User.find({ _id: { $in: ids } })
    .select("_id email")
    .lean<{ _id: mongoose.Types.ObjectId; email?: string }[]>();
  const liveIds = new Set(live.map((u) => String(u._id)));
  const withoutEmail = live.filter((u) => !u.email).length;

  console.log("\ndistinct draft owners:            ", owners.size);
  console.log("  accounts that still exist:      ", liveIds.size);
  console.log("  accounts GONE (drafts dropped): ", ids.length - liveIds.size);
  console.log("  existing but no email (dropped):", withoutEmail);

  const hidden = totals.missingFlag + totals.noOwnerId;
  console.log(
    `\nverdict: ${totals.drafts - hidden} of ${totals.drafts} drafts are visible to a super admin` +
      (hidden ? ` — ${hidden} are NOT` : "")
  );

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
