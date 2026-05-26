const https = require("https");
const { transit_realtime } = require("gtfs-realtime-bindings");
const { isValidFeedKey, getFeedUrl } = require("../config/feeds");
const cache = require("../middleware/cache");

const MAX_RESPONSE_SIZE = 2 * 1024 * 1024; // 2 MB

function fetchBuffer(url, headers) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers }, (response) => {
      const { statusCode } = response;
      if (!statusCode || statusCode < 200 || statusCode >= 300) {
        response.resume();
        const error = new Error(`Upstream request failed with status ${statusCode}`);
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
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });

    request.on("error", (error) => {
      error.code = error.code || "ENETUNREACH";
      reject(error);
    });
  });
}

/** Express handler for GET /api/gtfs?feed=<key>&limit=<n>. */
module.exports = function (req, res) {
  const feedKey = req.query.feed;
  if (!feedKey || !isValidFeedKey(feedKey)) {
    res.status(400).json({ error: "Invalid or missing feed parameter." });
    return;
  }

  const apiKey = process.env.PTV_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server missing PTV_API_KEY." });
    return;
  }

  const rawLimit = req.query.limit;
  let limit = 0;
  if (rawLimit !== undefined && rawLimit !== null && rawLimit !== "") {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1) {
      res.status(400).json({ error: "limit must be a positive integer." });
      return;
    }
    limit = Math.min(parsed, 200);
  }

  function slice(data) {
    return limit > 0 && Array.isArray(data.entity)
      ? { ...data, entity: data.entity.slice(0, limit) }
      : data;
  }

  const cached = cache.get(feedKey);
  if (cached) {
    req.log.info({ feed: feedKey, cached: true }, "Serving from cache");
    res.set("Cache-Control", "public, max-age=30");
    res.json(slice(cached));
    return;
  }

  (async () => {
    try {
      const buffer = await fetchBuffer(getFeedUrl(feedKey), { KeyID: apiKey });
      const feed = transit_realtime.FeedMessage.decode(buffer);
      const data = transit_realtime.FeedMessage.toObject(feed, {
        longs: String,
        enums: String,
        bytes: String,
      });

      cache.set(feedKey, data);
      req.log.info({ feed: feedKey, entities: data.entity ? data.entity.length : 0 }, "Fetched from upstream");

      res.set("Cache-Control", "public, max-age=30");
      res.json(slice(data));
    } catch (error) {
      req.log.error({ err: error, feed: feedKey }, "Upstream fetch failed");

      if (error.statusCode === 401 || error.statusCode === 403) {
        res.status(502).json({ error: "Upstream authentication failed." });
        return;
      }
      if (error.statusCode && error.statusCode >= 500) {
        res.status(502).json({ error: "Upstream server error." });
        return;
      }
      if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND" || error.code === "ECONNRESET") {
        res.status(502).json({ error: "Upstream network error." });
        return;
      }
      res.status(502).json({ error: "Upstream request failed." });
    }
  })();
};
