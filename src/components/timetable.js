import { ROUTE_TYPE_TO_FEED } from "../constants.js";
import { setMapCenter, setRouteStops } from "./map.js";
import { updateRouteSearchUI } from "../utils/dom.js";
import { loadFeed } from "./dashboard.js";

const ROUTE_TYPES = {
  0: { name: "Train", icon: "train" },
  1: { name: "Tram", icon: "tram-front" },
  2: { name: "Bus", icon: "bus" },
  3: { name: "V/Line", icon: "train" },
  4: { name: "Night Bus", icon: "bus" },
};

let selectedStop = null;
let lastDisruptions = [];

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
}

function buildMockDisruptions() {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const day = 24 * 60 * 60 * 1000;
  return [
    {
      disruption_id: 1001,
      title: "Werribee Line delays",
      description: "Signal fault near Newport. Expect delays up to 20 minutes.",
      disruption_status: "Current",
      published_on: new Date(now - 2 * hour).toISOString(),
      routes: [{ route_id: 1, route_name: "Werribee", route_type: 0 }],
    },
    {
      disruption_id: 1002,
      title: "Route 75 stop closure",
      description: "Stop 31 (Auburn Rd) closed for roadworks until Friday.",
      disruption_status: "Planned",
      published_on: new Date(now - 6 * hour).toISOString(),
      routes: [{ route_id: 75, route_name: "Route 75", route_type: 1 }],
    },
    {
      disruption_id: 1003,
      title: "Route 246 service changes",
      description: "Short-term detours between Elsternwick and St Kilda.",
      disruption_status: "Current",
      published_on: new Date(now - day).toISOString(),
      routes: [{ route_id: 246, route_name: "Route 246", route_type: 2 }],
    },
    {
      disruption_id: 1004,
      title: "Geelong Line works complete",
      description: "Buses replaced trains overnight. Services now restored.",
      disruption_status: "Past",
      published_on: new Date(now - 3 * day).toISOString(),
      routes: [{ route_id: 1100, route_name: "Geelong", route_type: 3 }],
    },
    {
      disruption_id: 1005,
      title: "Network-wide info",
      description: "Minor delays possible during peak due to signal upgrades.",
      disruption_status: "Current",
      published_on: new Date(now - 4 * hour).toISOString(),
      routes: [],
    },
  ];
}

const MOCK_STOPS = [
  { stop_id: "1000", stop_name: "Flinders Street Station", route_type: 0, suburb: "Melbourne", stop_latitude: -37.8183, stop_longitude: 144.9671 },
  { stop_id: "1001", stop_name: "Southern Cross Station", route_type: 0, suburb: "Melbourne", stop_latitude: -37.8181, stop_longitude: 144.9526 },
  { stop_id: "1002", stop_name: "Richmond Station", route_type: 0, suburb: "Richmond", stop_latitude: -37.8237, stop_longitude: 144.9897 },
  { stop_id: "2001", stop_name: "Stop 28: Auburn Rd", route_type: 1, suburb: "Hawthorn", stop_latitude: -37.8294, stop_longitude: 145.0451, stop_landmark: "Auburn Rd/Hawthorn Rd" },
  { stop_id: "2002", stop_name: "Stop 20: Burke Rd", route_type: 1, suburb: "Camberwell", stop_latitude: -37.8342, stop_longitude: 145.0568, stop_landmark: "Burke Rd/Camberwell Rd" },
  { stop_id: "3001", stop_name: "Elsternwick Station", route_type: 2, suburb: "Elsternwick", stop_latitude: -37.8845, stop_longitude: 144.9982 },
  { stop_id: "3002", stop_name: "St Kilda Station", route_type: 2, suburb: "St Kilda", stop_latitude: -37.8677, stop_longitude: 144.9774 },
];

