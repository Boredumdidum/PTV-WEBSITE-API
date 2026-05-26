import { TRAIN_ROUTE_SHORT_CODES } from "../constants.js";

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

export function formatRouteName(routeId) {
	const cleaned = String(routeId);
	const parts = cleaned.split(":");
	const nonEmpty = parts.filter(Boolean);
	const last = nonEmpty.length ? nonEmpty[nonEmpty.length - 1] : cleaned;
	return escapeHTML(last);
}

export function displayRouteName(routeId, busMode) {
	if (busMode) {
		return formatRouteName(routeId);
	}
	const code = String(routeId).split(":").filter(Boolean).pop().split("-").pop();
	return TRAIN_ROUTE_SHORT_CODES[code] || code;
}
