const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert");
const https = require("https");
const cache = require("../middleware/cache");

process.env.SWAGGER_API_KEY = "test-swagger-key";
process.env.SWAGGER_DEV_ID = "999";
delete require.cache[require.resolve("../routes/timetable")];
const handler = require("../routes/timetable");

function mockReq(url) {
  return { url, originalUrl: `/api/timetable${url}`, log: { info() {}, error() {} } };
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

function mockHttpsJson(statusCode, json) {
  mock.method(https, "get", (_url, cb) => {
    cb({
      statusCode,
      resume() {},
      on(e, h) {
        if (e === "data") setImmediate(() => h(Buffer.from(JSON.stringify(json))));
        if (e === "end") setImmediate(() => h());
      },
    });
    return { on() {}, setTimeout() {}, destroy() {} };
  });
}

function mockHttpsStatus(statusCode) {
  mock.method(https, "get", (_url, cb) => {
    cb({ statusCode, resume() {}, on() {} });
    return { on() {}, setTimeout() {}, destroy() {} };
  });
}

function mockHttpsNetworkError(code) {
  mock.method(https, "get", (_url, _cb) => {
    const err = Object.assign(new Error("network error"), { code });
    return { on(e, h) { h(err); }, setTimeout() {}, destroy() {} };
  });
}

beforeEach(() => {
  mock.method(cache, "get", () => null);
  mock.method(cache, "set", () => {});
});

afterEach(() => {
  mock.restoreAll();
});

describe("routes/timetable — credential validation", () => {
  it("returns 500 when SWAGGER_API_KEY is missing", () => {
    const orig = process.env.SWAGGER_API_KEY;
    delete process.env.SWAGGER_API_KEY;
    try {
      const req = mockReq("/v3/route_types");
      const res = mockRes();
      handler(req, res);
      assert.strictEqual(res._status, 500);
      assert.ok(res._json.error.includes("SWAGGER_API_KEY"));
    } finally {
      process.env.SWAGGER_API_KEY = orig;
    }
  });

  it("returns 500 when SWAGGER_DEV_ID is missing", () => {
    const orig = process.env.SWAGGER_DEV_ID;
    delete process.env.SWAGGER_DEV_ID;
    try {
      const req = mockReq("/v3/route_types");
      const res = mockRes();
      handler(req, res);
      assert.strictEqual(res._status, 500);
      assert.ok(res._json.error.includes("SWAGGER_DEV_ID"));
    } finally {
      process.env.SWAGGER_DEV_ID = orig;
    }
  });
});

describe("routes/timetable — error classification", () => {
  it("returns 502 auth error for upstream 401", async () => {
    mockHttpsStatus(401);
    const res = mockRes();
    handler(mockReq("/v3/route_types"), res);
    await tick();
    assert.strictEqual(res._status, 502);
    assert.ok(res._json.error.includes("authentication failed"));
  });

  it("returns 502 auth error for upstream 403", async () => {
    mockHttpsStatus(403);
    const res = mockRes();
    handler(mockReq("/v3/route_types"), res);
    await tick();
    assert.strictEqual(res._status, 502);
    assert.ok(res._json.error.includes("authentication failed"));
  });

  it("returns 502 server error for upstream 5xx", async () => {
    mockHttpsStatus(503);
    const res = mockRes();
    handler(mockReq("/v3/route_types"), res);
    await tick();
    assert.strictEqual(res._status, 502);
    assert.strictEqual(res._json.error, "Timetable API server error.");
  });

  it("returns 502 for upstream network error", async () => {
    mockHttpsNetworkError("ECONNREFUSED");
    const res = mockRes();
    handler(mockReq("/v3/route_types"), res);
    await tick();
    assert.strictEqual(res._status, 502);
    assert.strictEqual(res._json.error, "Timetable API request failed.");
  });
});

describe("routes/timetable — cached response", () => {
  it("serves from cache without upstream call", () => {
    mock.restoreAll();
    mock.method(cache, "get", () => ({ route_types: [{ route_type_name: "Train" }] }));
    const upstreamCall = mock.fn();
    mock.method(https, "get", upstreamCall);
    const req = mockReq("/v3/route_types");
    const res = mockRes();
    handler(req, res);
    assert.strictEqual(upstreamCall.mock.calls.length, 0);
    assert.strictEqual(res._status, null);
    assert.deepStrictEqual(res._json, { route_types: [{ route_type_name: "Train" }] });
  });
});

describe("routes/timetable — successful response", () => {
  it("returns JSON from upstream", async () => {
    mockHttpsJson(200, { route_types: [{ route_type_name: "Train", route_type: 0 }] });
    const res = mockRes();
    handler(mockReq("/v3/route_types"), res);
    await tick();
    assert.strictEqual(res._status, null);
    assert.strictEqual(res._json.route_types[0].route_type_name, "Train");
  });
});
