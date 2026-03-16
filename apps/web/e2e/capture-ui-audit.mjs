import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.argv[2];
const outputDirArg = process.argv[3];
if (!baseUrl || !outputDirArg) {
  console.error("Usage: node e2e/capture-ui-audit.mjs <baseUrl> <outputDir>");
  process.exit(1);
}

const outputDir = path.resolve(outputDirArg);
fs.mkdirSync(outputDir, { recursive: true });

const viewports = [
  { name: "mobile-320", width: 320, height: 640 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1024", width: 1024, height: 768 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1920", width: 1920, height: 1080 }
];

const routes = [
  { slug: "home", path: "/" },
  { slug: "verify", path: "/verify" }
];

const consoleErrors = [];
const results = [];

const browser = await chromium.launch({ headless: true });

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push({
        viewport: viewport.name,
        text: msg.text()
      });
    }
  });

  for (const route of routes) {
    const targetUrl = `${baseUrl}${route.path}`;
    await page.goto(targetUrl, { waitUntil: "networkidle" });
    const outputPath = path.join(outputDir, `${route.slug}-${viewport.name}.png`);
    await page.screenshot({ path: outputPath, fullPage: true });
    results.push({
      viewport: viewport.name,
      route: route.path,
      screenshot: outputPath
    });
  }

  await context.close();
}

await browser.close();

fs.writeFileSync(path.join(outputDir, "console-errors.json"), JSON.stringify(consoleErrors, null, 2));
fs.writeFileSync(path.join(outputDir, "screenshots.json"), JSON.stringify(results, null, 2));

console.log(`Captured ${results.length} screenshots`);
console.log(`Console errors: ${consoleErrors.length}`);
