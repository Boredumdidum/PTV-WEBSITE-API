(function () {
	var theme = localStorage.getItem("theme");
	if (theme === "dark" || (!theme && matchMedia("(prefers-color-scheme: dark)").matches)) {
		document.documentElement.classList.add("dark");
	} else if (theme === "light") {
		document.documentElement.classList.add("light");
	}
})();
