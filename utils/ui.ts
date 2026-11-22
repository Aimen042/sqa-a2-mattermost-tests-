import { Page, expect } from '@playwright/test';

/**
 * All UI selectors live here. If Mattermost's markup differs in your version,
 * fix the selector ONCE here (use UI mode's "Pick locator":
 * `npx playwright test --ui --ui-host 0.0.0.0 --ui-port 8080`).
 * A broken selector is a SCRIPT error, not an app defect.
 */
export const SEL = {
  loginId: '#input_loginId, input[name="loginId"], input[placeholder*="mail" i], input[placeholder*="sername" i]',
  password: '#input_password-input, input[name="password-input"], input[type="password"]',
  postTextbox: '#post_textbox, [data-testid="post_textbox"]',
  fileInput: '#fileUploadInput, input[type="file"]',
};

export async function uiLogin(page: Page, username: string, password: string) {
  await page.goto('/login');
  // Mattermost may first show a "Where would you like to view this?" page - click "View in Browser"
  const viewInBrowser = page.getByRole('link', { name: /view in browser/i })
    .or(page.getByRole('button', { name: /view in browser/i })).first();
  const loginField = page.locator(SEL.loginId).first();
  await expect(loginField.or(viewInBrowser)).toBeVisible({ timeout: 30_000 });
  if (await viewInBrowser.isVisible()) {
    await viewInBrowser.click();
    await expect(loginField).toBeVisible({ timeout: 30_000 });
  }
  await loginField.fill(username);
  await page.locator(SEL.password).first().fill(password);
  await page.getByRole('button', { name: /^log in$/i }).click();
}

/** Closes onboarding tours / tips that can cover the message box. Safe to call any time. */
export async function dismissOverlays(page: Page) {
  for (const name of [/skip tour/i, /no thanks/i, /not now/i, /^got it$/i, /^dismiss$/i]) {
    const btn = page.getByRole('button', { name }).first();
    if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {});
  }
  await page.keyboard.press('Escape').catch(() => {});
}

export async function openChannel(page: Page, teamName: string, channelName: string) {
  await page.goto(`/${teamName}/channels/${channelName}`);
  await dismissOverlays(page);
  await expect(page.locator(SEL.postTextbox).first()).toBeVisible();
}

export async function uiPost(page: Page, message: string) {
  const box = page.locator(SEL.postTextbox).first();
  await box.click();
  await box.fill(message);
  await box.press('Enter');
}
