/**
 * Repair pages whose stored password has leading or trailing whitespace.
 *
 * ── WHY THESE PAGES ARE BROKEN ──────────────────────────────────────────────
 *
 * Until the models trimmed on save, a sender who typed a trailing space — which
 * a phone keyboard offers after every word — stored "sunflower ". Every
 * recipient-side viewer trims what it sends, so "sunflower" was compared against
 * the hash of "sunflower " and rejected. The password was correct and the page
 * would not open.
 *
 * The fix is in the models now, but it only applies on the next save. Pages
 * already stored this way stay broken until this runs.
 *
 * ── HOW IT KNOWS WHAT THE PASSWORD WAS ──────────────────────────────────────
 *
 * `passwordRaw` — the plaintext the models keep alongside the hash so the sender
 * can be shown their own password. That is what makes this repairable at all: the
 * hash alone could not be un-hashed to find the stray space.
 *
 *   DRY RUN:  node scripts/repair-page-passwords.js --uri='mongodb://…/dbname'
 *   APPLY:    node scripts/repair-page-passwords.js --uri='…' --write
 *
 * The database is never inferred from the environment — see the note in main().
 * Production additionally requires --i-mean-production.
 *
 * Safe to run repeatedly; a page whose password already equals its trim is
 * skipped, so a second run reports nothing to do.
 */

require("dotenv").config();
const mongoose = require("mongoose");

const WRITE = process.argv.includes("--write");

(async () => {
  // ── The target is never inferred ──────────────────────────────────────────
  //
  // The first version of this read MONGODB_URI || PROD_MONGODB_URI ||
  // LOCAL_MONGODB_URI. Run with a scratch .env that still carried
  // PROD_MONGODB_URI — which every copy of .env does — it silently connected to
  // PRODUCTION and scanned 1423 live pages. It was a dry run, so nothing was
  // written, but `--write` would have edited production because of an ordering
  // choice in a fallback chain.
  //
  // A maintenance script that mutates rows must not guess which database it is
  // pointed at. The URI is now passed explicitly and production needs a second,
  // deliberate flag.
  const uriArg = (process.argv.find((a) => a.startsWith("--uri=")) || "").slice(6);
  const uri = uriArg || process.env.REPAIR_MONGODB_URI || "";

  if (!uri) {
    console.error("Refusing to guess a database.\n");
    console.error("  node scripts/repair-page-passwords.js --uri='mongodb://…/dbname' [--write]");
    console.error("  (or set REPAIR_MONGODB_URI)\n");
    console.error("Production also needs --i-mean-production.");
    process.exit(1);
  }

  const looksProd = /gifts(\?|$)/.test(uri) || /prod/i.test(uri);
  if (looksProd && !process.argv.includes("--i-mean-production")) {
    console.error(`Refusing: "${uri.replace(/\/\/[^@]*@/, "//***@")}" looks like production.`);
    console.error("Re-run with --i-mean-production if that is genuinely the intent.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`connected to ${mongoose.connection.name}`);
  console.log(WRITE ? "MODE: APPLYING CHANGES\n" : "MODE: dry run — nothing will be written\n");

  const { TEMPLATE_REGISTRY } = require("../dist/services/templateRegistry");

  let scanned = 0, broken = 0, repaired = 0, unrepairable = 0;
  const details = [];

  for (const entry of TEMPLATE_REGISTRY) {
    if (!entry.model.schema.path("password")) continue;

    // `passwordRaw` is `select: false`, so it has to be asked for.
    const pages = await entry.model
      .find({ password: { $ne: "" } })
      .select("+passwordRaw")
      .exec();

    for (const page of pages) {
      scanned++;
      const raw = typeof page.passwordRaw === "string" ? page.passwordRaw : "";

      if (!raw) {
        // Predates passwordRaw. The hash cannot be un-hashed, so a stray space
        // here is not recoverable — the owner has to set a new one. Counted, not
        // guessed at.
        continue;
      }
      const trimmed = raw.trim();
      if (raw === trimmed) continue;

      broken++;
      details.push(`${entry.templateType}/${page._id}  ${JSON.stringify(raw)} -> ${JSON.stringify(trimmed)}`);

      if (!trimmed) {
        // Whitespace only. There is no password the sender could have meant, so
        // clearing is the honest outcome — the page opens on the link alone.
        unrepairable++;
        if (WRITE) {
          page.password = "";
          page.passwordRaw = "";
          await page.save();
        }
        continue;
      }

      if (WRITE) {
        // Assign and save so the model's hook re-hashes the trimmed value.
        page.password = trimmed;
        await page.save();
      }
      repaired++;
    }
  }

  console.log(`scanned ${scanned} password-protected pages`);
  console.log(`  needing repair : ${broken}`);
  console.log(`  ${WRITE ? "repaired" : "would repair"}       : ${repaired}`);
  console.log(`  whitespace-only, ${WRITE ? "cleared" : "would clear"}: ${unrepairable}`);
  if (details.length) console.log("\n" + details.map((d) => "  " + d).join("\n"));
  if (!WRITE && broken) console.log("\nRe-run with --write to apply.");

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
