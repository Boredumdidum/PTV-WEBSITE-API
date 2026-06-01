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

function extractCode(routeId) {
	return String(routeId).split(":").filter(Boolean).pop().split("-").pop();
}

export function displayRouteName(routeId, busMode, routeNames) {
	if (busMode) {
		const code = extractCode(routeId);
		return routeNames?.get(code) || routeNames?.get(String(routeId)) || code;
	}
	const code = extractCode(routeId);
	const cached = routeNames?.get(code) || routeNames?.get(String(routeId));
	if (cached) return cached;
	if (routeNames) {
		for (const [key, label] of routeNames) {
			if (key.toLowerCase() === code.toLowerCase()) return label;
			if (label.toLowerCase().includes(code.toLowerCase())) return label;
		}
	}
	return code;
}
