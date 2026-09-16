import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isAllowedUploadMime } from "./mediaProcessor.service";

// multer's fileFilter runs before a single byte of the upload is buffered, so
// this function sees a MIME string and nothing else. It used to be the gate,
// and it was closed against the two things browsers most commonly send.
describe("isAllowedUploadMime", () => {
  it("accepts the exact string Chrome's MediaRecorder reports", () => {
    // This rejected every voice note recorded in Chrome, with the request
    // failing before the controller could look at the bytes.
    assert.equal(isAllowedUploadMime("audio/webm;codecs=opus"), true);
    assert.equal(isAllowedUploadMime("audio/webm; codecs=opus"), true);
    assert.equal(isAllowedUploadMime("audio/ogg;codecs=opus"), true);
  });

  it("accepts a file the phone could not name", () => {
    // An Android picker that does not recognise the extension hands over a Blob
    // with no type at all. The bytes decide later; refusing here is premature.
    assert.equal(isAllowedUploadMime(""), true);
    assert.equal(isAllowedUploadMime("application/octet-stream"), true);
  });

  it("accepts audio formats the original list forgot", () => {
    for (const mime of ["audio/flac", "audio/opus", "audio/m4a", "audio/x-m4a", "audio/3gpp", "audio/amr"]) {
      assert.equal(isAllowedUploadMime(mime), true, mime);
    }
  });

  it("still accepts the ordinary cases", () => {
    for (const mime of ["image/jpeg", "image/png", "image/webp", "image/heic", "audio/mpeg", "audio/wav"]) {
      assert.equal(isAllowedUploadMime(mime), true, mime);
    }
  });

  it("still refuses what is plainly not media", () => {
    for (const mime of ["application/pdf", "application/zip", "text/html", "application/x-msdownload"]) {
      assert.equal(isAllowedUploadMime(mime), false, mime);
    }
  });
});