function getMockDepartures(stop) {
  const now = new Date();
  const addMin = (m) => new Date(now.getTime() + m * 60000).toISOString();
  const addHour = (h) => new Date(now.getTime() + h * 3600000).toISOString();

  if (stop.routeType === 0) {
    return {
      departures: [
        { scheduled_departure_utc: addMin(2), estimated_departure_utc: addMin(3), route_id: "Werribee", run_ref: "run-wer-1", platform_number: "1" },
        { scheduled_departure_utc: addMin(4), estimated_departure_utc: addMin(5), route_id: "Werribee", run_ref: "run-wer-2", platform_number: "2" },
        { scheduled_departure_utc: addMin(7), estimated_departure_utc: addMin(8), route_id: "Craigieburn", run_ref: "run-cra-1", platform_number: "3" },
        { scheduled_departure_utc: addMin(12), estimated_departure_utc: addMin(13), route_id: "Craigieburn", run_ref: "run-cra-2", platform_number: "3" },
        { scheduled_departure_utc: addMin(15), estimated_departure_utc: addMin(16), route_id: "Werribee", run_ref: "run-wer-3", platform_number: "1" },
      ],
      runs: {
        "run-wer-1": { run_id: "wer-1", direction_id: 1 },
        "run-wer-2": { run_id: "wer-2", direction_id: 1 },
        "run-wer-3": { run_id: "wer-3", direction_id: 1 },
        "run-cra-1": { run_id: "cra-1", direction_id: 0 },
        "run-cra-2": { run_id: "cra-2", direction_id: 0 },
      },
      directions: { 0: { direction_name: "Craigieburn", direction_id: 0 }, 1: { direction_name: "Werribee", direction_id: 1 } },
      routes: {
        "Werribee": { route_id: "Werribee", route_name: "Werribee", route_number: "WER" },
        "Craigieburn": { route_id: "Craigieburn", route_name: "Craigieburn", route_number: "CRA" },
      },
      stops: Object.fromEntries(MOCK_STOPS.filter((s) => s.route_type === 0).map((s) => [s.stop_id, s])),
    };
  }

  if (stop.routeType === 1) {
    return {
      departures: [
        { scheduled_departure_utc: addMin(1), estimated_departure_utc: addMin(2), route_id: "75", run_ref: "run-t75-1" },
        { scheduled_departure_utc: addMin(5), estimated_departure_utc: addMin(6), route_id: "75", run_ref: "run-t75-2" },
        { scheduled_departure_utc: addMin(10), estimated_departure_utc: "", route_id: "75", run_ref: "run-t75-3" },
        { scheduled_departure_utc: addMin(12), estimated_departure_utc: addMin(15), route_id: "75", run_ref: "run-t75-4", cancelled: true },
        { scheduled_departure_utc: addMin(18), estimated_departure_utc: addMin(19), route_id: "75", run_ref: "run-t75-5" },
      ],
      runs: {
        "run-t75-1": { run_id: "t75-1", direction_id: 0 },
        "run-t75-2": { run_id: "t75-2", direction_id: 0 },
        "run-t75-3": { run_id: "t75-3", direction_id: 1 },
        "run-t75-4": { run_id: "t75-4", direction_id: 1 },
        "run-t75-5": { run_id: "t75-5", direction_id: 0 },
      },
      directions: { 0: { direction_name: "City", direction_id: 0 }, 1: { direction_name: "Burwood", direction_id: 1 } },
      routes: { "75": { route_id: "75", route_name: "Route 75", route_number: "75" } },
      stops: Object.fromEntries(MOCK_STOPS.filter((s) => s.route_type === 1).map((s) => [s.stop_id, s])),
    };
  }

  return {
    departures: [
      { scheduled_departure_utc: addMin(3), estimated_departure_utc: addMin(4), route_id: "246", run_ref: "run-b246-1" },
      { scheduled_departure_utc: addMin(8), estimated_departure_utc: addMin(9), route_id: "246", run_ref: "run-b246-2" },
      { scheduled_departure_utc: addMin(11), estimated_departure_utc: "", route_id: "246", run_ref: "run-b246-3" },
      { scheduled_departure_utc: addMin(17), estimated_departure_utc: addMin(18), route_id: "246", run_ref: "run-b246-4" },
      { scheduled_departure_utc: addHour(1), estimated_departure_utc: addHour(1), route_id: "246", run_ref: "run-b246-5" },
    ],
    runs: {
      "run-b246-1": { run_id: "b246-1", direction_id: 0 },
      "run-b246-2": { run_id: "b246-2", direction_id: 1 },
      "run-b246-3": { run_id: "b246-3", direction_id: 0 },
      "run-b246-4": { run_id: "b246-4", direction_id: 1 },
      "run-b246-5": { run_id: "b246-5", direction_id: 0 },
    },
    directions: { 0: { direction_name: "Elsternwick", direction_id: 0 }, 1: { direction_name: "St Kilda", direction_id: 1 } },
    routes: { "246": { route_id: "246", route_name: "Route 246", route_number: "246" } },
    stops: Object.fromEntries(MOCK_STOPS.filter((s) => s.route_type === 2).map((s) => [s.stop_id, s])),
  };
}

