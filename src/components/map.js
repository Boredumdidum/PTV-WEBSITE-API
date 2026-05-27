import {
	DEFAULT_MAP_CENTER,
	DEFAULT_MAP_ZOOM,
	VICTORIA_BOUNDS,
	VEHICLE_FEEDS,
	FEED_COLORS,
	ROUTE_LINE_COLORS,
	ROUTE_SERVICE_URL,
	MAX_ROUTE_POINTS,
	LINE_INDEX_URL,
	LINE_DATA_BASE,
} from "../constants.js";
import { escapeHTML, formatTimestamp, formatSpeed, formatEnum, displayRouteName } from "../utils/format.js";
import { setMapMessage, setMapHint } from "../utils/dom.js";

let mapInstance = null;
export { mapInstance };
let markerLayer = null;
let routeLayer = null;
let routeRequestId = 0;
const ROUTE_CACHE = new Map();
const LINE_CHUNK_CACHE = new Map();
let lineIndex = null;
let lineIndexPromise = null;

export function isVehicleFeed(feed) {
	return VEHICLE_FEEDS.has(feed);
}

export function isBusFeed(feed) {
	return typeof feed === "string" && feed.startsWith("bus-");
}

export function initMap() {
	const mapEl = document.getElementById("map");
	if (!mapEl || mapInstance) {
		return;
	}

	if (typeof L === "undefined") {
		setMapMessage("Map library failed to load.");
		return;
	}

	mapInstance = L.map(mapEl, {
		scrollWheelZoom: true,
		zoomControl: false,
		maxBounds: VICTORIA_BOUNDS,
		maxBoundsViscosity: 1,
		minZoom: 7,
	}).setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);

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

export function getDirectionKey(item) {
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

	return items.slice().sort((a, b) => (sortByLongitude ? a.longitude - b.longitude : a.latitude - b.latitude));
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
	if (!parts.length) {
		return normalized;
	}
	const withDigits = parts.find((part) => /\d/.test(part));
	return withDigits || parts[parts.length - 1];
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
	const candidates = index.chunks.filter((chunk) => bboxIntersects(chunk.bbox, bounds));
	if (!candidates.length) {
		return false;
	}
	const chunkData = await Promise.all(candidates.map((chunk) => loadLineChunk(chunk.file)));
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
		},
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
	return points.map((point) => `${point[0].toFixed(5)},${point[1].toFixed(5)}`).join("|");
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

	const coordString = sampled.map((point) => `${point[1]},${point[0]}`).join(";");
	const url = `${ROUTE_SERVICE_URL}${coordString}?overview=full&geometries=geojson`;

	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error("Routing failed");
		}

		const data = await response.json();
		const coords =
			data && data.routes && data.routes[0] && data.routes[0].geometry ? data.routes[0].geometry.coordinates : null;
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
	const normalizedQuery = normalizeBusRoute(query);
	if (!normalizedQuery) {
		return "";
	}

	for (const entity of entities) {
		const routes = getEntityRouteIds(entity);
		for (const route of routes) {
			if (normalizeBusRoute(route) === normalizedQuery) {
				return route;
			}
		}
	}

	return "";
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

export function updateMap(feed, entities, routeQuery) {
	const mapEl = document.getElementById("map");
	const routeSearchInput = document.getElementById("route-search");

	if (!mapEl) {
		return;
	}

	if (typeof L === "undefined") {
		setMapMessage("Map library failed to load.");
		return;
	}

	const showVehicles = isVehicleFeed(feed);

	if (!showVehicles) {
		if (markerLayer) markerLayer.clearLayers();
		if (routeLayer) routeLayer.clearLayers();
		setMapMessage("Select a vehicle positions feed to see markers.");
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

	const busMode = isBusFeed(feed);
	const normalizedRouteQuery = routeQuery ? routeQuery.trim() : "";
	const selectedRouteId = busMode ? resolveSelectedRouteId(entities, normalizedRouteQuery) : "";
	const shouldDrawRoute = Boolean(busMode && normalizedRouteQuery && selectedRouteId && routeLayer);
	setMapHint(shouldDrawRoute ? "Route line loading..." : "");
	markerLayer.clearLayers();

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
			hasFilter ? "No vehicle positions match that route." : "No vehicle positions available in this response.",
		);
		mapInstance.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
		return;
	}

	setMapMessage("");
	const markerColor = FEED_COLORS[feed] || "#0f5b61";
	const bounds = [];

	if (shouldDrawRoute) {
		setMapHint(`Route ${selectedRouteId}: loading line data`);

		const directionBuckets = {
			0: [],
			1: [],
		};

		positions.forEach((item) => {
			const routeId = (item.vehicle.trip && item.vehicle.trip.routeId) || "";
			if (String(routeId).toLowerCase() !== String(selectedRouteId).toLowerCase()) {
				return;
			}
			const directionKey = getDirectionKey(item);
			const key = directionKey === 1 ? 1 : 0;
			directionBuckets[key].push(item);
		});

		void drawBusRouteFromLines(selectedRouteId, currentRouteRequestId).then((drawn) => {
			if (currentRouteRequestId !== routeRequestId) {
				return;
			}
			if (drawn) {
				setMapHint(`Route ${selectedRouteId}: line from GTFS shapes`);
			} else {
				setMapHint(`Route ${selectedRouteId}: no GTFS line found`);
			}
		});
	}

	positions.forEach((item) => {
		const rawRouteId = item.vehicle.trip && item.vehicle.trip.routeId;
		const routeId = rawRouteId ? String(rawRouteId) : "";
		const updated = formatTimestamp(item.vehicle.timestamp);
		const speed = formatSpeed(item.position.speed);
		const occupancy = formatEnum(item.vehicle.occupancyStatus);
		const congestion = formatEnum(item.vehicle.congestionLevel);
		const direction = getDirectionKey(item);
		const directionLabel = busMode
			? direction === 1
				? "City bound"
				: "Outbound"
			: direction === 1
				? "City bound"
				: "Flinders St bound";

		const vehicleType = busMode ? "Bus" : "Train";
		const title = routeId ? displayRouteName(routeId, busMode) : vehicleType;
		const popupHtml =
			"<strong>" +
			title +
			"</strong><br />" +
			vehicleType +
			" - " +
			directionLabel +
			"<br />" +
			"Updated " +
			escapeHTML(updated);
		const extraLines = [];

		if (speed) {
			extraLines.push("Speed: " + escapeHTML(speed));
		}
		if (occupancy) {
			extraLines.push("Occupancy: " + escapeHTML(occupancy));
		}
		if (congestion) {
			extraLines.push("Congestion: " + escapeHTML(congestion));
		}
		const popupContent = extraLines.length ? popupHtml + "<br />" + extraLines.join("<br />") : popupHtml;

		const marker = L.circleMarker([item.latitude, item.longitude], {
			radius: 7,
			color: markerColor,
			fillColor: markerColor,
			fillOpacity: 0.85,
			weight: 2,
		});
		marker.on("click", () => {
			if (busMode && routeSearchInput) {
				routeSearchInput.value = routeId;
			}
		});
		marker.bindPopup(popupContent);
		marker.addTo(markerLayer);
		bounds.push([item.latitude, item.longitude]);
	});

	mapInstance.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
}
