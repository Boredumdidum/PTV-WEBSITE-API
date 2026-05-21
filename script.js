const feedSelect = document.getElementById("feed");
const loadButton = document.getElementById("load");
const mockToggle = document.getElementById("mock");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const updatedEl = document.getElementById("updated");
const countEl = document.getElementById("count");
const previewEl = document.getElementById("preview");

function setStatus(state, text) {
	statusEl.dataset.state = state;
	statusEl.textContent = text;
}

function setError(message) {
	errorEl.textContent = message || "";
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

function applyData(data, isMock) {
	const entities = Array.isArray(data.entity) ? data.entity : [];

	const timestampRaw = data.header && data.header.timestamp ? data.header.timestamp : null;
	const timestamp = timestampRaw ? Number(timestampRaw) : 0;
	const formattedTime = timestamp ? new Date(timestamp * 1000).toLocaleString() : "Unknown";

	updatedEl.textContent = formattedTime;
	countEl.textContent = `${entities.length}`;
	previewEl.textContent = JSON.stringify(entities.slice(0, 5), null, 2) || "No entities";
	setStatus("ok", isMock ? "Mock" : "OK");
}

async function loadFeed() {
	const feed = feedSelect.value;
	setStatus("loading", "Loading");
	setError("");
	previewEl.textContent = "Fetching feed...";

	if (mockToggle && mockToggle.checked) {
		const data = buildMockData(feed);
		applyData(data, true);
		return;
	}

	try {
		const response = await fetch(`/api/gtfs?feed=${encodeURIComponent(feed)}&limit=10`);
		if (!response.ok) {
			throw new Error(`Request failed (${response.status})`);
		}

		const data = await response.json();
		applyData(data, false);
	} catch (error) {
		setStatus("error", "Error");
		setError(error.message || "Something went wrong.");
		previewEl.textContent = "No data";
		updatedEl.textContent = "-";
		countEl.textContent = "-";
	}
}

loadButton.addEventListener("click", loadFeed);
feedSelect.addEventListener("change", loadFeed);
if (mockToggle) {
	mockToggle.addEventListener("change", loadFeed);
}

loadFeed();
