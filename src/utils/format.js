export const TRAIN_ROUTE_NAMES = {
	1: "Alamein", ALM: "Alamein",
	2: "Belgrave", BEL: "Belgrave",
	3: "Craigieburn", CGB: "Craigieburn", CRA: "Craigieburn",
	4: "Cranbourne", CRN: "Cranbourne",
	5: "Mernda", MDD: "Mernda",
	6: "Frankston", FKN: "Frankston",
	7: "Glen Waverley", GWS: "Glen Waverley",
	8: "Hurstbridge", HUR: "Hurstbridge",
	9: "Lilydale", LIL: "Lilydale",
	11: "Pakenham", PKM: "Pakenham",
	12: "Sandringham", SAN: "Sandringham", SHM: "Sandringham",
	13: "Stony Point", STP: "Stony Point",
	14: "Sunbury", SUN: "Sunbury", SUY: "Sunbury",
	15: "Upfield", UFD: "Upfield",
	16: "Werribee", WER: "Werribee",
	17: "Williamstown", WIL: "Williamstown", WLW: "Williamstown",
	1482: "Flemington Racecourse",
};

function extractCode(routeId) {
	return String(routeId).split(":").filter(Boolean).pop().split("-").pop();
}

export function displayRouteName(routeId, busMode) {
	const name = TRAIN_ROUTE_NAMES[routeId] || TRAIN_ROUTE_NAMES[extractCode(routeId)] || TRAIN_ROUTE_NAMES[String(routeId)];
	if (name) return name;
	const code = extractCode(routeId);
	return code;
}

export function escapeHTML(str) {
	const div = document.createElement("div");
	div.textContent = str;
	return div.innerHTML;
}

export function formatTimestamp(value) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric) || numeric <= 0) {
		return "Unknown";
	}
	return new Date(numeric * 1000).toLocaleTimeString();
}

export function formatSpeed(speed) {
	if (!Number.isFinite(speed)) {
		return null;
	}
	const kmh = speed * 3.6;
	return `${kmh.toFixed(1)} km/h`;
}

export function formatEnum(value) {
	if (!value) {
		return null;
	}
	return String(value).replace(/_/g, " ").toLowerCase();
}
