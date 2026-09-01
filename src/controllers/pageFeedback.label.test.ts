// Every template must be nameable in the feedback panel.
//
// ── WHY THIS IS AN INVARIANT AND NOT A HANDFUL OF EXAMPLES ──────────────────
//
// The label is what a super admin reads on a ticket and what the AI drafter is
// told the person built. When it does not resolve, the row shows no template at
// all and the draft says "a SubhSandesh page" — degraded, silent, and invisible
// until somebody notices a blank chip weeks later.
//
// The first version of `labelForSlug` looked only at the slug→type mapping, and
// two whole classes of identifier fell through it: types with no slug entry
// ("eid", "raksha-bandhan") resolved to nothing, and identifiers that are BOTH a
// slug and a type ("birthday-gf") resolved to the wrong one of the two. Both
// were found by a single assertion in the integration script and neither would
// have been caught by testing three hand-picked slugs.
//
// So this asserts over the whole catalog: every templateType and every editor
// route slug in the registry resolves to a non-empty label. A forty-fourth
// template cannot ship unnameable.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { labelForSlug } from "./pageFeedback.controller";
import { allTemplateTypeSlugPairs } from "../config/templateSlugs";
import { TEMPLATE_REGISTRY } from "../services/templateRegistry";

describe("labelForSlug", () => {
  it("names every templateType in the registry", () => {
    const unnamed = TEMPLATE_REGISTRY.filter((e) => !labelForSlug(e.templateType)).map(
      (e) => e.templateType
    );
    assert.deepEqual(unnamed, [], `templateTypes with no label:\n  ${unnamed.join("\n  ")}`);
  });

  it("names every editor-route slug — the value the client actually sends", () => {
    const pairs = allTemplateTypeSlugPairs();
    assert.ok(pairs.length > 30, `expected the full catalog, got ${pairs.length}`);

    const unnamed = pairs.filter(({ slug }) => !labelForSlug(slug)).map(({ slug }) => slug);
    assert.deepEqual(unnamed, [], `editor slugs with no label:\n  ${unnamed.join("\n  ")}`);
  });

  it("prefers the exact templateType when an identifier is both a slug and a type", () => {
    // "birthday-gf" is an editor route AND a templateType, and its slug entry
    // lists "birthday" first. Resolving via the slug mapping alone labels a
    // Birthday GF page "Birthday".
    const both = allTemplateTypeSlugPairs().filter(({ templateType, slug }) => templateType === slug);
    assert.ok(both.length > 0, "expected at least one identifier that is both");

    for (const { templateType } of both) {
      const entry = TEMPLATE_REGISTRY.find((e) => e.templateType === templateType);
      if (!entry) continue;
      assert.equal(
        labelForSlug(templateType),
        entry.label,
        `${templateType} resolved to the wrong label`
      );
    }
  });

  it("is case- and whitespace-insensitive, because it reads a request body", () => {
    const { slug, templateType } = allTemplateTypeSlugPairs()[0];
    const expected = labelForSlug(slug);
    assert.ok(expected, `fixture slug ${slug} (${templateType}) has no label`);
    assert.equal(labelForSlug(`  ${slug.toUpperCase()}  `), expected);
  });

  it("returns empty rather than guessing for something unknown", () => {
    for (const junk of ["", "   ", "not-a-template", "../../etc/passwd", "<script>"]) {
      assert.equal(labelForSlug(junk), "", JSON.stringify(junk));
    }
  });
});
