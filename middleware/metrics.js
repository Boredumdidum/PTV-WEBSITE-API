const client = require("prom-client");

const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5] });

const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
});

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
});

const gtfsUpstreamDuration = new client.Histogram({
  name: "gtfs_upstream_fetch_duration_seconds",
  help: "Duration of upstream PTV API calls in seconds",
  labelNames: ["feed"],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 15],
});

const gtfsCacheHits = new client.Counter({
  name: "gtfs_cache_hits_total",
  help: "Total number of cache hits for GTFS feeds",
  labelNames: ["feed"],
});

const gtfsCacheMisses = new client.Counter({
  name: "gtfs_cache_misses_total",
  help: "Total number of cache misses for GTFS feeds",
  labelNames: ["feed"],
});

function metricsMiddleware(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    httpRequestDuration.observe({ method: req.method, route, status_code: res.statusCode }, duration);
    httpRequestsTotal.inc({ method: req.method, route, status_code: res.statusCode });
  });
  next();
}

module.exports = {
  client,
  metricsMiddleware,
  gtfsUpstreamDuration,
  gtfsCacheHits,
  gtfsCacheMisses,
  httpRequestDuration,
  httpRequestsTotal,
};
