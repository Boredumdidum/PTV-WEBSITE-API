const path = require("path");
const https = require("https");
const express = require("express");
const { transit_realtime } = require("gtfs-realtime-bindings");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_TTL_MS = 30000;

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
        reject(new Error(`Upstream request failed with status ${statusCode}`));
        return;
      }

      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });

    request.on("error", reject);
  });
}

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

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 0, 0), 200);
    const payload =
      limit > 0 && Array.isArray(data.entity)
        ? { ...data, entity: data.entity.slice(0, limit) }
        : data;

    res.set("Cache-Control", "public, max-age=30");
    res.json(payload);
  } catch (error) {
    res.status(502).json({ error: "Upstream request failed." });
  }
});

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
