const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
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

app.use(helmet());
app.use(express.json({ limit: "1kb" }));
app.use(pinoHttp({ logger }));

const gtfsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    cache: cache.getStatus(),
    apiKeySet: !!process.env.PTV_API_KEY,
  });
});

app.get("/api/gtfs", gtfsLimiter, gtfsHandler);

app.use(express.static(path.join(__dirname)));

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, "Server started");
});

function shutdown(signal) {
  logger.info({ signal }, "Shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
