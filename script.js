const feedSelect = document.getElementById("feed");
const loadButton = document.getElementById("load");
const mockToggle = document.getElementById("mock");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const updatedEl = document.getElementById("updated");
const countEl = document.getElementById("count");
const previewEl = document.getElementById("preview");
const mapEl = document.getElementById("map");
const mapHintEl = document.getElementById("map-hint");
const mapEmptyEl = document.getElementById("map-empty");
const routeSearchInput = document.getElementById("route-search");
const routeSearchLabel = document.querySelector("label[for='route-search']");
const navButtons = document.querySelectorAll(".nav-btn");
const panels = document.querySelectorAll(".panel");
const themeToggle = document.getElementById("theme-toggle");
const toastContainer = document.getElementById("toast-container");

const DEFAULT_MAP_CENTER = [-37.8136, 144.9631];
const DEFAULT_MAP_ZOOM = 11;
const VEHICLE_FEEDS = new Set(["metro-vehicle-positions", "bus-vehicle-positions"]);
const FEED_COLORS = {
	"metro-vehicle-positions": "#0f5b61",
	"bus-vehicle-positions": "#e27d60",
};
const ROUTE_LINE_COLORS = {
	0: "#ff922b",
	1: "#339af0",
};

let mapInstance = null;
let markerLayer = null;
let routeLayer = null;
let lastPayload = null;
let lastFeed = null;
let lastIsMock = false;

function setStatus(state, text) {
	statusEl.dataset.state = state;
	statusEl.textContent = text;
}

function setError(message) {
	errorEl.textContent = message || "";
}

function setMapMessage(message) {
	if (!mapEmptyEl) {
		return;
	}
	mapEmptyEl.textContent = message || "";
}

function setMapHint(message) {
	if (!mapHintEl) {
		return;
	}
	mapHintEl.textContent = message || "";
}

function isVehicleFeed(feed) {
	return VEHICLE_FEEDS.has(feed);
}

function isBusFeed(feed) {
	return typeof feed === "string" && feed.startsWith("bus-");
}

function escapeHTML(str) {
	const div = document.createElement("div");
	div.textContent = str;
	return div.innerHTML;
}

function formatTimestamp(value) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric) || numeric <= 0) {
		return "Unknown";
	}
	return new Date(numeric * 1000).toLocaleTimeString();
}

function formatSpeed(speed) {
	if (!Number.isFinite(speed)) {
		return null;
	}
	const kmh = speed * 3.6;
	return `${kmh.toFixed(1)} km/h`;
}

function formatEnum(value) {
	if (!value) {
		return null;
	}
	return String(value).replace(/_/g, " ").toLowerCase();
}

function updateRouteSearchUI(feed) {
	if (!routeSearchInput || !routeSearchLabel) {
		return;
	}

	const busMode = isBusFeed(feed);
	routeSearchLabel.textContent = busMode ? "Bus route number" : "Train line name";
	routeSearchInput.placeholder = busMode
		? "e.g. 765 or 733"
		: "e.g. Werribee or Frankston";
	routeSearchInput.inputMode = busMode ? "numeric" : "text";
}

function getDirectionKey(item) {
	const trip = item.vehicle && item.vehicle.trip ? item.vehicle.trip : null;
	if (trip && (trip.directionId === 0 || trip.directionId === 1)) {
		return trip.directionId;
	}

	const bearing = Number(item.position && item.position.bearing);
	if (Number.isFinite(bearing)) {
		return bearing < 180 ? 0 : 1;
	}

	return 0;
}

function sortPositionsForLine(items) {
	if (items.length <= 2) {
		return items.slice();
	}

	let minLat = Infinity;
	let maxLat = -Infinity;
	let minLng = Infinity;
	let maxLng = -Infinity;

	items.forEach((item) => {
		minLat = Math.min(minLat, item.latitude);
		maxLat = Math.max(maxLat, item.latitude);
		minLng = Math.min(minLng, item.longitude);
		maxLng = Math.max(maxLng, item.longitude);
	});

	const latRange = maxLat - minLat;
	const lngRange = maxLng - minLng;
	const sortByLongitude = lngRange >= latRange;

	return items
		.slice()
		.sort((a, b) =>
			sortByLongitude ? a.longitude - b.longitude : a.latitude - b.latitude
		);
}

