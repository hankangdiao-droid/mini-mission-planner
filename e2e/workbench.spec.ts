import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";

test.beforeEach(async ({ page }) => {
  // External tile servers are never exercised by automated browser panning.
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
});

test("themes, language, modes, review gating and export work offline", async ({
  page,
}, testInfo) => {
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  await page.goto("/");
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.getByRole("button", { name: /^导出/ })).toBeDisabled();
  await page.screenshot({
    path: ".local/screenshots/light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "切换主题" }).click();
  await expect(page.locator(".workbench")).toHaveClass(/dark/);
  await page.screenshot({
    path: ".local/screenshots/dark.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator(".workbench")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByLabel("Aircraft", { exact: true }).selectOption("mini4pro");
  await page.getByRole("button", { name: "Area survey", exact: true }).click();
  await page.getByRole("button", { name: "Demo", exact: true }).click();
  await expect(page.locator(".validation .error")).toHaveCount(0);
  await page.getByRole("button", { name: "Orbit", exact: true }).click();
  await page.getByRole("button", { name: "Demo", exact: true }).click();
  await expect(page.locator(".validation .error")).toHaveCount(0);
  await page.getByRole("button", { name: "Facade", exact: true }).click();
  await page.getByRole("button", { name: "Demo", exact: true }).click();
  await page.getByLabel("Heights, return path and site reviewed").check();
  await page
    .getByLabel("Flight verification pending; I will review in DJI Fly")
    .check();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Export/ }).click();
  const exported = await download;
  const path = testInfo.outputPath("exported.kmz");
  await exported.saveAs(path);
  const downloaded = unzipSync(new Uint8Array(await readFile(path)));
  const kmz = downloaded["wpmz/waylines.wpml"]
    ? downloaded
    : unzipSync(
        downloaded[Object.keys(downloaded).find((k) => k.endsWith(".kmz"))!],
      );
  const text = strFromU8(kmz["wpmz/waylines.wpml"]);
  expect(text).toContain("http://www.dji.com/wpmz/1.0.6");
  expect(text).toContain("relativeToStartPoint");
  expect(text).toContain("takePhoto");
  expect(text).not.toContain("NaN");
  expect(failures).toEqual([]);
  await page.getByRole("button", { name: "Coordinates & waypoints" }).click();
  await expect(page.locator("table")).toHaveCount(2);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Export/ })).toBeDisabled();
});

test("keyboard editing and small viewport stay usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "演示数据" }).click();
  await page.getByRole("button", { name: "坐标与航点表" }).click();
  await page.getByLabel("1 longitude").fill("0.0001");
  await page.getByLabel("1 longitude").press("Tab");
  await expect(page.locator(".validation .error")).toHaveCount(0);
  const size = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(size.width).toBeLessThanOrEqual(size.viewport + 1);
  await page.screenshot({
    path: ".local/screenshots/mobile.png",
    fullPage: true,
  });
});

test("basemap failures are visible and local XYZ configuration can be applied", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:9000/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0YQAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.goto("/");
  await page.getByLabel("显示底图").check();
  await expect(page.locator(".basemap-status")).toContainText("底图加载失败");
  await page.getByRole("button", { name: "底图与定位" }).click();
  await page
    .getByLabel("HTTPS 地址模板")
    .fill("http://127.0.0.1:9000/{z}/{x}/{y}.png");
  await page.getByLabel("版权归属").fill("Local authorized imagery");
  await page.getByRole("button", { name: "应用底图" }).click();
  await page.getByRole("button", { name: "底图与定位" }).click();
  await expect(page.locator(".basemap-status")).toHaveCount(0);
  await expect(page.locator(".leaflet-control-attribution")).toContainText(
    "Local authorized imagery",
  );
});
