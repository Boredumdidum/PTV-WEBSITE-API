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
const ROUTE_SERVICE_URL = "https://router.project-osrm.org/route/v1/driving/";
const MAX_ROUTE_POINTS = 40;
const ROUTE_CACHE = new Map();
const LINE_INDEX_URL = "/data/lines/index.json";
const LINE_DATA_BASE = "/data/lines/";
const LINE_CHUNK_CACHE = new Map();

let mapInstance = null;
let markerLayer = null;
let routeLayer = null;
let lastPayload = null;
let lastFeed = null;
let lastIsMock = false;
let routeRequestId = 0;
let lineIndex = null;
let lineIndexPromise = null;

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

function normalizeRouteValue(value) {
	if (value === null || value === undefined) {
		return "";
	}
	return String(value).trim().toLowerCase();
}

function normalizeBusRoute(value) {
	const normalized = normalizeRouteValue(value);
	if (!normalized) {
		return "";
	}
	const parts = normalized.split(/[^a-z0-9]+/).filter(Boolean);
	return parts.length ? parts[parts.length - 1] : normalized;
}

function bboxIntersects(bbox, bounds) {
	if (!bbox || !bounds) {
		return false;
	}
	const west = bounds.getWest();
	const east = bounds.getEast();
	const south = bounds.getSouth();
	const north = bounds.getNorth();
	return bbox[0] <= east && bbox[2] >= west && bbox[1] <= north && bbox[3] >= south;
}

async function getLineIndex() {
	if (lineIndex) {
		return lineIndex;
	}
	if (!lineIndexPromise) {
		lineIndexPromise = fetch(LINE_INDEX_URL)
			.then((response) => (response.ok ? response.json() : null))
			.then((data) => {
				lineIndex = data;
				return data;
			})
			.catch(() => {
				lineIndexPromise = null;
				return null;
			});
	}
	return lineIndexPromise;
}

async function loadLineChunk(fileName) {
	if (!fileName) {
		return null;
	}
	if (LINE_CHUNK_CACHE.has(fileName)) {
		return LINE_CHUNK_CACHE.get(fileName);
	}
	const response = await fetch(`${LINE_DATA_BASE}${fileName}`);
	if (!response.ok) {
		return null;
	}
	const data = await response.json();
	LINE_CHUNK_CACHE.set(fileName, data);
	return data;
}

function isBusLineFeature(feature) {
	const props = feature && feature.properties ? feature.properties : null;
	if (!props || !props.MODE) {
		return false;
	}
	const mode = String(props.MODE).toUpperCase();
	return mode.includes("BUS");
}

function featureMatchesRoute(feature, routeId) {
	if (!feature || !routeId) {
		return false;
	}
	if (!isBusLineFeature(feature)) {
		return false;
	}
	const props = feature.properties || {};
	const normalizedRoute = normalizeBusRoute(routeId);
	if (!normalizedRoute) {
		return false;
	}
	const shortName = props.SHORT_NAME ? normalizeBusRoute(props.SHORT_NAME) : "";
	if (shortName && shortName === normalizedRoute) {
		return true;
	}
	const longName = props.LONG_NAME ? normalizeRouteValue(props.LONG_NAME) : "";
	return longName ? longName.includes(normalizedRoute) : false;
}

async function drawBusRouteFromLines(routeId, requestId) {
	if (!routeLayer || !mapInstance) {
		return false;
	}
	const index = await getLineIndex();
	if (!index || !Array.isArray(index.chunks)) {
		return false;
	}
	const bounds = mapInstance.getBounds();
	const candidates = index.chunks.filter((chunk) =>
		bboxIntersects(chunk.bbox, bounds)
	);
	if (!candidates.length) {
		return false;
	}
	const chunkData = await Promise.all(
		candidates.map((chunk) => loadLineChunk(chunk.file))
	);
	if (requestId !== routeRequestId) {
		return false;
	}
	const features = [];
	chunkData.forEach((data) => {
		if (!data || !Array.isArray(data.features)) {
			return;
		}
		data.features.forEach((feature) => {
			if (featureMatchesRoute(feature, routeId)) {
				features.push(feature);
			}
		});
	});
	if (!features.length) {
		return false;
	}
	L.geoJSON(
		{ type: "FeatureCollection", features },
		{
			style: {
				color: ROUTE_LINE_COLORS[0],
				weight: 4,
				opacity: 0.9,
				lineJoin: "round",
				lineCap: "round",
			},
		}
	).addTo(routeLayer);
	return true;
}

