import { test, expect } from "@playwright/test";

test.describe("Match UI smoke", () => {
  test("shows start video chat after gender selection", async ({ page }) => {
    await page.goto("/match");

    await page
      .locator(".gender-option")
      .filter({ has: page.locator(".gender-option-label", { hasText: /^Male$/ }) })
      .click({ timeout: 5000 });
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: "📹 Video" }).click();
    await expect(page.getByRole("button", { name: "⚡ Talk to Stranger" })).toBeVisible();
  });
});
