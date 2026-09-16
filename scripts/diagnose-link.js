/**
 * Why will this link not open?
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * "The link doesn't open" arrives as a sentence, not a stack trace, and every
 * one of the causes below produces exactly that same sentence from the outside:
 *
 *   - the page was never published       → the share route 404s by design
 *   - the page was deleted               → same 404, different story
 *   - a password stored before the trim  → every password is refused forever
 *   - the link points at the builder     → opens the template, not their page
 *
 * Telling them apart needs one look at the row, and until now the only script
 * that looked at page passwords was the REPAIR one — so the fastest way to
 * answer a support question was to run a tool whose purpose is to write. This
 * one only reads.
 *
 *   node scripts/diagnose-link.js --uri='mongodb://…/dbname' <link-or-shareId>
 *   node scripts/diagnose-link.js --uri='…' --email=someone@example.com
 *
 * Requires `npm run build` first: it reads the same TEMPLATE_REGISTRY the app
 * does, so a template can never be missing from this tool while existing in the
 * app.
 *
 * ── IT NEVER WRITES AND NEVER PRINTS A PASSWORD ─────────────────────────────
 *
 * Only `find`. The stored plaintext is described (length, stray whitespace)
 * rather than echoed: the shape is the whole diagnosis, and a support tool that
 * prints passwords ends up pasting them into chat logs and ticket threads.
 */

require("dotenv").config();
const mongoose = require("mongoose");

// Passwords began being trimmed on save in 62db985. A page created before this
// stored the string exactly as typed, whitespace included.
const TRIM_FIX_DATE = new Date("2026-09-01T00:00:00Z");

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : "";
};

/** Pull a shareId out of whatever the user pasted — a full URL or a bare id. */
const SHARE_ID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
function extractShareId(input) {
  const m = String(input || "").match(SHARE_ID_RE);
  return m ? m[0].toLowerCase() : "";
}

function describeSecret(raw) {
  if (typeof raw !== "string" || !raw) return "not stored (cannot be auto-repaired)";
  const trimmed = raw.trim();
  if (!trimmed) return `${raw.length} chars, ALL whitespace — unrepairable`;
  if (trimmed !== raw) {
    const lead = raw.length - raw.replace(/^\s+/, "").length;
    const tail = raw.length - raw.replace(/\s+$/, "").length;
    return `${trimmed.length} chars + STRAY WHITESPACE (${lead} leading, ${tail} trailing)`;
  }
  return `${trimmed.length} chars, clean`;
}

function reportPage(entry, page, ownerBySubdomain) {
  const problems = [];
  const notes = [];

  console.log(`\n  template   : ${entry.label} (${entry.templateType})`);
  console.log(`  page id    : ${page._id}`);
  console.log(`  created    : ${page.createdAt ? page.createdAt.toISOString() : "?"}`);
  console.log(`  views      : ${page.viewCount || 0}`);

  // ── Published? ───────────────────────────────────────────────────────────
  if (!page.isPublished) {
    problems.push(
      "NOT PUBLISHED — every share route filters on { isPublished: true }, so this 404s.\n" +
        "        The page exists and its content is intact; it was built but never published.\n" +
        "        Ask them to reopen it from My Creations and press Publish/Share."
    );
  }

  // ── Reachable at what URL? ───────────────────────────────────────────────
  if (!page.shareId) {
    problems.push("NO shareId — the page has never been through publish at all.");
  } else {
    const apex = `https://subhsandesh.in/${page.shareId}`;
    console.log(`  apex link  : ${apex}`);
    if (ownerBySubdomain) {
      console.log(`  their link : https://${ownerBySubdomain}.subhsandesh.in/${page.shareId}`);
      notes.push(
        "Both URLs serve the same page. If only one fails, it is a routing issue, not this row."
      );
    }
  }

  // ── Password ─────────────────────────────────────────────────────────────
  if (!page.password) {
    console.log("  password   : none — opens for anyone with the link");
  } else {
    const raw = page.passwordRaw;
    console.log(`  password   : set — ${describeSecret(raw)}`);

    const preFix = page.createdAt && page.createdAt < TRIM_FIX_DATE;
    const strayWhitespace = typeof raw === "string" && raw.trim() !== raw && raw.trim();

    if (strayWhitespace) {
      problems.push(
        "PASSWORD STORED WITH STRAY WHITESPACE.\n" +
          "        The recipient must type it WITH that whitespace to get in — which nobody\n" +
          "        does, and a phone keyboard adds the space without being asked.\n" +
          "        Fix: node scripts/repair-page-passwords.js --uri='…' --write --i-mean-production"
      );
    } else if (preFix && !raw) {
      problems.push(
        "Created before the trim fix and has no stored plaintext, so if its hash carries\n" +
          "        whitespace it cannot be repaired automatically — the password must be reset."
      );
    }
  }

  if (problems.length === 0) {
    console.log("\n  => This row is healthy. The page should open.");
    console.log("     If it still does not, the link they were given is the wrong one —");
    console.log("     compare it against the apex link above.");
  } else {
    console.log(`\n  => ${problems.length} problem(s) found:`);
    problems.forEach((p) => console.log(`     - ${p}`));
  }
  notes.forEach((n) => console.log(`     note: ${n}`));
  return problems.length;
}

