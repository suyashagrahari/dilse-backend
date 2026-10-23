// ─── Spam / Promotions risk scores and "Make it more personal" ──────────────
//
// Pure: the model is a stub, nothing is sent.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { firstNameOf, riskLevel, scoreDeliverability, type Deliverability } from "./deliverability.service";
import { improveProspectMail, buildImprovePrompt, shapeFixes, IMPROVE_SYSTEM_PROMPT } from "./prospectImprove.service";

const SUYASH = { fromName: "Suyash", fromAddress: "suyash@subhsandesh.in" };

const CONNECT =
  "Hey Om,\n\nI've been watching your reels with Diya — the one where you surprised her at the station made me smile. I'm Suyash, and I'd love to connect.\n\nHow did you two start making videos together?\n\nSuyash";

const PROMO =
  "Hi there,\n\nEXCLUSIVE collab opportunity with SubhSandesh! Earn 20% commission on every sale — limited time offer!!\n\nSign up now: https://subhsandesh.in/influencer?utm_source=mail and https://bit.ly/xyz\n\nTeam SubhSandesh\nWard No. 06";

describe("scoreDeliverability", () => {
  it("a Connect note from a person scores low on both", () => {
    const d = scoreDeliverability({ subject: "Om & Diya, would love to connect", text: CONNECT, ...SUYASH, headers: [], firstName: "Om" });
    assert.equal(d.spamLevel, "low", JSON.stringify(d.factors));
    assert.equal(d.promotionsLevel, "low", JSON.stringify(d.factors));
    assert.ok(d.good.includes("No links"));
    assert.ok(d.good.includes("Sent from a person's own address"));
  });

  it("a marketing blast scores high on both, with the reasons and fixes", () => {
    const d = scoreDeliverability({
      subject: "EARN WITH SUBHSANDESH!",
      text: PROMO,
      html: "<table><tr><td><img src=x></td></tr></table>",
      fromName: "SubhSandesh Team",
      fromAddress: "team@subhsandesh.in",
      headers: ["List-Unsubscribe", "List-Unsubscribe-Post"],
      firstName: "Om",
    });
    assert.equal(d.spamLevel, "high");
    assert.equal(d.promotionsLevel, "high");
    const ids = d.factors.map((f) => f.id);
    for (const id of ["list_unsubscribe", "role_sender", "brand_from", "html", "subject_caps", "subject_bang", "subject_brand", "pitch_words", "money", "shortener", "tracking", "links", "generic_greeting", "caps", "punctuation", "footer"]) {
      assert.ok(ids.includes(id), `missing ${id}: ${ids.join(",")}`);
    }
    assert.ok(d.factors.every((f) => f.fix.length > 0 && f.points > 0));
    // biggest first
    assert.ok(d.factors[0].points >= d.factors[d.factors.length - 1].points);
  });

  it("each signal moves only its own score the right way", () => {
    const base = scoreDeliverability({ subject: "Om, quick hello", text: CONNECT, ...SUYASH, firstName: "Om" });
    const link = scoreDeliverability({ subject: "Om, quick hello", text: CONNECT.replace("How did", "subhsandesh.in — how did"), ...SUYASH, firstName: "Om" });
    assert.ok(link.promotions > base.promotions);
    const spammy = scoreDeliverability({ subject: "Om, quick hello", text: CONNECT.replace("I'd love to connect", "this is guaranteed, act now"), ...SUYASH, firstName: "Om" });
    assert.ok(spammy.spam > base.spam);
    const unsub = scoreDeliverability({ subject: "Om, quick hello", text: CONNECT, ...SUYASH, firstName: "Om", headers: ["List-Unsubscribe"] });
    assert.equal(unsub.spam, base.spam);
    assert.ok(unsub.promotions >= base.promotions + 25);
  });

  it("a reply in a conversation may carry a link and details", () => {
    const text = "Hey Om,\n\nHere's the page: https://subhsandesh.in/influencer — the commission is 20%.\n\nSuyash";
    const cold = scoreDeliverability({ subject: "Re: hello", text, ...SUYASH, firstName: "Om" });
    const reply = scoreDeliverability({ subject: "Re: hello", text, ...SUYASH, firstName: "Om", reply: true });
    assert.ok(reply.promotions < cold.promotions);
  });

  it("a leftover placeholder is flagged", () => {
    const d = scoreDeliverability({ subject: "Hi", text: "Hey {{firstName}},\n\nLoved your reel. How's it going?", ...SUYASH });
    assert.ok(d.factors.some((f) => f.id === "placeholder"));
  });

  it("scores stay within 2–98 and levels follow the bands", () => {
    const d = scoreDeliverability({ subject: "x", text: PROMO.repeat(5), fromName: "SubhSandesh", fromAddress: "noreply@subhsandesh.in", headers: ["List-Unsubscribe"], image: true });
    assert.ok(d.spam <= 98 && d.promotions <= 98);
    assert.equal(riskLevel(10), "low");
    assert.equal(riskLevel(30), "medium");
    assert.equal(riskLevel(70), "high");
  });

  it("firstNameOf takes the first person's first name", () => {
    assert.equal(firstNameOf("Om & Diya"), "Om");
    assert.equal(firstNameOf("Priya Sharma"), "Priya");
    assert.equal(firstNameOf(""), "");
  });
});

