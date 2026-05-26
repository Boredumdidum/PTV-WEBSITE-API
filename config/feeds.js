const FEEDS = {
  "metro-vehicle-positions":
    "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/vehicle-positions",
  "bus-vehicle-positions":
    "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/bus/vehicle-positions",
};

/** Check if a feed key is valid. */
function isValidFeedKey(key) {
  return !!FEEDS[key];
}

/** Get the upstream URL for a feed key. Returns undefined if invalid. */
function getFeedUrl(key) {
  return FEEDS[key];
}

module.exports = { FEEDS, isValidFeedKey, getFeedUrl };