function resolveSelectedRouteId(entities, query) {
	const normalizedQuery = query ? query.trim().toLowerCase() : "";
	if (!normalizedQuery) {
		return "";
	}

	let fallback = "";
	for (const entity of entities) {
		const routes = getEntityRouteIds(entity);
		for (const route of routes) {
			const normalizedRoute = String(route).toLowerCase();
			if (!fallback) {
				fallback = route;
			}
			if (
				normalizedRoute === normalizedQuery ||
				normalizedRoute.endsWith(`-${normalizedQuery}`)
			) {
				return route;
			}
		}
	}

	return fallback;
}

function getEntityRouteIds(entity) {
	const routes = [];
	if (entity && entity.vehicle && entity.vehicle.trip && entity.vehicle.trip.routeId) {
		routes.push(entity.vehicle.trip.routeId);
	}
	if (entity && entity.tripUpdate && entity.tripUpdate.trip && entity.tripUpdate.trip.routeId) {
		routes.push(entity.tripUpdate.trip.routeId);
	}
	if (entity && entity.alert && Array.isArray(entity.alert.informedEntity)) {
		entity.alert.informedEntity.forEach((info) => {
			if (info && info.routeId) {
				routes.push(info.routeId);
			}
		});
	}
	return routes;
}

function filterEntitiesByRoute(entities, query) {
	const trimmed = query ? query.trim().toLowerCase() : "";
	if (!trimmed) {
		return entities;
	}

	return entities.filter((entity) => {
		const routes = getEntityRouteIds(entity);
		return routes.some((route) => String(route).toLowerCase().includes(trimmed));
	});
}

function showToast(message, iconName = "check-circle") {
	if (!toastContainer) {
		return;
	}

	const toast = document.createElement("div");
	toast.className = "toast";

	const icon = document.createElement("i");
	icon.className = "icon";
	icon.setAttribute("data-lucide", iconName);

	const text = document.createElement("span");
	text.textContent = message;

	toast.append(icon, text);
	toastContainer.append(toast);

	if (window.lucide && typeof lucide.createIcons === "function") {
		lucide.createIcons({ nodes: [toast] });
	}

	window.setTimeout(() => {
		toast.classList.add("toast-out");
	}, 2600);

	toast.addEventListener("animationend", (event) => {
		if (event.animationName === "toast-out") {
			toast.remove();
		}
	});
}

function updateThemeToggle(theme) {
	if (!themeToggle) {
		return;
	}

	const isDark = theme === "dark";
	const icon = isDark ? "sun" : "moon";
	const label = isDark ? "Light mode" : "Dark mode";

	themeToggle.innerHTML = `<i data-lucide="${icon}" class="icon"></i><span>${label}</span>`;

	if (window.lucide && typeof lucide.createIcons === "function") {
		lucide.createIcons({ nodes: [themeToggle] });
	}
}

function setTheme(theme) {
	const isDark = theme === "dark";
	document.body.classList.toggle("dark", isDark);
	localStorage.setItem("theme", isDark ? "dark" : "light");
	updateThemeToggle(isDark ? "dark" : "light");
	showToast(isDark ? "Dark mode enabled" : "Light mode enabled", isDark ? "moon" : "sun");
}

function initTheme() {
	const stored = localStorage.getItem("theme");
	const theme = stored === "dark" ? "dark" : "light";
	document.body.classList.toggle("dark", theme === "dark");
	updateThemeToggle(theme);
}

