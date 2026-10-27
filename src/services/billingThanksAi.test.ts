import test from "node:test";
import assert from "node:assert/strict";
import { BillingAiRefusedError, buildThanksPrompt, parseThanksDraft } from "./billingThanksAi.service";

test("a good draft is kept; a trailing signature is stripped", () => {
  const d = parseThanksDraft(JSON.stringify({ subject: "Thank you, Asha 💛", message: "Dear Asha,\n\nThank you for choosing SubhSandesh for your Happy Halloween page.\n\nWarm regards,\nSubhSandesh" }));
  assert.equal(d.subject, "Thank you, Asha 💛");
  assert.ok(d.message.endsWith("Happy Halloween page."));
});

test("money words throw the draft away", () => {
  assert.throws(() => parseThanksDraft(JSON.stringify({ subject: "Thanks", message: "Dear Asha,\n\nThank you! Here is a 10% discount coupon for your next celebration with us." })), BillingAiRefusedError);
  assert.throws(() => parseThanksDraft("not json"), BillingAiRefusedError);
  assert.throws(() => parseThanksDraft(JSON.stringify({ subject: "x", message: "short" })), BillingAiRefusedError);
});

test("the prompt carries the first name and templates only, fenced as data", () => {
  const p = buildThanksPrompt({ name: "Asha Rao", templates: ["Happy Halloween ✦ Premium", "Happy Halloween ✦ Premium"], period: "24 Oct 2026" });
  assert.ok(p.includes("NAME:\n<<<\nAsha\n>>>"));
  assert.equal(p.match(/Happy Halloween/g)?.length, 1, "templates deduplicated");
  assert.ok(!p.includes("@"), "no email address");
});
