const { describe, it } = require("node:test");
const assert = require("node:assert");
const { signUrl } = require("../utils/hmac");

describe("utils/hmac", () => {
  it("returns URL with devid and signature query params", () => {
    const result = signUrl("/v3/route_types", "123", "secret");
    assert.ok(result.startsWith("https://timetableapi.ptv.vic.gov.au/v3/route_types?"));
    assert.ok(result.includes("devid=123"));
    assert.ok(result.includes("signature="));
  });

  it("produces deterministic signature for same inputs", () => {
    const a = signUrl("/v3/route_types", "123", "secret");
    const b = signUrl("/v3/route_types", "123", "secret");
    assert.strictEqual(a, b);
  });

  it("produces different signatures for different API keys", () => {
    const a = signUrl("/v3/route_types", "123", "secret1");
    const b = signUrl("/v3/route_types", "123", "secret2");
    assert.notStrictEqual(a, b);
  });

  it("produces different signatures for different devids", () => {
    const a = signUrl("/v3/route_types", "123", "secret");
    const b = signUrl("/v3/route_types", "456", "secret");
    assert.notStrictEqual(a, b);
  });

  it("preserves existing query params and appends devid + signature", () => {
    const result = signUrl("/v3/routes?route_types=0,1", "123", "secret");
    assert.ok(result.includes("route_types=0,1"));
    assert.ok(result.includes("devid=123"));
    assert.ok(result.includes("signature="));
    const sigIndex = result.indexOf("signature=");
    const devIdIndex = result.indexOf("devid=123");
    assert.ok(devIdIndex < sigIndex, "devid must appear before signature");
  });

  it("signature is a lowercase hex string", () => {
    const result = signUrl("/v3/route_types", "123", "secret");
    const sig = new URL(result).searchParams.get("signature");
    assert.ok(sig);
    assert.ok(/^[a-f0-9]{40}$/.test(sig));
  });

  it("encodes devid in URL", () => {
    const result = signUrl("/v3/route_types", "a b", "secret");
    assert.ok(result.includes("devid=a+b") || result.includes("devid=a%20b"));
  });
});
