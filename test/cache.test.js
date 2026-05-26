const { describe, it, after } = require("node:test");
const assert = require("node:assert");

process.env.CACHE_TTL_MS = "50";
delete require.cache[require.resolve("../middleware/cache")];
const cache = require("../middleware/cache");

describe("middleware/cache", () => {
  after(() => {
    delete process.env.CACHE_TTL_MS;
  });

  it("get returns null for missing key", () => {
    assert.strictEqual(cache.get("nonexistent"), null);
  });

  it("set stores data and get retrieves it", () => {
    cache.set("a", { entity: [{ id: 1 }] });
    assert.deepStrictEqual(cache.get("a"), { entity: [{ id: 1 }] });
  });

  it("getStatus shows cached entry details", () => {
    cache.set("b", { entity: [{ id: 1 }, { id: 2 }] });
    const s = cache.getStatus();
    assert.ok(s.b);
    assert.strictEqual(s.b.entities, 2);
    assert.ok(s.b.age.endsWith("s"));
  });

  it("get returns null after TTL expiry", async () => {
    cache.set("c", { entity: [{ id: 3 }] });
    await new Promise((r) => setTimeout(r, 60));
    assert.strictEqual(cache.get("c"), null);
  });
});
