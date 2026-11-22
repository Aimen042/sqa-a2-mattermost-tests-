/**
 * NFR-02 Security - Owner: Member 3 - Muhammad Huzaifa
 * A1 wording: restrict private-channel content and privileged operations to authorized users according to
 * assigned roles and permissions. Continues A1 QO-03 (incl. its suggested extra check: a REMOVED member must not
 * find earlier messages through search or reach the channel by direct link).
 * Measurable form: 100% of unauthorized requests denied across 4 probe groups:
 *   G1 non-member  G2 removed member (checked immediately after removal)  G3 regular user -> admin operations
 *   G4 no session / forged token
 */
import { test, expect } from '@playwright/test';
import { MM, keyword, uniq } from '../../utils/api';
import { rt } from '../../utils/runtime';
import { actual, meta, saveNfr } from '../../utils/evidence';
import thresholds from '../../test-data/nfr-thresholds.json';

type Row = { group: string; check: string; status: number | string; denied: boolean };

test('NFR-02 [Security] Private-channel content and privileged operations restricted to authorized users @nfr @memberC', async () => {
  const t = thresholds['NFR-02'];
  const { alice, bob, eve } = rt().users;
  meta({ req: 'NFR-02', owner: 'Muhammad Huzaifa (Member 3)', technique: 'Measurement (authorization probes)', inputs: 'non-member, removed member, regular user vs admin APIs, no/forged session' });

  const owner = await MM.login(alice.username, alice.password);
  const member = await MM.login(bob.username, bob.password);
  const outsider = await MM.login(eve.username, eve.password);
  const anon = await MM.anonymous();
  const forged = await MM.anonymous({ Authorization: 'Bearer abcdefghijklmnopqrstuvwxyz', 'X-Requested-With': 'XMLHttpRequest' });

  // Fixture: like A1 QO-03 - private channel with a message and a file, bob added
  const kw = keyword('secret');
  const ch = await (await owner.createChannel(rt().teamId, uniq('qa-test02'), `QA_Test02 ${kw}`, 'P')).json();
  await owner.addChannelMember(ch.id, bob.id);
  const file = (await (await owner.uploadFileRaw(ch.id, 'confidential.txt', Buffer.from(`top secret ${kw}`))).json()).file_infos[0];
  const post = await (await owner.createPost(ch.id, `Confidential ${kw}`, [file.id])).json();
  // precondition: bob (member) CAN see it - so later denials are meaningful
  await expect.poll(async () => ((await (await member.search(rt().teamId, kw)).json()).order ?? []).length, { timeout: 20_000 }).toBe(1);
  expect((await member.get(`/api/v4/channels/${ch.id}`)).status()).toBe(200);

  const rows: Row[] = [];
  const probe = async (group: string, c: MM) => {
    const s = (await c.get(`/api/v4/channels/${ch.id}`)).status();
    rows.push({ group, check: 'GET channel (direct link)', status: s, denied: s === 403 || s === 404 });
    const p = (await c.get(`/api/v4/channels/${ch.id}/posts`)).status();
    rows.push({ group, check: 'GET channel posts', status: p, denied: p === 403 || p === 404 });
    const sp = (await c.get(`/api/v4/posts/${post.id}`)).status();
    rows.push({ group, check: 'GET single post by id', status: sp, denied: sp === 403 || sp === 404 });
    const f = (await c.get(`/api/v4/files/${file.id}`)).status();
    rows.push({ group, check: 'Download attached file', status: f, denied: f === 403 || f === 404 });
    const w = (await c.createPost(ch.id, 'intrusion attempt')).status();
    rows.push({ group, check: 'POST message into channel', status: w, denied: w === 403 });
    const sr = await (await c.search(rt().teamId, kw)).json();
    const n = (sr.order ?? []).length;
    rows.push({ group, check: 'Search for channel keyword', status: `${n} results`, denied: n === 0 });
  };

  // G1 non-member
  await probe('G1 non-member (eve)', outsider);

  // G2 removed member - removal, then probe immediately
  const removedAt = Date.now();
  expect((await owner.removeChannelMember(ch.id, bob.id)).status()).toBe(200);
  await probe('G2 removed member (bob)', member);
  const g2ProbeMs = Date.now() - removedAt;

  // G3 privileged (admin-only) operations by a regular user
  const adminOps: [string, () => Promise<number>][] = [
    ['GET server config', async () => (await outsider.get('/api/v4/config')).status()],
    ['PATCH server config', async () => (await outsider.put('/api/v4/config/patch', { FileSettings: { MaxFileSize: 1 } })).status()],
    ['Deactivate another user', async () => (await outsider.ctx.delete(`/api/v4/users/${alice.id}`)).status()],
    ['Delete private channel not a member of', async () => (await outsider.ctx.delete(`/api/v4/channels/${ch.id}`)).status()],
  ];
  for (const [check, run] of adminOps) {
    const s = await run();
    rows.push({ group: 'G3 regular user -> privileged op', check, status: s, denied: s === 403 || s === 401 });
  }

  // G4 unauthenticated / forged
  for (const [label, c] of [['G4 no session', anon], ['G4 forged token', forged]] as const) {
    for (const path of ['/api/v4/users/me', `/api/v4/channels/${ch.id}`, `/api/v4/channels/${ch.id}/posts`]) {
      const s = (await c.get(path)).status();
      rows.push({ group: label, check: `GET ${path.replace(ch.id, '{private}')}`, status: s, denied: s === 401 });
    }
  }

  const deniedPct = (rows.filter((r) => r.denied).length / rows.length) * 100;
  const result = {
    id: 'NFR-02',
    metric: t.metric,
    conditions: { probes: rows.length, removed_member_probed_within_ms: g2ProbeMs, server: rt().baseUrl, version: rt().serverVersion },
    threshold: { denied_pct_min: t.denied_pct_min },
    measured: { denied: rows.filter((r) => r.denied).length, total: rows.length, denied_pct: +deniedPct.toFixed(1) },
    details: rows,
  };
  await saveNfr('NFR-02', result);
  const failed = rows.filter((r) => !r.denied).map((r) => `${r.group}: ${r.check} -> ${r.status}`);
  actual(`${result.measured.denied}/${rows.length} unauthorized requests denied (${result.measured.denied_pct}%)` + (failed.length ? `; NOT denied: ${failed.join('; ')}` : ''));

  expect(failed, 'every unauthorized request must be denied').toEqual([]);
  expect(deniedPct).toBeGreaterThanOrEqual(t.denied_pct_min);

  for (const c of [owner, member, outsider, anon, forged]) await c.dispose();
});