function initNavigation() {
	navButtons.forEach((button) => {
		button.addEventListener("click", () => {
			navButtons.forEach((btn) => btn.classList.remove("active"));
			panels.forEach((panel) => panel.classList.remove("active"));
			button.classList.add("active");

			const targetId = button.dataset.panel;
			const targetPanel = targetId ? document.getElementById(targetId) : null;
			if (targetPanel) {
				targetPanel.classList.add("active");
			}

			if (targetPanel && mapEl && targetPanel.contains(mapEl) && mapInstance) {
				setTimeout(() => mapInstance.invalidateSize(), 0);
			}
		});
	});
}

function initMap() {
	if (!mapEl || mapInstance) {
		return;
	}

	if (typeof L === "undefined") {
		setMapMessage("Map library failed to load.");
		return;
	}

	mapInstance = L.map(mapEl, { scrollWheelZoom: false }).setView(
		DEFAULT_MAP_CENTER,
		DEFAULT_MAP_ZOOM
	);

	L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
		maxZoom: 19,
		attribution: "&copy; OpenStreetMap contributors",
		crossOrigin: true,
		referrerPolicy: "origin",
	}).addTo(mapInstance);

	routeLayer = L.layerGroup().addTo(mapInstance);
	markerLayer = L.layerGroup().addTo(mapInstance);
	setTimeout(() => mapInstance.invalidateSize(), 0);
}

function updateMap(feed, entities, routeQuery) {
	if (!mapEl) {
		return;
	}

	if (typeof L === "undefined") {
		setMapMessage("Map library failed to load.");
		return;
	}

	initMap();
	if (!mapInstance || !markerLayer) {
		return;
	}
	if (routeLayer) {
		routeLayer.clearLayers();
	}

	const showVehicles = isVehicleFeed(feed);
	const busMode = isBusFeed(feed);
	const normalizedRouteQuery = routeQuery ? routeQuery.trim() : "";
	setMapHint(
		showVehicles
			? busMode && normalizedRouteQuery
				? "Route lines: orange / blue"
				: "Vehicle positions only"
			: "Select a vehicle positions feed"
	);

	markerLayer.clearLayers();

	if (!showVehicles) {
		setMapMessage("Select a vehicle positions feed to see markers.");
		mapInstance.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
		return;
	}

	const positions = (Array.isArray(entities) ? entities : [])
		.map((entity) => {
			const vehicle = entity.vehicle;
			const position = vehicle && vehicle.position ? vehicle.position : null;
			if (!position) {
				return null;
			}
			const latitude = Number(position.latitude);
			const longitude = Number(position.longitude);
			if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
				return null;
			}
			return { entity, vehicle, latitude, longitude, position };
		})
		.filter(Boolean);

	const hasFilter = normalizedRouteQuery.length > 0;
	if (positions.length === 0) {
		setMapMessage(
			hasFilter
				? "No vehicle positions match that route."
				: "No vehicle positions available in this response."
		);
		mapInstance.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
		return;
	}

	setMapMessage("");
	const markerColor = FEED_COLORS[feed] || "#0f5b61";
	const bounds = [];

	const selectedRouteId = busMode
		? resolveSelectedRouteId(entities, normalizedRouteQuery)
		: "";
	if (busMode && normalizedRouteQuery && selectedRouteId && routeLayer) {
		setMapHint(`Route ${selectedRouteId}: orange / blue`);

		const directionBuckets = {
			0: [],
			1: [],
		};

		positions.forEach((item) => {
			const routeId =
				(item.vehicle.trip && item.vehicle.trip.routeId) || "";
			if (String(routeId).toLowerCase() !== String(selectedRouteId).toLowerCase()) {
				return;
			}
			const directionKey = getDirectionKey(item);
			const key = directionKey === 1 ? 1 : 0;
			directionBuckets[key].push(item);
		});

		[0, 1].forEach((directionKey) => {
			const items = directionBuckets[directionKey];
			if (!items || items.length < 2) {
				return;
			}
			const sorted = sortPositionsForLine(items);
			const latLngs = sorted.map((item) => [item.latitude, item.longitude]);
			L.polyline(latLngs, {
				color: ROUTE_LINE_COLORS[directionKey],
				weight: 4,
				opacity: 0.9,
			}).addTo(routeLayer);
		});
	}

	positions.forEach((item) => {
		const routeId =
			(item.vehicle.trip && item.vehicle.trip.routeId) || "Unknown route";
		const updated = formatTimestamp(item.vehicle.timestamp);
		const speed = formatSpeed(item.position.speed);
		const occupancy = formatEnum(item.vehicle.occupancyStatus);
		const congestion = formatEnum(item.vehicle.congestionLevel);

		const popupLines = [
			`<strong>${escapeHTML(routeId)}</strong>`,
			`Updated: ${escapeHTML(updated)}`,
		];
		if (speed) {
			popupLines.push(`Speed: ${escapeHTML(speed)}`);
		}
		if (occupancy) {
			popupLines.push(`Occupancy: ${escapeHTML(occupancy)}`);
		}
		if (congestion) {
			popupLines.push(`Congestion: ${escapeHTML(congestion)}`);
		}

		const marker = L.circleMarker([item.latitude, item.longitude], {
			radius: 7,
			color: markerColor,
			fillColor: markerColor,
			fillOpacity: 0.85,
			weight: 2,
		});
		marker.on("click", () => {
			if (!busMode || !routeSearchInput) {
				return;
			}
			routeSearchInput.value = routeId;
			if (lastPayload && lastFeed) {
				applyData(lastPayload, lastIsMock, lastFeed);
			}
		});
		marker.bindPopup(popupLines.join("<br />"));
		marker.addTo(markerLayer);
		bounds.push([item.latitude, item.longitude]);
	});

	mapInstance.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
}

