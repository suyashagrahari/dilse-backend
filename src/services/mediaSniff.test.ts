import test from "node:test";
import assert from "node:assert/strict";

import { normalizeMime, parseAnyDataUrl, sniffMedia } from "./mediaSniff";

// Synthetic headers. Only the magic bytes matter — nothing here decodes audio,
// it only has to be told apart from a photo.
const header = (bytes: number[], pad = 64): Buffer =>
  Buffer.concat([Buffer.from(bytes), Buffer.alloc(pad)]);

const fromAscii = (text: string, pad = 64): Buffer =>
  Buffer.concat([Buffer.from(text, "latin1"), Buffer.alloc(pad)]);

const riff = (form: string): Buffer =>
  Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from(form), Buffer.alloc(64)]);

const ftyp = (brand: string): Buffer =>
  Buffer.concat([Buffer.alloc(4), Buffer.from("ftyp"), Buffer.from(brand), Buffer.alloc(64)]);

test("normalizeMime strips the parameters browsers actually send", () => {
  // The exact string Chrome's MediaRecorder reports, which used to be compared
  // against a Set of bare types and therefore matched nothing.
  assert.equal(normalizeMime("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(normalizeMime("audio/webm; codecs=opus"), "audio/webm");
  assert.equal(normalizeMime("AUDIO/WEBM;CODECS=OPUS"), "audio/webm");
  assert.equal(normalizeMime("video/mp4;codecs=avc1.42E01E"), "video/mp4");
});

test("normalizeMime collapses the spellings browsers disagree about", () => {
  assert.equal(normalizeMime("audio/mp3"), "audio/mpeg");
  assert.equal(normalizeMime("audio/x-wav"), "audio/wav");
  assert.equal(normalizeMime("audio/x-m4a"), "audio/mp4");
  assert.equal(normalizeMime("audio/aac"), "audio/mp4");
  assert.equal(normalizeMime("image/jpg"), "image/jpeg");
  assert.equal(normalizeMime(""), "");
  assert.equal(normalizeMime(undefined), "");
});

test("audio is identified from its bytes even with no declared type at all", () => {
  // This is the bug. A file the Android picker could not name arrives as an
  // untyped Blob, becomes `data:;base64,…`, and used to be stored whole.
  const cases: Array<[string, Buffer, string]> = [
    ["mp3 with ID3 tag", fromAscii("ID3"), "audio/mpeg"],
    ["bare mp3 frame", header([0xff, 0xfb, 0x90, 0x00]), "audio/mpeg"],
    ["wav", riff("WAVE"), "audio/wav"],
    ["ogg / opus", fromAscii("OggS"), "audio/ogg"],
    ["webm from MediaRecorder", header([0x1a, 0x45, 0xdf, 0xa3]), "audio/webm"],
    ["m4a from an iPhone", ftyp("M4A "), "audio/mp4"],
    ["flac", fromAscii("fLaC"), "audio/flac"],
    ["aiff", Buffer.concat([Buffer.from("FORM"), Buffer.alloc(4), Buffer.from("AIFF"), Buffer.alloc(64)]), "audio/aiff"],
    ["amr", fromAscii("#!AMR"), "audio/amr"],
    ["caf from iOS Safari", fromAscii("caff"), "audio/x-caf"],
    ["wma", header([0x30, 0x26, 0xb2, 0x75]), "audio/x-ms-wma"],
    ["3gp", ftyp("3gp4"), "audio/3gpp"],
  ];

  for (const [label, buffer, expected] of cases) {
    const got = sniffMedia(buffer, ""); // no declared type whatsoever
    assert.equal(got.kind, "audio", `${label} should be audio, got ${got.kind}`);
    assert.equal(got.mimeType, expected, label);
    assert.ok(got.extension, `${label} needs an extension for the S3 key`);
  }
});

test("images are still identified, and are never confused with audio", () => {
  assert.deepEqual(
    { kind: sniffMedia(header([0xff, 0xd8, 0xff, 0xe0]), "").kind, mime: sniffMedia(header([0xff, 0xd8, 0xff, 0xe0]), "").mimeType },
    { kind: "image", mime: "image/jpeg" }
  );
  assert.equal(sniffMedia(header([0x89, 0x50, 0x4e, 0x47]), "").mimeType, "image/png");
  assert.equal(sniffMedia(fromAscii("GIF89a"), "").mimeType, "image/gif");
  assert.equal(sniffMedia(riff("WEBP"), "").mimeType, "image/webp");
  // Both of these are `ftyp` boxes off the same phone; only the brand separates them.
  assert.equal(sniffMedia(ftyp("heic"), "").kind, "image");
  assert.equal(sniffMedia(ftyp("avif"), "").kind, "image");
  assert.equal(sniffMedia(ftyp("M4A "), "").kind, "audio");
});

test("a lying declared type never beats the bytes", () => {
  // The client hardcoded `kind: "image"` on every upload, audio included. Bytes win.
  const webm = header([0x1a, 0x45, 0xdf, 0xa3]);
  assert.equal(sniffMedia(webm, "image/png").kind, "audio");

  const png = header([0x89, 0x50, 0x4e, 0x47]);
  assert.equal(sniffMedia(png, "audio/mpeg").kind, "image");
});

test("declared type is the fallback only when the bytes say nothing", () => {
  const nonsense = Buffer.from("not a known container at all");
  assert.equal(sniffMedia(nonsense, "audio/mpeg").kind, "audio");
  assert.equal(sniffMedia(nonsense, "audio/mpeg").fromBytes, false);
  assert.equal(sniffMedia(nonsense, "image/svg+xml").kind, "image");
  assert.equal(sniffMedia(nonsense, "application/pdf").kind, "unknown");
  assert.equal(sniffMedia(nonsense, "").kind, "unknown");
});

test("parseAnyDataUrl reads the shapes that used to fall through and get stored", () => {
  const bytes = header([0x1a, 0x45, 0xdf, 0xa3]);
  const b64 = bytes.toString("base64");

  // 1. Chrome's MediaRecorder, with its codec parameter.
  const chrome = parseAnyDataUrl(`data:audio/webm;codecs=opus;base64,${b64}`);
  assert.equal(chrome?.declaredMime, "audio/webm");
  assert.equal(sniffMedia(chrome!.buffer, chrome!.declaredMime).kind, "audio");

  // 2. A typeless Blob, per the File API spec.
  const typeless = parseAnyDataUrl(`data:;base64,${b64}`);
  assert.equal(typeless?.declaredMime, "");
  assert.equal(sniffMedia(typeless!.buffer, typeless!.declaredMime).kind, "audio");

  // 3. What Chrome writes for a file it cannot name. This one was the profile
  //    full of megabyte-long "music URLs".
  const octet = parseAnyDataUrl(`data:application/octet-stream;base64,${b64}`);
  assert.equal(octet?.declaredMime, "application/octet-stream");
  assert.equal(sniffMedia(octet!.buffer, octet!.declaredMime).kind, "audio");
});

test("parseAnyDataUrl refuses what is not a base64 data URL", () => {
  assert.equal(parseAnyDataUrl("https://cdn.subhsandesh.in/a.mp3"), null);
  assert.equal(parseAnyDataUrl("data:text/plain,hello"), null); // not base64
  assert.equal(parseAnyDataUrl("data:audio/mpeg;base64,"), null); // empty payload
  assert.equal(parseAnyDataUrl(""), null);
});
