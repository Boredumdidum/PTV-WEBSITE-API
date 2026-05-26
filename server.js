const path = require("path");
const https = require("https");
const express = require("express");
const pino = require("pino");
const pinoHttp = require("pino-http");
const { transit_realtime } = require("gtfs-realtime-bindings");

require("dotenv").config();

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS, 10) || 30000;

app.use(pinoHttp({ logger }));

const FEEDS = {
  "metro-trip-updates":
    "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/trip-updates",
  "metro-service-alerts":
    "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/service-alerts",
  "metro-vehicle-positions":
    "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/vehicle-positions",
  "bus-trip-updates":
    "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/bus/trip-updates",
  "bus-vehicle-positions":
    "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/bus/vehicle-positions",
};

const cache = new Map();

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
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });

    request.on("error", (error) => {
      error.code = error.code || "ENETUNREACH";
      reject(error);
    });
  });
}

app.get("/health", (req, res) => {
  const cacheStatus = {};
  for (const [key, entry] of cache) {
    cacheStatus[key] = {
      age: Math.round((Date.now() - entry.time) / 1000) + "s",
      entities: entry.data.entity ? entry.data.entity.length : 0,
    };
  }
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    cache: cacheStatus,
    apiKeySet: !!process.env.PTV_API_KEY,
  });
});

app.get("/api/gtfs", async (req, res) => {
  const feedKey = req.query.feed;
  if (!feedKey || !FEEDS[feedKey]) {
    res.status(400).json({ error: "Invalid or missing feed parameter." });
    return;
  }

  const apiKey = process.env.PTV_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server missing PTV_API_KEY." });
    return;
  }

  const cacheEntry = cache.get(feedKey);
  const now = Date.now();
  if (cacheEntry && now - cacheEntry.time < CACHE_TTL_MS) {
    req.log.info({ feed: feedKey, cached: true }, "Serving from cache");
    res.set("Cache-Control", "public, max-age=30");
    res.json(cacheEntry.data);
    return;
  }

  try {
    const buffer = await fetchBuffer(FEEDS[feedKey], { KeyID: apiKey });
    const feed = transit_realtime.FeedMessage.decode(buffer);
    const data = transit_realtime.FeedMessage.toObject(feed, {
      longs: String,
      enums: String,
      bytes: String,
    });

    cache.set(feedKey, { time: now, data });
    req.log.info({ feed: feedKey, entities: data.entity ? data.entity.length : 0 }, "Fetched from upstream");

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 0, 0), 200);
    const payload =
      limit > 0 && Array.isArray(data.entity)
        ? { ...data, entity: data.entity.slice(0, limit) }
        : data;

    res.set("Cache-Control", "public, max-age=30");
    res.json(payload);
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
});

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  logger.info({ port: PORT }, "Server started");
});
