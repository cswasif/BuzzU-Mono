import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test.describe('WebSocket Matchmaking & Signaling', () => {

    test('should match two random users', async ({ browser }) => {
        // Create two independent contexts, which simulate two different users
        const context1 = await browser.newContext();
        const context2 = await browser.newContext();

        const page1 = await context1.newPage();
        const page2 = await context2.newPage();

        page1.on('pageerror', err => console.error('PAGE1 ERROR: ', err.message));
        page1.on('console', msg => { if (msg.type() === 'error') console.error('PAGE1 CONSOLE: ', msg.text()) });
        page2.on('pageerror', err => console.error('PAGE2 ERROR: ', err.message));
        page2.on('console', msg => { if (msg.type() === 'error') console.error('PAGE2 CONSOLE: ', msg.text()) });

        // Go to Match page
        await page1.goto('/match');
        await page2.goto('/match');

        // Handle Gender Dialog which defaults to 'U' on first visit
        // Wait for it to appear then click Male and Female respectively
        try {
            await page1
                .locator('.gender-option')
                .filter({ has: page1.locator('.gender-option-label', { hasText: /^Male$/ }) })
                .click({ timeout: 5000 });
            await page1.getByRole('button', { name: 'Continue' }).click();

            await page2
                .locator('.gender-option')
                .filter({ has: page2.locator('.gender-option-label', { hasText: /^Female$/ }) })
                .click({ timeout: 5000 });
            await page2.getByRole('button', { name: 'Continue' }).click();

            // Wait a short moment for the dialog animation to close
            await page1.waitForTimeout(500);
            await page2.waitForTimeout(500);
        } catch (err) {
            const html = await page1.content();
            fs.writeFileSync('page-dump.html', html);
            throw err;
        }

        // Make sure they select the text mode
        await page1.getByRole('button', { name: '💬 Text' }).click();
        await page2.getByRole('button', { name: '💬 Text' }).click();

        // Click on "Talk to Stranger"
        await page1.getByRole('button', { name: '⚡ Talk to Stranger' }).click();
        await page2.getByRole('button', { name: '⚡ Talk to Stranger' }).click();

        // Wait for Chat Room to load
        await expect(page1).toHaveURL(/\/chat\/room_.*/);
        await expect(page2).toHaveURL(/\/chat\/room_.*/);

        // Verify chat UI elements are present
        const chatInput1 = page1.getByPlaceholder('Type a message...');
        const chatInput2 = page2.getByPlaceholder('Type a message...');

        await expect(chatInput1).toBeVisible();
        await expect(chatInput2).toBeVisible();

        // Send a message from User 1
        await chatInput1.fill('Hello from User 1');
        await page1.getByRole('button', { name: 'Send' }).click();

        // Verify User 2 received it
        await expect(page2.locator('.message-text').filter({ hasText: 'Hello from User 1' })).toBeVisible();

        // Send a message from User 2
        await chatInput2.fill('Hi from User 2');
        await page2.getByRole('button', { name: 'Send' }).click();

        // Verify User 1 received it
        await expect(page1.locator('.message-text').filter({ hasText: 'Hi from User 2' })).toBeVisible();

        // Clean up
        await context1.close();
        await context2.close();
    });
});
