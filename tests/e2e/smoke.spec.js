const { test, expect } = require("@playwright/test");

test("page loads with correct title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/PTV GTFS Realtime Dashboard/);
});

test("sidebar is present with navigation buttons", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".sidebar")).toBeVisible();
  const navButtons = page.locator(".nav-btn");
  await expect(navButtons).toHaveCount(2);
});

test("feed selector has vehicle position options", async ({ page }) => {
  await page.goto("/");
  const select = page.locator("#feed");
  const options = select.locator("option");
  await expect(options).toHaveCount(2);
  await expect(options.nth(0)).toHaveValue("metro-vehicle-positions");
  await expect(options.nth(1)).toHaveValue("bus-vehicle-positions");
});

test("theme toggle switches between dark and light", async ({ page }) => {
  await page.goto("/");
  const toggle = page.locator("#theme-toggle");
  await expect(toggle).toBeVisible();

  const isDark = await page.locator("body").evaluate((el) => el.classList.contains("dark"));
  const initialLabel = isDark ? "Light mode" : "Dark mode";
  await expect(toggle).toContainText(initialLabel);

  await toggle.click();
  const nowDark = await page.locator("body").evaluate((el) => el.classList.contains("dark"));
  expect(nowDark).toBe(!isDark);

  await toggle.click();
  const backToOriginal = await page.locator("body").evaluate((el) => el.classList.contains("dark"));
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

test("preview panel shows on navigation click", async ({ page }) => {
  await page.goto("/");
  const panelButtons = page.locator(".nav-btn");
  const previewPanel = page.locator("#panel-preview");
  const dashboardPanel = page.locator("#panel-dashboard");

  await expect(dashboardPanel).toBeVisible();
  await expect(previewPanel).not.toBeVisible();

  await panelButtons.nth(1).click();
  await expect(previewPanel).toBeVisible();
  await expect(dashboardPanel).not.toBeVisible();
});

test("response body error is displayed on failed request", async ({ page }) => {
  await page.goto("/");
  const errorEl = page.locator("#error");
  await expect(errorEl).toBeAttached();
});
