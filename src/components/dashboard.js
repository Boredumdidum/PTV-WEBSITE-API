import { setStatus, setError, setMapMessage } from "../utils/dom.js";
import { updateMap, mapInstance } from "./map.js";
import { displayRouteName, escapeHTML } from "../utils/format.js";

let lastPayload = null;
let lastFeed = null;
let lastIsMock = false;

let autoRefreshTimer = null;
let autoCountdownTimer = null;
let secondsUntilRefresh = 0;
let lastAlertEntities = [];

export { lastPayload, lastFeed, lastIsMock };

const AUTO_REFRESH_MS = 30000;
const ALERTS_FEED = "metro-service-alerts";

function updateCountdownDisplay() {
	const el = document.getElementById("countdown");
	if (!el) return;
	if (secondsUntilRefresh > 0) {
		el.textContent = `Next refresh in ${secondsUntilRefresh}s`;
	} else {
		el.textContent = "";
	}
}

function severityClass(effect) {
	const map = {
		DELAY: "alert-severity-delay",
		DETOUR: "alert-severity-detour",
		SUSPENSION: "alert-severity-suspension",
		MODIFIED_SERVICE: "alert-severity-detour",
	};
	return map[effect] || "alert-severity-info";
}

function formatActivePeriod(period) {
	if (!period || (!period.start && !period.end)) return "";
	const start = period.start ? new Date(Number(period.start) * 1000).toLocaleString() : "now";
	const end = period.end ? new Date(Number(period.end) * 1000).toLocaleString() : "unknown";
	return `${start} — ${end}`;
}

function updateAlerts(entities, options = {}) {
	const listEl = document.getElementById("alerts-list");
	const dashEl = document.getElementById("alerts-dashboard");
	const countEl = document.getElementById("alert-count");
	const subtitleEl = document.getElementById("alert-subtitle");
	const emptyMessage = options.emptyMessage || "No active alerts";
	const subtitle = options.subtitle || "";

	const renderAlerts = (container) => {
		if (!container) return;
		if (!entities.length) {
			container.innerHTML = emptyMessage
				? `<div class="alerts-empty">${escapeHTML(emptyMessage)}</div>`
				: "";
			return;
		}
		container.innerHTML = entities.map((e) => {
			const alert = e.alert || {};
			const header = alert.headerText && alert.headerText.translation && alert.headerText.translation[0]
				? alert.headerText.translation[0].text : "Untitled alert";
			const desc = alert.descriptionText && alert.descriptionText.translation && alert.descriptionText.translation[0]
				? alert.descriptionText.translation[0].text : "";
			const cause = alert.cause || "UNKNOWN";
			const effect = alert.effect || "UNKNOWN";
			const period = alert.activePeriod && alert.activePeriod[0] ? alert.activePeriod[0] : null;
			const routes = alert.informedEntity
				? alert.informedEntity.map((ie) => ie.routeId).filter(Boolean)
				: [];

			return `<div class="alert-card">
				<span class="alert-severity ${severityClass(effect)}">${effect.replace(/_/g, " ")}</span>
				<div class="alert-header">${escapeHTML(header)}</div>
				${desc ? `<p class="alert-description">${escapeHTML(desc)}</p>` : ""}
				<div class="alert-meta">
					${routes.length ? `<span>Routes: ${routes.map((r) => displayRouteName(r)).join(", ")}</span>` : ""}
					<span>Cause: ${cause.replace(/_/g, " ")}</span>
					${period ? `<span>${formatActivePeriod(period)}</span>` : ""}
				</div>
			</div>`;
		}).join("");
	};

	renderAlerts(listEl);
	renderAlerts(dashEl);

	if (!entities.length) {
		if (countEl) countEl.textContent = "";
		if (subtitleEl) subtitleEl.textContent = subtitle || emptyMessage;
		return;
	}

	if (subtitleEl) {
		subtitleEl.textContent = subtitle || `${entities.length} active alert${entities.length > 1 ? "s" : ""}`;
	}
	if (countEl) countEl.textContent = String(entities.length);
}

function getAlertRouteIds(entity) {
	if (!entity || !entity.alert || !Array.isArray(entity.alert.informedEntity)) {
		return [];
	}
	return entity.alert.informedEntity
		.map((info) => info && info.routeId)
		.filter(Boolean);
}

