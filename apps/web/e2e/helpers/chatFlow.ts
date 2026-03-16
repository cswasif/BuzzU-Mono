import { expect, Page } from '@playwright/test';

type GenderOption = 'Male' | 'Female' | 'Other';

export async function completeMatchSetup(page: Page, gender: GenderOption) {
  await page.goto('/match');
  const overlay = page.locator('.gender-dialog-overlay');
  const option = page
    .locator('.gender-option')
    .filter({ has: page.locator('.gender-option-label', { hasText: new RegExp(`^${gender}$`) }) });
  if (await option.count()) {
    await option.first().click({ timeout: 5000 });
    const continueBtn = page.getByRole('button', { name: 'Continue' });
    if (await continueBtn.isVisible()) {
      await continueBtn.click({ force: true });
    }
    await expect(overlay).toHaveCount(0, { timeout: 10000 });
  }
  const textButton = page.getByRole('button', { name: '💬 Text' });
  if (await textButton.isVisible()) {
    await textButton.click();
  }
  if (await overlay.count()) {
    const continueBtn = page.getByRole('button', { name: 'Continue' });
    if (await continueBtn.isVisible()) {
      await continueBtn.click({ force: true });
    }
    await expect(overlay).toHaveCount(0, { timeout: 10000 });
  }
  await page.getByRole('button', { name: '⚡ Talk to Stranger' }).click();
}

export async function waitForMatchedChat(page: Page) {
  const input = page.getByLabel('Send a message');
  await expect(input).toBeVisible({ timeout: 45000 });
  await expect(input).toBeEnabled({ timeout: 45000 });
  await expect(page.getByRole('button', { name: 'SKIP' })).toBeVisible({ timeout: 45000 });
}

export async function waitForEncryptionReady(page: Page) {
  await expect(page.getByText('Establishing encrypted connection...')).toHaveCount(0, { timeout: 45000 });
}

export async function sendChatMessage(page: Page, content: string) {
  await page.getByLabel('Send a message').fill(content);
  await page.keyboard.press('Enter');
}

export async function expectMessageVisible(page: Page, content: string) {
  await expect(page.locator('.chat-message-text').filter({ hasText: content })).toBeVisible({ timeout: 30000 });
}

export async function expectNoDecryptError(page: Page) {
  await expect(page.getByText('Message could not be decrypted')).toHaveCount(0);
}

export async function getSessionState(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('buzzu-session');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
      return parsed.state ?? null;
    } catch {
      return null;
    }
  });
}
