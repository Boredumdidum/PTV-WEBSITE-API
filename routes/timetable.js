const https = require("https");
const cache = require("../middleware/cache");
const { signUrl } = require("../utils/hmac");

const MAX_RESPONSE_SIZE = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15000;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      const { statusCode } = response;
      if (!statusCode || statusCode < 200 || statusCode >= 300) {
        response.resume();
        const error = new Error(`Timetable upstream failed with status ${statusCode}`);
        error.statusCode = statusCode;
        reject(error);
        return;
      }

      const chunks = [];
      let totalBytes = 0;
      response.on("data", (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_RESPONSE_SIZE) {
          request.destroy();
          reject(new Error("Upstream response exceeded maximum size"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (e) {
          reject(new Error("Invalid JSON from upstream"));
        }
      });
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy();
      reject(new Error("Upstream request timed out"));
    });

    request.on("error", (error) => reject(error));
  });
}

/** Express handler for GET /api/timetable/* — proxies to timetableapi.ptv.vic.gov.au with HMAC-SHA1 auth. */
module.exports = function timetableHandler(req, res) {
  const apiKey = process.env.SWAGGER_API_KEY;
  const devId = process.env.SWAGGER_DEV_ID;
  if (!apiKey || !devId) {
    res.status(500).json({ error: "Server missing SWAGGER_API_KEY or SWAGGER_DEV_ID." });
    return;
  }

  const timetablePath = req.url;
  const upstreamUrl = signUrl(timetablePath, devId, apiKey);

  const cacheKey = `timetable:${req.originalUrl}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    req.log.info({ path: timetablePath, cached: true }, "Timetable cache hit");
    res.set("Cache-Control", "public, max-age=30");
    res.json(cached);
    return;
  }

  (async () => {
    try {
      const data = await fetchJson(upstreamUrl);
      cache.set(cacheKey, data);
      req.log.info({ path: timetablePath }, "Timetable upstream fetched");
      res.set("Cache-Control", "public, max-age=30");
      res.json(data);
    } catch (error) {
      req.log.error({ err: error, path: timetablePath }, "Timetable upstream fetch failed");

      if (error.statusCode === 401 || error.statusCode === 403) {
        res.status(502).json({
          error:
            "Timetable API authentication failed. Check SWAGGER_API_KEY and SWAGGER_DEV_ID.",
        });
        return;
      }
      if (error.statusCode && error.statusCode >= 500) {
        res.status(502).json({ error: "Timetable API server error." });
        return;
      }
      res.status(502).json({ error: "Timetable API request failed." });
    }
  })();
};
