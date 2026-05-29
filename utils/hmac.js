const crypto = require("crypto");

/**
 * Compute PTV Timetable API v3 HMAC-SHA1 signature.
 * Returns the full signed URL with devid and signature appended.
 * See: https://www.ptv.vic.gov.au/assets/PTV/PTV%20docs/PTV-Timetable-API-key-and-signature-guide.PDF
 */
function signUrl(path, devId, apiKey) {
  const base = `https://timetableapi.ptv.vic.gov.au${path}`;
  const separator = path.includes("?") ? "&" : "?";
  const urlWithDevId = `${base}${separator}devid=${encodeURIComponent(devId)}`;
  const signature = crypto
    .createHmac("sha1", apiKey)
    .update(urlWithDevId)
    .digest("hex")
    .toLowerCase();
  return `${urlWithDevId}&signature=${signature}`;
}

module.exports = { signUrl };
