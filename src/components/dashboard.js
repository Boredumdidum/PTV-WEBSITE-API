import { updateMap, mapInstance } from "./map.js";

let lastPayload = null;
let lastFeed = null;
let lastIsMock = false;

export { lastPayload, lastFeed, lastIsMock };

export function filterEntitiesByRoute(entities, query) {
	const trimmed = query ? query.trim().toLowerCase() : "";
	if (!trimmed) {
		return entities;
	}

	return entities.filter((entity) => {
		const routes = getEntityRouteIds(entity);
		return routes.some((route) => String(route).toLowerCase().includes(trimmed));
	});
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

export function applyData(data, isMock, feed) {
	const entities = Array.isArray(data.entity) ? data.entity : [];
	const routeSearchInput = document.getElementById("route-search");
	const routeQuery = routeSearchInput ? routeSearchInput.value.trim() : "";
	const filteredEntities = filterEntitiesByRoute(entities, routeQuery);

	lastPayload = data;
	lastFeed = feed;
	lastIsMock = isMock;

	const updatedEl = document.getElementById("updated");
	const countEl = document.getElementById("count");
	const previewEl = document.getElementById("preview");

	const timestampRaw = data.header && data.header.timestamp ? data.header.timestamp : null;
	const timestamp = timestampRaw ? Number(timestampRaw) : 0;
	const formattedTime = timestamp ? new Date(timestamp * 1000).toLocaleString() : "Unknown";

	if (updatedEl) updatedEl.textContent = formattedTime;
	if (countEl) countEl.textContent = `${filteredEntities.length}`;
	if (previewEl) {
		previewEl.textContent = filteredEntities.length
			? JSON.stringify(filteredEntities.slice(0, 5), null, 2)
			: routeQuery
				? "No entities match that route."
				: "No entities";
	}
	setStatus("ok", isMock ? "Mock" : "OK");
	updateMap(feed, filteredEntities, routeQuery);
}

export async function loadFeed() {
	const feedSelect = document.getElementById("feed");
	const mockToggle = document.getElementById("mock");
	const previewEl = document.getElementById("preview");
	const updatedEl = document.getElementById("updated");
	const countEl = document.getElementById("count");

	const feed = feedSelect.value;
	setStatus("loading", "Loading");
	setError("");
	if (previewEl) previewEl.textContent = "Fetching feed...";
	setMapMessage("Loading feed data...");

	if (mockToggle && mockToggle.checked) {
		const data = buildMockData(feed);
		applyData(data, true, feed);
		return;
	}

	try {
		const response = await fetch(
			`/api/gtfs?feed=${encodeURIComponent(feed)}&limit=200`
		);
		if (!response.ok) {
			const body = await response.json().catch(() => ({}));
			throw new Error(body.error || `Request failed (${response.status})`);
		}

		const data = await response.json();
		applyData(data, false, feed);
	} catch (error) {
		setStatus("error", "Error");
		setError(error.message || "Something went wrong.");
		if (previewEl) previewEl.textContent = "No data";
		if (updatedEl) updatedEl.textContent = "-";
		if (countEl) countEl.textContent = "-";
		setMapMessage("No data");
		lastPayload = null;
		lastFeed = null;
		lastIsMock = false;
	}
}

export function initNavigation() {
	const navButtons = document.querySelectorAll(".nav-btn");
	const panels = document.querySelectorAll(".panel");

	function activateButton(button) {
		navButtons.forEach((btn) => {
			btn.classList.remove("active");
			btn.setAttribute("aria-selected", "false");
			btn.setAttribute("tabindex", "-1");
		});
		panels.forEach((panel) => panel.classList.remove("active"));
		button.classList.add("active");
		button.setAttribute("aria-selected", "true");
		button.setAttribute("tabindex", "0");

		const targetId = button.dataset.panel;
		const targetPanel = targetId ? document.getElementById(targetId) : null;
		if (targetPanel) {
			targetPanel.classList.add("active");
		}

		const mapEl = document.getElementById("map");
		if (targetPanel && mapEl && targetPanel.contains(mapEl) && mapInstance) {
			setTimeout(() => mapInstance.invalidateSize(), 0);
		}
	}

	navButtons.forEach((button, index) => {
		button.addEventListener("click", () => activateButton(button));

		button.addEventListener("keydown", (event) => {
			if (event.key === "ArrowDown" || event.key === "ArrowRight") {
				event.preventDefault();
				const next = navButtons[(index + 1) % navButtons.length];
				next.focus();
				activateButton(next);
			} else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
				event.preventDefault();
				const prev = navButtons[(index - 1 + navButtons.length) % navButtons.length];
				prev.focus();
				activateButton(prev);
			}
		});
	});
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
