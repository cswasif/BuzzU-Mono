import { test, expect } from "@playwright/test";

const routes = ["/safety", "/help", "/settings", "/privacy"];

async function assertNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

async function assertBottomContentVisibleAboveFooter(page: import("@playwright/test").Page) {
  const scroller = page.locator(".info-page-main");
  await expect(scroller).toBeVisible();

  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });

  const footer = page.locator('nav[aria-label="Footer"]');
  await expect(footer).toBeVisible();

  const lastItem = page.locator(".info-list-item").last();
  await expect(lastItem).toBeVisible();

  const [footerBox, itemBox] = await Promise.all([
    footer.boundingBox(),
    lastItem.boundingBox(),
  ]);

  if (!footerBox || !itemBox) {
    throw new Error("Unable to read layout boxes");
  }

  expect(itemBox.bottom).toBeLessThanOrEqual(footerBox.top - 4);
}

test.describe("landing info page layout", () => {
  test.describe("desktop", () => {
    test.use({ viewport: { width: 1365, height: 768 } });

    for (const route of routes) {
      test(`keeps content visible on ${route}`, async ({ page }) => {
        await page.goto(route);
        await assertNoHorizontalOverflow(page);
        await assertBottomContentVisibleAboveFooter(page);
      });
    }
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    for (const route of routes) {
      test(`keeps content visible on ${route}`, async ({ page }) => {
        await page.goto(route);
        await assertNoHorizontalOverflow(page);
        await assertBottomContentVisibleAboveFooter(page);
      });
    }
  });
});