async function fetchTimetable(path) {
  const response = await fetch(`/api/timetable${path}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response.json();
}

// --- Stop search + departures ---

function initStopSearch() {
  const input = document.getElementById("stop-search");
  const results = document.getElementById("stop-search-results");
  if (!input || !results) return;

  let debounceTimer;
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const term = input.value.trim();
    if (term.length < 2) {
      results.innerHTML = "";
      results.classList.remove("show");
      return;
    }
    debounceTimer = setTimeout(() => searchStops(term, results), 300);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      clearTimeout(debounceTimer);
      const term = input.value.trim();
      if (term.length >= 2) searchStops(term, results);
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".stop-search-wrapper")) {
      results.classList.remove("show");
    }
  });
}

async function searchStops(term, resultsEl) {
  resultsEl.innerHTML = '<div class="search-loading">Searching...</div>';
  resultsEl.classList.add("show");
  try {
    const mockToggle = document.getElementById("mock");
    const data = mockToggle && mockToggle.checked
      ? { stops: MOCK_STOPS.filter((s) => s.stop_name.toLowerCase().includes(term.toLowerCase()) || s.suburb.toLowerCase().includes(term.toLowerCase())) }
      : await fetchTimetable(`/v3/search/${encodeURIComponent(term)}`);
    const stops = data.stops || [];
    if (!stops.length) {
      resultsEl.innerHTML = '<div class="search-empty">No stops found</div>';
      return;
    }
    resultsEl.innerHTML = stops.map((s) => {
      const rtName = ROUTE_TYPES[s.route_type]?.name || `Type ${s.route_type}`;
      return `<button type="button" class="search-result" data-stop-id="${s.stop_id}" data-route-type="${s.route_type}">
        <strong>${escapeHTML(s.stop_name)}</strong>
        <span class="search-result-sub">${rtName} — ${s.suburb || ""} ${s.stop_landmark ? "· " + escapeHTML(s.stop_landmark) : ""}</span>
      </button>`;
    }).join("");
    resultsEl.querySelectorAll(".search-result").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedStop = {
          id: btn.dataset.stopId,
          name: btn.querySelector("strong").textContent,
          routeType: parseInt(btn.dataset.routeType, 10),
        };
        const searchInput = document.getElementById("stop-search");
        if (searchInput) searchInput.value = selectedStop.name;
        resultsEl.classList.remove("show");
        loadDepartures(selectedStop);
      });
    });
  } catch (err) {
    resultsEl.innerHTML = `<div class="search-error">${escapeHTML(err.message)}</div>`;
  }
}

async function loadDepartures(stop) {
  const container = document.getElementById("departures-board");
  if (!container) return;
  container.innerHTML = '<div class="departures-loading">Loading departures...</div>';
  try {
    const mockToggle = document.getElementById("mock");
    const data = mockToggle && mockToggle.checked
      ? getMockDepartures(stop)
      : await fetchTimetable(
          `/v3/departures/route_type/${stop.routeType}/stop/${stop.id}?max_results=25&include_cancelled=true`
        );
    const departures = data.departures || [];
    if (!departures.length) {
      container.innerHTML = '<div class="departures-empty">No departures found for this stop</div>';
      return;
    }
    displayDepartures(departures, container, data.runs || {}, data.directions || {}, data.routes || {});
    showStopOnMap(stop, departures[0], data.routes || {}, data.stops || {});
  } catch (err) {
    container.innerHTML = `<div class="departures-empty">Error: ${escapeHTML(err.message)}</div>`;
  }
}

function showStopOnMap(stop, departure, routes, stops) {
  const feed = ROUTE_TYPE_TO_FEED[stop.routeType];
  if (!feed) return;

  const stopInfo = stops[stop.id];
  if (!stopInfo) return;

  const feedSelect = document.getElementById("feed");
  const routeSearchInput = document.getElementById("route-search");
  if (!feedSelect || !routeSearchInput) return;

  feedSelect.value = feed;
  routeSearchInput.value = "";

  const route = departure ? routes[departure.route_id] : null;
  if (route) {
    const isBus = feed.startsWith("bus-");
    routeSearchInput.value = isBus
      ? (route.route_number || departure.route_id)
      : (route.route_name || "");
  }

  updateRouteSearchUI(feed);
  setMapCenter(Number(stopInfo.stop_latitude), Number(stopInfo.stop_longitude), stopInfo.stop_name);
  setRouteStops(stop.routeType, departure ? departure.route_id : "");

  const dashboardBtn = document.querySelector('[data-panel="panel-dashboard"]');
  if (dashboardBtn) dashboardBtn.click();

  loadFeed();
}

function displayDepartures(departures, container, runs, directions, routes) {
  const slice = departures.slice(0, 30);
  const cols = { hasDirection: false, hasEstimated: false, hasPlatform: false, hasStatus: false };

  const rowData = slice.map((d) => {
    const scheduled = d.scheduled_departure_utc ? formatTime(d.scheduled_departure_utc) : "";
    const estimated = d.estimated_departure_utc ? formatTime(d.estimated_departure_utc) : "";
    const showEstimated = estimated && estimated !== scheduled;
    const platform = d.platform_number || d.platform || "";
    const cancelled = d.cancelled ? '<span class="departure-cancelled">Cancelled</span>' : "";
    const run = runs[d.run_ref] || null;
    const direction = run ? directions[run.direction_id]?.direction_name || "" : "";
    const route = routes[d.route_id] || null;
    const routeLabel = route
      ? `${escapeHTML(route.route_number || d.route_id)} ${escapeHTML(route.route_name || "")}`
      : escapeHTML(d.route_id || "");

    if (direction) cols.hasDirection = true;
    if (showEstimated) cols.hasEstimated = true;
    if (platform) cols.hasPlatform = true;
    if (cancelled) cols.hasStatus = true;

    return { routeLabel, direction, scheduled, estimated, showEstimated, platform, cancelled };
  });

  const rows = rowData.map((r) => `<tr>
    <td><strong>${r.routeLabel || "?"}</strong></td>
    ${cols.hasDirection ? `<td>${escapeHTML(r.direction)}</td>` : ""}
    <td>${r.scheduled || "-"}</td>
    ${cols.hasEstimated ? `<td>${r.showEstimated ? r.estimated : "-"}</td>` : ""}
    ${cols.hasPlatform ? `<td>${escapeHTML(r.platform) || "-"}</td>` : ""}
    ${cols.hasStatus ? `<td>${r.cancelled}</td>` : ""}
  </tr>`).join("");

  container.innerHTML = `<div class="departures-header">
    <h3>Departures from <strong>${escapeHTML(selectedStop?.name || "?")}</strong></h3>
    <span class="note">Up to 30 services</span>
  </div>
  <table class="departures-table">
    <thead><tr>
      <th>Route</th>
      ${cols.hasDirection ? "<th>Direction</th>" : ""}
      <th>Scheduled</th>
      ${cols.hasEstimated ? "<th>Estimated</th>" : ""}
      ${cols.hasPlatform ? "<th>Platform</th>" : ""}
      ${cols.hasStatus ? "<th>Status</th>" : ""}
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// --- Route browser ---

function initRouteBrowser() {
  const container = document.getElementById("routes-list");
  if (!container) return;

  container.innerHTML = Object.entries(ROUTE_TYPES).map(([id, rt]) => `
    <button type="button" class="route-type-btn" data-route-type="${id}">
      <i data-lucide="${rt.icon}" class="icon"></i>
      <span>${rt.name}</span>
      <span class="route-type-arrow">&#9654;</span>
    </button>
    <div class="route-type-routes" id="routes-type-${id}"></div>
  `).join("");

  container.querySelectorAll(".route-type-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const typeId = btn.dataset.routeType;
      const routesEl = document.getElementById(`routes-type-${typeId}`);
      const isOpen = routesEl.classList.contains("open");

      document.querySelectorAll(".route-type-routes.open").forEach((el) => el.classList.remove("open"));
      document.querySelectorAll(".route-type-arrow").forEach((a) => (a.textContent = "\u25B6"));

      if (!isOpen) {
        routesEl.classList.add("open");
        btn.querySelector(".route-type-arrow").textContent = "\u25BC";
        loadRoutesForType(typeId, routesEl);
      }
    });
  });

  if (window.lucide && typeof lucide.createIcons === "function") {
    lucide.createIcons({ nodes: [container] });
  }
}