/**
 * Diagnose a link over the PUBLIC API, with no database and no credentials.
 *
 * ── WHY THIS MODE EXISTS ────────────────────────────────────────────────────
 *
 * The database is not always reachable from where the question is being asked —
 * a laptop without the production URI, a support person who should not have it,
 * or a sandbox that refuses the connection. Almost every distinction that
 * matters is visible from outside anyway, because it is exactly what the
 * recipient's browser sees:
 *
 *   404            → not published, or deleted
 *   200 + password → the page is there and the gate is the problem
 *   200            → the page opens; the link they were given is the wrong one
 *
 * The one thing it cannot see is whether a stored password carries whitespace,
 * since the hash never leaves the server. `--password=` closes that: verifying
 * the same string trimmed and untrimmed tells the two apart definitively,
 * because a legacy row opens for exactly one of them.
 */
async function diagnoseLive(shareId, password, apiBase) {
  const API = apiBase || "https://api.subhsandesh.in/api";
  console.log(`=== live check: ${shareId} ===`);
  console.log(`  api        : ${API}`);
  console.log(`  apex link  : https://subhsandesh.in/${shareId}`);

  let res;
  try {
    res = await fetch(`${API}/share/${shareId}`);
  } catch (e) {
    console.log(`  could not reach the API: ${e.message}`);
    return;
  }

  if (res.status === 404) {
    console.log("  share API  : 404 Page not found\n");
    console.log("  => The page is NOT PUBLISHED, or it was deleted.");
    console.log("     Every share route filters on { isPublished: true }. This is the single");
    console.log("     most common cause: the page was built but publish never completed.");
    console.log("     Ask them to open it from My Creations and press Publish/Share again.");
    return;
  }
  if (!res.ok) {
    console.log(`  share API  : ${res.status} — the API is unhappy, not the page.`);
    return;
  }

  const body = await res.json();
  const d = body.data || {};
  console.log(`  share API  : 200 OK`);
  console.log(`  template   : ${body.templateType}`);
  console.log(`  from → to  : ${d.senderName || "?"} → ${d.recipientName || "?"}`);
  console.log(`  created    : ${d.createdAt || "?"}`);
  console.log(`  views      : ${d.viewCount != null ? d.viewCount : "?"}`);
  console.log(`  password   : ${body.hasPassword ? "SET" : "none"}`);

  if (!body.hasPassword) {
    console.log("\n  => The page is published and opens for anyone with the link.");
    console.log("     If they still cannot open it, the URL they were given is not this one.");
    return;
  }
  if (!password) {
    console.log("\n  => Published, but password-gated. Re-run with --password='their password'");
    console.log("     to find out whether the stored hash carries stray whitespace.");
    return;
  }

  // A legacy row opens for exactly one of these two; a healthy row opens for
  // both; a wrong password opens for neither.
  const base = body.templateType === "proposal" ? "proposal-pages" : null;
  const verify = async (candidate) => {
    const url = base
      ? `${API}/${base}/share/${shareId}/verify`
      : `${API}/share/${shareId}/verify`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: candidate }),
    });
    return r.status;
  };

  const trimmed = password.trim();
  const asTyped = await verify(password);
  const asTrimmed = password === trimmed ? asTyped : await verify(trimmed);
  console.log(`\n  verify as typed   (${JSON.stringify(password)}) -> ${asTyped}`);
  console.log(`  verify trimmed    (${JSON.stringify(trimmed)}) -> ${asTrimmed}`);

  if (asTyped === 200 || asTrimmed === 200) {
    console.log("\n  => This password DOES open the page. The gate is not the problem —");
    console.log("     they are typing something else, or opening a different link.");
  } else {
    console.log("\n  => Neither form opens it. Either the password is not what you think,");
    console.log("     or this row predates the trim fix and its hash carries whitespace");
    console.log("     that nothing typed can reproduce. That case needs:");
    console.log("       node scripts/repair-page-passwords.js --uri='…' --write --i-mean-production");
  }
}

