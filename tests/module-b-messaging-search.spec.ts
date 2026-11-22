/**
 * MODULE B - Messaging & Search
 * Owner: Member 2 - Bakhtawar (02-134231-100)
 * Requirements: FR-02 (send a message in a permitted channel), FR-04 (search with criteria and modifiers)
 */
import { test, expect } from '@playwright/test';
import { MM, keyword } from '../utils/api';
import { rt } from '../utils/runtime';
import { uiLogin, openChannel, uiPost } from '../utils/ui';
import { actual, meta } from '../utils/evidence';

const OWNER = 'Bakhtawar (Member 2)';

test.describe('Module B - Messaging & Search', () => {
  test('TC-B01 [FR-02][EP-valid] Sent message is displayed and persists after reload @smoke @fr02 @memberB', async ({ page }) => {
    const u = rt().users.alice;
    const msg = `Smoke message ${keyword('msg')}`;
    meta({ req: 'FR-02', owner: OWNER, technique: 'EP - valid partition (normal text message, member of the channel)', inputs: msg });

    await uiLogin(page, u.username, u.password);
    await expect(page).toHaveURL(/\/channels\//, { timeout: 30_000 });
    await openChannel(page, rt().teamName, rt().channels.scratch.name);
    await uiPost(page, msg);
    await expect(page.getByText(msg).first()).toBeVisible();

    // persistence (A1 QO-04): reload the page, message must still be there
    await page.reload();
    await expect(page.getByText(msg).first()).toBeVisible();

    // API cross-check: message stored on the server
    const api = await MM.login(u.username, u.password);
    const posts = await (await api.get(`/api/v4/channels/${rt().channels.scratch.id}/posts?per_page=30`)).json();
    const stored = Object.values<any>(posts.posts).some((p) => p.message === msg);
    expect(stored).toBeTruthy();
    actual('Message shown, still shown after reload, found via API');
    await api.dispose();
  });

  test('TC-B02 [FR-02][BVA] Message length: max accepted, max+1 rejected @fr02 @memberB', async () => {
    const api = await MM.login(rt().users.alice.username, rt().users.alice.password);
    const max = Number((await api.clientConfig()).MaxPostSize ?? 16383);
    meta({ req: 'FR-02', owner: OWNER, technique: `BVA - max (${max}) and max+1 (${max + 1}) characters`, inputs: `messages of ${max} and ${max + 1} characters` });

    const atMax = await api.createPost(rt().channels.scratch.id, 'x'.repeat(max));
    expect(atMax.status(), `${max} chars (on boundary) must be accepted`).toBe(201);
    expect((await atMax.json()).message.length, 'message must not be truncated').toBe(max);

    const overMax = await api.createPost(rt().channels.scratch.id, 'x'.repeat(max + 1));
    expect(overMax.status(), `${max + 1} chars (above boundary) must be rejected`).toBe(400);

    actual(`MaxPostSize=${max}; ${max} chars -> HTTP ${atMax.status()}; ${max + 1} chars -> HTTP ${overMax.status()}`);
    await api.dispose();
  });

  test('TC-B03 [FR-04][EP-valid] Keyword search with the in: modifier returns only messages from that channel @fr04 @memberB', async () => {
    const api = await MM.login(rt().users.alice.username, rt().users.alice.password);
    const kw = keyword();
    const scratch = rt().channels.scratch;
    meta({ req: 'FR-04', owner: OWNER, technique: 'EP - valid partition (existing keyword + supported modifier)', inputs: `"${kw}" and "${kw} in:${scratch.name}"` });

    const inScratch = await (await api.createPost(scratch.id, `Budget report ${kw}`)).json();
    const inPrivate = await (await api.createPost(rt().channels.private.id, `Quarterly planning ${kw}`)).json();

    // plain keyword: both messages
    await expect.poll(async () => ((await (await api.search(rt().teamId, kw)).json()).order ?? []).length,
      { timeout: 20_000, message: 'plain keyword search should return both posts' }).toBe(2);

    // keyword + in: modifier: only the message from that channel
    const filtered = await (await api.search(rt().teamId, `${kw} in:${scratch.name}`)).json();
    expect(filtered.order).toEqual([inScratch.id]);
    expect(filtered.order).not.toContain(inPrivate.id);

    actual(`"${kw}" -> 2 results; "${kw} in:${scratch.name}" -> ${filtered.order.length} result (post ${inScratch.id})`);
    await api.dispose();
  });

  test('TC-B04 [FR-04][EP-invalid] Misspelled / non-existent keyword returns no results @fr04 @memberB', async () => {
    const api = await MM.login(rt().users.alice.username, rt().users.alice.password);
    const kw = keyword('budget');
    const misspelled = kw.replace('budget', 'budhet'); // same mistake as A1 QO-02
    meta({ req: 'FR-04', owner: OWNER, technique: 'EP - invalid partition (term that matches no message)', inputs: `stored "${kw}", searched "${misspelled}"` });

    await api.createPost(rt().channels.scratch.id, `Search target ${kw}`);
    await expect.poll(async () => ((await (await api.search(rt().teamId, kw)).json()).order ?? []).length, { timeout: 20_000 }).toBe(1);

    const res = await api.search(rt().teamId, misspelled);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.order ?? []).toHaveLength(0);

    actual(`Correct term -> 1 result; misspelled "${misspelled}" -> HTTP ${res.status()}, ${(body.order ?? []).length} results`);
    await api.dispose();
  });
});
