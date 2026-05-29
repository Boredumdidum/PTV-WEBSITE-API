export const DEFAULT_MAP_CENTER = [-37.8136, 144.9631];
export const DEFAULT_MAP_ZOOM = 11;
export const VICTORIA_BOUNDS = [
	[-39.5, 140.5],
	[-33.5, 150.5],
];
export const VEHICLE_FEEDS = new Set(["metro-vehicle-positions", "bus-vehicle-positions"]);
export const FEED_COLORS = {
	"metro-vehicle-positions": "#0f5b61",
	"bus-vehicle-positions": "#e27d60",
};
export const ROUTE_LINE_COLORS = {
	0: "#0f5b61",
	1: "#ff922b",
};
export const ROUTE_SERVICE_URL = "https://router.project-osrm.org/route/v1/driving/";
export const MAX_ROUTE_POINTS = 40;
export const LINE_INDEX_URL = "/data/lines/index.json";
export const LINE_DATA_BASE = "/data/lines/";
export const TRAIN_ROUTE_SHORT_CODES = {
	ALM: "Alamein",
	BEL: "Belgrave",
	CRA: "Craigieburn",
	FKN: "Frankston",
	GWS: "Glen Waverley",
	HUR: "Hurstbridge",
	LIL: "Lilydale",
	MDD: "Mernda",
	PKM: "Pakenham",
	SAN: "Sandringham",
	SUN: "Sunbury",
	UFD: "Upfield",
	WER: "Werribee",
	WLW: "Williamstown",
};
