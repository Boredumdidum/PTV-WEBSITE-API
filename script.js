import { setTheme, initTheme, showToast, updateRouteSearchUI } from "./src/utils/dom.js";
import { initNavigation, loadFeed, applyData, lastPayload, lastFeed, lastIsMock } from "./src/components/dashboard.js";

document.addEventListener("DOMContentLoaded", () => {
	if (window.lucide && typeof lucide.createIcons === "function") {
		lucide.createIcons();
	}

	initTheme();
	initNavigation();

	const themeToggle = document.getElementById("theme-toggle");
	if (themeToggle) {
		themeToggle.addEventListener("click", () => {
			const nextTheme = document.body.classList.contains("dark") ? "light" : "dark";
			setTheme(nextTheme);
		});
	}

	const sidebarToggle = document.getElementById("sidebar-toggle");
	if (sidebarToggle) {
		const isClosed = localStorage.getItem("sidebar-closed") === "true";
		if (isClosed) document.body.classList.add("sidebar-closed");

		sidebarToggle.addEventListener("click", () => {
			const closed = document.body.classList.toggle("sidebar-closed");
			localStorage.setItem("sidebar-closed", closed);
		});
	}

	const routeSearchInput = document.getElementById("route-search");
	if (routeSearchInput) {
		routeSearchInput.addEventListener("input", () => {
			if (lastPayload && lastFeed) {
				applyData(lastPayload, lastIsMock, lastFeed);
			}
		});

		routeSearchInput.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				if (lastPayload && lastFeed) {
					applyData(lastPayload, lastIsMock, lastFeed);
				}
			}
		});
	}

	const loadButton = document.getElementById("load");
	const feedSelect = document.getElementById("feed");

	loadButton.addEventListener("click", loadFeed);
	feedSelect.addEventListener("change", () => {
		updateRouteSearchUI(feedSelect.value);
		loadFeed();
	});

	const mockToggle = document.getElementById("mock");
	if (mockToggle) {
		mockToggle.addEventListener("change", loadFeed);
	}

	updateRouteSearchUI(feedSelect.value);
	loadFeed();
});
