import { expect, test, type ConsoleMessage } from '@playwright/test';

test.describe('app shell', () => {
  const errors: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors.length = 0;
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  });

  test('renders the shell with tokens and fonts, no console errors', async ({ page }, testInfo) => {
    await page.goto('/');
    const heading = page.getByRole('heading', { name: 'New Game' });
    await expect(heading).toBeVisible();

    // Heading font is the self-hosted Barlow Condensed, and it actually loaded.
    await expect(heading).toHaveCSS('font-family', /Barlow Condensed/);
    expect(await page.evaluate(() => document.fonts.check('700 22px "Barlow Condensed"'))).toBe(true);

    // Tokens resolve to the data-model colors (team inputs are bordered in them).
    await expect(page.getByLabel('Team A name')).toHaveCSS('border-color', 'rgb(5, 57, 97)');
    await expect(page.getByLabel('Team B name')).toHaveCSS('border-color', 'rgb(124, 60, 15)');
    await expect(page.locator('.sheet')).toHaveCSS('background-color', 'rgb(242, 242, 243)');

    // Fits a 390px phone: no horizontal scroll.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    await page.screenshot({ path: `test-results/shell-${testInfo.project.name}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });

  test('serves the web app manifest', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const res = await request.get(href ?? '');
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest).toMatchObject({
      name: 'Ringer',
      display: 'standalone',
      orientation: 'portrait',
      theme_color: '#053961',
    });
    const sizes = manifest.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ? ` ${i.purpose}` : ''}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512', '512x512 maskable']));
    for (const icon of manifest.icons as Array<{ src: string }>) {
      expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
    }
    expect((await request.get('/apple-touch-icon.png')).ok()).toBe(true);
    expect(await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content')).toBe('yes');
    expect(errors).toEqual([]);
  });

  test('registers the service worker and precaches the fonts', async ({ page }) => {
    await page.goto('/');
    const sw = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return { scope: reg.scope, script: reg.active?.scriptURL ?? null };
    });
    expect(sw.script).toMatch(/\/sw\.js$/);
    expect(sw.scope).toMatch(/\/$/);

    const cachedFonts = await page.evaluate(async () => {
      const names = await caches.keys();
      const urls: string[] = [];
      for (const n of names) {
        for (const req of await (await caches.open(n)).keys()) urls.push(req.url);
      }
      return urls.filter((u) => u.endsWith('.woff2')).length;
    });
    expect(cachedFonts).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
