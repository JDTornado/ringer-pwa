import { expect, test, type Page } from '@playwright/test';
import { buildVersions, startServer, type DeployServer } from './deploy-sim.mjs';
import {
  SEED_ROWS,
  draftFrameCount,
  enterFrame,
  expectScore,
  sideButton,
  startGame,
  watchConsole,
} from './helpers';

// A real deploy, simulated: v1 is served, a game is started, then the server
// switches to v2 (different JS, so a different sw.js) and the app is brought
// "back to the foreground", which triggers its update check.

let server: DeployServer;

test.beforeAll(async ({}, info) => {
  test.setTimeout(120_000);
  const dirs = buildVersions(`test-results/deploy-sim/${info.project.name}-${info.workerIndex}`);
  server = await startServer(dirs, 'v1');
});
test.afterAll(async () => {
  await server?.close();
});

/** The page's main bundle URL ('' while a reload is in flight). */
const mainScript = (page: Page) =>
  page
    .evaluate(() => document.querySelector<HTMLScriptElement>('script[type="module"]')?.src ?? '')
    .catch(() => '');

test('new deploy: banner, Reload gated on the entry card, game resumes after reload', async ({ page }) => {
  const errors = watchConsole(page);
  const banner = page.getByTestId('update-banner');
  const reload = banner.getByRole('button', { name: 'Reload' });

  await startGame(page, server.url);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  for (const row of SEED_ROWS.slice(0, 3)) await enterFrame(page, row);
  await expectScore(page, 3, 1);
  await expect.poll(() => draftFrameCount(page)).toBe(3);
  const v1Script = await mainScript(page);

  // No update yet: no banner.
  await expect(banner).toHaveCount(0);

  // Deploy v2, then the app returns to the foreground.
  server.use('v2');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect(banner).toContainText('Update available');

  // Empty card: Reload is safe.
  await expect(reload).toBeEnabled();

  // Half-entered frame: Reload is disabled, with the hint.
  await sideButton(page, 'a').click();
  await expect(reload).toBeDisabled();
  await expect(page.getByTestId('update-hint')).toHaveText('Finish this frame first');

  // Finish it: the card is empty again.
  await enterFrame(page, SEED_ROWS[3] ?? ['a', 2, 0, 0]);
  await expectScore(page, 5, 1);
  await expect(reload).toBeEnabled();
  await expect(page.getByTestId('update-hint')).toHaveCount(0);

  // Editing a past frame also blocks it.
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByTestId('review-row').filter({ hasText: 'Inn 1 · South' }).click();
  await expect(reload).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(reload).toBeEnabled();
  await expect.poll(() => draftFrameCount(page)).toBe(4);

  // Reload: v2 takes over and the page reloads into the same game.
  await reload.click();
  // A loaded page whose bundle is not v1's ('' would only mean "mid-reload").
  await expect
    .poll(async () => {
      const src = await mainScript(page);
      return src !== '' && src !== v1Script;
    }, { timeout: 15_000 })
    .toBe(true);
  await expect(page.getByTestId('slot')).toHaveText('Inning 3 · South');
  await expectScore(page, 5, 1);
  await expect(banner).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('setup: Reload disabled while the form has text; build tag shows the new version after it', async ({ page }) => {
  const errors = watchConsole(page);
  server.use('v1');
  await page.goto(server.url);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await expect(page.getByTestId('build-tag')).toHaveText('build aaaaaaa');

  server.use('v2');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const reload = page.getByTestId('update-banner').getByRole('button', { name: 'Reload' });
  const hint = page.getByTestId('update-hint');

  // Empty setup form: nothing to lose, Reload enabled.
  await expect(reload).toBeEnabled({ timeout: 15_000 });
  await expect(hint).toHaveCount(0);

  // Any typed text would be lost: Reload disabled, with the setup hint.
  await page.getByLabel('Team B North player').fill('Bob');
  await expect(reload).toBeDisabled();
  await expect(hint).toHaveText('Finish setup first');

  // Cleared again: enabled.
  await page.getByLabel('Team B North player').fill('');
  await expect(reload).toBeEnabled();
  await expect(hint).toHaveCount(0);

  await reload.click();
  await expect(page.getByTestId('build-tag')).toHaveText('build bbbbbbb', { timeout: 15_000 });
  await expect(page.getByTestId('update-banner')).toHaveCount(0);
  expect(errors).toEqual([]);
});
