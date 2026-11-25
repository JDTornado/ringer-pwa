// Sign-in, player claim, the scoring gate, offline start, and sign-out, clicked
// through as a new league member would, against LOCAL Supabase. Codes come
// from the local Mailpit inbox.
import { expect, test, type Page } from '@playwright/test';
import { NAMES, startGame, watchConsole } from './helpers';
import { SESSION_KEY, createPlayer, deleteAccount, latestCode, uniqueEmail, type TestPlayer } from './supabase';

let errors: string[] = [];
let email = '';
let player: TestPlayer;

test.beforeEach(async ({ page }, info) => {
  errors = watchConsole(page);
  email = uniqueEmail(`auth-${info.project.name}`);
  // A roster player nobody has claimed yet, with a name only this test uses.
  player = await createPlayer(`Zed Claimtest ${crypto.randomUUID().slice(0, 8)}`);
});
test.afterEach(async () => {
  await deleteAccount(email, [player.id]);
  expect(errors, 'console errors').toEqual([]);
});

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/auth/${name}-${test.info().project.name}.png`, fullPage: true });

async function signInWithCode(page: Page): Promise<void> {
  await page.getByLabel('Email').fill(email);
  const sentAt = Date.now() - 1000;
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByTestId('code-email')).toHaveText(email);
  await shot(page, '2-code');
  const code = await latestCode(email, sentAt);
  // Typing the 6th digit submits on its own.
  await page.getByLabel('6-digit code').fill(code);
}

test('new member: email code → claim player → score; session persists; sign out', async ({ page }) => {
  await page.goto('/');

  // Gate: signed out, the scoring screens aren't reachable.
  await expect(page.getByRole('heading', { name: 'Sign in to Ringer' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New Game' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Email me a code' })).toBeDisabled();
  await page.getByLabel('Email').fill('not-an-email');
  await expect(page.getByRole('button', { name: 'Email me a code' })).toBeDisabled();
  await shot(page, '1-signin');

  await signInWithCode(page);

  // First login: pick your player.
  await expect(page.getByRole('heading', { name: 'Which player are you?' })).toBeVisible();
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  const list = page.getByRole('list', { name: 'Players' });
  await expect(list.getByRole('button').first()).toBeVisible();
  // Seeded members who already claimed (Tom, Mae) and guests (Gus) aren't offered.
  await expect(list.getByText('Tom Wexler')).toHaveCount(0);
  await expect(list.getByText('Gus Turner')).toHaveCount(0);
  await shot(page, '3-claim-list');

  await page.getByLabel('Search players').fill('zzz nobody');
  await expect(page.getByText('No players match that search.')).toBeVisible();
  await page.getByLabel('Search players').fill(player.name.toLowerCase());
  await expect(list.getByRole('button')).toHaveCount(1);
  await list.getByRole('button', { name: new RegExp(`^${player.name}`) }).click();

  const confirm = page.getByRole('dialog', { name: 'Confirm your player' });
  await expect(confirm).toContainText(player.name);
  await expect(confirm).toContainText('only a league admin can change this');
  await shot(page, '4-claim-confirm');
  await confirm.getByRole('button', { name: "Yes, that's me" }).click();

  // Linked: scoring is open.
  await expect(page.getByRole('heading', { name: 'New Game' })).toBeVisible();
  await page.getByRole('button', { name: `Account: ${player.name}` }).click();
  await expect(page.getByTestId('account-player')).toHaveText(player.name);
  await expect(page.getByTestId('account-email')).toHaveText(email);
  await shot(page, '5-account-menu');
  // A tap outside closes the menu.
  await page.getByRole('heading', { name: 'New Game' }).click();
  await expect(page.getByRole('menu', { name: 'Account' })).toHaveCount(0);

  // The session survives a reload, and doesn't ask again who you are.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'New Game' })).toBeVisible();

  // Sign out (with a confirm step); the saved session is gone, even after a reload.
  await page.getByRole('button', { name: `Account: ${player.name}` }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.getByRole('menuitem', { name: 'Yes, sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Ringer' })).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), SESSION_KEY)).toBeNull();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in to Ringer' })).toBeVisible();

  // Signing back in skips the claim: the link is permanent. (Supabase allows
  // one code per email per second, so don't ask again within the same second.)
  await page.waitForTimeout(1500);
  await signInWithCode(page);
  await expect(page.getByRole('heading', { name: 'New Game' })).toBeVisible();
  await startGame(page);
  await expect(page.locator('.sheet')).toHaveAttribute('data-screen', 'scoring');
  await shot(page, '6-scoring');
});

test('a wrong code is refused, and "use a different email" goes back', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  const sentAt = Date.now() - 1000;
  await page.getByRole('button', { name: 'Email me a code' }).click();
  const real = await latestCode(email, sentAt);
  const wrong = real === '000000' ? '111111' : '000000';
  await page.getByLabel('6-digit code').fill(wrong);
  await expect(page.getByRole('alert')).toContainText("That code didn't work");
  await expect(page.getByLabel('6-digit code')).toHaveValue('');
  await shot(page, 'wrong-code');
  await page.getByRole('button', { name: 'Use a different email' }).click();
  await expect(page.getByLabel('Email')).toBeVisible();
  // Supabase logs the rejected verify as a failed request (403); that's the expected path.
  errors = errors.filter((e) => !/status of 403/.test(e));
});

test('offline: a signed-in member can still open the app and score', async ({ page, context }) => {
  await page.goto('/');
  await signInWithCode(page);
  await page.getByLabel('Search players').fill(player.name);
  await page.getByRole('list', { name: 'Players' }).getByRole('button', { name: new RegExp(`^${player.name}`) }).click();
  await page.getByRole('button', { name: "Yes, that's me" }).click();
  await expect(page.getByRole('heading', { name: 'New Game' })).toBeVisible();
  // The service worker has the app shell cached.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  // Go offline with an EXPIRED access token (as after an hour away), then relaunch.
  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k) ?? '{}');
    s.expires_at = Math.floor(Date.now() / 1000) - 60;
    localStorage.setItem(k, JSON.stringify(s));
  }, SESSION_KEY);
  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole('heading', { name: 'New Game' })).toBeVisible();
  await page.getByRole('button', { name: `Account: ${player.name}` }).click();
  await expect(page.getByText("Offline · using this device's saved sign-in")).toBeVisible();
  await shot(page, 'offline-menu');
  await page.keyboard.press('Escape');
  await startGame(page);
  await expect(page.getByText(NAMES.teamA).first()).toBeVisible();

  // Back online: the token refreshes and the offline note goes away.
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect
    .poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').expires_at * 1000 > Date.now(), SESSION_KEY))
    .toBe(true);
});
