// ─── Proving an SNS message really came from Amazon ─────────────────────────
//
// The inbound-mail webhook is reachable by anyone who finds the URL. What it
// posts becomes a message in a super admin's conversation view, attributed to a
// creator. Unverified, it is an open form for writing words into somebody
// else's mouth inside our own admin panel.
//
// Every message is therefore checked three times, and the checks answer
// different questions:
//
//   · The signature proves Amazon SNS signed it.
//   · The topic ARN (checked in the controller) proves it was OUR topic. A
//     signature alone does not: anybody with an AWS account can create a topic
//     and have Amazon sign a message for it perfectly. AWS's own guidance says
//     to "reject any message with an unexpected TopicArn to prevent spoofing".
//   · A shared secret in the path stops a scan reaching the parser at all.
//
// ── WHY THE SIGNATURE CHECK IS NOT WRITTEN HERE ────────────────────────────
//
// It was, at first. SNS signs a canonical string built from a FIXED set of
// fields in a FIXED order that varies by message type, and getting that string
// wrong does not fail loudly — it rejects every genuine message, so inbound
// mail simply stops arriving with no error anywhere. It is exactly the kind of
// detail that cannot be confirmed from the documentation page alone.
//
// AWS's guidance is explicit: "The AWS SDKs for Amazon SNS provide built-in
// validation logic, reducing the risk of misimplementation." For JavaScript
// that is `sns-validator`, published from `aws/aws-js-sns-message-validator`.
// So the canonical string and the certificate chain are its problem, and this
// module adds the two things it deliberately does not do:
//
//   1. A host check BEFORE any network call, so a flood of forged messages
//      cannot turn this endpoint into a certificate-fetching amplifier.
//   2. A staleness check, so a genuine signed message captured off the wire
//      cannot be replayed indefinitely.

import MessageValidator from "sns-validator";

export class SnsVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnsVerificationError";
  }
}

export interface SnsMessage {
  Type?: string;
  MessageId?: string;
  TopicArn?: string;
  Subject?: string;
  Message?: string;
  Timestamp?: string;
  SignatureVersion?: string;
  Signature?: string;
  SigningCertURL?: string;
  SigningCertUrl?: string;
  SubscribeURL?: string;
  Token?: string;
}

/**
 * Amazon's SNS signing-certificate hosts.
 *
 * Anchored at both ends. A pattern like `/sns\..*\.amazonaws\.com/` without the
 * anchors matches `https://evil.com/sns.x.amazonaws.com/cert.pem`, which is the
 * classic way this check is gotten wrong.
 */
const CERT_HOST_RE = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;

/** A signature older than this is refused, so a captured one cannot be replayed. */
const MAX_AGE_MS = 60 * 60 * 1000;

const validator = new MessageValidator();

function certUrlOf(msg: SnsMessage): string {
  return String(msg.SigningCertURL || msg.SigningCertUrl || "");
}

/** Throws unless the URL is https and on an Amazon SNS host. */
export function assertCertUrlIsAmazon(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(String(rawUrl || ""));
  } catch {
    throw new SnsVerificationError("The signing certificate URL is not a URL");
  }
  if (url.protocol !== "https:") {
    throw new SnsVerificationError("The signing certificate URL is not https");
  }
  if (!CERT_HOST_RE.test(url.hostname)) {
    throw new SnsVerificationError(`"${url.hostname}" is not an Amazon SNS signing host`);
  }
  if (!url.pathname.endsWith(".pem")) {
    throw new SnsVerificationError("The signing certificate URL does not name a .pem");
  }
  return url;
}

/** Throws if the message is older than `MAX_AGE_MS`, or has no usable date. */
export function assertNotStale(timestamp: string | undefined): void {
  const at = Date.parse(String(timestamp || ""));
  if (!Number.isFinite(at)) {
    throw new SnsVerificationError("The message has no usable timestamp");
  }
  if (Math.abs(Date.now() - at) > MAX_AGE_MS) {
    throw new SnsVerificationError("The message is too old to accept");
  }
}

/**
 * Verify an SNS message. Throws `SnsVerificationError` if it is not genuine.
 *
 * The cheap local checks run first, so nothing hostile reaches the network.
 */
export async function verifySnsMessage(msg: SnsMessage): Promise<void> {
  if (!msg || typeof msg !== "object") {
    throw new SnsVerificationError("Not an SNS message");
  }
  if (!String(msg.Signature || "")) {
    throw new SnsVerificationError("The message is not signed");
  }

  assertNotStale(msg.Timestamp);
  assertCertUrlIsAmazon(certUrlOf(msg));

  await new Promise<void>((resolve, reject) => {
    validator.validate(msg as never, (err: Error | null) => {
      if (err) {
        reject(new SnsVerificationError(`SNS validation failed: ${err.message}`));
        return;
      }
      resolve();
    });
  });
}
