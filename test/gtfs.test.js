const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert");
const https = require("https");
const cache = require("../middleware/cache");

process.env.PTV_API_KEY = "test-key";
delete require.cache[require.resolve("../routes/gtfs")];
const handler = require("../routes/gtfs");

function mockReq(feed, limit) {
  return { query: { feed, limit }, log: { info() {}, error() {} } };
}

function mockRes() {
  const r = { _status: null, _json: null };
  r.status = function (c) {
    this._status = c;
    return this;
  };
  r.json = function (o) {
    this._json = o;
  };
  r.set = function () {};
  return r;
}

function tick() {
  return new Promise((r) => setImmediate(r));
}

function mockHttpsStatus(statusCode) {
  mock.method(https, "get", (_url, _opts, cb) => {
    cb({ statusCode, resume() {}, on() {} });
    return { on() {}, setTimeout() {} };
  });
}

function mockHttpsNetworkError(code) {
  mock.method(https, "get", (_url, _opts, _cb) => {
    const err = Object.assign(new Error("network error"), { code });
    return {
      on(e, h) {
        h(err);
      },
      setTimeout() {},
    };
  });
}

beforeEach(() => {
  mock.method(cache, "get", () => null);
  mock.method(cache, "set", () => {});
});

afterEach(() => {
  mock.restoreAll();
});

describe("routes/gtfs — feed validation", () => {
  it("returns 400 for missing feed", () => {
    const req = { query: {}, log: { info() {}, error() {} } };
    const res = mockRes();
    handler(req, res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "Invalid or missing feed parameter.");
  });

  it("returns 400 for invalid feed", () => {
    const req = { query: { feed: "bogus" }, log: { info() {}, error() {} } };
    const res = mockRes();
    handler(req, res);
    assert.strictEqual(res._status, 400);
  });
});

describe("routes/gtfs — limit validation", () => {
  it("returns 400 for NaN limit", () => {
    const res = mockRes();
    handler(mockReq("metro-vehicle-positions", "abc"), res);
    assert.strictEqual(res._status, 400);
  });

  it("returns 400 for float limit", () => {
    const res = mockRes();
    handler(mockReq("metro-vehicle-positions", "1.5"), res);
    assert.strictEqual(res._status, 400);
  });

  it("returns 400 for negative limit", () => {
    const res = mockRes();
    handler(mockReq("metro-vehicle-positions", "-1"), res);
    assert.strictEqual(res._status, 400);
  });
});

describe("routes/gtfs — error classification", () => {
  beforeEach(() => {
    mock.method(globalThis, "setTimeout", (fn) => fn());
  });

  it("returns 502 auth error for upstream 401", async () => {
    mockHttpsStatus(401);
    const res = mockRes();
    handler(mockReq("metro-vehicle-positions"), res);
    await tick();
    assert.strictEqual(res._status, 502);
    assert.strictEqual(res._json.error, "Upstream authentication failed.");
  });

  it("returns 502 auth error for upstream 403", async () => {
    mockHttpsStatus(403);
    const res = mockRes();
    handler(mockReq("metro-vehicle-positions"), res);
    await tick();
    assert.strictEqual(res._status, 502);
    assert.strictEqual(res._json.error, "Upstream authentication failed.");
  });

  it("returns 502 server error for upstream 5xx", async () => {
    mockHttpsStatus(503);
    const res = mockRes();
    handler(mockReq("metro-vehicle-positions"), res);
    await tick();
    assert.strictEqual(res._status, 502);
    assert.strictEqual(res._json.error, "Upstream server error.");
  });

  it("returns 502 network error for ECONNREFUSED", async () => {
    mockHttpsNetworkError("ECONNREFUSED");
    const res = mockRes();
    handler(mockReq("metro-vehicle-positions"), res);
    await tick();
    assert.strictEqual(res._status, 502);
    assert.strictEqual(res._json.error, "Upstream network error.");
  });

  it("returns 502 network error for ENOTFOUND", async () => {
    mockHttpsNetworkError("ENOTFOUND");
    const res = mockRes();
    handler(mockReq("metro-vehicle-positions"), res);
    await tick();
    assert.strictEqual(res._status, 502);
    assert.strictEqual(res._json.error, "Upstream network error.");
  });

  it("returns 502 network error for ECONNRESET", async () => {
    mockHttpsNetworkError("ECONNRESET");
    const res = mockRes();
    handler(mockReq("metro-vehicle-positions"), res);
    await tick();
    assert.strictEqual(res._status, 502);
    assert.strictEqual(res._json.error, "Upstream network error.");
  });

  it("returns 502 generic for unknown error", async () => {
    mockHttpsNetworkError("UNKNOWN_CODE");
    const res = mockRes();
    handler(mockReq("metro-vehicle-positions"), res);
    await tick();
    assert.strictEqual(res._status, 502);
    assert.strictEqual(res._json.error, "Upstream request failed.");
  });
});

describe("routes/gtfs — cached response", () => {
  it("serves from cache without upstream call", () => {
    mock.restoreAll();
    mock.method(cache, "get", () => ({ entity: [{ id: "1" }] }));
    const upstreamCall = mock.fn();
    mock.method(https, "get", upstreamCall);
    const res = mockRes();
    handler(mockReq("metro-vehicle-positions"), res);
    assert.strictEqual(upstreamCall.mock.calls.length, 0);
    assert.strictEqual(res._status, null);
    assert.deepStrictEqual(res._json, { entity: [{ id: "1" }] });
  });

  it("cached response respects limit", () => {
    mock.restoreAll();
    mock.method(cache, "get", () => ({ entity: [{ id: "1" }, { id: "2" }] }));
    const res = mockRes();
    handler(mockReq("metro-vehicle-positions", "1"), res);
    assert.strictEqual(res._json.entity.length, 1);
    assert.strictEqual(res._json.entity[0].id, "1");
  });
});
