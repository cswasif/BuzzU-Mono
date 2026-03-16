import { test, expect } from '@playwright/test';
import {
  completeMatchSetup,
  expectMessageVisible,
  expectNoDecryptError,
  getSessionState,
  sendChatMessage,
  waitForEncryptionReady,
  waitForMatchedChat,
} from './helpers/chatFlow';

test.describe('Chat encryption resilience', () => {
  test('keeps encryption ready after DM round-trip and decrypts new messages', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await completeMatchSetup(pageA, 'Male');
    await completeMatchSetup(pageB, 'Female');

    await waitForMatchedChat(pageA);
    await waitForMatchedChat(pageB);
    await waitForEncryptionReady(pageA);
    await waitForEncryptionReady(pageB);

    const preDmMsg = `pre-dm-${Date.now()}`;
    await sendChatMessage(pageA, preDmMsg);
    await expectMessageVisible(pageB, preDmMsg);
    await expectNoDecryptError(pageA);
    await expectNoDecryptError(pageB);

    const stateA = await getSessionState(pageA);
    const stateB = await getSessionState(pageB);
    expect(stateA?.partnerId).toBeTruthy();
    expect(stateA?.currentRoomId).toBeTruthy();
    expect(stateB?.partnerId).toBeTruthy();

    const partnerIdB = String(stateB?.peerId ?? stateA?.partnerId ?? '');
    const roomIdA = String(stateA?.currentRoomId ?? '');
    await pageA.goto(`/chat/dm/${partnerIdB}`);
    await expect(pageA.getByLabel('Send a message')).toBeVisible({ timeout: 30000 });

    await pageA.goto(`/chat/new/${roomIdA}`);
    await waitForMatchedChat(pageA);
    await waitForEncryptionReady(pageA);

    const postDmMsg = `post-dm-${Date.now()}`;
    await sendChatMessage(pageB, postDmMsg);
    await expectMessageVisible(pageA, postDmMsg);
    await expectNoDecryptError(pageA);
    await expectNoDecryptError(pageB);

    await contextA.close();
    await contextB.close();
  });

  test('handles reconnect churn without surfacing decrypt failures', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await completeMatchSetup(pageA, 'Male');
    await completeMatchSetup(pageB, 'Female');

    await waitForMatchedChat(pageA);
    await waitForMatchedChat(pageB);
    await waitForEncryptionReady(pageA);
    await waitForEncryptionReady(pageB);

    const stateA = await getSessionState(pageA);
    const roomIdA = String(stateA?.currentRoomId ?? '');
    expect(roomIdA).toContain('room_');

    await pageA.reload();
    await pageA.goto(`/chat/new/${roomIdA}`);
    await waitForMatchedChat(pageA);
    await waitForEncryptionReady(pageA);

    const burst = [
      `reconnect-msg-1-${Date.now()}`,
      `reconnect-msg-2-${Date.now()}`,
      `reconnect-msg-3-${Date.now()}`,
    ];
    for (const msg of burst) {
      await sendChatMessage(pageB, msg);
      await expectMessageVisible(pageA, msg);
    }

    await expectNoDecryptError(pageA);
    await expectNoDecryptError(pageB);

    await contextA.close();
    await contextB.close();
  });
});
