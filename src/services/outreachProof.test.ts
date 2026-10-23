// ─── Traction proof: screenshot → confirmed numbers → an honest email ───────
//
// No Mongo, no S3, no OpenAI, no SES: the store, the vision model, the image
// fetcher and the mail transport are stubs. Real email is never sent from here.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  EXTRACTION_SCHEMA,
  PROOF_MAX_BYTES,
  ProofInputError,
  extractProofStats,
  inlineProofImage,
  isProofKey,
  numberForms,
  parseProofExtraction,
  parseProofInput,
  personalEmailParts,
  processProofImage,
  proofAllowedNumbers,
  proofFactsForPrompt,
  proofKey,
  quotableStats,
  sniffProofImage,
  storeProofImage,
  type ProofSnapshot,
  type ProofStore,
} from "./outreachProof.service";
import { inboxCheck, lintOutreach, withoutAllowedNumbers } from "./prospectMail.service";
import { buildRawMime } from "./mime.service";
import { buildSendCommand } from "./ses.service";
import { buildProspectSendInput } from "./prospectQueue.service";
import { sendInfluencerMail } from "./influencerMail.service";
import { buildProspectPrompt, parseProspectDraft, type ProspectDraftContext } from "./prospectAi.service";
import { _resetModelCacheForTests, completionParams, isReasoningModel, pickBestModel, resolveProspectModel } from "./prospectModel.service";
import type { SesEmail } from "./ses.service";

const PROOF: ProofSnapshot = {
  id: "6720aa00bb11cc22dd33ee44",
  imageUrl: "https://cdn.subhsandesh.in/gifts-media/outreach-proof/0123456789abcdef0123.png",
  source: "search_console",
  periodLabel: "last 3 months (Jul 17 – Oct 2026)",
  stats: [
    { label: "Total clicks", value: "52.2K" },
    { label: "Total impressions", value: "2.75M" },
    { label: "Average CTR", value: "1.9%" },
    { label: "Average position", value: "7.3" },
  ],
  width: 1600,
  height: 820,
};
const ALLOWED = proofAllowedNumbers(PROOF);

const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 240, g: 244, b: 250 } } }).png().toBuffer();