async function loadRoutesForType(typeId, container) {
  container.innerHTML = '<div class="search-loading">Loading routes...</div>';
  try {
    const data = await fetchTimetable(`/v3/routes?route_types=${typeId}`);
    const routes = data.routes || [];
    if (!routes.length) {
      container.innerHTML = '<div class="search-empty">No routes found</div>';
      return;
    }
    container.innerHTML = routes.map((r) => `
      <div class="route-item">
        <div class="route-item-header">
          <span class="route-number">${escapeHTML(r.route_number || r.route_id)}</span>
          <span class="route-name">${escapeHTML(r.route_name || "Unnamed")}</span>
        </div>
        <div class="route-item-meta">
          ${r.route_gtfs_transport_mode ? `<span>${escapeHTML(r.route_gtfs_transport_mode)}</span>` : ""}
          <span>ID: ${r.route_id}</span>
        </div>
      </div>
    `).join("");
  } catch (err) {
    container.innerHTML = `<div class="search-error">${escapeHTML(err.message)}</div>`;
  }
}

// --- Disruptions ---

function initDisruptions() {
  const container = document.getElementById("disruptions-list");
  if (!container) return;

  const disruptionsFilter = document.getElementById("disruptions-filter");
  const disruptionsRoute = document.getElementById("disruptions-route");
  const disruptionsSort = document.getElementById("disruptions-sort");
  const loadBtn = document.getElementById("load-disruptions");
  const mockToggle = document.getElementById("mock");

  const applyFilters = () => {
    const routeQuery = disruptionsRoute ? disruptionsRoute.value.trim() : "";
    const sortOrder = disruptionsSort ? disruptionsSort.value : "recent";
    let filtered = filterDisruptionsByRoute(lastDisruptions, routeQuery);
    filtered = sortDisruptions(filtered, sortOrder);
    const emptyMessage = routeQuery
      ? "No disruptions match that route."
      : "No current disruptions";
    renderDisruptions(filtered, container, emptyMessage);
  };

  const loadDisruptions = async () => {
    container.innerHTML = '<div class="departures-loading">Loading disruptions...</div>';
    const routeTypes = disruptionsFilter ? disruptionsFilter.value : "0,1,2,3,4";
    if (mockToggle && mockToggle.checked) {
      const typeSet = new Set(routeTypes.split(",").map((value) => Number(value)));
      lastDisruptions = buildMockDisruptions().filter((d) => {
        const routes = Array.isArray(d.routes) ? d.routes : [];
        if (!routes.length) return true;
        return routes.some((r) => typeSet.has(Number(r.route_type)));
      });
      applyFilters();
      return;
    }

    try {
      const data = await fetchTimetable(`/v3/disruptions?route_types=${routeTypes}`);
      lastDisruptions = normalizeDisruptions(data ? data.disruptions : null);
      applyFilters();
    } catch (err) {
      container.innerHTML = `<div class="disruptions-empty">Error: ${escapeHTML(err.message)}</div>`;
    }
  };

  if (disruptionsFilter) disruptionsFilter.addEventListener("change", loadDisruptions);
  if (disruptionsRoute) disruptionsRoute.addEventListener("input", applyFilters);
  if (disruptionsSort) disruptionsSort.addEventListener("change", applyFilters);
  if (loadBtn) loadBtn.addEventListener("click", loadDisruptions);
  if (mockToggle) mockToggle.addEventListener("change", loadDisruptions);

  loadDisruptions();
}

