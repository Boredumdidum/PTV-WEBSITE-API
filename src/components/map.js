import {
	DEFAULT_MAP_CENTER,
	DEFAULT_MAP_ZOOM,
	VICTORIA_BOUNDS,
	VEHICLE_FEEDS,
	FEED_COLORS,
	ROUTE_LINE_COLORS,
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
const LINE_CHUNK_CACHE = new Map();
let routeNames = null;
export { routeNames };

export async function fetchRouteNames(routeType) {
	try {
		const res = await fetch(`/api/timetable/v3/routes?route_types=${routeType}`);
		if (!res.ok) return;
		const data = await res.json();
		const map = new Map();
		for (const r of data.routes || []) {
			const id = r.route_gtfs_id || String(r.route_id);
			const label = `${r.route_number || ""} ${r.route_name || ""}`.trim();
			if (id && label) map.set(id, label);
		}
		routeNames = map;
	} catch {
		/* ignore */
	}
}
let stopMarkerLayer = null;
let routeStopLayer = null;
let lineIndex = null;
let lineIndexPromise = null;
let pendingMapCenter = null;
let pendingStopName = null;
let pendingRouteStops = null;

export function setMapCenter(lat, lng, stopName) {
	pendingMapCenter = [lat, lng];
	pendingStopName = stopName || null;
}

export function setRouteStops(routeType, routeId) {
	pendingRouteStops = { routeType, routeId };
}

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
	stopMarkerLayer = L.layerGroup().addTo(mapInstance);
	routeStopLayer = L.layerGroup().addTo(mapInstance);
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

function getFeatureDirectionTag(feature) {
	const props = feature && feature.properties ? feature.properties : null;
	if (!props) {
		return "";
	}
	const headsign = normalizeRouteValue(props.HEADSIGN);
	if (headsign) {
		return `headsign:${headsign}`;
	}
	const shapeId = props.SHAPE_ID ? String(props.SHAPE_ID) : "";
	if (!shapeId) {
		return "";
	}
	const directionMatch = shapeId.match(/\.([12])\./);
	if (directionMatch) {
		return `shape:${directionMatch[1]}`;
	}
	const suffix = shapeId.split(".").pop();
	if (suffix && suffix.length <= 2) {
		return `shape:${suffix.toLowerCase()}`;
	}
	return "";
}

function splitFeaturesByDirection(features) {
	const buckets = new Map();
	features.forEach((feature) => {
		const tag = getFeatureDirectionTag(feature) || "unknown";
		if (!buckets.has(tag)) {
			buckets.set(tag, []);
		}
		buckets.get(tag).push(feature);
	});
	const ordered = [...buckets.values()].sort((a, b) => b.length - a.length);
	const primary = ordered[0] || [];
	const secondary = ordered.slice(1).flat();
	return { primary, secondary };
}

function drawRouteLines(features, color, options = {}) {
	if (!routeLayer || !features.length) {
		return;
	}
	L.geoJSON(
		{ type: "FeatureCollection", features },
		{
			style: {
				color,
				weight: 4,
				opacity: 0.9,
				lineJoin: "round",
				lineCap: "round",
				dashArray: options.dashArray || null,
				dashOffset: options.dashOffset || null,
			},
		},
	).addTo(routeLayer);
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
	const { primary, secondary } = splitFeaturesByDirection(features);
	const hasBothDirections = primary.length && secondary.length;
	const dashArray = hasBothDirections ? "10 10" : null;
	drawRouteLines(primary, ROUTE_LINE_COLORS[0], { dashArray, dashOffset: "0" });
	if (secondary.length) {
		drawRouteLines(secondary, ROUTE_LINE_COLORS[1], { dashArray, dashOffset: hasBothDirections ? "10" : "0" });
	}
	return true;
}

function resolveSelectedRouteId(entities, query) {
	const normalizedQuery = normalizeBusRoute(query);
	if (!normalizedQuery) {
		return "";
	}

	const lowerQuery = query.trim().toLowerCase();

	for (const entity of entities) {
		const routes = getEntityRouteIds(entity);
		for (const route of routes) {
			const normalized = normalizeBusRoute(route);
			if (normalized.includes(normalizedQuery) || normalizedQuery.includes(normalized)) {
				return route;
			}
			const name = routeNames?.get(route);
			if (name && name.toLowerCase().includes(lowerQuery)) {
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

export async function updateMap(feed, entities, routeQuery) {
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
	if (stopMarkerLayer) {
		stopMarkerLayer.clearLayers();
	}
	if (routeStopLayer) {
		routeStopLayer.clearLayers();
	}
	const currentRouteRequestId = ++routeRequestId;

	const busMode = isBusFeed(feed);
	const isTrainFeed = feed === "metro-vehicle-positions";
	const routeType = busMode ? 2 : isTrainFeed ? 0 : 0;
	await fetchRouteNames(routeType);

	const normalizedRouteQuery = routeQuery ? routeQuery.trim() : "";
	const canResolveRoute = busMode || isTrainFeed;
	const selectedRouteId = canResolveRoute ? resolveSelectedRouteId(entities, normalizedRouteQuery) : "";
	const shouldDrawRoute = Boolean(selectedRouteId && routeLayer && normalizedRouteQuery);
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
		if (pendingMapCenter) {
			const [lat, lng] = pendingMapCenter;
			const stopName = pendingStopName;
			pendingMapCenter = null;
			pendingStopName = null;
			mapInstance.setView([lat, lng], 15);
			drawStopMarker(lat, lng, stopName);
		} else {
			mapInstance.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
		}
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

		loadAndDrawRouteStops(routeType, selectedRouteId, currentRouteRequestId);
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
		const title = routeId ? displayRouteName(routeId, busMode, routeNames) : vehicleType;
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
			if (routeSearchInput) {
				routeSearchInput.value = routeId;
			}
		});
		marker.bindPopup(popupContent);
		marker.addTo(markerLayer);
		bounds.push([item.latitude, item.longitude]);
	});

	if (pendingMapCenter) {
		const [lat, lng] = pendingMapCenter;
		const stopName = pendingStopName;
		pendingMapCenter = null;
		pendingStopName = null;
		mapInstance.setView([lat, lng], 15);
		drawStopMarker(lat, lng, stopName);
	} else {
		mapInstance.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
	}
}

function getMockRouteStops(routeType, routeId) {
	const key = `${routeType}:${routeId}`;
	const mock = {
		"0:Werribee": [
			{ stop_name: "Flinders Street Station", stop_latitude: -37.8183, stop_longitude: 144.9671, direction_id: 1 },
			{ stop_name: "Southern Cross Station", stop_latitude: -37.8181, stop_longitude: 144.9526, direction_id: 1 },
			{ stop_name: "Richmond Station", stop_latitude: -37.8237, stop_longitude: 144.9897, direction_id: 0 },
		],
		"0:Craigieburn": [
			{ stop_name: "Flinders Street Station", stop_latitude: -37.8183, stop_longitude: 144.9671, direction_id: 0 },
			{ stop_name: "Southern Cross Station", stop_latitude: -37.8181, stop_longitude: 144.9526, direction_id: 0 },
		],
		"1:75": [
			{ stop_name: "Stop 28: Auburn Rd", stop_latitude: -37.8294, stop_longitude: 145.0451, direction_id: 0 },
			{ stop_name: "Stop 20: Burke Rd", stop_latitude: -37.8342, stop_longitude: 145.0568, direction_id: 1 },
		],
		"2:246": [
			{ stop_name: "Elsternwick Station", stop_latitude: -37.8845, stop_longitude: 144.9982, direction_id: 0 },
			{ stop_name: "St Kilda Station", stop_latitude: -37.8677, stop_longitude: 144.9774, direction_id: 1 },
		],
	};
	return mock[key] || null;
}

async function loadAndDrawRouteStops(routeType, selectedRouteId, requestId) {
	if (!routeStopLayer || !mapInstance) return;
	const routeId = pendingRouteStops ? pendingRouteStops.routeId : selectedRouteId;
	if (!routeId) return;
	pendingRouteStops = null;
	let stops;
	const mockToggle = document.getElementById("mock");
	if (mockToggle && mockToggle.checked) {
		stops = getMockRouteStops(routeType, routeId);
	} else {
		try {
			const res = await fetch(`/api/timetable/v3/stops/route_type/${routeType}/route/${encodeURIComponent(routeId)}`);
			if (!res.ok) return;
			if (requestId !== routeRequestId) return;
			const data = await res.json();
			stops = data.stops || [];
		} catch {
			return;
		}
	}
	if (!stops || !stops.length) return;
	try {
		const size = 10;
		const icons = {
			0: L.divIcon({
				className: "",
				html: `<svg width="${size * 2}" height="${size * 2 + 4}" viewBox="0 0 ${size * 2} ${size * 2 + 4}" xmlns="http://www.w3.org/2000/svg">
					<polygon points="${size},0 ${size * 2},${size * 2} 0,${size * 2}" fill="#0f5b61" stroke="#fff" stroke-width="1.5"/>
				</svg>`,
				iconSize: [size * 2, size * 2 + 4],
				iconAnchor: [size, size * 2 + 4],
			}),
			1: L.divIcon({
				className: "",
				html: `<svg width="${size * 2}" height="${size * 2 + 4}" viewBox="0 0 ${size * 2} ${size * 2 + 4}" xmlns="http://www.w3.org/2000/svg">
					<polygon points="${size},0 ${size * 2},${size * 2} 0,${size * 2}" fill="#ff922b" stroke="#fff" stroke-width="1.5"/>
				</svg>`,
				iconSize: [size * 2, size * 2 + 4],
				iconAnchor: [size, size * 2 + 4],
			}),
		};
		stops.forEach((s) => {
			const dir = s.direction_id === 1 ? 1 : 0;
			const lat = Number(s.stop_latitude);
			const lng = Number(s.stop_longitude);
			if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
			L.marker([lat, lng], {
				icon: icons[dir],
				zIndexOffset: 500,
			}).bindPopup(`<strong>${escapeHTML(s.stop_name || "")}</strong>`).addTo(routeStopLayer);
		});
	} catch {
		/* ignore */
	}
}

function drawStopMarker(lat, lng, name) {
	if (!stopMarkerLayer || !mapInstance) return;
	const size = 14;
	const icon = L.divIcon({
		className: "",
		html: `<svg width="${size * 2}" height="${size * 2 + 6}" viewBox="0 0 ${size * 2} ${size * 2 + 6}" xmlns="http://www.w3.org/2000/svg">
			<polygon points="${size},0 ${size * 2},${size * 2} 0,${size * 2}" fill="#e74c3c" stroke="#fff" stroke-width="2"/>
			<line x1="${size}" y1="0" x2="${size}" y2="${size}" stroke="#fff" stroke-width="2"/>
		</svg>`,
		iconSize: [size * 2, size * 2 + 6],
		iconAnchor: [size, size * 2 + 6],
		popupAnchor: [0, -(size * 2 + 6)],
	});
	const marker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(stopMarkerLayer);
	if (name) {
		marker.bindPopup(`<strong>${name}</strong>`);
	}
}
