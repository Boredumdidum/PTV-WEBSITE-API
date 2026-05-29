const path = require("path");
const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const pino = require("pino");
const pinoHttp = require("pino-http");
const cache = require("./middleware/cache");
const gtfsHandler = require("./routes/gtfs");
const timetableHandler = require("./routes/timetable");
const { client, metricsMiddleware } = require("./middleware/metrics");
const restrictMetrics = require("./middleware/restrictMetrics");

require("dotenv").config();

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

const app = express();

app.set("trust proxy", 1);

app.use(metricsMiddleware);

app.use(compression());

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "same-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://unpkg.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "https://*.tile.openstreetmap.org", "data:"],
        connectSrc: ["'self'", "https://router.project-osrm.org"],
      },
    },
  }),
);
app.use(express.json({ limit: "1kb" }));
app.use(pinoHttp({ logger }));

const gtfsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { error: "Too many requests. Please slow down." },
});

const timetableLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { error: "Too many requests. Please slow down." },
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    cache: cache.getStatus(),
    apiKeySet: !!process.env.PTV_API_KEY,
    swaggerKeySet: !!process.env.SWAGGER_API_KEY,
    swaggerDevIdSet: !!process.env.SWAGGER_DEV_ID,
  });
});

app.get("/metrics", restrictMetrics, async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.get("/api/gtfs", gtfsLimiter, gtfsHandler);

app.use("/api/timetable", timetableLimiter, timetableHandler);

app.use(
  express.static(path.join(__dirname), {
    maxAge: "1d",
    immutable: true,
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html")) {
        res.set("Cache-Control", "no-cache");
      }
    },
  }),
);

app.use((err, req, res, next) => {
  req.log.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error." });
});

module.exports = app;

if (require.main === module) {
  if (!process.env.PTV_API_KEY) {
    console.error("FATAL: PTV_API_KEY environment variable is not set.");
    process.exit(1);
  }

  if (!process.env.SWAGGER_API_KEY || !process.env.SWAGGER_DEV_ID) {
    console.error(
      "FATAL: SWAGGER_API_KEY and SWAGGER_DEV_ID environment variables must be set.",
    );
    process.exit(1);
  }

  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, "Server started");
  });

  const shutdown = (signal) => {
    logger.info({ signal }, "Shutting down gracefully");
    server.close(() => {
      logger.info("Server closed");
      process.exit(0);
    });
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
