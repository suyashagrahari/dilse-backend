/**
 * Move media that was stored inline as base64 onto S3, in documents that were
 * saved before `transformMediaPayload` learned to sniff bytes.
 *
 * ── WHAT WENT WRONG, AND WHAT THIS CLEANS UP ────────────────────────────────
 *
 * The payload walker used to recognise only strings beginning `data:image/` or
 * `data:audio/`, and returned everything else untouched. A recording the
 * browser could not name arrives as `data:;base64,…` or
 * `data:application/octet-stream;base64,…`, so it was written into Mongo whole,
 * into String fields that carry no maxlength. Those documents are why a user's
 * profile shows a "music URL" several megabytes long.
 *
 * The pipeline no longer produces them (`services/mediaSniff.ts`). This repairs
 * the ones already written.
 *
 * ── IT IS A DRY RUN UNLESS YOU SAY OTHERWISE ────────────────────────────────
 *
 *   npx tsx src/scripts/repairInlineMedia.ts                 # report only
 *   npx tsx src/scripts/repairInlineMedia.ts --only=ApologyDashboardPage
 *   npx tsx src/scripts/repairInlineMedia.ts --apply         # upload + rewrite
 *
 * `--apply` uploads to the bucket in `env` and writes to the database in
 * `MONGODB_URI`. Point both at staging first.
 *
 * A document is only written once every blob in it has uploaded successfully.
 * A partial rewrite would leave a page half pointing at S3 and half still
 * carrying its bytes, and the inline copy is the only copy — so on any failure
 * the document is left exactly as it was and reported.
 */
import mongoose from "mongoose";
import { env } from "../config/env";
import { parseAnyDataUrl, sniffMedia } from "../services/mediaSniff";
import { uploadMediaBuffer } from "../services/mediaProcessor.service";
import { TEMPLATE_REGISTRY } from "../services/templateRegistry";


const APPLY = process.argv.includes("--apply");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "";

/**
 * Every template that can hold media, with the slug its S3 folder uses.
 *
 * ── WHY THIS IS DERIVED AND NOT A LIST ──────────────────────────────────────
 *
 * This was eleven models written out by hand, which was right when only eleven
 * controllers uploaded to S3. Now that all of them do, a hand list is a list
 * that silently under-reports: a template missing from it is scanned by nothing
 * and reported clean, which is the one failure mode a repair tool must not
 * have. `TEMPLATE_REGISTRY` is already the single list of which templates
 * exist, so adding a template to that list is all it takes to be repaired.
 *
 * The models themselves, not their names: mongoose lowercases the WHOLE name to
 * pluralise (`ApologyDashboardPage` -> `apologydashboardpages`), so any
 * collection name derived by hand here would quietly scan nothing.
 */
const MODELS: Array<{ model: mongoose.Model<unknown>; template: string }> =
  TEMPLATE_REGISTRY.map((t) => ({ model: t.model, template: t.templateType }));

interface Found {
  path: string;
  value: string;
}

/** Every inline base64 blob in a document, with the path it sits at. */
function collect(node: unknown, path = "", out: Found[] = []): Found[] {
  if (typeof node === "string") {
    if (node.startsWith("data:") && parseAnyDataUrl(node)) out.push({ path, value: node });
    return out;
  }
  if (!node || typeof node !== "object") return out;
  if (node instanceof Date || node instanceof mongoose.Types.ObjectId) return out;
  if (Array.isArray(node)) {
    node.forEach((item, i) => collect(item, `${path}/${i}`, out));
    return out;
  }
  for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
    if (key === "_id" || key === "__v") continue;
    collect(val, path ? `${path}/${key}` : key, out);
  }
  return out;
}

/** Rewrite by value: the same blob used twice shares one uploaded URL. */
function rewrite(node: unknown, map: Map<string, string>): unknown {
  if (typeof node === "string") return map.get(node) ?? node;
  if (!node || typeof node !== "object") return node;
  if (node instanceof Date || node instanceof mongoose.Types.ObjectId) return node;
  if (Array.isArray(node)) return node.map((item) => rewrite(item, map));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
    out[key] = rewrite(val, map);
  }
  return out;
}

const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(2)}MB`;

async function main(): Promise<void> {
  const uri = env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set.");

  await mongoose.connect(uri);
  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — connected to ${uri.replace(/\/\/[^@]+@/, "//***@")}\n`);

  let docsAffected = 0;
  let blobsFound = 0;
  let bytesFound = 0;
  let repaired = 0;
  const failures: string[] = [];

  for (const { model, template } of MODELS) {
    if (ONLY && ONLY.toLowerCase() !== model.modelName.toLowerCase()) continue;

    const collection = model.collection;
    console.log(`── ${model.modelName}  (${collection.collectionName})`);

    const cursor = collection.find({});
    for await (const doc of cursor) {
      const found = collect(doc);
      if (!found.length) continue;

      docsAffected++;
      blobsFound += found.length;
      const docBytes = found.reduce((n, f) => n + f.value.length, 0);
      bytesFound += docBytes;

      const label = `${model.modelName}/${String(doc._id)}`;
      console.log(`${label}  ${found.length} inline blob(s), ${mb(docBytes)}`);
      for (const f of found) {
        const parsed = parseAnyDataUrl(f.value)!;
        const sniffed = sniffMedia(parsed.buffer, parsed.declaredMime);
        console.log(
          `    ${f.path}  declared="${parsed.declaredMime || "(none)"}"  ` +
            `actually=${sniffed.kind}/${sniffed.mimeType || "?"}  ${mb(f.value.length)}`
        );
      }

      if (!APPLY) continue;

      const map = new Map<string, string>();
      let ok = true;
      for (const f of found) {
        if (map.has(f.value)) continue;
        const parsed = parseAnyDataUrl(f.value)!;
        try {
          const uploaded = await uploadMediaBuffer(
            parsed.buffer,
            parsed.declaredMime,
            `${template}/users/${String(doc.userId || "anonymous")}/repair`
          );
          map.set(f.value, uploaded.url);
        } catch (error) {
          ok = false;
          const why = error instanceof Error ? error.message : String(error);
          failures.push(`${label} ${f.path}: ${why}`);
          console.log(`    ! ${f.path} could not be uploaded: ${why}`);
        }
      }

      // All or nothing. The inline copy is the only copy.
      if (!ok) {
        console.log(`    → left untouched (some blobs failed)\n`);
        continue;
      }

      const next = rewrite(doc, map) as Record<string, unknown>;
      delete next._id;
      await collection.updateOne({ _id: doc._id }, { $set: next });
      repaired++;
      console.log(`    → rewritten with ${map.size} S3 URL(s)\n`);
    }
  }

  console.log("─".repeat(60));
  console.log(`documents with inline media : ${docsAffected}`);
  console.log(`inline blobs                : ${blobsFound}  (${mb(bytesFound)})`);
  if (APPLY) {
    console.log(`documents rewritten         : ${repaired}`);
    console.log(`failures                    : ${failures.length}`);
    for (const f of failures) console.log(`  ${f}`);
  } else if (docsAffected) {
    console.log("\nRe-run with --apply to upload these and rewrite the documents.");
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
