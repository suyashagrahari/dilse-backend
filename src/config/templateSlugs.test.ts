import { test } from "node:test";
import assert from "node:assert/strict";
import { slugForTemplateType, templateTypesForSlug, allTemplateTypeSlugPairs } from "./templateSlugs";

test("translates the templateTypes whose slug differs from their name", () => {
  assert.equal(slugForTemplateType("eid"), "eid-mubarak");
  assert.equal(slugForTemplateType("wedding"), "wedding-shaadi");
  assert.equal(slugForTemplateType("valentine"), "valentine-gf");
  assert.equal(slugForTemplateType("shaadi"), "shaadi-card");
  assert.equal(slugForTemplateType("raksha-bandhan"), "happy-rakshabandhan-to-brother");
  assert.equal(slugForTemplateType("raksha-bandhan-sister"), "happy-rakshabandhan-to-sister");
});

test("passes through the templateTypes that already are their slug", () => {
  assert.equal(slugForTemplateType("holi"), "holi");
  assert.equal(slugForTemplateType("apology-dashboard"), "apology-dashboard");
});

test("both birthday templateTypes share one slug, so both take one price", () => {
  assert.equal(slugForTemplateType("birthday"), "birthday-gf");
  assert.equal(slugForTemplateType("birthday-gf"), "birthday-gf");
  assert.deepEqual(templateTypesForSlug("birthday-gf").sort(), ["birthday", "birthday-gf"]);
});

test("an unknown templateType maps to itself rather than throwing", () => {
  // A template can reach the gate before anyone adds it to TEMPLATE_LOOKUPS.
  // Returning the input means it gets the free default, not a 500.
  assert.equal(slugForTemplateType("not-a-real-template"), "not-a-real-template");
});

test("every lookup yields a non-empty slug", () => {
  const pairs = allTemplateTypeSlugPairs();
  assert.ok(pairs.length >= 43, `only ${pairs.length} pairs found`);
  for (const { templateType, slug } of pairs) {
    assert.ok(slug && slug.length > 0, `${templateType} produced an empty slug`);
    assert.ok(!slug.startsWith("/"), `${templateType} kept its leading slash: ${slug}`);
  }
});

// ── Guards on the derivation itself ──────────────────────────────────────────

test("lookup is case-insensitive on the way in", () => {
  // Nothing should send "EID", but a hand-built request will, and answering
  // "free" to a mis-cased templateType is a publish nobody was charged for.
  assert.equal(slugForTemplateType("EID"), "eid-mubarak");
  assert.equal(slugForTemplateType("Holi"), "holi");
});

test("empty and nonsense input never throws", () => {
  assert.equal(slugForTemplateType(""), "");
  assert.equal(slugForTemplateType(undefined as unknown as string), "");
  assert.equal(slugForTemplateType(null as unknown as string), "");
});

test("every slug is a clean URL segment", () => {
  // The slug becomes a pricing row's key and a panel row's identity. Anything
  // that is not a plain segment means TEMPLATE_LOOKUPS has an editorRoute this
  // derivation was not built for — e.g. a nested path.
  const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
  for (const { templateType, slug } of allTemplateTypeSlugPairs()) {
    assert.ok(SLUG_RE.test(slug), `${templateType} derived "${slug}", which is not a plain slug`);
  }
});

test("templateTypesForSlug is the exact inverse of slugForTemplateType", () => {
  // If these ever disagree, a price set on a slug applies to a different set of
  // templateTypes than the panel believes it does.
  for (const { templateType, slug } of allTemplateTypeSlugPairs()) {
    assert.ok(
      templateTypesForSlug(slug).includes(templateType),
      `${templateType} maps to ${slug}, but ${slug} does not map back to it`
    );
  }
});

test("an unknown slug has no templateTypes", () => {
  assert.deepEqual(templateTypesForSlug("not-a-real-slug"), []);
});