function getDisruptionSortValue(disruption) {
  const raw = disruption.published_on
    || disruption.created_utc
    || disruption.last_updated
    || disruption.updated_utc
    || disruption.start_date
    || disruption.end_date
    || "";
  if (!raw) return 0;
  if (typeof raw === "number") return raw * 1000;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeDisruptions(disruptions) {
  if (Array.isArray(disruptions)) return disruptions;
  if (!disruptions || typeof disruptions !== "object") return [];
  return Object.values(disruptions).reduce((acc, value) => {
    if (Array.isArray(value)) {
      acc.push(...value);
    }
    return acc;
  }, []);
}

function filterDisruptionsByRoute(disruptions, query) {
  const trimmed = query ? query.trim().toLowerCase() : "";
  if (!trimmed) return disruptions;

  return disruptions.filter((d) => {
    const routes = Array.isArray(d.routes) ? d.routes : [];
    const routeMatch = routes.some((r) => {
      const name = r && (r.route_name || r.route_id) ? String(r.route_name || r.route_id) : "";
      return name.toLowerCase().includes(trimmed);
    });
    if (routeMatch) return true;
    const text = `${d.title || ""} ${d.description || ""}`.toLowerCase();
    return text.includes(trimmed);
  });
}

function sortDisruptions(disruptions, order) {
  const sorted = [...disruptions];
  sorted.sort((a, b) => {
    const ta = getDisruptionSortValue(a);
    const tb = getDisruptionSortValue(b);
    if (order === "oldest") {
      return ta - tb;
    }
    return tb - ta;
  });
  return sorted;
}

function renderDisruptions(disruptions, container, emptyMessage = "No current disruptions") {
  if (!disruptions.length) {
    container.innerHTML = `<div class="disruptions-empty">${escapeHTML(emptyMessage)}</div>`;
    return;
  }

  container.innerHTML = disruptions.map((d) => {
    const title = d.title || d.description || "Untitled disruption";
    const desc = d.description || "";
    const status = d.disruption_status || d.status || "unknown";
    const routes = d.routes ? d.routes.map((r) => r.route_name || r.route_id).join(", ") : "";
    const created = d.published_on || d.created_utc || "";
    const dateStr = created ? new Date(created).toLocaleDateString("en-AU") : "";
    return `<div class="disruption-card">
      <div class="disruption-header">
        <span class="disruption-status disruption-${status.toLowerCase()}">${escapeHTML(status)}</span>
        <strong>${escapeHTML(title)}</strong>
      </div>
      ${desc ? `<p class="disruption-desc">${escapeHTML(desc)}</p>` : ""}
      <div class="disruption-meta">
        ${routes ? `<span>Routes: ${escapeHTML(routes)}</span>` : ""}
        ${dateStr ? `<span>${dateStr}</span>` : ""}
      </div>
    </div>`;
  }).join("");
}

// --- Init ---

export function initTimetable() {
  initStopSearch();
  initRouteBrowser();
  initDisruptions();
}
