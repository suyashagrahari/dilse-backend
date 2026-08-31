import { test } from "node:test";
import assert from "node:assert/strict";
import { allTemplateTypeSlugPairs } from "../config/templateSlugs";
import { modelForTemplateType } from "./payment.controller";

test("every templateType that can be priced can also have its owner verified", () => {
  const missing: string[] = [];
  for (const { templateType } of allTemplateTypeSlugPairs()) {
    if (!modelForTemplateType(templateType)) missing.push(templateType);
  }
  assert.deepEqual(
    missing,
    [],
    `create-order would 403 for these, so their paywall could never take money:\n  ${missing.join("\n  ")}`
  );
});

test("an unknown templateType has no model rather than throwing", () => {
  assert.equal(modelForTemplateType("not-a-real-template"), null);
  assert.equal(modelForTemplateType(""), null);
  assert.equal(modelForTemplateType(undefined as unknown as string), null);
});

test("lookup is case-insensitive, matching slugForTemplateType", () => {
  // The two must agree on what counts as the same templateType, or a mis-cased
  // request could resolve a price and fail ownership, or the reverse.
  assert.ok(modelForTemplateType("HOLI"));
  assert.ok(modelForTemplateType("Eid"));
});
