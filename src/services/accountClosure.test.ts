import { test } from "node:test";
import assert from "node:assert/strict";
import { anonymisedEmail, checkClosureRequest, ClosureError, emailHash } from "./accountClosure.service";
import { parseStatementRequest, StatementError } from "./billingStatement.service";

test("closure refuses without the matching confirmEmail", () => {
  const body = { mode: "hide", reason: "User asked by email", confirmEmail: "someone@else.com" };
  assert.throws(() => checkClosureRequest(body, "asha@example.com"), ClosureError);
  assert.throws(() => checkClosureRequest({ ...body, confirmEmail: "" }, "asha@example.com"), ClosureError);
  assert.throws(() => checkClosureRequest({ ...body, confirmEmail: undefined }, "asha@example.com"), ClosureError);
});

test("closure needs a mode and a reason; the email match ignores case and spaces", () => {
  const ok = { mode: "delete", reason: " Requested on 12 Oct ", confirmEmail: "  Asha@Example.COM " };
  assert.deepEqual(checkClosureRequest(ok, "asha@example.com"), { mode: "delete", reason: "Requested on 12 Oct" });
  assert.throws(() => checkClosureRequest({ ...ok, mode: "purge" }, "asha@example.com"), ClosureError);
  assert.throws(() => checkClosureRequest({ ...ok, reason: "   " }, "asha@example.com"), ClosureError);
  assert.throws(() => checkClosureRequest(null, "asha@example.com"), ClosureError);
});

test("an anonymised account keeps only a hash of its old address", () => {
  assert.equal(anonymisedEmail("64f0c0ffee"), "closed+64f0c0ffee@closed.subhsandesh.invalid");
  assert.equal(emailHash(" Asha@Example.com"), emailHash("asha@example.com"));
  assert.match(emailHash("asha@example.com"), /^[0-9a-f]{64}$/);
});

test("statement requests need a range or orders, with valid ids and dates", () => {
  assert.throws(() => parseStatementRequest({}), StatementError);
  assert.throws(() => parseStatementRequest({ from: "2026-10-12" }), StatementError);
  assert.throws(() => parseStatementRequest({ from: "2026-10-12", to: "2026-10-01" }), StatementError);
  assert.throws(() => parseStatementRequest({ orderIds: ["nope"] }), StatementError);
  assert.throws(() => parseStatementRequest({ from: "12/10/2026", to: "2026-10-12" }), StatementError);
  const r = parseStatementRequest({ orderIds: ["64f0c0ffee64f0c0ffee64f0", "64f0c0ffee64f0c0ffee64f0"], note: " thanks " });
  assert.deepEqual(r, { from: null, to: null, orderIds: ["64f0c0ffee64f0c0ffee64f0"], note: "thanks" });
  assert.deepEqual(parseStatementRequest({ from: "2026-10-12", to: "2026-10-12" }).orderIds, []);
});