describe("improveProspectMail", () => {
  const ORIGINAL = { subject: "Exclusive collab offer", body: "Hi {{firstName}},\n\nWe have an exclusive collab offer for you — earn 20% commission! Sign up at subhsandesh.in" };
  const check = (subject: string, body: string) => ({
    errors: /\{\{firstName\}\}/.test(body) ? [] : [{ code: "greeting", message: "Greet them by {{firstName}}." }],
    score: scoreDeliverability({ subject, text: body.replace(/\{\{firstName\}\}/g, "Om"), ...SUYASH, firstName: "Om" }),
  });
  const reply = (subject: string, body: string) => async () => JSON.stringify({ reading: "x", subject, body });

  it("returns a rewrite that passes the linter and scores lower", async () => {
    const r = await improveProspectMail(
      { ...ORIGINAL, subjectLocked: false, writer: "Suyash", check },
      reply("Om, loved your reels", "Hi {{firstName}},\n\nYour reel at the station made me smile. I'm Suyash. How did you two start making videos?")
    );
    assert.equal(r.improved, true);
    assert.ok(r.after.spam + r.after.promotions < r.before.spam + r.before.promotions);
    assert.match(r.body, /\{\{firstName\}\}/);
  });

  it("keeps a locked subject whatever the model says", async () => {
    const r = await improveProspectMail(
      { ...ORIGINAL, subject: "Om, would love to connect", subjectLocked: true, writer: "Suyash", check },
      reply("Something else", "Hi {{firstName}},\n\nYour reel made me smile. How did you start?")
    );
    assert.equal(r.subject, "Om, would love to connect");
  });

  it("rejects a rewrite that drops a placeholder, and says why when nothing works", async () => {
    await assert.rejects(
      improveProspectMail({ ...ORIGINAL, subjectLocked: false, writer: "Suyash", check }, reply("Om, hi", "Hi Om,\n\nLoved it. How did you start?")),
      /dropped \{\{firstName\}\}/
    );
  });

  it("does not hand back something that scores no better", async () => {
    const good = { subject: "Om, loved your reels", body: "Hi {{firstName}},\n\nYour reel at the station made me smile. I'm Suyash. How did you two start?" };
    const r = await improveProspectMail({ ...good, subjectLocked: false, writer: "Suyash", check }, reply("EXCLUSIVE OFFER", "Hi {{firstName}},\n\nExclusive collab offer! Earn 20%!"));
    assert.equal(r.improved, false);
    assert.equal(r.body, good.body);
  });

  it("the prompt asks for the fixes, never lists the flagged words", () => {
    const before: Deliverability = scoreDeliverability({ subject: ORIGINAL.subject, text: ORIGINAL.body, ...SUYASH, firstName: "Om" });
    const p = buildImprovePrompt({ ...ORIGINAL, subjectLocked: false, writer: "Suyash", fixes: before.factors.map((f) => f.fix) });
    const flagged = ["exclusive", "collab", "offer", "commission", "earn"];
    const instructions = p.slice(0, p.indexOf("SUBJECT"));
    for (const w of flagged) assert.ok(!new RegExp(`\\b${w}\\b`, "i").test(instructions), w);
    for (const w of flagged) assert.ok(!new RegExp(`\\b${w}\\b`, "i").test(IMPROVE_SYSTEM_PROMPT), w);
  });

  it("shapeFixes passes length / question rules and drops any message that quotes a word", () => {
    assert.deepEqual(
      shapeFixes([
        { code: "too_short", message: "Too short (29 words). Aim for 40–60." },
        { code: "pitch_word", message: "“collab” reads like a pitch." },
        { code: "no_question", message: "Ask one soft question with a question mark." },
      ]),
      ["Too short (29 words). Aim for 40–60.", "Ask one soft question with a question mark."]
    );
  });

  it("feeds a failed check back and accepts a sendable rewrite of an unsendable email", async () => {
    let calls = 0;
    const prompts: string[] = [];
    const lenCheck = (subject: string, body: string) => ({
      errors: body.split(/\s+/).length < 12 ? [{ code: "too_short", message: "Too short. Aim for 12+ words." }] : [],
      score: scoreDeliverability({ subject, text: body, ...SUYASH, firstName: "Om" }),
    });
    const r = await improveProspectMail(
      { subject: "Om, hi", body: "Hey Om,\n\nLoved your reel. How did you start?", subjectLocked: true, writer: "Suyash", check: lenCheck },
      async (_s, u) => {
        prompts.push(u);
        calls++;
        return JSON.stringify({ reading: "", subject: "x", body: calls === 1 ? "Hey Om,\n\nNice. How?" : "Hey Om,\n\nYour station reel with Diya made me smile today. I'm Suyash. How did you two start making videos?" });
      }
    );
    assert.equal(r.improved, true);
    assert.match(prompts[0], /Too short/);
    assert.match(prompts[1], /YOUR LAST VERSION STILL NEEDS/);
  });
});
