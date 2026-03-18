import { test, expect, Page } from '@playwright/test';

const captureLayout = async (page: Page) => {
    const rightColumn = page.locator('.r-nsbfu8');
    await rightColumn.waitFor({ state: 'visible', timeout: 10000 });
    const rightBox = await rightColumn.boundingBox();

    const joinText = page.getByText('Join today.');
    await joinText.waitFor({ state: 'visible', timeout: 10000 });
    const textBox = await joinText.boundingBox();

    const logo = page.locator('.mobile-hero-logo');
    const logoVisible = await logo.isVisible();
    const logoBox = logoVisible ? await logo.boundingBox() : null;

    if (!rightBox || !textBox) {
        throw new Error('Layout anchors are not available');
    }

    return {
        rightX: rightBox.x,
        textX: textBox.x,
        logoX: logoBox ? logoBox.x : null,
    };
};

const assertStable = (before: { rightX: number; textX: number; logoX: number | null }, after: { rightX: number; textX: number; logoX: number | null }) => {
    expect(Math.abs(after.rightX - before.rightX)).toBeLessThan(2);
    expect(Math.abs(after.textX - before.textX)).toBeLessThan(2);
    if (before.logoX !== null && after.logoX !== null) {
        expect(Math.abs(after.logoX - before.logoX)).toBeLessThan(2);
    }
};

test.describe('layout stability when returning from verify', () => {
    test.describe('desktop viewport', () => {
        test.use({ viewport: { width: 1440, height: 900 } });

        test('keeps landing positions aligned', async ({ page }) => {
            await page.goto('/');
            const before = await captureLayout(page);
            await page.goto('/verify');
            await page.goto('/');
            const after = await captureLayout(page);
            assertStable(before, after);
        });
    });

    test.describe('mobile viewport', () => {
        test.use({ viewport: { width: 390, height: 844 } });

        test('keeps landing positions aligned', async ({ page }) => {
            await page.goto('/');
            const before = await captureLayout(page);
            await page.goto('/verify');
            await page.goto('/');
            const after = await captureLayout(page);
            assertStable(before, after);
        });
    });
});
