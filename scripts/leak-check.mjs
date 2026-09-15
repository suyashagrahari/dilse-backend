#!/usr/bin/env node
/**
 * ─── Leak check ─────────────────────────────────────────────────────────────
 *
 * Fails the build when an UNAUTHENTICATED endpoint could answer with something
 * private.
 *
 * ── WHY THIS EXISTS ALONGSIDE THE SCRUBBER ──────────────────────────────────
 *
 * `middleware/scrubPrivate` deletes a short list of keys from every response at
 * runtime, and that list can only contain keys that are NEVER legitimate. The
 * interesting cases are not like that:
 *
 *   · `email` is correct on `/auth/me` — your own address, to you — and a
 *     disaster on a public share endpoint. Whether it is a leak depends on who
 *     can reach the handler, which is a question about routes, not about keys.
 *   · Sending a whole Mongoose document is fine in a super-admin panel and is
 *     how a page password would escape from a public one.
 *
 * So the runtime guard handles the absolutes and this handles the contextual
 * ones, where the answer is knowable from the code but not from the payload.
 *
 * ── WHAT IT CHECKS ──────────────────────────────────────────────────────────
 *
 *   1. A public read handler must not mention a private field in its response.
 *   2. A public read handler must not send a raw document — `data: page` rather
 *      than a destructured `safeData`. This is the shape that would publish a
 *      page's unlock word, and `valentine` had already drifted to it.
 *
 * ── WHY IT IDENTIFIES PUBLIC HANDLERS BY NAME ───────────────────────────────
 *
 * `getShared*` and `getPublic*` are the naming convention for every handler
 * mounted before a router's `router.use(protect)`, across all 48 of them.
 * Resolving the route tree properly would be more precise and much easier to
 * get subtly wrong; a convention that is already universal is the more reliable
 * signal, and a handler that breaks the convention is worth catching anyway.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "controllers");

/** Never acceptable in a response nobody had to sign in for. */
const PRIVATE_FIELDS = [
  "userEmail",
  "email",
  "ipAddress",
  "userAgent",
  "adminNotes",
  "passwordRaw",
  "refreshToken",
  "tokenVersion",
  "otp",
];

/** Comments describe the old behaviour as often as the current one. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/([^:])\/\/.*$/gm, "$1");
}

/** The body of one exported handler, from its name to the next export. */
function bodyOf(src, name) {
  const start = src.indexOf(`export const ${name}`);
  if (start === -1) return "";
  const next = src.indexOf("export const ", start + 13);
  return src.slice(start, next === -1 ? src.length : next);
}

/** Every `res.json(...)` payload in a body, balanced-paren aware. */
function payloads(body) {
  const out = [];
  const re = /res\s*\.\s*(?:status\([^)]*\)\s*\.\s*)?json\s*\(/g;
  let m;
  while ((m = re.exec(body))) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < body.length && depth > 0) {
      if (body[i] === "(") depth += 1;
      else if (body[i] === ")") depth -= 1;
      i += 1;
    }
    out.push(body.slice(m.index, i));
  }
  return out;
}

const problems = [];
let handlers = 0;

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".controller.ts"))) {
  const src = stripComments(readFileSync(join(DIR, file), "utf8"));
  const names = [...src.matchAll(/export const (getShared\w*|getPublic\w*)\s*=/g)].map((m) => m[1]);

  for (const name of names) {
    handlers += 1;
    const body = bodyOf(src, name);

    for (const payload of payloads(body)) {
      for (const field of PRIVATE_FIELDS) {
        // Word boundary, so `templateLabel` does not match `label`.
        if (new RegExp(`\\b${field}\\b`).test(payload)) {
          problems.push(`${file} → ${name}: responds with "${field}"`);
        }
      }
      // `data: page` / `data: doc` — the whole document, unfiltered.
      const raw = payload.match(/data:\s*(page|doc|record|user|row)\b/);
      if (raw) {
        problems.push(`${file} → ${name}: sends the raw document (data: ${raw[1]}) — destructure it`);
      }
    }
  }
}

console.log("");
console.log(`public read handlers checked : ${handlers}`);
console.log(`private fields watched for    : ${PRIVATE_FIELDS.length}`);
console.log("");

if (problems.length === 0) {
  console.log("✓ no unauthenticated handler can answer with private data");
  process.exit(0);
}

console.error(`✗ ${problems.length} problem(s):`);
for (const p of problems) console.error(`    ${p}`);
console.error("");
console.error("A public handler must name the fields it sends, not exclude the ones it does not.");
console.error("See middleware/scrubPrivate.ts and controllers/pageFeedback.controller.ts.");
process.exit(1);
