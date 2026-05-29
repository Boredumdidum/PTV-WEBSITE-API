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
    const data = await fetchTimetable(`/v3/search/${encodeURIComponent(term)}`);
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
    const data = await fetchTimetable(
      `/v3/departures/route_type/${stop.routeType}/stop/${stop.id}?max_results=25&include_cancelled=true`
    );
    const departures = data.departures || [];
    if (!departures.length) {
      container.innerHTML = '<div class="departures-empty">No departures found for this stop</div>';
      return;
    }
    displayDepartures(departures, container, data.runs || {}, data.directions || {});
  } catch (err) {
    container.innerHTML = `<div class="departures-empty">Error: ${escapeHTML(err.message)}</div>`;
  }
}

function displayDepartures(departures, container, runs, directions) {
  const rows = departures.slice(0, 30).map((d) => {
    const scheduled = d.scheduled_departure_utc ? formatTime(d.scheduled_departure_utc) : "-";
    const estimated = d.estimated_departure_utc ? formatTime(d.estimated_departure_utc) : "-";
    const platform = d.platform_number || d.platform || "-";
    const cancelled = d.cancelled ? '<span class="departure-cancelled">Cancelled</span>' : "";
    const run = runs[d.run_ref] || null;
    const direction = run
      ? directions[run.direction_id]?.direction_name || ""
      : "";
    return `<tr>
      <td><strong>${escapeHTML(d.route_id || "?")}</strong></td>
      <td>${escapeHTML(direction)}</td>
      <td>${scheduled}</td>
      <td>${estimated}</td>
      <td>${platform}</td>
      <td>${cancelled}</td>
    </tr>`;
  }).join("");

  container.innerHTML = `<div class="departures-header">
    <h3>Departures from <strong>${escapeHTML(selectedStop?.name || "?")}</strong></h3>
    <span class="note">Up to 30 services</span>
  </div>
  <table class="departures-table">
    <thead><tr>
      <th>Route</th>
      <th>Direction</th>
      <th>Scheduled</th>
      <th>Estimated</th>
      <th>Platform</th>
      <th>Status</th>
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
    try {
      const routeTypes = disruptionsFilter ? disruptionsFilter.value : "0,1,2,3,4";
      const data = await fetchTimetable(`/v3/disruptions?route_types=${routeTypes}`);
      lastDisruptions = data.disruptions || [];
      applyFilters();
    } catch (err) {
      container.innerHTML = `<div class="disruptions-empty">Error: ${escapeHTML(err.message)}</div>`;
    }
  };

  if (disruptionsFilter) disruptionsFilter.addEventListener("change", loadDisruptions);
  if (disruptionsRoute) disruptionsRoute.addEventListener("input", applyFilters);
  if (disruptionsSort) disruptionsSort.addEventListener("change", applyFilters);
  if (loadBtn) loadBtn.addEventListener("click", loadDisruptions);

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