(async () => {
  // The target is never inferred — same rule as repair-page-passwords.js, and
  // for the same reason: every copy of .env carries PROD_MONGODB_URI.
  const uri = arg("uri") || process.env.REPAIR_MONGODB_URI || "";
  const email = arg("email").toLowerCase();
  const target = process.argv.slice(2).find((a) => !a.startsWith("--")) || "";
  const shareId = extractShareId(target);

  // No database needed, and none is opened.
  if (process.argv.includes("--live") && shareId) {
    await diagnoseLive(shareId, arg("password"), arg("api"));
    return;
  }

  if (!uri || (!shareId && !email)) {
    console.error("Read-only. Diagnoses why a share link will not open.\n");
    console.error("  node scripts/diagnose-link.js --live <link>          (no database needed)");
    console.error("  node scripts/diagnose-link.js --live <link> --password='their password'");
    console.error("  node scripts/diagnose-link.js --uri='mongodb://…/dbname' <link-or-shareId>");
    console.error("  node scripts/diagnose-link.js --uri='…' --email=someone@example.com\n");
    if (target && !shareId) {
      console.error(`"${target}" contains no shareId.`);
      console.error("A share link looks like https://subhsandesh.in/<uuid> (or <name>.subhsandesh.in/<uuid>).");
      console.error("A URL like https://subhsandesh.in/proposal is the BUILDER, not a share link —");
      console.error("if that is what was sent to the recipient, that alone explains it.\n");
    }
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`connected to ${mongoose.connection.name} (read-only: this script never writes)\n`);

  const { TEMPLATE_REGISTRY } = require("../dist/services/templateRegistry");
  const User = require("../dist/models/User").default;

  let found = 0;

  if (shareId) {
    console.log(`=== share id ${shareId} ===`);
    for (const entry of TEMPLATE_REGISTRY) {
      if (!entry.model.schema.path("shareId")) continue;
      const page = await entry.model.findOne({ shareId }).select("+passwordRaw");
      if (!page) continue;
      found++;
      const owner = page.userId ? await User.findById(page.userId).select("email name subdomain") : null;
      if (owner) console.log(`  owner      : ${owner.name || "?"} <${owner.email}>`);
      reportPage(entry, page, owner && owner.subdomain);
    }
    if (!found) {
      console.log(`  NOT FOUND in any of the ${TEMPLATE_REGISTRY.length} page collections.`);
      console.log("  Either the id is wrong, or the page was deleted. A deleted page and a");
      console.log("  never-created one are indistinguishable from here — both simply 404.");
    }
  }

  if (email) {
    console.log(`\n=== pages owned by ${email} ===`);
    const user = await User.findOne({ email }).select("email name subdomain createdAt");
    if (!user) {
      console.log("  No account with that email. Check for a typo, or a different sign-in provider.");
    } else {
      console.log(`  ${user.name || "?"} <${user.email}>  subdomain=${user.subdomain || "(none)"}`);
      let total = 0;
      for (const entry of TEMPLATE_REGISTRY) {
        if (!entry.model.schema.path("userId")) continue;
        const pages = await entry.model.find({ userId: user._id }).select("+passwordRaw");
        for (const page of pages) {
          total++;
          reportPage(entry, page, user.subdomain);
        }
      }
      console.log(`\n  ${total} page(s) total.`);
      if (!total) console.log("  They have not created any page yet — nothing to open.");
    }
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
