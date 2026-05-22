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

const DEFAULT_MAP_CENTER = [-37.8136, 144.9631];
const DEFAULT_MAP_ZOOM = 11;
const VEHICLE_FEEDS = new Set(["metro-vehicle-positions", "bus-vehicle-positions"]);
const FEED_COLORS = {
	"metro-vehicle-positions": "#0f5b61",
	"bus-vehicle-positions": "#e27d60",
};

let mapInstance = null;
let markerLayer = null;

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

function escapeHtml(value) {
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#39;");
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
	}).addTo(mapInstance);

	markerLayer = L.layerGroup().addTo(mapInstance);
	setTimeout(() => mapInstance.invalidateSize(), 0);
}

function updateMap(feed, entities) {
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

	const showVehicles = isVehicleFeed(feed);
	setMapHint(showVehicles ? "Vehicle positions only" : "Select a vehicle positions feed");

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

	if (positions.length === 0) {
		setMapMessage("No vehicle positions available in this response.");
		mapInstance.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
		return;
	}

	setMapMessage("");
	const markerColor = FEED_COLORS[feed] || "#0f5b61";
	const bounds = [];

	positions.forEach((item) => {
		const routeId =
			(item.vehicle.trip && item.vehicle.trip.routeId) || "Unknown route";
		const updated = formatTimestamp(item.vehicle.timestamp);
		const speed = formatSpeed(item.position.speed);
		const occupancy = formatEnum(item.vehicle.occupancyStatus);
		const congestion = formatEnum(item.vehicle.congestionLevel);

		const popupLines = [
			`<strong>${escapeHtml(routeId)}</strong>`,
			`Updated: ${escapeHtml(updated)}`,
		];
		if (speed) {
			popupLines.push(`Speed: ${escapeHtml(speed)}`);
		}
		if (occupancy) {
			popupLines.push(`Occupancy: ${escapeHtml(occupancy)}`);
		}
		if (congestion) {
			popupLines.push(`Congestion: ${escapeHtml(congestion)}`);
		}

		const marker = L.circleMarker([item.latitude, item.longitude], {
			radius: 7,
			color: markerColor,
			fillColor: markerColor,
			fillOpacity: 0.85,
			weight: 2,
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

	const timestampRaw = data.header && data.header.timestamp ? data.header.timestamp : null;
	const timestamp = timestampRaw ? Number(timestampRaw) : 0;
	const formattedTime = timestamp ? new Date(timestamp * 1000).toLocaleString() : "Unknown";

	updatedEl.textContent = formattedTime;
	countEl.textContent = `${entities.length}`;
	previewEl.textContent = JSON.stringify(entities.slice(0, 5), null, 2) || "No entities";
	setStatus("ok", isMock ? "Mock" : "OK");
	updateMap(feed, entities);
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
	}
}

loadButton.addEventListener("click", loadFeed);
feedSelect.addEventListener("change", loadFeed);
if (mockToggle) {
	mockToggle.addEventListener("change", loadFeed);
}

loadFeed();
