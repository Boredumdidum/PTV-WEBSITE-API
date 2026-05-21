const feedSelect = document.getElementById("feed");
const loadButton = document.getElementById("load");
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

async function loadFeed() {
	const feed = feedSelect.value;
	setStatus("loading", "Loading");
	setError("");
	previewEl.textContent = "Fetching feed...";

	try {
		const response = await fetch(`/api/gtfs?feed=${encodeURIComponent(feed)}&limit=10`);
		if (!response.ok) {
			throw new Error(`Request failed (${response.status})`);
		}

		const data = await response.json();
		const entities = Array.isArray(data.entity) ? data.entity : [];

		const timestampRaw = data.header && data.header.timestamp ? data.header.timestamp : null;
		const timestamp = timestampRaw ? Number(timestampRaw) : 0;
		const formattedTime = timestamp
			? new Date(timestamp * 1000).toLocaleString()
			: "Unknown";

		updatedEl.textContent = formattedTime;
		countEl.textContent = `${entities.length}`;
		previewEl.textContent = JSON.stringify(entities.slice(0, 5), null, 2) || "No entities";
		setStatus("ok", "OK");
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

loadFeed();
