import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * ── WHAT THIS GUARDS ────────────────────────────────────────────────────────
 *
 * A page controller that stores an uploaded photo without sending it to S3
 * keeps the base64 data URL in Mongo, and that document is what the recipient
 * downloads when they open the link.
 *
 * One real proposal page reached 858 KB this way — 856 KB of it four inlined
 * JPEGs. Measured from a phone, the password box took 17s to appear on 4G and
 * 47s on a weak signal. The link is not broken and the password is not wrong,
 * but both look that way from the outside, which is exactly how it was
 * reported.
 *
 * Several of these controllers also cap the field (`str(b.photoUrl, 600)`), so
 * a data URL was not merely stored inline — it was TRUNCATED to 600 characters
 * and the photograph destroyed. That is why the upload has to happen before
 * sanitising, not after.
 *
 * This test is a ratchet: it fails the moment a controller persists a media
 * field without any upload call, so the forty-fifth template cannot quietly
 * ship the same bug.
 */

const DIR = __dirname;

/** A field name that can carry an uploaded file from the builder. */
const MEDIA_FIELD = /(photo|image|avatar|picture|voice|audio|music|recording|videoUrl|qrImage)/i;

/**
 * Any of the sanctioned ways to move bytes to S3 — as a CALL, not a mention.
 *
 * The trailing `\(` is load-bearing. Without it this matched the `import` line,
 * so a controller that imported the helper and then stopped calling it still
 * passed. Verified by deleting the call sites from a controller and watching
 * this test go red.
 */
const UPLOADS =
  /(transformMediaPayload|uploadMediaBuffer|uploadMediaField|uploadImageDataUrl|uploadAudioDataUrl)\s*\(/;

describe("uploaded media never reaches the database as base64", () => {
  it("every page controller that stores a media field uploads it", () => {
    const offenders: string[] = [];

    for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith("Page.controller.ts"))) {
      const src = fs.readFileSync(path.join(DIR, file), "utf8");

      const fields = new Set<string>();
      for (const m of src.matchAll(/^\s*(?:if \([^)]*\) )?(?:page\.)?([A-Za-z0-9_]+)\s*[:=]/gm)) {
        if (MEDIA_FIELD.test(m[1])) fields.add(m[1]);
      }
      if (fields.size === 0) continue; // no media in this template

      if (!UPLOADS.test(src)) {
        offenders.push(`${file} stores ${[...fields].join(", ")} but never uploads`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      "these controllers would store an uploaded file as base64 inside the document"
    );
  });

  it("the upload runs before any length cap is applied to the same field", () => {
    // `str(b.photoUrl, 600)` on a data URL yields 600 characters of a JPEG and
    // nothing that can be decoded. Wherever a media field is capped, the upload
    // must already have replaced it with a short CDN URL — which is true when
    // the controller transforms `req.body` (or the sanitised content) up front.
    const offenders: string[] = [];

    for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith("Page.controller.ts"))) {
      const src = fs.readFileSync(path.join(DIR, file), "utf8");
      if (!UPLOADS.test(src)) continue;

      // A cap applied to a media field read straight off the request body is
      // the failing shape: nothing has been uploaded at that point.
      const capsRawBody = [
        ...src.matchAll(/str\(\s*b\.([A-Za-z0-9_]+)\s*,\s*\d+\s*\)/g),
      ].filter((m) => MEDIA_FIELD.test(m[1]));

      for (const m of capsRawBody) {
        // Fine if the body itself was transformed on the way in — then `b`
        // already holds CDN URLs.
        const transformsBody =
          /const b = \(?await transformMediaPayload\(/.test(src) ||
          /= \(await transformMediaPayload\(req\.body/.test(src);
        if (!transformsBody) offenders.push(`${file}: caps b.${m[1]} without uploading first`);
      }
    }

    assert.deepEqual(offenders, [], "a data URL would be truncated into a broken image here");
  });
});
