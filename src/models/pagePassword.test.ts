import { describe, it } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

import ProposalPage from "./ProposalPage";
import ApologyDashboardPage from "./ApologyDashboardPage";
import GaneshChaturthiPage from "./GaneshChaturthiPage";

/**
 * `comparePassword` reads nothing but `this.password`, so it can be exercised
 * with a synthetic `this` and no database — which keeps these in the same
 * dependency-free shape as the rest of the suite.
 */
type Compare = (this: { password: string }, candidate: string) => Promise<boolean>;

const compareOf = (model: { schema: { methods: Record<string, unknown> } }): Compare =>
  model.schema.methods.comparePassword as Compare;

const hash = (s: string) => bcrypt.hash(s, bcrypt.genSaltSync(4));

describe("page password comparison", () => {
  const models: Array<[string, ReturnType<typeof compareOf>]> = [
    ["ProposalPage", compareOf(ProposalPage as never)],
    ["ApologyDashboardPage", compareOf(ApologyDashboardPage as never)],
    ["GaneshChaturthiPage", compareOf(GaneshChaturthiPage as never)],
  ];

  it("opens a page published BEFORE passwords were trimmed", async () => {
    // ── THE REGRESSION THIS EXISTS FOR ────────────────────────────────────────
    //
    // Those rows hashed the string exactly as the sender typed it, whitespace
    // and all. When `comparePassword` began trimming the candidate, the only
    // key that opened them stopped working — the sender's own password failed
    // on the sender's own page, and so did the trimmed version. There was no
    // string the recipient could type.
    for (const [name, compare] of models) {
      for (const typed of ["sunflower ", " sunflower", "  our song  "]) {
        const stored = { password: await hash(typed) };
        assert.equal(
          await compare.call(stored, typed),
          true,
          `${name}: a legacy page must open for the string it was created with (${JSON.stringify(typed)})`
        );
      }
    }
  });

  it("opens a page saved today, however the recipient types it", async () => {
    for (const [name, compare] of models) {
      // Saved through the hook, so the stored hash is of the trimmed string.
      const stored = { password: await hash("sunflower") };
      for (const typed of ["sunflower", "sunflower ", " sunflower", "  sunflower  "]) {
        assert.equal(await compare.call(stored, typed), true, `${name}: ${JSON.stringify(typed)}`);
      }
    }
  });

  it("still refuses a wrong password", async () => {
    for (const [name, compare] of models) {
      const stored = { password: await hash("sunflower") };
      for (const wrong of ["", "   ", "sunflowe", "Sunflower", "sunflower1", "nope"]) {
        assert.equal(await compare.call(stored, wrong), false, `${name}: ${JSON.stringify(wrong)} must not open`);
      }
    }
  });

  it("treats an unprotected page as open", async () => {
    for (const [, compare] of models) {
      assert.equal(await compare.call({ password: "" }, ""), true);
      assert.equal(await compare.call({ password: "" }, "anything"), true);
    }
  });

  it("every page model shares the one implementation", () => {
    // 43 copies of this logic exist. The bug that started all of this was one
    // half of a pair being changed without the other, so the guard that matters
    // is that no copy drifts.
    const dir = path.join(__dirname);
    const offenders: string[] = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
      if (f === "User.ts") continue; // the ACCOUNT password — deliberately untrimmed
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      if (!/methods\.comparePassword/.test(src)) continue;

      const trimsOnSave = /this\.password\.trim\(\)/.test(src);
      const triesTrimmed = /bcrypt\.compare\(trimmed, this\.password\)/.test(src);
      const triesRaw = /bcrypt\.compare\(raw, this\.password\)/.test(src);
      // Keeps the plaintext the first time an old page is proved open, so a
      // page created before `passwordRaw` existed becomes readable in the admin
      // panel instead of being "reset but not recovered" forever.
      const remembersTrimmed = /rememberPagePassword\(this, trimmed\)/.test(src);
      const remembersRaw = /rememberPagePassword\(this, raw\)/.test(src);
      const storesRawOnSave = /this\.passwordRaw = trimmed/.test(src);
      if (
        !trimsOnSave ||
        !triesTrimmed ||
        !triesRaw ||
        !remembersTrimmed ||
        !remembersRaw ||
        !storesRawOnSave
      ) {
        offenders.push(
          `${f} (trim-on-save=${trimsOnSave} trimmed-compare=${triesTrimmed} ` +
            `raw-fallback=${triesRaw} remembers-trimmed=${remembersTrimmed} ` +
            `remembers-raw=${remembersRaw} stores-raw-on-save=${storesRawOnSave})`
        );
      }
    }
    assert.deepEqual(offenders, [], "these page models have drifted from the shared password logic");
  });
});
