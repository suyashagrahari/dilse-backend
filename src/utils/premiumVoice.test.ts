import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolvePremiumVoice, type AudioUploader } from "./premiumVoice";

const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64, 1)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypM4A "), Buffer.alloc(64, 2)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 3)]);
const FLAC = Buffer.concat([Buffer.from("fLaC"), Buffer.alloc(64, 4)]);

const dataUrl = (mime: string, buf: Buffer) => `data:${mime};base64,${buf.toString("base64")}`;

function spyUploader() {
  const calls: { mime: string; folder: string; bytes: number }[] = [];
  const upload: AudioUploader = async (buffer, mimeType, folder) => {
    calls.push({ mime: mimeType, folder, bytes: buffer.length });
    return { url: `https://cdn.test/${folder}/v.${mimeType.split("/")[1]}` };
  };
  return { calls, upload };
}

describe("resolvePremiumVoice", () => {
  it("'' and non-strings → ''", async () => {
    const { calls, upload } = spyUploader();
    assert.equal(await resolvePremiumVoice("", "u1", "happy-hug-day-premium", upload), "");
    assert.equal(await resolvePremiumVoice(null, "u1", "happy-hug-day-premium", upload), "");
    assert.equal(calls.length, 0);
  });

  it("keeps an https link (≤ 600) without uploading; http and other schemes → ''", async () => {
    const { calls, upload } = spyUploader();
    assert.equal(await resolvePremiumVoice("https://cdn.subhsandesh.in/a.webm", "u1", "s", upload), "https://cdn.subhsandesh.in/a.webm");
    assert.equal(await resolvePremiumVoice("https://cdn.x/a.webm", "u1", "s", upload), "");
    assert.equal(await resolvePremiumVoice("https://cdn.x/" + "a".repeat(700), "u1", "s", upload), "");
    assert.equal(await resolvePremiumVoice("http://cdn.x/a.webm", "u1", "s", upload), "");
    assert.equal(await resolvePremiumVoice("javascript:alert(1)", "u1", "s", upload), "");
    assert.equal(calls.length, 0);
  });

  it("uploads a real webm or mp4 recording into <slug>/users/<id>/voice", async () => {
    const { calls, upload } = spyUploader();
    const a = await resolvePremiumVoice(dataUrl("audio/webm;codecs=opus", WEBM), "u1", "happy-hug-day-premium", upload);
    const b = await resolvePremiumVoice(dataUrl("audio/mp4", MP4), "u1", "happy-hug-day-premium", upload);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], { mime: "audio/webm", folder: "happy-hug-day-premium/users/u1/voice", bytes: WEBM.length });
    assert.equal(calls[1].mime, "audio/mp4");
    assert.equal(a, "https://cdn.test/happy-hug-day-premium/users/u1/voice/v.webm");
    assert.ok(b.startsWith("https://"));
  });

  it("refuses a non-audio payload, an unlisted audio type, and a declared-only type", async () => {
    const { calls, upload } = spyUploader();
    assert.equal(await resolvePremiumVoice(dataUrl("audio/webm", PNG), "u1", "s", upload), "");
    assert.equal(await resolvePremiumVoice(dataUrl("audio/flac", FLAC), "u1", "s", upload), "");
    assert.equal(await resolvePremiumVoice(dataUrl("audio/webm", Buffer.alloc(80, 7)), "u1", "s", upload), "");
    assert.equal(await resolvePremiumVoice("data:image/png;base64," + PNG.toString("base64"), "u1", "s", upload), "");
    assert.equal(calls.length, 0);
  });

  it("refuses more than 2 MB", async () => {
    const { calls, upload } = spyUploader();
    const big = Buffer.concat([WEBM, Buffer.alloc(2 * 1024 * 1024, 1)]);
    assert.equal(await resolvePremiumVoice(dataUrl("audio/webm", big), "u1", "s", upload), "");
    assert.equal(calls.length, 0);
  });

  it("an uploader failure stores '' instead of failing the save", async () => {
    const failing: AudioUploader = async () => {
      throw new Error("S3 down");
    };
    assert.equal(await resolvePremiumVoice(dataUrl("audio/webm", WEBM), "u1", "s", failing), "");
  });
});