function sampleRoutePoints(points, maxPoints) {
	if (points.length <= maxPoints) {
		return points.slice();
	}

	const sampled = [];
	const lastIndex = points.length - 1;
	for (let i = 0; i < maxPoints; i += 1) {
		const index = Math.round((i * lastIndex) / (maxPoints - 1));
		sampled.push(points[index]);
	}

	return sampled;
}

function buildRouteCacheKey(points) {
	return points
		.map((point) => `${point[0].toFixed(5)},${point[1].toFixed(5)}`)
		.join("|");
}

async function drawRouteLine(points, color, requestId) {
	if (!routeLayer || points.length < 2) {
		return;
	}

	const sampled = sampleRoutePoints(points, MAX_ROUTE_POINTS);
	const cacheKey = buildRouteCacheKey(sampled);
	const cached = ROUTE_CACHE.get(cacheKey);
	if (cached) {
		if (requestId !== routeRequestId) {
			return;
		}
		L.polyline(cached, {
			color,
			weight: 4,
			opacity: 0.9,
			lineJoin: "round",
			lineCap: "round",
		}).addTo(routeLayer);
		return;
	}

	const coordString = sampled
		.map((point) => `${point[1]},${point[0]}`)
		.join(";");
	const url = `${ROUTE_SERVICE_URL}${coordString}?overview=full&geometries=geojson`;

	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error("Routing failed");
		}

		const data = await response.json();
		const coords =
			data && data.routes && data.routes[0] && data.routes[0].geometry
				? data.routes[0].geometry.coordinates
				: null;
		if (!Array.isArray(coords) || coords.length < 2) {
			throw new Error("Routing missing geometry");
		}

		const latLngs = coords.map((coord) => [coord[1], coord[0]]);
		ROUTE_CACHE.set(cacheKey, latLngs);
		if (requestId !== routeRequestId) {
			return;
		}
		L.polyline(latLngs, {
			color,
			weight: 4,
			opacity: 0.9,
			lineJoin: "round",
			lineCap: "round",
		}).addTo(routeLayer);
	} catch (error) {
		if (requestId !== routeRequestId) {
			return;
		}
		L.polyline(points, {
			color,
			weight: 4,
			opacity: 0.9,
			lineJoin: "round",
			lineCap: "round",
		}).addTo(routeLayer);
	}
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

	mapInstance = L.map(mapEl, { scrollWheelZoom: true, zoomControl: false }).setView(
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
	const currentRouteRequestId = ++routeRequestId;

	const showVehicles = isVehicleFeed(feed);
	const busMode = isBusFeed(feed);
	const normalizedRouteQuery = routeQuery ? routeQuery.trim() : "";
	setMapHint(
		showVehicles
			? busMode && normalizedRouteQuery
				? "Route line loading..."
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
		setMapHint(`Route ${selectedRouteId}: loading line data`);

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

		const drawFromPositions = () => {
			[0, 1].forEach((directionKey) => {
				const items = directionBuckets[directionKey];
				if (!items || items.length < 2) {
					return;
				}
				const sorted = sortPositionsForLine(items);
				const latLngs = sorted.map((item) => [item.latitude, item.longitude]);
				void drawRouteLine(
					latLngs,
					ROUTE_LINE_COLORS[directionKey],
					currentRouteRequestId
				);
			});
		};

		void drawBusRouteFromLines(selectedRouteId, currentRouteRequestId).then(
			(drawn) => {
				if (currentRouteRequestId !== routeRequestId) {
					return;
				}
				if (drawn) {
					setMapHint(`Route ${selectedRouteId}: line from GTFS shapes`);
				} else {
					setMapHint(`Route ${selectedRouteId}: estimated path`);
					drawFromPositions();
				}
			}
		);
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
	const isBus = typeof feed === "string" && feed.startsWith("bus-");

	if (feed === "metro-service-alerts") {
		return {
			...base,
			entity: [
				{
					id: "alert-1",
					alert: {
						effect: "SIGNIFICANT_DELAYS",
						headerText: {
							translation: [{ text: "Frankston line delays near Caulfield" }],
						},
						descriptionText: {
							translation: [{ text: "Expect 10-15 minute delays." }],
						},
						informedEntity: [{ routeId: "Frankston" }],
					},
				},
				{
					id: "alert-2",
					alert: {
						effect: "STOP_MOVED",
						headerText: {
							translation: [{ text: "Werribee line platform change" }],
						},
						descriptionText: {
							translation: [
								{ text: "Platform 2 is closed at Footscray. Trains use platform 4." },
							],
						},
						informedEntity: [{ routeId: "Werribee", stopId: "FOOTSCRAY" }],
					},
				},
			],
		};
	}

	if (feed === "metro-vehicle-positions" || feed === "bus-vehicle-positions") {
		const vehicles = isBus
			? [
					{
						routeId: "246",
						latitude: -37.8572,
						longitude: 144.9885,
						bearing: 85,
						speed: 11.1,
						congestionLevel: "CONGESTION_LEVEL_LOW",
						occupancyStatus: "MANY_SEATS_AVAILABLE",
						directionId: 0,
						updatedOffset: 20,
					},
					{
						routeId: "246",
						latitude: -37.8446,
						longitude: 144.9922,
						bearing: 95,
						speed: 10.4,
						congestionLevel: "CONGESTION_LEVEL_LOW",
						occupancyStatus: "MANY_SEATS_AVAILABLE",
						directionId: 0,
						updatedOffset: 40,
					},
					{
						routeId: "246",
						latitude: -37.8391,
						longitude: 144.9735,
						bearing: 260,
						speed: 9.3,
						congestionLevel: "CONGESTION_LEVEL_MEDIUM",
						occupancyStatus: "FEW_SEATS_AVAILABLE",
						directionId: 1,
						updatedOffset: 30,
					},
					{
						routeId: "246",
						latitude: -37.8284,
						longitude: 144.9652,
						bearing: 250,
						speed: 8.8,
						congestionLevel: "CONGESTION_LEVEL_MEDIUM",
						occupancyStatus: "FEW_SEATS_AVAILABLE",
						directionId: 1,
						updatedOffset: 50,
					},
					{
						routeId: "250",
						latitude: -37.7896,
						longitude: 145.0467,
						bearing: 70,
						speed: 12.6,
						congestionLevel: "CONGESTION_LEVEL_LOW",
						occupancyStatus: "MANY_SEATS_AVAILABLE",
						updatedOffset: 25,
					},
					{
						routeId: "401",
						latitude: -37.7992,
						longitude: 144.9491,
						bearing: 180,
						speed: 6.2,
						congestionLevel: "CONGESTION_LEVEL_HIGH",
						occupancyStatus: "STANDING_ROOM_ONLY",
						updatedOffset: 15,
					},
					{
						routeId: "302",
						latitude: -37.8234,
						longitude: 145.0183,
						bearing: 240,
						speed: 9.7,
						congestionLevel: "CONGESTION_LEVEL_LOW",
						occupancyStatus: "MANY_SEATS_AVAILABLE",
						updatedOffset: 35,
					},
					{
						routeId: "903",
						latitude: -37.9198,
						longitude: 145.0824,
						bearing: 120,
						speed: 13.8,
						congestionLevel: "CONGESTION_LEVEL_MEDIUM",
						occupancyStatus: "FEW_SEATS_AVAILABLE",
						updatedOffset: 45,
					},
				]
			: [
					{
						routeId: "Werribee",
						latitude: -37.8575,
						longitude: 144.9042,
						bearing: 70,
						speed: 20.3,
						congestionLevel: "CONGESTION_LEVEL_MEDIUM",
						occupancyStatus: "FEW_SEATS_AVAILABLE",
						updatedOffset: 20,
					},
					{
						routeId: "Werribee",
						latitude: -37.8353,
						longitude: 144.9554,
						bearing: 250,
						speed: 18.6,
						congestionLevel: "CONGESTION_LEVEL_HIGH",
						occupancyStatus: "STANDING_ROOM_ONLY",
						updatedOffset: 35,
					},
					{
						routeId: "Frankston",
						latitude: -37.9061,
						longitude: 145.0278,
						bearing: 150,
						speed: 19.4,
						congestionLevel: "CONGESTION_LEVEL_MEDIUM",
						occupancyStatus: "FEW_SEATS_AVAILABLE",
						updatedOffset: 30,
					},
					{
						routeId: "Craigieburn",
						latitude: -37.7441,
						longitude: 144.9442,
						bearing: 15,
						speed: 21.8,
						congestionLevel: "CONGESTION_LEVEL_LOW",
						occupancyStatus: "MANY_SEATS_AVAILABLE",
						updatedOffset: 28,
					},
					{
						routeId: "Mernda",
						latitude: -37.6899,
						longitude: 145.0175,
						bearing: 20,
						speed: 17.2,
						congestionLevel: "CONGESTION_LEVEL_LOW",
						occupancyStatus: "MANY_SEATS_AVAILABLE",
						updatedOffset: 42,
					},
					{
						routeId: "Sunbury",
						latitude: -37.7242,
						longitude: 144.7951,
						bearing: 265,
						speed: 22.5,
						congestionLevel: "CONGESTION_LEVEL_MEDIUM",
						occupancyStatus: "FEW_SEATS_AVAILABLE",
						updatedOffset: 24,
					},
					{
						routeId: "Pakenham",
						latitude: -37.8212,
						longitude: 145.2331,
						bearing: 105,
						speed: 23.7,
						congestionLevel: "CONGESTION_LEVEL_HIGH",
						occupancyStatus: "STANDING_ROOM_ONLY",
						updatedOffset: 55,
					},
					{
						routeId: "Lilydale",
						latitude: -37.8154,
						longitude: 145.3524,
						bearing: 95,
						speed: 20.1,
						congestionLevel: "CONGESTION_LEVEL_LOW",
						occupancyStatus: "MANY_SEATS_AVAILABLE",
						updatedOffset: 38,
					},
				];

		return {
			...base,
			entity: vehicles.map((vehicle, index) => {
				const trip = { routeId: vehicle.routeId };
				if (vehicle.directionId === 0 || vehicle.directionId === 1) {
					trip.directionId = vehicle.directionId;
				}
				const updatedOffset = Number.isFinite(vehicle.updatedOffset)
					? vehicle.updatedOffset
					: 0;
				return {
					id: `${isBus ? "bus" : "metro"}-vehicle-${index + 1}`,
					vehicle: {
						trip,
						position: {
							latitude: vehicle.latitude,
							longitude: vehicle.longitude,
							bearing: vehicle.bearing,
							speed: vehicle.speed,
						},
						congestionLevel: vehicle.congestionLevel,
						occupancyStatus: vehicle.occupancyStatus,
						timestamp: String(now - updatedOffset),
					},
				};
			}),
		};
	}

	const trips = isBus
		? [
				{
					tripId: "246-07",
					routeId: "246",
					stopId: "ELSTERNWICK",
					arrivalOffset: 420,
					departureOffset: 480,
					delay: 120,
				},
				{
					tripId: "250-13",
					routeId: "250",
					stopId: "LA_TROBE",
					arrivalOffset: 300,
					departureOffset: 360,
					delay: -60,
				},
				{
					tripId: "401-02",
					routeId: "401",
					stopId: "PARKVILLE",
					arrivalOffset: 180,
					departureOffset: 240,
					delay: 90,
				},
				{
					tripId: "903-18",
					routeId: "903",
					stopId: "MENTONE",
					arrivalOffset: 600,
					departureOffset: 660,
					delay: 0,
				},
			]
		: [
				{
					tripId: "WRB-21",
					routeId: "Werribee",
					stopId: "FOOTSCRAY",
					arrivalOffset: 240,
					departureOffset: 300,
					delay: 180,
				},
				{
					tripId: "FRN-05",
					routeId: "Frankston",
					stopId: "CAULFIELD",
					arrivalOffset: 420,
					departureOffset: 480,
					delay: 60,
				},
				{
					tripId: "CRB-11",
					routeId: "Craigieburn",
					stopId: "NORTH_MELB",
					arrivalOffset: 360,
					departureOffset: 420,
					delay: -30,
				},
				{
					tripId: "MRN-09",
					routeId: "Mernda",
					stopId: "CLIFTON_HILL",
					arrivalOffset: 540,
					departureOffset: 600,
					delay: 0,
				},
			];

	return {
		...base,
		entity: trips.map((trip, index) => ({
			id: `${isBus ? "bus" : "metro"}-trip-${index + 1}`,
			tripUpdate: {
				trip: {
					tripId: trip.tripId,
					routeId: trip.routeId,
				},
				stopTimeUpdate: [
					{
						stopId: trip.stopId,
						arrival: { time: String(now + trip.arrivalOffset) },
						departure: { time: String(now + trip.departureOffset) },
					},
				],
				delay: trip.delay,
			},
		})),
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

const sidebarToggle = document.getElementById("sidebar-toggle");
if (sidebarToggle) {
	const isClosed = localStorage.getItem("sidebar-closed") === "true";
	if (isClosed) document.body.classList.add("sidebar-closed");

	sidebarToggle.addEventListener("click", () => {
		const closed = document.body.classList.toggle("sidebar-closed");
		localStorage.setItem("sidebar-closed", closed);
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
