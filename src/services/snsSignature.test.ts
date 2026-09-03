import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SnsVerificationError,
  assertCertUrlIsAmazon,
  assertNotStale,
  verifySnsMessage,
} from "./snsSignature";

const NOW = () => new Date().toISOString();

describe("assertCertUrlIsAmazon", () => {
  it("accepts a real SNS signing URL", () => {
    const url = assertCertUrlIsAmazon(
      "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc123.pem"
    );
    assert.equal(url.hostname, "sns.us-east-1.amazonaws.com");
  });

  it("accepts the China partition", () => {
    assert.doesNotThrow(() =>
      assertCertUrlIsAmazon("https://sns.cn-north-1.amazonaws.com.cn/x.pem")
    );
  });

  // The whole point of this function. Every case below is a URL that a
  // substring or unanchored-regex check would wave through.
  it("rejects a host that merely CONTAINS the Amazon host", () => {
    assert.throws(
      () => assertCertUrlIsAmazon("https://evil.com/sns.us-east-1.amazonaws.com/x.pem"),
      SnsVerificationError
    );
  });

  it("rejects an Amazon host used as a subdomain of somewhere else", () => {
    assert.throws(
      () => assertCertUrlIsAmazon("https://sns.us-east-1.amazonaws.com.evil.com/x.pem"),
      SnsVerificationError
    );
  });

  it("rejects an Amazon host smuggled in as userinfo", () => {
    assert.throws(
      () => assertCertUrlIsAmazon("https://sns.us-east-1.amazonaws.com@evil.com/x.pem"),
      SnsVerificationError
    );
  });

  it("rejects plain http", () => {
    assert.throws(
      () => assertCertUrlIsAmazon("http://sns.us-east-1.amazonaws.com/x.pem"),
      SnsVerificationError
    );
  });

  it("rejects a URL that does not name a .pem", () => {
    assert.throws(
      () => assertCertUrlIsAmazon("https://sns.us-east-1.amazonaws.com/x.txt"),
      SnsVerificationError
    );
  });

  it("rejects nonsense", () => {
    assert.throws(() => assertCertUrlIsAmazon(""), SnsVerificationError);
    assert.throws(() => assertCertUrlIsAmazon("not a url"), SnsVerificationError);
  });
});

describe("assertNotStale", () => {
  it("accepts a message signed just now", () => {
    assert.doesNotThrow(() => assertNotStale(new Date().toISOString()));
  });

  it("accepts a small clock skew in either direction", () => {
    assert.doesNotThrow(() => assertNotStale(new Date(Date.now() + 120_000).toISOString()));
    assert.doesNotThrow(() => assertNotStale(new Date(Date.now() - 120_000).toISOString()));
  });

  it("rejects a replay of an old signed message", () => {
    assert.throws(
      () => assertNotStale(new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()),
      /too old/
    );
  });

  it("rejects a message dated far in the future", () => {
    assert.throws(
      () => assertNotStale(new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()),
      /too old/
    );
  });

  it("rejects a missing or unparseable date", () => {
    assert.throws(() => assertNotStale(undefined), /timestamp/);
    assert.throws(() => assertNotStale("not a date"), /timestamp/);
  });
});

describe("verifySnsMessage — the checks that run before any network call", () => {
  const base = {
    Type: "Notification",
    MessageId: "m1",
    TopicArn: "t",
    Message: "{}",
    SigningCertURL: "https://sns.us-east-1.amazonaws.com/x.pem",
  };

  it("rejects an unsigned message", async () => {
    await assert.rejects(
      () => verifySnsMessage({ ...base, Timestamp: NOW(), SignatureVersion: "1" }),
      SnsVerificationError
    );
  });

  it("rejects a message with no usable timestamp", async () => {
    await assert.rejects(
      () => verifySnsMessage({ ...base, Timestamp: "not a date", SignatureVersion: "1", Signature: "x" }),
      /timestamp/
    );
  });

  it("rejects a replay of an old signed message", async () => {
    await assert.rejects(
      () =>
        verifySnsMessage({
          ...base,
          Timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
          SignatureVersion: "1",
          Signature: "x",
        }),
      /too old/
    );
  });

  it("rejects a hostile certificate URL before fetching it", async () => {
    await assert.rejects(
      () =>
        verifySnsMessage({
          ...base,
          SigningCertURL: "https://evil.example.com/x.pem",
          Timestamp: NOW(),
          SignatureVersion: "1",
          Signature: "x",
        }),
      /not an Amazon SNS signing host/
    );
  });
});
