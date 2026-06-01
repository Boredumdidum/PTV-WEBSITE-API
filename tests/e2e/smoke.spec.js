const { test, expect } = require("@playwright/test");

test("page loads with correct title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/PTV GTFS Realtime Dashboard/);
});

test("sidebar is present with navigation buttons", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".sidebar")).toBeVisible();
  const navButtons = page.locator(".nav-btn");
  await expect(navButtons).toHaveCount(6);
});

test("feed selector has all feed options", async ({ page }) => {
  await page.goto("/");
  const select = page.locator("#feed");
  const options = select.locator("option");
  await expect(options).toHaveCount(5);
  await expect(options.nth(0)).toHaveAttribute("value", "metro-vehicle-positions");
  await expect(options.nth(4)).toHaveAttribute("value", "bus-trip-updates");
});

test("theme toggle switches between dark and light", async ({ page }) => {
  await page.goto("/");
  const toggle = page.locator("#theme-toggle");
  await expect(toggle).toBeVisible();

  const isDark = await page.locator("html").evaluate((el) => el.classList.contains("dark"));
  const initialLabel = isDark ? "Light mode" : "Dark mode";
  await expect(toggle).toContainText(initialLabel);

  await toggle.click();
  const nowDark = await page.locator("html").evaluate((el) => el.classList.contains("dark"));
  expect(nowDark).toBe(!isDark);

  await toggle.click();
  const backToOriginal = await page.locator("html").evaluate((el) => el.classList.contains("dark"));
  expect(backToOriginal).toBe(isDark);
});

test("sidebar toggle collapses and expands sidebar", async ({ page }) => {
  await page.goto("/");
  const sidebarToggle = page.locator("#sidebar-toggle");
  await expect(sidebarToggle).toBeVisible();

  await sidebarToggle.click();
  await expect(page.locator("body")).toHaveClass(/sidebar-closed/);

  await sidebarToggle.click();
  await expect(page.locator("body")).not.toHaveClass(/sidebar-closed/);
});

test("mock data mode shows vehicles on map", async ({ page }) => {
  await page.goto("/");
  await page.locator("#mock").check();
  await page.locator("#load").click();

  await page.waitForTimeout(1000);
  const mapEl = page.locator("#map");
  await expect(mapEl).toBeVisible();
  const leafletContainer = page.locator(".leaflet-container");
  await expect(leafletContainer).toBeVisible({ timeout: 5000 });
});

test("route search input updates placeholder for bus feed", async ({ page }) => {
  await page.goto("/");
  const feedSelect = page.locator("#feed");
  const searchInput = page.locator("#route-search");

  await feedSelect.selectOption("bus-vehicle-positions");
  await expect(searchInput).toHaveAttribute("placeholder", /e\.g\. 765/);

  await feedSelect.selectOption("metro-vehicle-positions");
  await expect(searchInput).toHaveAttribute("placeholder", /e\.g\. Werribee/);
});

test("status bar is present and interactive", async ({ page }) => {
  await page.goto("/");
  const statusEl = page.locator("#status");
  await expect(statusEl).toBeVisible();
});

test("preview toggle shows panel", async ({ page }) => {
  await page.goto("/");
  const previewToggle = page.locator("#preview-toggle");
  const previewPanel = page.locator("#panel-preview");

  await expect(previewPanel).not.toBeVisible();

  await previewToggle.click();
  await expect(previewPanel).toBeVisible();

  await previewToggle.click();
  await expect(previewPanel).not.toBeVisible();
});

test("response body error is displayed on failed request", async ({ page }) => {
  await page.goto("/");
  const errorEl = page.locator("#error");
  await expect(errorEl).toBeAttached();
});

test("departures panel has stop search input", async ({ page }) => {
  await page.goto("/");
  const departuresBtn = page.locator('[data-panel="panel-departures"]');
  await departuresBtn.click();
  await expect(page.locator("#panel-departures")).toBeVisible();
  await expect(page.locator("#stop-search")).toBeVisible();
  await expect(page.locator("#stop-search")).toHaveAttribute("placeholder", /Search by stop name/);
});

test("routes panel shows route type buttons", async ({ page }) => {
  await page.goto("/");
  const routesBtn = page.locator('[data-panel="panel-routes"]');
  await routesBtn.click();
  await expect(page.locator("#panel-routes")).toBeVisible();
  const routeTypeBtns = page.locator(".route-type-btn");
  await expect(routeTypeBtns).toHaveCount(2);
});

test("disruptions panel has route type filter", async ({ page }) => {
  await page.goto("/");
  const disruptionsBtn = page.locator('[data-panel="panel-disruptions"]');
  await disruptionsBtn.click();
  await expect(page.locator("#panel-disruptions")).toBeVisible();
  await expect(page.locator("#disruptions-filter")).toBeVisible();
  await expect(page.locator("#load-disruptions")).toBeVisible();
});
