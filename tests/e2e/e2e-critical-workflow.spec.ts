/**
 * E2E-01 Critical workflow from Assignment 1 (section 1.3): "Sending a message in a private channel"
 *   1. User logs in                                   -> Module A (Aimen)
 *   2. User opens a private channel they have access to -> Module C (Huzaifa)  [channel created + member added first]
 *   3-4. User enters and sends a message (with a file) -> Module B (Bakhtawar) + Module C (file)
 *   5. The message is displayed in the channel        -> Module B
 *   6. Other authorized members view the message      -> Modules A + B (second user logs in through the UI)
 *   7. The message can be searched and replied to     -> Module B
 *   8. A non-member cannot see it (security check)    -> Module C
 */
import { test, expect } from '@playwright/test';
import { MM, uniq, keyword } from '../../utils/api';
import { rt } from '../../utils/runtime';
import { SEL, uiLogin, openChannel, uiPost } from '../../utils/ui';
import { actual, meta } from '../../utils/evidence';

test('E2E-01 Critical workflow: send a message in a private channel (login -> open -> send -> view -> search/reply) @e2e @fr05', async ({ browser }) => {
  const { alice, bob, eve } = rt().users;
  const kw = keyword('e2e');
  const fileName = `e2e-${kw}.txt`;
  const fileText = `End-to-end evidence ${kw}`;
  const message = `Sprint review notes ${kw}`;
  meta({ req: 'FR-01, FR-02, FR-03, FR-04, FR-05 (+NFR-02)', owner: 'Aimen, Bakhtawar, Muhammad Huzaifa', technique: 'End-to-end scenario (A1 critical workflow)', inputs: `keyword=${kw}; file=${fileName}` });
  const ctxOpts = { baseURL: rt().baseUrl, viewport: { width: 1366, height: 768 } };

  const aliceApi = await MM.login(alice.username, alice.password);
  const chName = uniq('qa-e2e');
  let channel: any;
  await test.step('0. Precondition: private channel exists and Bob is a member (Module C)', async () => {
    const res = await aliceApi.createChannel(rt().teamId, chName, `QA_E2E ${kw}`, 'P');
    expect(res.status()).toBe(201);
    channel = await res.json();
    expect((await aliceApi.addChannelMember(channel.id, bob.id)).status()).toBe(201);
  });

  const aliceCtx = await browser.newContext(ctxOpts);
  const page = await aliceCtx.newPage();
  await test.step('1. Alice logs in (Module A)', async () => {
    await uiLogin(page, alice.username, alice.password);
    await expect(page).toHaveURL(/\/channels\//, { timeout: 30_000 });
  });

  await test.step('2. Alice opens the private channel (Module C)', async () => {
    await openChannel(page, rt().teamName, chName);
    await expect(page.getByText(`QA_E2E ${kw}`).first()).toBeVisible();
  });

  await test.step('3-5. Alice attaches a file, enters and sends a message; it is displayed (Modules B + C)', async () => {
    const uploaded = page.waitForResponse((r) => r.url().includes('/api/v4/files') && r.request().method() === 'POST');
    await page.locator(SEL.fileInput).first().setInputFiles({ name: fileName, mimeType: 'text/plain', buffer: Buffer.from(fileText) });
    expect((await uploaded).status()).toBe(201);
    await uiPost(page, message);
    await expect(page.getByText(message).first()).toBeVisible();
    await expect(page.getByText(fileName).first()).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('e2e-step5-alice-sent.png') });
    await test.info().attach('e2e-step5-alice-sent', { path: test.info().outputPath('e2e-step5-alice-sent.png'), contentType: 'image/png' });
  });

  await test.step('6. Bob (authorized member) logs in and views the message (Modules A + B)', async () => {
    const bobCtx = await browser.newContext(ctxOpts);
    const bobPage = await bobCtx.newPage();
    await uiLogin(bobPage, bob.username, bob.password);
    await expect(bobPage).toHaveURL(/\/channels\//, { timeout: 30_000 });
    await openChannel(bobPage, rt().teamName, chName);
    await expect(bobPage.getByText(message).first()).toBeVisible();
    await expect(bobPage.getByText(fileName).first()).toBeVisible();
    await bobPage.screenshot({ path: test.info().outputPath('e2e-step6-bob-views.png') });
    await test.info().attach('e2e-step6-bob-views', { path: test.info().outputPath('e2e-step6-bob-views.png'), contentType: 'image/png' });
    await bobCtx.close();
  });

  const bobApi = await MM.login(bob.username, bob.password);
  let postId = '';
  await test.step('7. Bob searches the message, downloads the file and replies (Modules B + C)', async () => {
    await expect.poll(async () => {
      const body = await (await bobApi.search(rt().teamId, kw)).json();
      postId = (body.order ?? [])[0] ?? '';
      return (body.order ?? []).length;
    }, { timeout: 20_000 }).toBe(1);
    const post = await (await bobApi.get(`/api/v4/posts/${postId}`)).json();
    expect(post.message).toBe(message);
    const dl = await bobApi.get(`/api/v4/files/${post.file_ids[0]}`);
    expect(dl.status()).toBe(200);
    expect((await dl.body()).toString()).toBe(fileText);

    const reply = await bobApi.createPost(channel.id, `Reply from Bob ${kw}`, [], postId);
    expect(reply.status()).toBe(201);
    const thread = await (await aliceApi.get(`/api/v4/posts/${postId}/thread`)).json();
    expect(thread.order).toHaveLength(2); // root + reply
  });

  await test.step('8. Eve (non-member) cannot open, read or find it (Module C / NFR-02)', async () => {
    const eveApi = await MM.login(eve.username, eve.password);
    expect([403, 404]).toContain((await eveApi.get(`/api/v4/channels/${channel.id}`)).status());
    expect([403, 404]).toContain((await eveApi.get(`/api/v4/posts/${postId}`)).status());
    expect(((await (await eveApi.search(rt().teamId, kw)).json()).order ?? [])).toHaveLength(0);
    await eveApi.dispose();
  });

  actual(`All steps passed: channel ${chName}, post ${postId} viewed by member, found by search, replied (thread of 2), non-member denied`);
  await aliceApi.dispose(); await bobApi.dispose(); await aliceCtx.close();
});
