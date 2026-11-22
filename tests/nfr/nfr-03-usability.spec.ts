/**
 * NFR-03 Usability - Owner: Member 1 - Aimen
 * A1 wording: consistent and understandable interface that lets users complete common communication tasks
 * without unnecessary difficulty.
 * Measurable form (two indicators):
 *   (1) Accessibility: 0 "critical" axe-core WCAG 2.0/2.1 A+AA violations on the sign-up page, login page
 *       and a channel view (the screens of the critical workflow).
 *   (2) Task efficiency: the common task "open a channel and send a message" completes in the UI in
 *       <= 5 s (median of 3 attempts, measured from navigation to message visible).
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { keyword } from '../../utils/api';
import { rt } from '../../utils/runtime';
import { uiLogin, openChannel, uiPost } from '../../utils/ui';
import { actual, meta, saveNfr } from '../../utils/evidence';
import thresholds from '../../test-data/nfr-thresholds.json';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

function summarize(violations: { id: string; impact?: string | null; nodes: unknown[]; help: string }[]) {
  const byImpact: Record<string, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of violations) byImpact[v.impact ?? 'minor'] = (byImpact[v.impact ?? 'minor'] ?? 0) + 1;
  return { total: violations.length, byImpact, rules: violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })) };
}

test('NFR-03 [Usability] No critical accessibility violations; send-message task within time limit @nfr @memberA', async ({ page }) => {
  const t = thresholds['NFR-03'];
  meta({ req: 'NFR-03', owner: 'Aimen (Member 1)', technique: 'Measurement (axe-core scan + task timing)', inputs: `pages: /signup_user_complete, /login, channel view; tags ${TAGS.join(',')}; 3 timed send-message tasks` });

  // (1) accessibility scans
  await page.goto('/signup_user_complete');
  await page.waitForLoadState('networkidle');
  const signup = summarize((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations);

  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  const login = summarize((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations);

  await uiLogin(page, rt().users.alice.username, rt().users.alice.password);
  await expect(page).toHaveURL(/\/channels\//, { timeout: 30_000 });
  await openChannel(page, rt().teamName, rt().channels.scratch.name);
  await page.waitForLoadState('networkidle');
  const channel = summarize((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations);

  // (2) task timing: open channel + send message, until the message is visible
  const timings: number[] = [];
  for (let i = 0; i < 3; i++) {
    const msg = `Usability task ${i} ${keyword('ux')}`;
    const t0 = Date.now();
    await openChannel(page, rt().teamName, rt().channels.scratch.name);
    await uiPost(page, msg);
    await expect(page.getByText(msg).first()).toBeVisible();
    timings.push(Date.now() - t0);
  }
  const medianMs = [...timings].sort((a, b) => a - b)[1];

  const critical = signup.byImpact.critical + login.byImpact.critical + channel.byImpact.critical;
  const result = {
    id: 'NFR-03',
    metric: t.metric,
    conditions: { tool: 'axe-core via @axe-core/playwright', tags: TAGS, browser: 'Chromium 1366x768', task: 'open channel + send message (3 attempts)', server: rt().baseUrl, version: rt().serverVersion },
    threshold: { max_critical: t.max_critical, task_median_ms_max: t.task_median_ms_max },
    measured: { critical_total: critical, signup, login, channel, task_timings_ms: timings, task_median_ms: medianMs },
  };
  await saveNfr('NFR-03', result);
  actual(`critical: signup ${signup.byImpact.critical}, login ${login.byImpact.critical}, channel ${channel.byImpact.critical} (serious: ${signup.byImpact.serious}/${login.byImpact.serious}/${channel.byImpact.serious}); task median ${medianMs} ms [${timings.join(', ')}]`);

  expect(critical).toBeLessThanOrEqual(t.max_critical);
  expect(medianMs).toBeLessThanOrEqual(t.task_median_ms_max);
});
