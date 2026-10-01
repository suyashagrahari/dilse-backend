import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePhone } from "./wishlist.controller";

describe("parsePhone", () => {
  it("accepts an Indian mobile and returns E.164", () => {
    assert.deepEqual(parsePhone({ dialCode: "+91", country: "in", number: "98765 43210" }), { phone: "+919876543210", country: "IN" });
  });
  it("drops a leading trunk zero", () => {
    assert.deepEqual(parsePhone({ dialCode: "+91", country: "IN", number: "09876543210" }), { phone: "+919876543210", country: "IN" });
  });
  it("refuses Indian numbers that are not mobiles", () => {
    assert.ok("error" in parsePhone({ dialCode: "+91", country: "IN", number: "1234567890" }));
    assert.ok("error" in parsePhone({ dialCode: "+91", country: "IN", number: "98765" }));
  });
  it("checks other countries loosely", () => {
    assert.deepEqual(parsePhone({ dialCode: "+1", country: "US", number: "(415) 555-0134" }), { phone: "+14155550134", country: "US" });
    assert.ok("error" in parsePhone({ dialCode: "+44", country: "GB", number: "123" }));
  });
  it("refuses a missing code, country or non-digits", () => {
    assert.ok("error" in parsePhone({ country: "IN", number: "9876543210" }));
    assert.ok("error" in parsePhone({ dialCode: "+91", number: "9876543210" }));
    assert.ok("error" in parsePhone({ dialCode: "+91", country: "IN", number: "98765abc10" }));
    assert.ok("error" in parsePhone(undefined));
  });
});