function buildMockData(feed) {
	const now = Math.floor(Date.now() / 1000);
	const base = {
		header: {
			gtfsRealtimeVersion: "2.0",
			incrementality: "FULL_DATASET",
			timestamp: String(now),
		},
	};

	if (feed === "metro-service-alerts") {
		return {
			...base,
			entity: [
				{
					id: "alert-1",
					alert: {
						effect: "SIGNIFICANT_DELAYS",
						headerText: {
							translation: [{ text: "Signal fault near Central" }],
						},
						descriptionText: {
							translation: [{ text: "Expect 10-15 minute delays." }],
						},
						informedEntity: [{ routeId: "METRO" }],
					},
				},
				{
					id: "alert-2",
					alert: {
						effect: "STOP_MOVED",
						headerText: {
							translation: [{ text: "Temporary platform change" }],
						},
						descriptionText: {
							translation: [{ text: "Platform 2 is closed for maintenance." }],
						},
						informedEntity: [{ stopId: "CENTRAL" }],
					},
				},
			],
		};
	}

	if (feed === "metro-vehicle-positions" || feed === "bus-vehicle-positions") {
		return {
			...base,
			entity: [
				{
					id: "vehicle-1",
					vehicle: {
						trip: {
							routeId: feed === "bus-vehicle-positions" ? "BUS-246" : "METRO-03",
						},
						position: {
							latitude: -37.8136,
							longitude: 144.9631,
							bearing: 120,
							speed: 12.2,
						},
						congestionLevel: "CONGESTION_LEVEL_LOW",
						occupancyStatus: "MANY_SEATS_AVAILABLE",
						timestamp: String(now),
					},
				},
				{
					id: "vehicle-2",
					vehicle: {
						trip: {
							routeId: feed === "bus-vehicle-positions" ? "BUS-512" : "METRO-15",
						},
						position: {
							latitude: -37.8005,
							longitude: 144.9789,
							bearing: 42,
							speed: 8.6,
						},
						congestionLevel: "CONGESTION_LEVEL_MEDIUM",
						occupancyStatus: "FEW_SEATS_AVAILABLE",
						timestamp: String(now),
					},
				},
			],
		};
	}

	return {
		...base,
		entity: [
			{
				id: "trip-1",
				tripUpdate: {
					trip: {
						tripId: "TRIP-1001",
						routeId: feed === "bus-trip-updates" ? "BUS-86" : "METRO-03",
					},
					stopTimeUpdate: [
						{
							stopId: "STOP-120",
							arrival: { time: String(now + 300) },
							departure: { time: String(now + 360) },
						},
					],
					delay: 120,
				},
			},
			{
				id: "trip-2",
				tripUpdate: {
					trip: {
						tripId: "TRIP-1022",
						routeId: feed === "bus-trip-updates" ? "BUS-246" : "METRO-15",
					},
					stopTimeUpdate: [
						{
							stopId: "STOP-305",
							arrival: { time: String(now + 540) },
							departure: { time: String(now + 600) },
						},
					],
					delay: -30,
				},
			},
		],
	};
}

