/**
 * MODULE A - User Authentication & Account Management
 * Owner: Member 1 - Aimen (02-134231-042)
 * Requirements: FR-01 (login, from Assignment 1), FR-06 (registration with input validation, NEW - from A1 QO-01)
 */
import { test, expect } from '@playwright/test';
import { MM } from '../utils/api';
import { rt } from '../utils/runtime';
import { SEL, uiLogin, dismissOverlays } from '../utils/ui';
import { actual, meta } from '../utils/evidence';

const OWNER = 'Aimen (Member 1)';

/** Unique, valid username (3-22 chars, starts with a letter) and matching email. */
function newAccount(prefix: string) {
  const id = `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.slice(0, 20);
  return { username: id, email: `${id}@example.com` };
}

test.describe('Module A - User Authentication & Account Management', () => {
  test('TC-A01 [FR-01][EP-valid] Login with valid credentials opens the team workspace @smoke @fr01 @memberA', async ({ page }) => {
    const u = rt().users.alice;
    meta({ req: 'FR-01', owner: OWNER, technique: 'EP - valid partition (registered user + correct password)', inputs: `${u.username} / ${u.password}` });

    await uiLogin(page, u.username, u.password);

    // Assertions: redirected into the team, message box available, session cookie issued
    await expect(page).toHaveURL(new RegExp(`/${rt().teamName}/channels/`), { timeout: 30_000 });
    await dismissOverlays(page);
    await expect(page.locator(SEL.postTextbox).first()).toBeVisible();
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === 'MMAUTHTOKEN')).toBeTruthy();
    actual(`Logged in; landed on ${new URL(page.url()).pathname}; MMAUTHTOKEN cookie present`);
  });

  test('TC-A02 [FR-01][EP-invalid] Login with wrong password is rejected @fr01 @memberA', async ({ page }) => {
    const u = rt().users.alice;
    const wrong = 'WrongPass#000';
    meta({ req: 'FR-01', owner: OWNER, technique: 'EP - invalid partition (registered user + wrong password)', inputs: `${u.username} / ${wrong}` });

    await uiLogin(page, u.username, wrong);

    // UI assertions: an error is shown and the user stays on the login page
    const error = page.getByText(/password is incorrect|invalid|incorrect/i).first();
    await expect(error).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    const errorText = (await error.textContent())?.trim();
    // API assertion: the same credentials are refused with 401
    const res = await MM.loginRaw(u.username, wrong);
    expect(res.status()).toBe(401);
    actual(`Error shown: "${errorText}"; stayed on /login; API login returned ${res.status()}`);

    // reset the failed-attempt counter so repeated runs never lock the account
    expect((await MM.loginRaw(u.username, u.password)).status()).toBe(200);
  });

  test('TC-A03 [FR-06][BVA] Registration password length: min-1 rejected, min accepted @fr06 @memberA', async () => {
    const min = rt().passwordMinLength;
    const anon = await MM.anonymous();
    const short = newAccount('bvas');
    const ok = newAccount('bvam');
    const pwShort = 'Ab1#'.padEnd(min - 1, 'x').slice(0, min - 1);
    const pwMin = 'Ab1#'.padEnd(min, 'x');
    meta({ req: 'FR-06', owner: OWNER, technique: `BVA - password length min-1 (${min - 1}) and min (${min})`, inputs: `password lengths ${pwShort.length} and ${pwMin.length}` });

    const below = await anon.signUp(short.email, short.username, pwShort);
    expect(below.status(), `${min - 1} chars (below boundary) must be rejected`).toBe(400);
    const belowId = (await below.json()).id;

    const atMin = await anon.signUp(ok.email, ok.username, pwMin);
    expect(atMin.status(), `${min} chars (on boundary) must be accepted`).toBe(201);
    // the new account can log in with that password
    expect((await MM.loginRaw(ok.username, pwMin)).status()).toBe(200);

    actual(`PasswordSettings.MinimumLength=${min}; ${min - 1} chars -> ${below.status()} (${belowId}); ${min} chars -> ${atMin.status()}, login 200`);
    await anon.dispose();
  });

  test('TC-A04 [FR-06][EP-invalid] Registration with an invalid email address is rejected @fr06 @memberA', async () => {
    const anon = await MM.anonymous();
    const acc = newAccount('bade');
    const badEmail = 'not-an-email';
    meta({ req: 'FR-06', owner: OWNER, technique: 'EP - invalid partition (email without @ and domain)', inputs: `email="${badEmail}", username=${acc.username}` });

    const res = await anon.signUp(badEmail, acc.username, 'Valid#Pass2026');
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(String(body.id)).toMatch(/email/i); // error refers to the email field (A1 QO-01: field-specific errors)
    // no account was created
    expect((await MM.loginRaw(acc.username, 'Valid#Pass2026')).status()).toBe(401);

    actual(`HTTP ${res.status()} - ${body.id}: "${body.message}"; login for that username -> 401 (not created)`);
    await anon.dispose();
  });
});
