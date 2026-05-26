export function setStatus(state, text) {
	const el = document.getElementById("status");
	if (el) {
		el.dataset.state = state;
		el.textContent = text;
	}
}

export function setError(message) {
	const el = document.getElementById("error");
	if (el) {
		el.textContent = message || "";
	}
}

export function setMapMessage(message) {
	const el = document.getElementById("map-empty");
	if (el) {
		el.textContent = message || "";
	}
}

export function setMapHint(message) {
	const el = document.getElementById("map-hint");
	if (el) {
		el.textContent = message || "";
	}
}

export function showToast(message, iconName = "check-circle") {
	const container = document.getElementById("toast-container");
	if (!container) {
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
	container.append(toast);

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
	const themeToggle = document.getElementById("theme-toggle");
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

export function setTheme(theme) {
	const isDark = theme === "dark";
	document.body.classList.toggle("dark", isDark);
	localStorage.setItem("theme", isDark ? "dark" : "light");
	updateThemeToggle(isDark ? "dark" : "light");
	showToast(isDark ? "Dark mode enabled" : "Light mode enabled", isDark ? "moon" : "sun");
}

export function initTheme() {
	const stored = localStorage.getItem("theme");
	const theme = stored === "dark" ? "dark" : "light";
	document.body.classList.toggle("dark", theme === "dark");
	updateThemeToggle(theme);
}

export function updateRouteSearchUI(feed) {
	const input = document.getElementById("route-search");
	const label = document.querySelector("label[for='route-search']");
	if (!input || !label) {
		return;
	}

	const busMode = typeof feed === "string" && feed.startsWith("bus-");
	label.textContent = busMode ? "Bus route number" : "Train line name";
	input.placeholder = busMode
		? "e.g. 765 or 733"
		: "e.g. Werribee or Frankston";
	input.inputMode = busMode ? "numeric" : "text";
}