function applyData(data, isMock, feed) {
	const entities = Array.isArray(data.entity) ? data.entity : [];
	const routeQuery = routeSearchInput ? routeSearchInput.value.trim() : "";
	const filteredEntities = filterEntitiesByRoute(entities, routeQuery);

	lastPayload = data;
	lastFeed = feed;
	lastIsMock = isMock;

	const timestampRaw = data.header && data.header.timestamp ? data.header.timestamp : null;
	const timestamp = timestampRaw ? Number(timestampRaw) : 0;
	const formattedTime = timestamp ? new Date(timestamp * 1000).toLocaleString() : "Unknown";

	updatedEl.textContent = formattedTime;
	countEl.textContent = `${filteredEntities.length}`;
	previewEl.textContent = filteredEntities.length
		? JSON.stringify(filteredEntities.slice(0, 5), null, 2)
		: routeQuery
			? "No entities match that route."
			: "No entities";
	setStatus("ok", isMock ? "Mock" : "OK");
	updateMap(feed, filteredEntities, routeQuery);
}

async function loadFeed() {
	const feed = feedSelect.value;
	setStatus("loading", "Loading");
	setError("");
	previewEl.textContent = "Fetching feed...";
	setMapMessage("Loading feed data...");
	setMapHint(isVehicleFeed(feed) ? "Vehicle positions only" : "Select a vehicle positions feed");

	if (mockToggle && mockToggle.checked) {
		const data = buildMockData(feed);
		applyData(data, true, feed);
		return;
	}

	try {
		const limit = isVehicleFeed(feed) ? 200 : 10;
		const response = await fetch(
			`/api/gtfs?feed=${encodeURIComponent(feed)}&limit=${limit}`
		);
		if (!response.ok) {
			throw new Error(`Request failed (${response.status})`);
		}

		const data = await response.json();
		applyData(data, false, feed);
	} catch (error) {
		setStatus("error", "Error");
		setError(error.message || "Something went wrong.");
		previewEl.textContent = "No data";
		updatedEl.textContent = "-";
		countEl.textContent = "-";
		setMapMessage("Unable to load feed data.");
		lastPayload = null;
		lastFeed = null;
		lastIsMock = false;
	}
}

if (window.lucide && typeof lucide.createIcons === "function") {
	lucide.createIcons();
}

initTheme();
initNavigation();

if (themeToggle) {
	themeToggle.addEventListener("click", () => {
		const nextTheme = document.body.classList.contains("dark") ? "light" : "dark";
		setTheme(nextTheme);
	});
}

if (routeSearchInput) {
	routeSearchInput.addEventListener("input", () => {
		if (lastPayload && lastFeed) {
			applyData(lastPayload, lastIsMock, lastFeed);
		}
	});

	routeSearchInput.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			if (lastPayload && lastFeed) {
				applyData(lastPayload, lastIsMock, lastFeed);
			}
		}
	});
}

loadButton.addEventListener("click", loadFeed);
feedSelect.addEventListener("change", () => {
	updateRouteSearchUI(feedSelect.value);
	loadFeed();
});
if (mockToggle) {
	mockToggle.addEventListener("change", loadFeed);
}

updateRouteSearchUI(feedSelect.value);
loadFeed();