function filterAlertsByRoute(entities, query) {
	const trimmed = query ? query.trim().toLowerCase() : "";
	if (!trimmed) {
		return entities;
	}

	return entities.filter((entity) => {
		const routes = getAlertRouteIds(entity);
		return routes.some((route) => String(route).toLowerCase().includes(trimmed));
	});
}

function getAlertSortValue(entity) {
	const alert = entity && entity.alert ? entity.alert : null;
	const period = alert && Array.isArray(alert.activePeriod) ? alert.activePeriod[0] : null;
	const start = period && period.start ? Number(period.start) : 0;
	const end = period && period.end ? Number(period.end) : 0;
	return (start || end) * 1000;
}

function sortAlerts(entities, order) {
	const sorted = [...entities];
	sorted.sort((a, b) => {
		const ta = getAlertSortValue(a);
		const tb = getAlertSortValue(b);
		if (order === "oldest") {
			return ta - tb;
		}
		return tb - ta;
	});
	return sorted;
}

function applyAlertFilters() {
	const routeInput = document.getElementById("alerts-route");
	const sortSelect = document.getElementById("alerts-sort");
	const routeQuery = routeInput ? routeInput.value.trim() : "";
	const sortOrder = sortSelect ? sortSelect.value : "recent";

	let filtered = filterAlertsByRoute(lastAlertEntities, routeQuery);
	filtered = sortAlerts(filtered, sortOrder);

	const emptyMessage = routeQuery
		? "No alerts match that route."
		: "No active alerts";
	updateAlerts(filtered, { emptyMessage });
}

export async function loadAlerts() {
	updateAlerts([], { emptyMessage: "Loading alerts...", subtitle: "Loading alerts..." });
	try {
		const response = await fetch(`/api/gtfs?feed=${encodeURIComponent(ALERTS_FEED)}&limit=200`);
		if (!response.ok) {
			const body = await response.json().catch(() => ({}));
			throw new Error(body.error || `Request failed (${response.status})`);
		}
		const data = await response.json();
		lastAlertEntities = Array.isArray(data.entity) ? data.entity : [];
		applyAlertFilters();
	} catch (error) {
		lastAlertEntities = [];
		updateAlerts([], {
			emptyMessage: "Failed to load alerts.",
			subtitle: "Service alerts unavailable",
		});
	}
}

export function initAlerts() {
	const routeInput = document.getElementById("alerts-route");
	const sortSelect = document.getElementById("alerts-sort");
	const loadBtn = document.getElementById("load-alerts");

	if (routeInput) routeInput.addEventListener("input", applyAlertFilters);
	if (sortSelect) sortSelect.addEventListener("change", applyAlertFilters);
	if (loadBtn) loadBtn.addEventListener("click", loadAlerts);

	loadAlerts();
}

export function setupAutoRefresh(enabled) {
	clearTimeout(autoRefreshTimer);
	clearInterval(autoCountdownTimer);
	autoRefreshTimer = null;
	autoCountdownTimer = null;

	if (enabled) {
		secondsUntilRefresh = AUTO_REFRESH_MS / 1000;
		updateCountdownDisplay();
		scheduleNextRefresh();
	} else {
		secondsUntilRefresh = 0;
		updateCountdownDisplay();
	}
}

function scheduleNextRefresh() {
	clearInterval(autoCountdownTimer);

	autoRefreshTimer = setTimeout(() => {
		loadFeed();
	}, AUTO_REFRESH_MS);

	autoCountdownTimer = setInterval(() => {
		secondsUntilRefresh--;
		updateCountdownDisplay();
		if (secondsUntilRefresh <= 0) {
			clearInterval(autoCountdownTimer);
		}
	}, 1000);
}

