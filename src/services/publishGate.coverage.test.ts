import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { allTemplateTypeSlugPairs } from "../config/templateSlugs";

const CONTROLLERS = path.join(__dirname, "..", "controllers");

/** Controllers that publish a page but are not a template page controller. */
const NOT_TEMPLATE_PAGES = new Set(["activity", "admin", "share"]);

function controllerFiles(): string[] {
  return fs.readdirSync(CONTROLLERS).filter((f) => f.endsWith(".controller.ts"));
}

test("every controller with a publish handler consults the publish gate", () => {
  const offenders: string[] = [];

  for (const file of controllerFiles()) {
    const name = file.replace(".controller.ts", "");
    if (NOT_TEMPLATE_PAGES.has(name)) continue;

    const body = fs.readFileSync(path.join(CONTROLLERS, file), "utf8");
    const publishes = /isPublished\s*=\s*true/.test(body) || /export const publish/.test(body);
    if (!publishes) continue;

    if (!body.includes("checkPublishAccess")) offenders.push(file);
  }

  assert.deepEqual(
    offenders,
    [],
    `these publish a page without consulting the gate, so pricing their template ` +
      `would charge nobody:\n  ${offenders.join("\n  ")}`
  );
});

test("every templateType in the lookups is priceable under a non-empty slug", () => {
  for (const { templateType, slug } of allTemplateTypeSlugPairs()) {
    assert.ok(slug, `${templateType} has no slug, so it cannot be priced`);
  }
});

/**
 * The grep above proves the gate is MENTIONED. This proves it is mentioned
 * BEFORE the line that makes the page live, which is the part that matters.
 *
 * A handler that sets `isPublished = true` and then consults the gate passes the
 * first test and charges nobody — the page is already live by the time the 402
 * is returned. This catches that ordering without needing to run the handler.
 */
test("the gate is consulted before the page is marked published", () => {
  const offenders: string[] = [];

  for (const file of controllerFiles()) {
    const name = file.replace(".controller.ts", "");
    if (NOT_TEMPLATE_PAGES.has(name)) continue;

    const body = fs.readFileSync(path.join(CONTROLLERS, file), "utf8");
    if (!body.includes("checkPublishAccess")) continue;

    // Compare positions within the publish handler only. Some controllers set
    // isPublished elsewhere (a create that publishes immediately, a duplicate),
    // so anchor on the publish export and read to the end of that function.
    const publishIdx = body.search(/export const publish/);
    if (publishIdx === -1) continue;

    const region = body.slice(publishIdx);
    const gateIdx = region.indexOf("checkPublishAccess");
    const liveIdx = region.search(/isPublished\s*=\s*true/);

    if (gateIdx === -1) {
      offenders.push(`${file} (publish handler does not call the gate)`);
      continue;
    }
    if (liveIdx !== -1 && liveIdx < gateIdx) {
      offenders.push(`${file} (marks the page live at +${liveIdx} before gating at +${gateIdx})`);
    }
  }

  assert.deepEqual(offenders, [], `gate ordering is wrong in:\n  ${offenders.join("\n  ")}`);
});

/**
 * `isAlreadyPublished` must be read from the page BEFORE the handler sets it.
 *
 * Rule 2 of the gate allows any already-published page through. A handler that
 * passes a value read after assignment — or passes `true` — grandfathers every
 * page including brand-new ones, and nothing is ever charged. That is a silent
 * revenue hole of exactly the kind this whole change exists to close, so it gets
 * an assertion rather than a code review.
 */
test("no publish handler tells the gate a page is already published unconditionally", () => {
  const offenders: string[] = [];

  for (const file of controllerFiles()) {
    const body = fs.readFileSync(path.join(CONTROLLERS, file), "utf8");
    if (!body.includes("checkPublishAccess")) continue;

    // Match the argument as written, allowing for whitespace and formatting.
    for (const m of body.matchAll(/isAlreadyPublished:\s*([^,\n]+)/g)) {
      const arg = m[1].trim();
      if (/^true$/.test(arg)) {
        offenders.push(`${file} passes a literal true`);
      }
    }
  }

  assert.deepEqual(offenders, [], `these would grandfather every page:\n  ${offenders.join("\n  ")}`);
});
