// ─── Which address a reply may be sent FROM ──────────────────────────────────
//
// The panel offers a choice, so the server has to decide what a valid choice
// is. Two things are being protected here:
//
//   • SES only sends from a verified identity. `subhsandesh.in` is verified as
//     a DOMAIN with DKIM, so any address on it works — and nothing else does.
//     An unconstrained field would let a super admin pick an address SES
//     rejects, and the send fails after they have written the reply.
//
//   • The From address is interpolated into a mail header. A newline in it is
//     header injection.

import { test } from "node:test";
import assert from "node:assert/strict";

import { listSenderOptions, resolveSenderAddress, DEFAULT_SENDER_ID } from "./replySenders";

test("the options are all on the verified domain", () => {
  const options = listSenderOptions();
  assert.ok(options.length >= 2, "a choice of one is not a choice");
  for (const o of options) {
    assert.match(o.address, /@subhsandesh\.in$/, `${o.address} is not on the verified domain`);
    assert.ok(o.id && o.label && o.description, `${o.id} is missing display copy`);
  }
});

test("option ids are unique", () => {
  const ids = listSenderOptions().map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("there is exactly one default, and it is the configured From address", () => {
  const options = listSenderOptions();
  const defaults = options.filter((o) => o.isDefault);
  assert.equal(defaults.length, 1, "exactly one option must be marked default");
  assert.equal(defaults[0].id, DEFAULT_SENDER_ID);
});

test("a known id resolves to its address", () => {
  for (const o of listSenderOptions()) {
    assert.equal(resolveSenderAddress(o.id), o.address);
  }
});

test("an unknown, absent or empty id falls back to the default", () => {
  // The panel is not the only caller forever, and a reply that fails to send
  // because of a bad dropdown value is a worse outcome than one sent from the
  // usual address.
  const fallback = resolveSenderAddress(DEFAULT_SENDER_ID);
  for (const bad of ["", "   ", undefined, null, "nope", "FEEDBACK", 42, {}, []]) {
    assert.equal(resolveSenderAddress(bad as never), fallback, `should fall back for ${JSON.stringify(bad)}`);
  }
});

test("a raw email address is NOT accepted in place of an id", () => {
  // Ids, not addresses. Accepting an address would mean validating it here and
  // trusting whatever passed — and "it looks like an email" is not the same
  // question as "SES will send from it".
  assert.equal(resolveSenderAddress("feedback@subhsandesh.in"), resolveSenderAddress(DEFAULT_SENDER_ID));
  assert.equal(resolveSenderAddress("attacker@evil.example"), resolveSenderAddress(DEFAULT_SENDER_ID));
});

test("no resolved address can carry a header break", () => {
  const injections = [
    "feedback\r\nBcc: someone@evil.example",
    "feedback\nX-Evil: 1",
    "feedback@subhsandesh.in\r\n",
  ];
  for (const bad of injections) {
    const out = resolveSenderAddress(bad);
    assert.ok(!/[\r\n]/.test(out), `resolved to something containing a newline: ${JSON.stringify(out)}`);
  }
  // And the options themselves, which are what actually get sent.
  for (const o of listSenderOptions()) {
    assert.ok(!/[\r\n<>,;"]/.test(o.address), `${o.address} contains a header-unsafe character`);
  }
});
