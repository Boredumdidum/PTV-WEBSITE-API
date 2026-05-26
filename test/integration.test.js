const { describe, it, before, after, mock } = require("node:test");
const assert = require("node:assert");
const https = require("https");
const bindings = require("gtfs-realtime-bindings");

process.env.PTV_API_KEY = "test-key";
process.env.LOG_LEVEL = "silent";
delete require.cache[require.resolve("../config/feeds")];
delete require.cache[require.resolve("../middleware/cache")];
delete require.cache[require.resolve("../routes/gtfs")];
delete require.cache[require.resolve("../server")];
const app = require("../server");
const request = require("supertest");

describe("integration — full middleware chain", () => {
  it("sets security headers via Helmet", async () => {
    const res = await request(app).get("/health");
    assert.ok(res.headers["content-security-policy"]);
    assert.ok(res.headers["x-content-type-options"]);
    assert.ok(res.headers["x-frame-options"]);
  });

  it("compresses responses with gzip", async () => {
    const res = await request(app).get("/style.css").set("Accept-Encoding", "gzip");
    assert.strictEqual(res.headers["content-encoding"], "gzip");
  });

  it("serves index.html with no-cache", async () => {
    const res = await request(app).get("/index.html");
    assert.strictEqual(res.status, 200);
    assert.ok(res.text.includes("PTV GTFS Realtime"));
    assert.strictEqual(res.headers["cache-control"], "no-cache");
  });

  it("serves static assets with immutable cache", async () => {
    const res = await request(app).get("/script.js");
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers["cache-control"].includes("max-age="));
    assert.ok(res.headers["cache-control"].includes("immutable"));
  });

  it("returns health status", async () => {
    const res = await request(app).get("/health");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, "ok");
    assert.ok(res.body.timestamp);
    assert.strictEqual(res.body.apiKeySet, true);
  });

  it("exposes Prometheus metrics", async () => {
    const res = await request(app).get("/metrics");
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers["content-type"].startsWith("text/plain"));
    assert.ok(res.text.includes("http_request_duration_seconds"));
  });

  it("rejects missing feed parameter on /api/gtfs", async () => {
    const res = await request(app).get("/api/gtfs");
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, "Invalid or missing feed parameter.");
  });

  it("rejects invalid feed parameter on /api/gtfs", async () => {
    const res = await request(app).get("/api/gtfs?feed=invalid");
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, "Invalid or missing feed parameter.");
  });

  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/nonexistent-path");
    assert.strictEqual(res.status, 404);
  });
});

describe("integration — GTFS endpoint with mocked upstream", () => {
  const mockEntities = [
    { id: "1", vehicle: { trip: { routeId: "test-route" }, position: { latitude: -37.8, longitude: 145.0 } } },
  ];

  before(() => {
    mock.method(https, "get", (_url, _opts, cb) => {
      cb({
        statusCode: 200,
        resume() {},
        on(e, h) {
          if (e === "data") setImmediate(() => h(Buffer.from("mock")));
          if (e === "end") setImmediate(() => h());
        },
      });
      return { on() {}, setTimeout() {} };
    });
    mock.method(bindings.transit_realtime.FeedMessage, "decode", () => ({ entity: [], header: {} }));
    mock.method(bindings.transit_realtime.FeedMessage, "toObject", () => ({
      header: { timestamp: String(Math.floor(Date.now() / 1000)) },
      entity: mockEntities,
    }));
  });

  after(() => {
    mock.restoreAll();
  });

  it("returns GTFS data through full middleware chain", async () => {
    const res = await request(app).get("/api/gtfs?feed=metro-vehicle-positions");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers["cache-control"], "public, max-age=30");
    assert.deepStrictEqual(res.body.entity, mockEntities);
  });

  it("serves second request from cache (cache hit)", async () => {
    const res = await request(app).get("/api/gtfs?feed=metro-vehicle-positions");
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.entity, mockEntities);
  });
});