export function resetAutoRefreshCountdown() {
	if (autoRefreshTimer === null) return;
	clearTimeout(autoRefreshTimer);
	clearInterval(autoCountdownTimer);
	secondsUntilRefresh = AUTO_REFRESH_MS / 1000;
	updateCountdownDisplay();
	scheduleNextRefresh();
}

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
	const jsonEl = document.getElementById("preview-json");
	const listEl = document.getElementById("preview-list");
	const statLabelEl = document.getElementById("stat-label");

	const timestampRaw = data.header && data.header.timestamp ? data.header.timestamp : null;
	const timestamp = timestampRaw ? Number(timestampRaw) : 0;
	const formattedTime = timestamp ? new Date(timestamp * 1000).toLocaleString() : "Unknown";

	if (updatedEl) updatedEl.textContent = formattedTime;

	const isTripUpdates = feed.endsWith("-trip-updates");
	const isServiceAlerts = feed.endsWith("-service-alerts");

	if (isTripUpdates) {
		if (statLabelEl) statLabelEl.textContent = "Avg delay";
		const delays = filteredEntities
			.map((e) => e.tripUpdate && e.tripUpdate.delay)
			.filter((d) => d != null);
		const avgDelay = delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 0;
		if (countEl) {
			const mins = Math.abs(Math.round(avgDelay / 60));
			if (avgDelay > 60) {
				countEl.textContent = `+${mins}m`;
				countEl.style.color = "var(--danger)";
			} else if (avgDelay > 0) {
				countEl.textContent = `+${mins}m`;
				countEl.style.color = "#f08c00";
			} else if (avgDelay < 0) {
				countEl.textContent = `-${mins}m`;
				countEl.style.color = "#2b8a3e";
			} else {
				countEl.textContent = "On time";
				countEl.style.color = "";
			}
		}
		if (jsonEl) jsonEl.textContent = "";
		if (listEl) {
			if (!filteredEntities.length) {
				listEl.innerHTML = routeQuery ? "No trip updates match that route." : "No trip updates.";
			} else {
				const rows = filteredEntities.slice(0, 20).map((e) => {
					const tu = e.tripUpdate || {};
					const trip = tu.trip || {};
					const stopTime = (tu.stopTimeUpdate && tu.stopTimeUpdate[0]) || {};
					const delay = tu.delay;
					const arrTime = stopTime.arrival ? new Date(Number(stopTime.arrival.time) * 1000).toLocaleTimeString() : "-";

					let cls = "delay-on-time";
					let text = "On time";
					if (delay > 300) { cls = "delay-major"; text = `${Math.round(delay / 60)}m late`; }
					else if (delay > 60) { cls = "delay-minor"; text = `${Math.round(delay / 60)}m late`; }
					else if (delay < -60) { text = `${Math.round(Math.abs(delay) / 60)}m early`; }
					else if (delay < 0) { text = `${Math.abs(delay)}s early`; }
					else if (delay > 0) { text = `${delay}s`; }

					return `<tr><td>${displayRouteName(trip.routeId || "?")}</td><td>${escapeHTML(trip.tripId || "?")}</td><td>${escapeHTML(stopTime.stopId || "?")}</td><td>${arrTime}</td><td><span class="delay-badge ${cls}">${text}</span></td></tr>`;
				}).join("");
				listEl.innerHTML = `<table><thead><tr><th>Route</th><th>Trip</th><th>Stop</th><th>Scheduled</th><th>Delay</th></tr></thead><tbody>${rows}</tbody></table>`;
			}
		}
	} else if (isServiceAlerts) {
		if (statLabelEl) statLabelEl.textContent = "Active alerts";
		if (countEl) {
			countEl.textContent = `${filteredEntities.length}`;
			countEl.style.color = filteredEntities.length > 0 ? "var(--danger)" : "";
		}
		if (jsonEl) jsonEl.textContent = "";
		if (listEl) listEl.innerHTML = "";
	} else {
		if (statLabelEl) statLabelEl.textContent = "Entities in preview";
		if (listEl) listEl.innerHTML = "";
		if (jsonEl) {
			jsonEl.textContent = filteredEntities.length
				? JSON.stringify(filteredEntities.slice(0, 5), null, 2)
				: routeQuery
					? "No entities match that route."
					: "No entities";
		}
		if (countEl) {
			countEl.textContent = `${filteredEntities.length}`;
			countEl.style.color = "";
		}
	}

	setStatus("ok", isMock ? "Mock" : "OK");
	updateMap(feed, filteredEntities, routeQuery);
}

function setStatCardsLoading(loading) {
	document.querySelectorAll(".stat-card").forEach((el) => {
		el.classList.toggle("loading", loading);
	});
}

function setPreviewLoading(loading) {
	document.querySelectorAll("#preview-json, #preview-list").forEach((el) => {
		if (el) el.classList.toggle("loading", loading);
	});
}

