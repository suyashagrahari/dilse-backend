// ─── The scrubber's contract ─────────────────────────────────────────────────
//
// Two assertions in tension, and both matter:
//
//   1. A private key never survives, however deeply it is buried.
//   2. Everything else arrives EXACTLY as the controller sent it.
//
// The second is the one that makes this middleware safe to put above every
// route in the API. A scrubber that quietly drops a real field, reshapes a
// Date, or turns an array into an object would be a worse bug than the leak it
// prevents — it would break correct responses everywhere at once.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scrubPrivate, __ALWAYS_PRIVATE } from "./scrubPrivate";

type Json = Record<string, unknown>;

/** Run a payload through the middleware and return what would be sent. */
function send(payload: unknown, path = "/feedback/public"): unknown {
  let out: unknown;
  const res = { json: (b: unknown) => { out = b; return res; } } as never as {
    json: (b: unknown) => unknown;
  };
  scrubPrivate({ path } as never, res as never, () => {});
  (res.json as (b: unknown) => unknown)(payload);
  return out;
}

describe("what must never survive", () => {
  it("drops every always-private key at the top level", () => {
    const got = send({
      success: true,
      password: "$2b$10$hash",
      otp: "123456",
      otpExpiry: new Date(),
      ipAddress: "203.0.113.9",
      userAgent: "Mozilla/5.0",
      tokenVersion: 3,
      __v: 0,
      keep: "me",
    }) as Json;

    for (const key of __ALWAYS_PRIVATE) {
      assert.equal(key in got, false, `${key} survived`);
    }
    assert.equal(got.keep, "me");
    assert.equal(got.success, true);
  });

  it("drops them inside nested objects and arrays", () => {
    const got = send({
      data: {
        items: [
          { id: "1", comment: "lovely", ipAddress: "203.0.113.1" },
          { id: "2", comment: "also lovely", password: "$2b$10$x" },
        ],
        meta: { deep: { deeper: { userAgent: "curl", fine: 1 } } },
      },
    }) as Json;

    const raw = JSON.stringify(got);
    for (const key of ["ipAddress", "password", "userAgent"]) {
      assert.equal(raw.includes(key), false, `${key} survived nesting`);
    }
    const items = (got.data as Json).items as Json[];
    assert.equal(items.length, 2, "the array is still an array of two");
    assert.equal(items[0].comment, "lovely");
    assert.equal(items[1].id, "2");
    const deeper = (((got.data as Json).meta as Json).deep as Json).deeper as Json;
    assert.equal(deeper.fine, 1, "a sibling of a stripped key must survive");
  });

  it("strips passwordRaw everywhere except the owner's own routes", () => {
    const hidden = send({ data: { passwordRaw: "gulab" } }) as Json;
    assert.equal("passwordRaw" in (hidden.data as Json), false);

    // Both routes that exist to hand it back to the person who set it. The
    // second is the one the first version of this middleware missed, which
    // would have broken reveal-and-copy on /profile.
    for (const path of ["/my-pages/holi/abc/password", "/share/me/creations"]) {
      const allowed = send({ data: { passwordRaw: "gulab" } }, path) as Json;
      assert.equal((allowed.data as Json).passwordRaw, "gulab", `${path} must keep it`);
    }
  });

  it("leaves adminNotes alone, because the admin panels render it", () => {
    // Deliberately not stripped: /admin/feedback and /admin/contacts read it
    // back after a PATCH. It is contextual, so `leak:check` keeps it out of
    // public handlers instead.
    const got = send({ data: { adminNotes: "called them back" } }) as Json;
    assert.equal((got.data as Json).adminNotes, "called them back");
  });
});

describe("what must survive untouched", () => {
  it("leaves a signed-in user their own email and refresh token", () => {
    // Deliberately NOT scrubbed: /auth/me returns your own address, and the
    // refresh endpoint exists to hand a token over. Whether an email is
    // appropriate is contextual, so it is a build-time check, not this.
    const got = send({
      data: { user: { email: "someone@example.com", name: "Riya" }, refreshToken: "jwt.here" },
    }) as Json;
    assert.equal(((got.data as Json).user as Json).email, "someone@example.com");
    assert.equal((got.data as Json).refreshToken, "jwt.here");
  });

  it("preserves Dates rather than flattening them to {}", () => {
    const when = new Date("2026-09-15T10:00:00.000Z");
    const got = send({ data: { createdAt: when } }) as Json;
    const back = (got.data as Json).createdAt;
    assert.ok(back instanceof Date, "a Date walked into an object would serialise as {}");
    assert.equal((back as Date).toISOString(), when.toISOString());
  });

  it("round-trips an ordinary payload byte for byte", () => {
    const payload = {
      success: true,
      data: {
        items: [{ id: "1", rating: 5, comment: "", template: "Holi", nested: [1, 2, [3]] }],
        hasMore: false,
        stats: { total: 12, average: 4, counts: { "1": 1, "5": 6 } },
      },
      nullish: null,
      zero: 0,
      empty: "",
    };
    assert.deepEqual(send(structuredClone(payload)), payload);
  });

  it("survives a cycle instead of hanging", () => {
    const a: Json = { name: "a", ipAddress: "203.0.113.4" };
    a.self = a;
    assert.doesNotThrow(() => send({ data: a }));
  });

  it("passes non-object bodies straight through", () => {
    assert.equal(send("plain string"), "plain string");
    assert.equal(send(42), 42);
    assert.equal(send(null), null);
  });
});