describe("proof image: sniffed, stripped, resized, stored", () => {
  it("the bytes decide the type, never the name", async () => {
    assert.equal(sniffProofImage(await png(300, 200)), "png");
    assert.equal(sniffProofImage(await sharp(await png(300, 200)).jpeg().toBuffer()), "jpeg");
    assert.equal(sniffProofImage(await sharp(await png(300, 200)).webp().toBuffer()), "webp");
    assert.equal(sniffProofImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>")), null);
    assert.equal(sniffProofImage(Buffer.from("GIF89a............")), null);
  });

  it("refuses non-images, tiny images and anything over 5 MB with a sentence", async () => {
    await assert.rejects(processProofImage(Buffer.from("not an image at all, just text")), ProofInputError);
    await assert.rejects(processProofImage(await png(100, 60)), /too small/);
    await assert.rejects(processProofImage(Buffer.alloc(PROOF_MAX_BYTES + 1, 1)), /over 5 MB/);
  });

  it("a wide photo with EXIF comes out ≤ 1600 px, as PNG, with no EXIF left", async () => {
    const withExif = await sharp({ create: { width: 2400, height: 1300, channels: 3, background: "#fafafa" } })
      .withMetadata({ exif: { IFD0: { Copyright: "secret-device", Make: "PhoneCo" } } })
      .jpeg()
      .toBuffer();
    assert.ok((await sharp(withExif).metadata()).exif, "fixture has EXIF");
    const out = await processProofImage(withExif);
    assert.equal(out.width, 1600);
    assert.equal(out.height, Math.round((1300 * 1600) / 2400));
    assert.equal(out.contentType, "image/png");
    const meta = await sharp(out.buffer).metadata();
    assert.equal(meta.exif, undefined);
    assert.ok(!out.buffer.includes(Buffer.from("secret-device")));
  });

  it("a small screenshot is not enlarged", async () => {
    const out = await processProofImage(await png(900, 500));
    assert.equal(out.width, 900);
  });

  it("upload pipeline with a stubbed S3: gifts-media/outreach-proof/<id>.png → CDN URL", async () => {
    const puts: { key: string; type: string; bytes: number }[] = [];
    const store: ProofStore = {
      put: async (key, buffer, type) => {
        puts.push({ key, type, bytes: buffer.length });
        return `https://cdn.subhsandesh.in/${key}`;
      },
      delete: async () => {},
    };
    const img = await processProofImage(await png(1800, 900));
    const stored = await storeProofImage(img, store);
    assert.equal(puts.length, 1);
    assert.match(puts[0].key, /^gifts-media\/outreach-proof\/[a-f0-9]{20}\.png$/);
    assert.equal(puts[0].type, "image/png");
    assert.equal(stored.url, `https://cdn.subhsandesh.in/${puts[0].key}`);
    assert.ok(isProofKey(stored.key));
    assert.ok(!isProofKey("gifts-media/templates/x.png"));
    assert.ok(!isProofKey("gifts-media/outreach-proof/../../evil.png"));
    assert.match(proofKey("png", "abcdef0123456789", "gifts-media"), /^gifts-media\/outreach-proof\/abcdef0123456789\.png$/);
  });
});

describe("proof numbers: what the admin confirms", () => {
  it("validates source, period and every value", () => {
    const ok = parseProofInput({ source: "search_console", periodLabel: " last 3 months ", stats: [{ label: "Total clicks", value: "52.2 k" }, { label: "Avg CTR", value: "1.9 %" }], caption: "GSC" });
    assert.deepEqual(ok.stats, [{ label: "Total clicks", value: "52.2K" }, { label: "Avg CTR", value: "1.9%" }]);
    assert.equal(ok.periodLabel, "last 3 months");
    assert.throws(() => parseProofInput({ source: "facebook", periodLabel: "x", stats: [{ label: "a", value: "1" }] }), /where the screenshot is from/);
    assert.throws(() => parseProofInput({ source: "other", periodLabel: "", stats: [{ label: "a", value: "1" }] }), /period/);
    assert.throws(() => parseProofInput({ source: "other", periodLabel: "x", stats: [] }), /at least one number/);
    assert.throws(() => parseProofInput({ source: "other", periodLabel: "x", stats: [{ label: "Users", value: "lots" }] }), /doesn't look like a number/);
    assert.throws(() => parseProofInput({ source: "other", periodLabel: "x", stats: [{ label: "", value: "5K" }] }), /label/);
    assert.throws(() => parseProofInput({ source: "other", periodLabel: "x", stats: Array.from({ length: 7 }, (_, i) => ({ label: `s${i}`, value: "1K" })) }), /At most/);
  });

  it("only counts are quotable — no CTR %, no average position", () => {
    assert.deepEqual(quotableStats(PROOF.stats).map((s) => s.value), ["52.2K", "2.75M"]);
  });

  it("allowed forms: exact, rounded the way people say it, the period", () => {
    assert.deepEqual(numberForms("52.2K").sort(), ["52.2 thousand", "52.2K", "52K"].sort());
    assert.ok(numberForms("2.75M").includes("2.8M") && numberForms("2.75M").includes("2.7M") && numberForms("2.75M").includes("2.75 million"));
    assert.ok(ALLOWED.includes("3 months"));
    assert.ok(!ALLOWED.some((f) => /1\.9|7\.3|%/.test(f)));
  });

  it("the prompt facts say truthfully what Search Console numbers count", () => {
    const f = proofFactsForPrompt(PROOF);
    assert.match(f, /52\.2K — Total clicks: visits to our pages that came from Google Search/);
    assert.match(f, /not total users/);
    assert.match(f, /2\.75M — Total impressions: times our pages were shown in Google Search results/);
    assert.ok(!/1\.9%|7\.3/.test(f), "no CTR or position in the facts");
    assert.match(proofFactsForPrompt({ ...PROOF, source: "google_analytics", stats: [{ label: "Active users", value: "18K" }] }), /people who used our pages/);
  });
});

describe("extraction (stubbed vision model)", () => {
  const MODEL_OUT = JSON.stringify({
    source: "search_console",
    periodLabel: "Last 3 months (Jul 17 – Oct 2026)",
    stats: [
      { label: "Total clicks", value: "52.2K" },
      { label: "Total impressions", value: "2.75M" },
      { label: "Average CTR", value: "1.9%" },
      { label: "Average position", value: "7.3" },
      { label: "Top query", value: "subhsandesh" },
    ],
    caption: "Google Search performance, last 3 months",
    notes: "",
  });

  it("parses the reading and drops what is not a number", () => {
    const e = parseProofExtraction(MODEL_OUT);
    assert.equal(e.source, "search_console");
    assert.deepEqual(e.stats.map((s) => s.value), ["52.2K", "2.75M", "1.9%", "7.3"]);
    assert.match(e.notes, /Top query: subhsandesh/);
    assert.equal(parseProofExtraction("{not json").stats.length, 0);
    assert.equal(parseProofExtraction(JSON.stringify({ source: "tiktok", stats: [] })).source, "other");
  });

  it("sends the image itself (data URL) with the strict schema", async () => {
    let seen = { url: "", schema: "" };
    const img = await processProofImage(await png(800, 400));
    const e = await extractProofStats(img, async (_s, _u, url, schema) => {
      seen = { url, schema: schema.name };
      return MODEL_OUT;
    });
    assert.match(seen.url, /^data:image\/png;base64,/);
    assert.equal(seen.schema, EXTRACTION_SCHEMA.name);
    assert.equal(e.stats[0].value, "52.2K");
  });

  it("a model failure becomes an empty, editable form — never a crash", async () => {
    const img = await processProofImage(await png(800, 400));
    const e = await extractProofStats(img, async () => { throw new Error("boom"); });
    assert.equal(e.stats.length, 0);
    assert.match(e.notes, /type the numbers in/);
  });
});

describe("the linter lets through the proof's numbers — and only those", () => {
  const body = (numbers: string) =>
    `Hey Om and Diya,\n\nI'm Suyash from SubhSandesh. Your Hindi couple reels from Jaipur are so warm and easy to watch.\n\nWe make little interactive pages people send someone they love: birthday surprises, miss-you notes, proposals. ${numbers}\n\nI'd love to make a reel with you two where one of you surprises the other with a page on camera. Happy to pay for it, of course, and you'd get your own link your followers can use.\n\nWould you be up for trying one together?`;
  const lint = (b: string, allowedNumbers?: string[]) =>
    lintOutreach("Om & Diya, a reel idea from SubhSandesh", b, { commissionPercent: 30, kind: "initial", style: "personal", writer: "Suyash", allowedNumbers });
  const LINE = "In the last 3 months about 52K people found us through Google Search alone, looking for something special for a birthday or an anniversary.";

  it("allows 52K / 3 months with the proof", () => {
    const r = lint(body(LINE), ALLOWED);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
  });

  it("the same email without the proof is refused (no digits in a first email)", () => {
    const r = lint(body(LINE));
    assert.ok(r.errors.some((e) => e.code === "personal_number"));
  });

  it("refuses any other number, a %, ₹, even with the proof", () => {
    for (const bad of [
      "In the last 3 months about 60K people found us through Google Search.",
      "Our click rate is 1.9% which is good.",
      "Creators make ₹500 on the first day.",
      "In the last 6 months about 52K people found us.",
      "About 52,200 people found us through Google Search.",
    ]) {
      const r = lint(body(bad), ALLOWED);
      assert.ok(r.errors.some((e) => e.code === "personal_number"), `${bad} → ${JSON.stringify(r.errors)}`);
    }
  });

  it("“2.75 million” is the proof's figure, not spam wording", () => {
    const r = lint(body("Our pages showed up 2.75 million times in Google over the last 3 months, mostly to couples."), ALLOWED);
    assert.ok(!r.errors.some((e) => e.code === "spam_phrase"), JSON.stringify(r.errors));
    assert.ok(!r.errors.some((e) => e.code === "personal_number"), JSON.stringify(r.errors));
  });

  it("pitch words stay banned with numbers on (ad, promotion, sponsored, campaign)", () => {
    for (const w of ["a quick ad", "a promotion", "a sponsored post", "a campaign"]) {
      const r = lint(body(`${LINE} Think of it as ${w}.`), ALLOWED);
      assert.ok(r.errors.some((e) => e.code === "pitch_word"), w);
    }
  });

  it("a number glued to other digits is not the allowed one", () => {
    assert.match(withoutAllowedNumbers("about 152K people", ALLOWED), /152K/);
    assert.match(withoutAllowedNumbers("about 52K. Then", ALLOWED), /^about\s+\. Then$/);
  });
});

describe("the parse step: a model draft with numbers passes only with the proof", () => {
  const ctx: ProspectDraftContext = {
    mode: "personal",
    style: "personal",
    person: { name: "Om & Diya", instagram: "theecouple__", niche: "couple reels", note: "Hindi couple reels from Jaipur" },
    programme: { commissionPercent: 30, attributionDays: 60, joinUrl: "https://subhsandesh.in/influencer", today: "2026-10-19" },
    proof: PROOF,
  };
  const raw = JSON.stringify({
    reading: "Intro with numbers",
    subject: "x",
    body: "Hey Om and Diya,\n\nI'm Suyash from SubhSandesh. Your Hindi couple reels from Jaipur are lovely.\n\nWe make little interactive pages people send someone they love — birthday surprises, miss-you notes, proposals. In the last 3 months about 52K people found us through Google Search alone, looking for something special for a birthday or an anniversary.\n\nI'd love to make a reel with you two where one of you surprises the other with a page on camera. Happy to pay for it, of course, and you'd get your own link to share.\n\nWould you be up for trying one together?",
  });

  it("passes with the proof in the context", () => {
    const d = parseProspectDraft(raw, ctx, "english");
    assert.match(d.body, /52K/);
  });

  it("is thrown away without it", () => {
    assert.throws(() => parseProspectDraft(raw, { ...ctx, proof: null }, "english"), /spam check/);
  });

  it("the prompt carries the facts and 70–120 words; without proof no numbers block", () => {
    const p = buildProspectPrompt(ctx, "english");
    assert.match(p, /REAL NUMBERS — from our Google Search Console/);
    assert.match(p, /70 to 120 words/);
    assert.match(p, /their own link/);
    const q = buildProspectPrompt({ ...ctx, proof: null }, "english");
    assert.ok(!/REAL NUMBERS/.test(q));
    assert.match(q, /Write no digits at all/);
  });
});

describe("the email with the screenshot inline", () => {
  const image = { cid: "proof-dd33ee44@subhsandesh.in", filename: "google-search-stats.png", contentType: "image/png", content: Buffer.from("89504e470d0a1a0a0000000d49484452", "hex") };
  const BODY = "Hey Om and Diya,\n\nI'm Suyash from SubhSandesh. About 52K people found us through Google Search in the last 3 months.\n\nWould you be up for a reel together?";

  it("preview and send render the same text; preview shows the CDN image, send uses cid", () => {
    const pv = personalEmailParts({ body: BODY, signature: "Suyash\nSubhSandesh", proof: PROOF, imageSrc: PROOF.imageUrl });
    const sd = personalEmailParts({ body: BODY, signature: "Suyash\nSubhSandesh", proof: PROOF, imageSrc: `cid:${image.cid}` });
    assert.equal(pv.text, sd.text);
    assert.match(pv.text, /\n\n\(screenshot of our Google Search stats attached\)\n\nSuyash\nSubhSandesh$/);
    assert.match(pv.html, new RegExp(`<img src="${PROOF.imageUrl.replace(/[.]/g, "\\.")}"`));
    assert.match(sd.html, /<img src="cid:proof-dd33ee44@subhsandesh\.in"/);
    assert.ok(!/<table|<style|<a /i.test(sd.html), "not a designed template");
    const none = personalEmailParts({ body: BODY, signature: "Suyash", proof: null });
    assert.equal(none.html, "");
    assert.ok(!/screenshot/.test(none.text));
  });

  it("MIME: multipart/alternative → text/plain + multipart/related (html + inline image by cid), threading kept", async () => {
    const parts = personalEmailParts({ body: BODY, signature: "Suyash\nSubhSandesh", proof: PROOF, imageSrc: `cid:${image.cid}` });
    const raw = (
      await buildRawMime({
        from: "Suyash <suyash@subhsandesh.in>",
        to: "om@example.com",
        replyTo: "Suyash <reply@in.subhsandesh.in>",
        subject: "Re: Om & Diya, a reel idea from SubhSandesh",
        text: parts.text,
        html: parts.html,
        headers: [
          { Name: "In-Reply-To", Value: "<abc@email.amazonses.com>" },
          { Name: "References", Value: "<abc@email.amazonses.com>" },
        ],
        inlineImages: [image],
      })
    ).toString("utf8");
    assert.match(raw, /^Content-Type: multipart\/alternative;/m);
    assert.match(raw, /^Content-Type: multipart\/related;/m);
    assert.match(raw, /^Content-Type: text\/plain; charset=utf-8/m);
    assert.match(raw, /^Content-Type: text\/html; charset=utf-8/m);
    assert.match(raw, /^Content-Type: image\/png; name=google-search-stats\.png/m);
    assert.match(raw, /^Content-ID: <proof-dd33ee44@subhsandesh\.in>/m);
    assert.match(raw, /^Content-Disposition: inline; filename=google-search-stats\.png/m);
    assert.match(raw, /^In-Reply-To: <abc@email\.amazonses\.com>/m);
    assert.match(raw, /^References: <abc@email\.amazonses\.com>/m);
    assert.match(raw, /^Reply-To: Suyash <reply@in\.subhsandesh\.in>/m);
    assert.match(raw, /^From: Suyash <suyash@subhsandesh\.in>/m);
    assert.ok(!/X-Mailer/i.test(raw));
    // the related part comes after the text part (clients show the last alternative they can render)
    assert.ok(raw.indexOf("text/plain") < raw.indexOf("multipart/related"));
  });

  it("SES: Raw content with the configuration set; Simple when there is no image", async () => {
    const base: SesEmail = { to: "om@example.com", subject: "Hi", text: "t", html: "<div>h</div>", replyTo: "r@in.subhsandesh.in", configurationSet: "outreach" };
    const o = { to: "om@example.com", subject: "Hi", fromEmail: "suyash@subhsandesh.in", fromName: "Suyash", configurationSet: "outreach", messageHeaders: [{ Name: "In-Reply-To", Value: "<a@b>" }] };
    const raw = await buildSendCommand({ ...base, inlineImages: [image] }, o);
    assert.equal(raw.input.ConfigurationSetName, "outreach");
    assert.ok(raw.input.Content?.Raw?.Data);
    assert.match(Buffer.from(raw.input.Content!.Raw!.Data!).toString(), /In-Reply-To: <a@b>/);
    const simple = await buildSendCommand(base, o);
    assert.ok(simple.input.Content?.Simple);
    assert.equal(simple.input.ConfigurationSetName, "outreach");
  });

  it("SES: no Reply-To header when it would only repeat the From address", async () => {
    const o = { to: "om@example.com", subject: "Hi", fromEmail: "suyash@subhsandesh.in", fromName: "Suyash", configurationSet: "", messageHeaders: [] };
    const same: SesEmail = { to: "om@example.com", subject: "Hi", text: "t", html: "<div>h</div>", replyTo: "Suyash <Suyash@SubhSandesh.in>" };
    const simple = await buildSendCommand(same, o);
    assert.equal(simple.input.ReplyToAddresses, undefined);
    const raw = await buildSendCommand({ ...same, inlineImages: [image] }, o);
    assert.ok(!/^Reply-To:/im.test(Buffer.from(raw.input.Content!.Raw!.Data!).toString()));
    const other = await buildSendCommand({ ...same, replyTo: "r@in.subhsandesh.in" }, o);
    assert.deepEqual(other.input.ReplyToAddresses, ["r@in.subhsandesh.in"]);
  });

  it("the queue's send input carries the image, the note and the quiet lane all the way to the transport", async () => {
    const input = buildProspectSendInput(
      "personal",
      { to: "om@example.com", subject: "Re: x", body: BODY, token: "INF-ABCDEFGH", instagram: "theecouple__", unsubscribeUrl: "https://x", inReplyTo: "<a@b>", references: "<a@b>", proofImage: { image, source: "search_console", width: 1600, height: 820 } },
      { fromAddress: "suyash@subhsandesh.in", fromName: "Suyash", replyToAddress: "reply@in.subhsandesh.in" },
      "outreach"
    );
    let got: SesEmail | null = null;
    await sendInfluencerMail(input, async (e) => {
      got = e;
      return { outcome: "sent", messageId: "m-1" };
    });
    const e = got! as SesEmail;
    assert.equal(e.configurationSet, "outreach");
    assert.equal(e.inlineImages?.[0].cid, image.cid);
    assert.match(e.text, /\(screenshot of our Google Search stats attached\)/);
    assert.match(e.html || "", /cid:proof-dd33ee44@subhsandesh\.in/);
    assert.equal(e.headers?.["In-Reply-To"], "<a@b>");
    assert.match(e.replyTo || "", /reply@in\.subhsandesh\.in/);
    // without the image: plain text only, exactly as before
    const plain = buildProspectSendInput("personal", { to: "om@example.com", subject: "x", body: BODY, token: "t", instagram: "", unsubscribeUrl: "u" });
    assert.equal(plain.inlineImages, undefined);
    assert.equal(plain.render!({ fromAddress: "", replyToAddress: "" }).html, "");
  });

  it("the inline image comes from our CDN only", async () => {
    const got = await inlineProofImage(PROOF, async (url) => {
      assert.equal(url, PROOF.imageUrl);
      return { contentType: "image/png", content: image.content };
    });
    assert.equal(got.filename, "google-search-stats.png");
    assert.match(got.cid, /@subhsandesh\.in$/);
  });

  it("Inbox check warns about the image and names the numbers", () => {
    const r = lintOutreach("Om & Diya, a reel idea from SubhSandesh", "Hey Om,\n\nI'm Suyash.", { commissionPercent: 30, kind: "initial", style: "personal", writer: "Suyash" });
    const items = inboxCheck({ style: "personal", kind: "initial", body: "", lint: r, sender: { fromAddress: "suyash@subhsandesh.in", fromName: "Suyash" }, writer: "Suyash", numbers: true, image: true });
    const img = items.find((i) => /Screenshot attached/.test(i.label));
    assert.ok(img && img.warn && !img.ok);
    assert.match(img!.label, /Promotions/);
    assert.ok(items.some((i) => /confirmed traction numbers/.test(i.label)));
    const off = inboxCheck({ style: "personal", kind: "initial", body: "", lint: r, sender: { fromAddress: "suyash@subhsandesh.in", fromName: "Suyash" }, writer: "Suyash" });
    assert.ok(off.some((i) => i.label === "Plain text — no HTML or images"));
  });
});

describe("model selection", () => {
  const LIVE = ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-5", "gpt-5-mini", "gpt-5-pro", "gpt-5-codex", "gpt-5.1", "gpt-5.2-chat-latest", "gpt-5.4", "gpt-5.4-mini", "gpt-5.5", "gpt-5.5-pro", "gpt-5.5-2026-04-23", "gpt-5.6-luna", "o3", "o3-pro", "o4-mini"];

  it("takes the newest bare GPT-5-family flagship", () => {
    assert.equal(pickBestModel(LIVE), "gpt-5.5");
    assert.equal(pickBestModel(["gpt-5", "gpt-5-mini", "gpt-4o"]), "gpt-5");
  });
  it("else o-series, else gpt-4.1, else gpt-4o, else the current model", () => {
    assert.equal(pickBestModel(["o1", "o3", "o3-mini", "gpt-4o"]), "o3");
    assert.equal(pickBestModel(["gpt-4.1", "gpt-4o", "gpt-4o-mini"]), "gpt-4.1");
    assert.equal(pickBestModel(["gpt-4o", "gpt-4o-mini"]), "gpt-4o");
    assert.equal(pickBestModel(["gpt-4o-mini"], "gpt-4o-mini"), "gpt-4o-mini");
    assert.equal(pickBestModel([], "gpt-4o-mini"), "gpt-4o-mini");
  });
  it("reasoning models get max_completion_tokens + reasoning_effort, no temperature", () => {
    assert.ok(isReasoningModel("gpt-5.5") && isReasoningModel("o3") && !isReasoningModel("gpt-4o"));
    const r = completionParams("gpt-5.5", [], { name: "x", schema: {} }) as unknown as Record<string, unknown>;
    assert.equal(r.temperature, undefined);
    assert.equal(r.reasoning_effort, "low");
    assert.ok((r.max_completion_tokens as number) >= 4000);
    const c = completionParams("gpt-4o", [], { name: "x", schema: {} }) as unknown as Record<string, unknown>;
    assert.equal(c.temperature, 0.6);
    assert.equal(c.max_tokens, 1100);
  });
  it("lists once and caches; PROSPECT_AI_MODEL overrides", async () => {
    _resetModelCacheForTests();
    let calls = 0;
    const list = async () => { calls++; return LIVE; };
    const prev = process.env.PROSPECT_AI_MODEL;
    delete process.env.PROSPECT_AI_MODEL;
    try {
      assert.equal(await resolveProspectModel(list), "gpt-5.5");
      assert.equal(await resolveProspectModel(list), "gpt-5.5");
      assert.equal(calls, 1);
      process.env.PROSPECT_AI_MODEL = "gpt-4.1";
      assert.equal(await resolveProspectModel(list), "gpt-4.1");
    } finally {
      if (prev === undefined) delete process.env.PROSPECT_AI_MODEL;
      else process.env.PROSPECT_AI_MODEL = prev;
      _resetModelCacheForTests();
    }
  });
  it("a failed lookup falls back to gpt-4o and is not cached", async () => {
    _resetModelCacheForTests();
    const prev = process.env.PROSPECT_AI_MODEL;
    delete process.env.PROSPECT_AI_MODEL;
    try {
      assert.equal(await resolveProspectModel(async () => { throw new Error("401"); }), "gpt-4o");
      assert.equal(await resolveProspectModel(async () => ["gpt-5.1"]), "gpt-5.1");
    } finally {
      if (prev !== undefined) process.env.PROSPECT_AI_MODEL = prev;
      _resetModelCacheForTests();
    }
  });
});
