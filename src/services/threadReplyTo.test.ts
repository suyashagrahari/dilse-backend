import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatReplyToAddress } from "./ses.service";

/**
 * The single most consequential address in the conversation pipeline.
 *
 * Mail goes OUT as feedback@subhsandesh.in, on the apex domain — and the apex
 * MX belongs to GoDaddy, because it carries all company mail. SES receives on
 * a subdomain instead. So if Reply-To is allowed to fall through to the From
 * address, every creator reply is delivered to a GoDaddy mailbox this app
 * cannot read, and the conversation view shows only our own side.
 *
 * That failure is invisible from the sending end: the send succeeds, the panel
 * looks correctly wired, and the two halves are simply pointed at different
 * mail systems. Hence the first test, which asserts the two stay DIFFERENT.
 */
describe("formatReplyToAddress", () => {
  const FROM = "feedback@subhsandesh.in";

  it("uses the SES receiving address, not the From address", () => {
    const got = formatReplyToAddress("inbox@reply.subhsandesh.in", FROM, "SubhSandesh");
    assert.equal(got, "SubhSandesh <inbox@reply.subhsandesh.in>");
    assert.ok(!got.includes("feedback@"), "must not fall back to the From address");
  });

  it("keeps staging pointed at its own inbox, so a real reply cannot cross environments", () => {
    assert.equal(
      formatReplyToAddress("staging@reply.subhsandesh.in", FROM, "SubhSandesh"),
      "SubhSandesh <staging@reply.subhsandesh.in>"
    );
  });

  it("falls back to the From address when unset — wrong, but never blocks a send", () => {
    assert.equal(
      formatReplyToAddress(undefined, FROM, "SubhSandesh"),
      "SubhSandesh <feedback@subhsandesh.in>"
    );
    assert.equal(formatReplyToAddress("", FROM, "SubhSandesh"), "SubhSandesh <feedback@subhsandesh.in>");
    assert.equal(formatReplyToAddress("   ", FROM, "SubhSandesh"), "SubhSandesh <feedback@subhsandesh.in>");
  });

  it("ignores a malformed override rather than emitting a broken header", () => {
    // Bare, so sendSesEmail's own From validation is the only gate left.
    assert.equal(formatReplyToAddress("not an address", FROM, "SubhSandesh"), FROM);
    assert.equal(formatReplyToAddress("inbox@", FROM, "SubhSandesh"), FROM);
    assert.equal(formatReplyToAddress("inbox@reply", FROM, "SubhSandesh"), FROM);
  });

  it("strips characters that would let a display name break the header", () => {
    const got = formatReplyToAddress("inbox@reply.subhsandesh.in", FROM, 'Sub"h\r\n<Sandesh>');
    assert.ok(!/[\r\n"]/.test(got), `header-breaking characters survived: ${got}`);
    assert.ok(got.endsWith("<inbox@reply.subhsandesh.in>"), got);
  });

  it("emits a bare address when there is no display name", () => {
    assert.equal(
      formatReplyToAddress("inbox@reply.subhsandesh.in", FROM, ""),
      "inbox@reply.subhsandesh.in"
    );
  });

  it("survives losing both addresses without throwing", () => {
    assert.equal(formatReplyToAddress(undefined, undefined, "SubhSandesh"), "");
  });
});
