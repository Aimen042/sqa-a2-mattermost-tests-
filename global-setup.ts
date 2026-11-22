import fs from 'fs';
import path from 'path';
import { request } from '@playwright/test';
import { ADMIN, BASE_URL, MAX_FILE_SIZE_MB, RUN_NAME } from './utils/env';
import { MM } from './utils/api';
import { RUNTIME_FILE, Runtime, RuntimeUser } from './utils/runtime';
import data from './test-data/users.json';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Prepares the authorized local test environment before every run:
 *  1. waits for Mattermost, records the server version
 *  2. ensures a system admin exists (first account on a fresh server becomes admin)
 *  3. applies test configuration (file size limit = MAX_FILE_SIZE_MB, open sign-up for FR-06)
 *  4. creates team, test users and channels if missing
 *  5. writes ids to .runtime/runtime.json for the tests
 */
export default async function globalSetup() {
  // 1. wait for the server
  const anon = await request.newContext({ baseURL: BASE_URL });
  let version = '';
  for (let i = 0; i < 60; i++) {
    try {
      const ping = await anon.get('/api/v4/system/ping');
      if (ping.ok()) { version = ping.headers()['x-version-id'] ?? 'unknown'; break; }
    } catch { /* not up yet */ }
    if (i === 59) throw new Error(`Mattermost is not reachable at ${BASE_URL}. Start it with: npm run mm:start`);
    await sleep(2000);
  }

  // 2. admin
  let admin: MM;
  try {
    admin = await MM.login(ADMIN.username, ADMIN.password);
  } catch {
    const created = await anon.post('/api/v4/users', {
      data: { email: ADMIN.email, username: ADMIN.username, password: ADMIN.password },
    });
    if (!created.ok()) {
      throw new Error(
        `Could not log in as or create the admin "${ADMIN.username}" (HTTP ${created.status()}: ${await created.text()}).\n` +
        `If this server already has an admin account, run with MM_ADMIN_USER=<user> MM_ADMIN_PASS=<password>.`,
      );
    }
    admin = await MM.login(ADMIN.username, ADMIN.password);
  }
  const adminMe = await admin.me();
  if (!String(adminMe.roles).includes('system_admin')) {
    throw new Error(`"${ADMIN.username}" is not a system admin. Use an admin account via MM_ADMIN_USER / MM_ADMIN_PASS.`);
  }
  // mark first-run site setup as complete so the UI does not redirect to the setup wizard
  await admin.post('/api/v4/system/onboarding/complete', { organization: 'SQA Lab', install_plugins: [] }).catch(() => undefined);

  // 3. test configuration
  const maxFileSize = Math.round(MAX_FILE_SIZE_MB * 1024 * 1024);
  const patch = await admin.put('/api/v4/config/patch', {
    FileSettings: { EnableFileAttachments: true, MaxFileSize: maxFileSize },
    ServiceSettings: { EnableTutorial: false, EnableOnboardingFlow: false },
    // FR-06 (registration) needs self sign-up to be open on the test server
    TeamSettings: { EnableUserCreation: true, EnableOpenServer: true },
    EmailSettings: { EnableSignUpWithEmail: true, RequireEmailVerification: false },
  });
  if (!patch.ok()) console.warn(`[setup] config patch returned HTTP ${patch.status()}: ${await patch.text()}`);
  const cfg = await (await admin.get('/api/v4/config')).json();
  const effectiveMax = Number(cfg?.FileSettings?.MaxFileSize ?? maxFileSize);
  const passwordMinLength = Number(cfg?.PasswordSettings?.MinimumLength ?? 8);

  // 4. team
  const teamRes = await admin.get(`/api/v4/teams/name/${data.team.name}`);
  let team: any = teamRes.ok() ? await teamRes.json() : null;
  if (!team) {
    const res = await admin.post('/api/v4/teams', { name: data.team.name, display_name: data.team.display_name, type: 'O' });
    if (!res.ok()) throw new Error(`Team creation failed: ${res.status()} ${await res.text()}`);
    team = await res.json();
  }

  // users
  const users: Record<string, RuntimeUser> = {};
  for (const [key, u] of Object.entries(data.users)) {
    let res = await admin.get(`/api/v4/users/username/${u.username}`);
    let user: any;
    if (res.ok()) {
      user = await res.json();
      // make sure the known password is set (in case the account was edited by hand)
      await admin.put(`/api/v4/users/${user.id}/password`, { new_password: u.password });
    } else {
      res = await admin.post('/api/v4/users', { email: u.email, username: u.username, password: u.password });
      if (!res.ok()) throw new Error(`User ${u.username} creation failed: ${res.status()} ${await res.text()}`);
      user = await res.json();
    }
    await admin.post(`/api/v4/teams/${team.id}/members`, { team_id: team.id, user_id: user.id });
    // hide tutorials / tours so they do not cover the UI
    const prefs = [
      { category: 'tutorial_step', name: user.id, value: '999' },
      { category: 'recommended_next_steps', name: 'hide', value: 'true' },
      { category: 'onboarding_task_list', name: 'onboarding_task_list_show', value: 'false' },
      { category: 'onboarding_task_list', name: 'onboarding_task_list_open', value: 'false' },
      { category: 'crt_thread_pane_step', name: user.id, value: '999' },
      { category: 'crt_tutorial_triggered', name: user.id, value: '999' },
      { category: 'drafts', name: 'drafts_tour_tip_showed', value: JSON.stringify({ drafts_tour_tip_showed: true }) },
    ].map((p) => ({ user_id: user.id, ...p }));
    await admin.put(`/api/v4/users/${user.id}/preferences`, prefs);
    users[key] = { id: user.id, username: u.username, password: u.password };
  }

  // channels
  // make sure the admin is a full team member (some versions fail channel creation otherwise)
  await admin.post(`/api/v4/teams/${team.id}/members`, { team_id: team.id, user_id: adminMe.id });
  const findChannel = async (name: string) => {
    const res = await admin.get(`/api/v4/teams/${team.id}/channels/name/${name}?include_deleted=true`);
    if (!res.ok()) return null;
    const ch = await res.json();
    if (ch.delete_at && ch.delete_at > 0) await admin.post(`/api/v4/channels/${ch.id}/restore`); // un-archive leftovers
    return ch;
  };
  const channels: any = {};
  for (const [key, c] of Object.entries(data.channels)) {
    let ch = await findChannel(c.name);
    for (let attempt = 1; !ch && attempt <= 3; attempt++) {
      const res = await admin.createChannel(team.id, c.name, c.display_name, c.type as 'O' | 'P');
      if (res.ok()) { ch = await res.json(); break; }
      const err = `${res.status()} ${await res.text()}`;
      // the server may have created the channel and then failed a follow-up step - look again
      await sleep(1000);
      ch = await findChannel(c.name);
      if (!ch && attempt === 3) throw new Error(`Channel ${c.name} creation failed after 3 attempts: ${err}`);
      if (!ch) console.warn(`[setup] channel ${c.name} attempt ${attempt} failed (${err}) - retrying`);
    }
    channels[key] = { id: ch.id, name: ch.name, display_name: ch.display_name };
  }
  // memberships: alice in both; bob in private (and scratch); eve only in scratch (NOT in private)
  await admin.addChannelMember(channels.scratch.id, users.alice.id);
  await admin.addChannelMember(channels.scratch.id, users.bob.id);
  await admin.addChannelMember(channels.scratch.id, users.eve.id);
  await admin.addChannelMember(channels.private.id, users.alice.id);
  await admin.addChannelMember(channels.private.id, users.bob.id);
  const eveInPrivate = await admin.get(`/api/v4/channels/${channels.private.id}/members/${users.eve.id}`);
  if (eveInPrivate.ok()) await admin.ctx.delete(`/api/v4/channels/${channels.private.id}/members/${users.eve.id}`);

  // 5. runtime file
  const runtime: Runtime = {
    serverVersion: version,
    baseUrl: BASE_URL,
    teamId: team.id,
    teamName: team.name,
    maxFileSize: effectiveMax,
    passwordMinLength,
    users: users as Runtime['users'],
    channels,
  };
  fs.mkdirSync(path.dirname(RUNTIME_FILE), { recursive: true });
  fs.writeFileSync(RUNTIME_FILE, JSON.stringify(runtime, null, 2));

  // environment record for the report
  const envDir = path.join(__dirname, 'reports', RUN_NAME);
  fs.mkdirSync(envDir, { recursive: true });
  fs.writeFileSync(
    path.join(envDir, 'environment.json'),
    JSON.stringify({
      run: RUN_NAME,
      startedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      mattermostVersion: version,
      maxFileSizeBytes: effectiveMax,
      passwordMinLength,
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
    }, null, 2),
  );
  console.log(`[setup] Mattermost ${version} at ${BASE_URL} | MaxFileSize=${effectiveMax} bytes | run=${RUN_NAME}`);

  await admin.dispose();
  await anon.dispose();
}
