const { describe, it } = require("node:test");
const assert = require("node:assert");
const { FEEDS, isValidFeedKey, getFeedUrl } = require("../config/feeds");

const VALID_KEYS = [
  "metro-trip-updates",
  "metro-service-alerts",
  "metro-vehicle-positions",
  "bus-trip-updates",
  "bus-vehicle-positions",
];

describe("config/feeds", () => {
  it("has all 5 feed keys", () => {
    assert.strictEqual(Object.keys(FEEDS).length, 5);
  });

  for (const key of VALID_KEYS) {
    it(`isValidFeedKey('${key}') returns true`, () => {
      assert.ok(isValidFeedKey(key));
    });
  }

  it("isValidFeedKey returns false for unknown key", () => {
    assert.strictEqual(isValidFeedKey("invalid"), false);
  });

  it("isValidFeedKey returns false for empty string", () => {
    assert.strictEqual(isValidFeedKey(""), false);
  });

  for (const key of VALID_KEYS) {
    it(`getFeedUrl('${key}') returns https URL`, () => {
      assert.ok(getFeedUrl(key).startsWith("https://"));
    });
  }

  it("getFeedUrl returns undefined for unknown key", () => {
    assert.strictEqual(getFeedUrl("invalid"), undefined);
  });
});