export async function loadFeed() {
	const feedSelect = document.getElementById("feed");
	const mockToggle = document.getElementById("mock");
	const jsonEl = document.getElementById("preview-json");
	const listEl = document.getElementById("preview-list");
	const updatedEl = document.getElementById("updated");
	const countEl = document.getElementById("count");

	const feed = feedSelect.value;
	setStatus("loading", "Loading");
	setError("");
	setStatCardsLoading(true);
	setPreviewLoading(true);
	if (jsonEl) jsonEl.textContent = "Fetching feed...";
	if (listEl) listEl.innerHTML = "";
	setMapMessage("Loading feed data...");

	if (mockToggle && mockToggle.checked) {
		const data = buildMockData(feed);
		applyData(data, true, feed);
		resetAutoRefreshCountdown();
		setStatCardsLoading(false);
		setPreviewLoading(false);
		return;
	}

	try {
		const response = await fetch(`/api/gtfs?feed=${encodeURIComponent(feed)}&limit=200`);
		if (!response.ok) {
			const body = await response.json().catch(() => ({}));
			throw new Error(body.error || `Request failed (${response.status})`);
		}

		const data = await response.json();
		applyData(data, false, feed);
	} catch (error) {
		setStatus("error", "Error");
		setError(error.message || "Something went wrong.");
		if (jsonEl) jsonEl.textContent = "No data";
		if (listEl) listEl.innerHTML = "";
		if (updatedEl) updatedEl.textContent = "-";
		if (countEl) countEl.textContent = "-";
		setMapMessage("No data");
		lastPayload = null;
		lastFeed = null;
		lastIsMock = false;
	}
	setPreviewLoading(false);
	setStatCardsLoading(false);
	resetAutoRefreshCountdown();
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
				const updatedOffset = Number.isFinite(vehicle.updatedOffset) ? vehicle.updatedOffset : 0;
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

	if (feed.endsWith("-service-alerts")) {
		const alerts = isBus
			? [
					{ routeId: "246", cause: "MAINTENANCE", effect: "DELAY", headerText: "Bus route 246 — delays due to road works", descriptionText: "Road works on Dandenong Road are causing delays of up to 15 minutes on route 246 between Elsternwick and St Kilda." },
					{ routeId: "250", cause: "SPECIAL_EVENT", effect: "DETOUR", headerText: "Bus route 250 — detour via La Trobe Street", descriptionText: "Due to the Melbourne Marathon, route 250 will be diverted via La Trobe Street between 6am and 2pm. Passengers should allow extra travel time." },
					{ routeId: "903", cause: "WEATHER", effect: "MODIFIED_SERVICE", headerText: "SmartBus route 903 — reduced frequency", descriptionText: "Due to severe weather conditions, services on route 903 are running at reduced frequency. Expect longer wait times." },
				]
			: [
					{ routeId: "Werribee", cause: "MAINTENANCE", effect: "DETOUR", headerText: "Werribee line — buses replace trains between Newport and Laverton", descriptionText: "Buses are replacing trains on the Werribee line between Newport and Laverton due to planned track maintenance from 8pm to last service." },
					{ routeId: "Frankston", cause: "TECHNICAL_PROBLEM", effect: "DELAY", headerText: "Frankston line — delays of up to 20 minutes", descriptionText: "A signal fault at Caulfield is causing delays of up to 20 minutes on the Frankston line. Services are operating with extended travel times." },
					{ routeId: "Craigieburn", cause: "STRIKE", effect: "SUSPENSION", headerText: "Craigieburn line — services suspended", descriptionText: "Due to industrial action, all services on the Craigieburn line are suspended until further notice. Replacement buses are not available." },
					{ routeId: "Sunbury", cause: "ACCIDENT", effect: "DELAY", headerText: "Sunbury line — major delays due to a police incident", descriptionText: "A police incident near Footscray is causing major delays on the Sunbury line. Trains may be held at platforms or terminated early." },
				];

		return {
			...base,
			entity: alerts.map((alert, index) => ({
				id: `${isBus ? "bus" : "metro"}-alert-${index + 1}`,
				alert: {
					informedEntity: [{ routeId: alert.routeId }],
					headerText: { translation: [{ text: alert.headerText, language: "en" }] },
					descriptionText: { translation: [{ text: alert.descriptionText, language: "en" }] },
					cause: alert.cause,
					effect: alert.effect,
					activePeriod: [{ start: String(now), end: String(now + 7200) }],
				},
			})),
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
