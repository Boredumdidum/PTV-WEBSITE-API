function restrictMetrics(req, res, next) {
  const allowed = process.env.METRICS_ALLOW_IPS;
  if (allowed === "*") return next();

  const ip = req.ip || req.socket.remoteAddress || "";
  const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;

  if (allowed) {
    const list = allowed.split(",").map((s) => s.trim());
    if (list.includes(normalized)) return next();
  }

  if (normalized === "127.0.0.1" || normalized === "::1") return next();

  const parts = normalized.split(".");
  if (parts.length === 4) {
    const first = parseInt(parts[0], 10);
    const second = parseInt(parts[1], 10);
    if (first === 10) return next();
    if (first === 172 && second >= 16 && second <= 31) return next();
    if (first === 192 && second === 168) return next();
  }

  req.log
    ? req.log.warn({ ip: normalized }, "Metrics access denied")
    : console.warn("Metrics access denied for", normalized);
  res.status(403).json({ error: "Forbidden" });
}

module.exports = restrictMetrics;
