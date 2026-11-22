/**
 * NFR-01 Performance - Owner: Member 2 - Bakhtawar
 * A1 wording: acceptable response time for common operations such as opening channels and searching messages
 * under normal operating conditions.
 * Measurable form: with 5 concurrent virtual users x 10 iterations (50 samples per operation),
 *   - search API p95 <= 1000 ms
 *   - open-channel (GET channel + GET latest 60 posts) p95 <= 1000 ms
 *   - 0 errors.
 * Run ONLY against the local Codespaces instance (authorized test environment).
 */
import { test, expect } from '@playwright/test';
import { performance } from 'perf_hooks';
import { MM, keyword } from '../../utils/api';
import { rt } from '../../utils/runtime';
import { actual, meta, saveNfr, percentile } from '../../utils/evidence';
import thresholds from '../../test-data/nfr-thresholds.json';

function stats(samples: number[]) {
  const s = [...samples].sort((a, b) => a - b);
  const r = (n: number) => +n.toFixed(1);
  return { n: s.length, min_ms: r(s[0]), p50_ms: r(percentile(s, 50)), p90_ms: r(percentile(s, 90)), p95_ms: r(percentile(s, 95)), max_ms: r(s[s.length - 1]), avg_ms: r(s.reduce((a, b) => a + b, 0) / s.length) };
}

test('NFR-01 [Performance] Search and open-channel p95 response time under 5 concurrent users @nfr @memberB', async () => {
  const t = thresholds['NFR-01'];
  const { virtual_users: vus, iterations_per_user: iters, seed_posts: seedCount } = t.workload;
  meta({ req: 'NFR-01', owner: 'Bakhtawar (Member 2)', technique: 'Measurement (concurrent load, local)', inputs: `${vus} VUs x ${iters} iterations; ${seedCount} seeded posts` });

  const kw = keyword('perf');
  const ch = rt().channels.scratch;
  const seeder = await MM.login(rt().users.alice.username, rt().users.alice.password);
  for (let i = 0; i < seedCount; i++) await seeder.createPost(ch.id, `Load seed ${i} ${kw}`);
  await expect.poll(async () => ((await (await seeder.search(rt().teamId, kw)).json()).order ?? []).length, { timeout: 30_000 }).toBe(seedCount);
  await seeder.search(rt().teamId, kw); // warm-up, not measured

  const clients = await Promise.all(Array.from({ length: vus }, () => MM.login(rt().users.alice.username, rt().users.alice.password)));
  const search: number[] = [];
  const open: number[] = [];
  let errors = 0;
  const started = performance.now();
  await Promise.all(clients.map(async (c) => {
    for (let i = 0; i < iters; i++) {
      let t0 = performance.now();
      const s = await c.search(rt().teamId, kw);
      search.push(performance.now() - t0);
      if (s.status() !== 200 || ((await s.json()).order ?? []).length !== seedCount) errors++;

      t0 = performance.now();
      const [chRes, postsRes] = await Promise.all([c.get(`/api/v4/channels/${ch.id}`), c.get(`/api/v4/channels/${ch.id}/posts?per_page=60`)]);
      await postsRes.body();
      open.push(performance.now() - t0);
      if (chRes.status() !== 200 || postsRes.status() !== 200) errors++;
    }
  }));
  const wallS = (performance.now() - started) / 1000;
  const total = search.length + open.length;

  const result = {
    id: 'NFR-01',
    metric: t.metric,
    conditions: { virtual_users: vus, iterations_per_user: iters, samples_per_operation: search.length, seeded_posts: seedCount, server: rt().baseUrl, version: rt().serverVersion },
    threshold: { search_p95_ms_max: t.search_p95_ms_max, open_channel_p95_ms_max: t.open_channel_p95_ms_max, error_rate_max: t.error_rate_max },
    measured: { search: stats(search), open_channel: stats(open), errors, error_rate: errors / total, throughput_rps: +(total / wallS).toFixed(2) },
  };
  await saveNfr('NFR-01', result);
  actual(`search p95=${result.measured.search.p95_ms} ms; open-channel p95=${result.measured.open_channel.p95_ms} ms; errors=${errors}/${total}; ${result.measured.throughput_rps} req/s`);

  expect(errors / total).toBeLessThanOrEqual(t.error_rate_max);
  expect(result.measured.search.p95_ms).toBeLessThanOrEqual(t.search_p95_ms_max);
  expect(result.measured.open_channel.p95_ms).toBeLessThanOrEqual(t.open_channel_p95_ms_max);

  await Promise.all(clients.map((c) => c.dispose()));
  await seeder.dispose();
});
