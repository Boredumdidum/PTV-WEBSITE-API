const path = require("path");
const express = require("express");
const pino = require("pino");
const pinoHttp = require("pino-http");
const cache = require("./middleware/cache");
const gtfsHandler = require("./routes/gtfs");

require("dotenv").config();

if (!process.env.PTV_API_KEY) {
  console.error("FATAL: PTV_API_KEY environment variable is not set.");
  process.exit(1);
}

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(pinoHttp({ logger }));

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    cache: cache.getStatus(),
    apiKeySet: !!process.env.PTV_API_KEY,
  });
});

app.get("/api/gtfs", gtfsHandler);

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  logger.info({ port: PORT }, "Server started");
});
