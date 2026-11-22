/**
 * MODULE C - Teams/Channels & File Sharing
 * Owner: Member 3 - Muhammad Huzaifa (02-134231-006)
 * Requirements: FR-03 (create / manage channels), FR-05 (attach and share files)
 */
import { test, expect } from '@playwright/test';
import { MM, keyword, uniq } from '../utils/api';
import { rt } from '../utils/runtime';
import { SEL, uiLogin, openChannel } from '../utils/ui';
import { actual, meta } from '../utils/evidence';

const OWNER = 'Muhammad Huzaifa (Member 3)';

test.describe('Module C - Channels & File Sharing', () => {
  test('TC-C01 [FR-03][EP-valid] User creates a private channel, adds a member, and the member can open it @smoke @fr03 @memberC', async ({ page }) => {
    const { alice, bob } = rt().users;
    const name = uniq('qa-test');
    const display = `QA_Test ${keyword('ch')}`;
    meta({ req: 'FR-03', owner: OWNER, technique: 'EP - valid partition (valid name, user permitted to create)', inputs: `name=${name}, display="${display}", type=P, member=${bob.username}` });

    const api = await MM.login(alice.username, alice.password);
    const created = await api.createChannel(rt().teamId, name, display, 'P');
    expect(created.status()).toBe(201);
    const ch = await created.json();
    expect(ch.type).toBe('P');
    expect((await api.addChannelMember(ch.id, bob.id)).status()).toBe(201);

    // the added member opens it in the UI
    await uiLogin(page, bob.username, bob.password);
    await expect(page).toHaveURL(/\/channels\//, { timeout: 30_000 });
    await openChannel(page, rt().teamName, name);
    await expect(page.getByText(display).first()).toBeVisible();
    await expect(page.locator(SEL.postTextbox).first()).toBeVisible();

    actual(`Channel created (201, type P), bob added (201), bob opened /${rt().teamName}/channels/${name} in the UI`);
    await api.dispose();
  });

  test('TC-C02 [FR-03][BVA] Channel display name: 64 chars accepted, 65 chars rejected @fr03 @memberC', async () => {
    const api = await MM.login(rt().users.alice.username, rt().users.alice.password);
    meta({ req: 'FR-03', owner: OWNER, technique: 'BVA - max (64) and max+1 (65) on display name length', inputs: 'display_name of length 64 and 65' });

    const atMax = await api.createChannel(rt().teamId, uniq('bva64'), 'B'.repeat(64), 'O');
    expect(atMax.status(), 'length 64 (on boundary) must be accepted').toBe(201);
    expect((await atMax.json()).display_name).toHaveLength(64);

    const overMax = await api.createChannel(rt().teamId, uniq('bva65'), 'B'.repeat(65), 'O');
    expect(overMax.status(), 'length 65 (above boundary) must be rejected').toBe(400);

    actual(`64 chars -> HTTP ${atMax.status()}; 65 chars -> HTTP ${overMax.status()}`);
    await api.dispose();
  });

  test('TC-C03 [FR-05][BVA] File size: exactly max accepted, max+1 byte rejected @fr05 @memberC', async () => {
    const max = rt().maxFileSize;
    const api = await MM.login(rt().users.alice.username, rt().users.alice.password);
    meta({ req: 'FR-05', owner: OWNER, technique: `BVA - max (${max} B) and max+1 (${max + 1} B)`, inputs: `binary files of ${max} and ${max + 1} bytes` });

    const atMax = await api.uploadFileRaw(rt().channels.private.id, 'bva-at-max.bin', Buffer.alloc(max, 0x61));
    expect(atMax.status(), 'file of exactly the maximum size must be accepted').toBe(201);
    expect((await atMax.json()).file_infos[0].size).toBe(max);

    const overMax = await api.uploadFileRaw(rt().channels.private.id, 'bva-over-max.bin', Buffer.alloc(max + 1, 0x61));
    expect(overMax.status(), 'file one byte above the maximum must be rejected').toBe(413);
    const err = await overMax.json().catch(() => ({}));

    actual(`MaxFileSize=${max}; ${max} B -> HTTP ${atMax.status()}; ${max + 1} B -> HTTP ${overMax.status()} ${err.id ?? ''}`);
    await api.dispose();
  });

  test('TC-C04 [FR-05][EP-valid] File attached to a message is downloaded unchanged by another member @fr05 @memberC', async () => {
    const api = await MM.login(rt().users.alice.username, rt().users.alice.password);
    const bob = await MM.login(rt().users.bob.username, rt().users.bob.password);
    const content = `SQA evidence file ${keyword('file')}\nLine 2`;
    meta({ req: 'FR-05', owner: OWNER, technique: 'EP - valid partition (supported file within size limit)', inputs: `notes.txt (${Buffer.byteLength(content)} B)` });

    const up = await api.uploadFileRaw(rt().channels.private.id, 'notes.txt', Buffer.from(content));
    expect(up.status()).toBe(201);
    const info = (await up.json()).file_infos[0];

    const post = await api.createPost(rt().channels.private.id, 'Attaching notes.txt', [info.id]);
    expect(post.status()).toBe(201);
    expect((await post.json()).file_ids).toContain(info.id);

    const fileInfo = await (await bob.get(`/api/v4/files/${info.id}/info`)).json();
    expect(fileInfo.name).toBe('notes.txt');
    const dl = await bob.get(`/api/v4/files/${info.id}`);
    expect(dl.status()).toBe(200);
    expect((await dl.body()).toString()).toBe(content);

    actual(`Upload 201 (${info.size} B), post 201 with file id, member sees name "${fileInfo.name}" and downloads identical content (200)`);
    await api.dispose(); await bob.dispose();
  });
});
