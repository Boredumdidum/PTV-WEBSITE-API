const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert");
const { EventEmitter } = require("events");

const metrics = require("../middleware/metrics");

function mockReq(path) {
  return { method: "GET", path, route: { path } };
}

function mockRes() {
  const ee = new EventEmitter();
  ee.statusCode = 200;
  ee.status = function (c) {
    this.statusCode = c;
    return this;
  };
  return ee;
}

describe("middleware/metrics", () => {
  beforeEach(() => {
    metrics.httpRequestsTotal.reset();
    metrics.httpRequestDuration.reset();
  });

  it("records request duration and total on finish", async () => {
    const req = mockReq("/api/gtfs");
    const res = mockRes();
    let called = false;
    metrics.metricsMiddleware(req, res, () => {
      called = true;
    });
    assert.ok(called, "next() was called");
    res.emit("finish");
    const snapshot = await metrics.client.register.getMetricsAsJSON();
    const total = snapshot.find((m) => m.name === "http_requests_total");
    assert.ok(total, "http_requests_total metric exists");
    assert.strictEqual(total.values.length, 1);
    assert.strictEqual(total.values[0].labels.method, "GET");
    assert.strictEqual(total.values[0].labels.route, "/api/gtfs");
    assert.strictEqual(total.values[0].labels.status_code, "200");
    assert.strictEqual(total.values[0].value, 1);
  });

  it("records duration histogram with non-default route", async () => {
    const req = mockReq("/health");
    const res = mockRes();
    res.statusCode = 503;
    metrics.metricsMiddleware(req, res, () => {});
    res.emit("finish");
    const snapshot = await metrics.client.register.getMetricsAsJSON();
    const dur = snapshot.find((m) => m.name === "http_request_duration_seconds");
    assert.ok(dur, "http_request_duration_seconds metric exists");
    const match = dur.values.find(
      (v) => v.labels.method === "GET" && v.labels.route === "/health" && v.labels.status_code === "503",
    );
    assert.ok(match, "duration record exists for /health 503");
  });

  it("falls back to req.path when req.route is undefined", async () => {
    const req = { method: "POST", path: "/some-path" };
    const res = mockRes();
    res.statusCode = 404;
    metrics.metricsMiddleware(req, res, () => {});
    res.emit("finish");
    const snapshot = await metrics.client.register.getMetricsAsJSON();
    const total = snapshot.find((m) => m.name === "http_requests_total");
    const match = total.values.find(
      (v) => v.labels.method === "POST" && v.labels.route === "/some-path" && v.labels.status_code === "404",
    );
    assert.ok(match, "fallback route recorded for POST /some-path 404");
  });
});
