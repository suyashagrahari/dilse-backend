import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { applyPagePassword } from "./pagePassword";

describe("applyPagePassword", () => {
  it("never removes a password that is already set", () => {
    // The whole point. Each of these is what an ordinary edit looks like when
    // the sender did not retype the password, and every one of them used to
    // leave the page open to anyone with the link.
    for (const incoming of [undefined, null, "", "   ", "\n\t ", 0, false, {}, []]) {
      const page = { password: "hashed-value" };
      applyPagePassword(page, incoming);
      assert.equal(page.password, "hashed-value", `${JSON.stringify(incoming)} must change nothing`);
    }
  });

  it("sets a real password, trimmed", () => {
    const page: { password?: string } = { password: "" };
    applyPagePassword(page, "  sunflower  ");
    assert.equal(page.password, "sunflower");
  });

  it("caps length by real characters, not whitespace", () => {
    const page: { password?: string } = {};
    applyPagePassword(page, "   " + "a".repeat(20) + "   ", 8);
    assert.equal(page.password, "a".repeat(8));
  });
});

describe("no update handler writes a page password directly", () => {
  it("every controller goes through applyPagePassword", () => {
    // ── WHY THIS IS A TEST AND NOT A CONVENTION ──────────────────────────────
    //
    // 22 of the 44 update handlers assigned the password themselves, either
    // unconditionally or guarded only against `undefined`. Both store an empty
    // string on an ordinary edit, and the model's hook does not hash empty
    // values — so the page kept its `passwordRaw` and lost its gate. A private
    // page went public because its owner renamed something.
    //
    // Reproduced on a real database before the fix, on two templates.
    const dir = path.join(__dirname, "..", "controllers");
    const offenders: string[] = [];

    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith("Page.controller.ts"))) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      const update = src.match(/export const update\w*Page = async[\s\S]*?\n\};/)?.[0];
      if (!update) continue;

      // A direct write, in either the plain or the indexed form.
      const direct = update
        .split("\n")
        .filter((l) => /\bpage\.password\s*=|\["password"\]\s*=/.test(l))
        // The guarded form that predates the helper is still correct: it refuses
        // an empty string explicitly.
        .filter((l) => !/!== ""/.test(l));

      for (const line of direct) offenders.push(`${f}: ${line.trim().slice(0, 90)}`);

      // The looped-field-list form: "password" among the keys copied straight
      // from the request body is the same wipe wearing different clothes.
      if (/for \(const field of fields\)/.test(update) && /"password"/.test(update)) {
        offenders.push(`${f}: "password" is copied by the field loop`);
      }
    }

    assert.deepEqual(offenders, [], "these would clear the gate on an ordinary edit");
  });
});
