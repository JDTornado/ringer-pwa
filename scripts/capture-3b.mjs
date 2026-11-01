// Side-by-side screenshots of the canonical prototype and the app, at the
// same states, for visual review. Not a test.
//   npm run build && node scripts/capture-3b.mjs
// Writes review/3b/<state>-prototype.png and review/3b/<state>-app.png
// (Chromium, 390x844). review/ is gitignored.
//
// The prototype loads React/Babel from unpkg, so this needs network. The app
// is served from dist/ with `vite preview`.

import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const protoDir = join(root, 'docs/design/prototype');
const outDir = join(root, 'review/3b');
await mkdir(outDir, { recursive: true });

// ---- Static server for the prototype (file:// breaks its fetch) ----------
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const protoServer = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
  try {
    const body = await readFile(join(protoDir, path));
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => protoServer.listen(4175, r));
const appServer = await preview({ root, preview: { port: 4176, strictPort: true } });

const NAMES = { teamA: 'Dust Devils', aS: 'Jonas', aN: 'Deb', teamB: 'Iron Horses', bS: 'Priya', bN: 'Sam' };
// Frames that use each score's DEFAULT ringers, so no ringer taps are needed
// in the prototype: [side, points] with side 'A' | 'B' | null.
const OPENING = [['A', 3], ['B', 1], [null, 0]];

// ---- Drivers: the same steps, expressed per UI ---------------------------
const prototype = {
  url: 'http://localhost:4175/New%20Game%20Setup.dc.html',
  async ready(page) {
    await page.getByText('New Game').first().waitFor();
  },
  async fillSetup(page) {
    const team = page.getByPlaceholder('Team name');
    const player = page.getByPlaceholder('Player name');
    await team.nth(0).fill(NAMES.teamA);
    await player.nth(0).fill(NAMES.aS);
    await player.nth(1).fill(NAMES.aN);
    await team.nth(1).fill(NAMES.teamB);
    await player.nth(2).fill(NAMES.bS);
    await player.nth(3).fill(NAMES.bN);
  },
  start: (page) => page.getByRole('button', { name: 'Start Game →' }).click(),
  side: (page, s) =>
    page
      .getByRole('button', { name: s === 'A' ? NAMES.teamA : s === 'B' ? NAMES.teamB : 'No score', exact: true })
      .click(),
  points: (page, p) => page.getByRole('button', { name: String(p), exact: true }).first().click(),
  confirm: async (page) => {
    await page.getByRole('button', { name: /Confirm & Next|Save Changes/ }).click();
    await page.waitForTimeout(450);
  },
  review: (page) => page.getByRole('button', { name: 'Review' }).click(),
  editRow: (page, label) => page.getByText(label, { exact: true }).click(),
  cancelEdit: (page) => page.getByRole('button', { name: 'Cancel' }).click(),
};

const app = {
  url: 'http://localhost:4176/',
  async ready(page) {
    await page.getByRole('heading', { name: 'New Game' }).waitFor();
  },
  async fillSetup(page) {
    await page.getByLabel('Team A name').fill(NAMES.teamA);
    await page.getByLabel('Team A South player').fill(NAMES.aS);
    await page.getByLabel('Team A North player').fill(NAMES.aN);
    await page.getByLabel('Team B name').fill(NAMES.teamB);
    await page.getByLabel('Team B South player').fill(NAMES.bS);
    await page.getByLabel('Team B North player').fill(NAMES.bN);
  },
  start: (page) => page.getByRole('button', { name: 'Start Game →' }).click(),
  side: (page, s) =>
    page
      .getByRole('group', { name: 'Who scored' })
      .getByRole('button', { name: s === 'A' ? NAMES.teamA : s === 'B' ? NAMES.teamB : 'No score', exact: true })
      .click(),
  points: (page, p) =>
    page.getByRole('group', { name: 'Points' }).getByRole('button', { name: String(p), exact: true }).click(),
  confirm: async (page) => {
    await page.getByRole('button', { name: /Confirm & Next|Save Changes/ }).click();
    await page.waitForTimeout(450);
  },
  review: (page) => page.getByRole('button', { name: 'Review' }).click(),
  editRow: (page, label) => page.getByText(label, { exact: true }).click(),
  cancelEdit: (page) => page.getByRole('button', { name: 'Cancel' }).click(),
};

async function frame(d, page, [side, points]) {
  await d.side(page, side);
  if (side) await d.points(page, points);
  await d.confirm(page);
}

async function capture(name, d, browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = (state) => page.screenshot({ path: join(outDir, `${state}-${name}.png`) });

  await page.goto(d.url);
  await d.ready(page);
  await d.fillSetup(page);
  await shot('setup');

  await d.start(page);
  for (const f of OPENING) await frame(d, page, f);
  await shot('scoring');

  await d.side(page, 'A');
  await d.points(page, 3);
  await shot('mid-entry');

  await d.review(page);
  await page.waitForTimeout(200);
  await shot('review');

  await d.editRow(page, 'Inn 1 · South');
  await page.waitForTimeout(200);
  await shot('editing');
  await d.cancelEdit(page);

  // No-score frames up to inning 15 south (frame index 28).
  for (let i = OPENING.length; i < 28; i++) await frame(d, page, [null, 0]);
  await shot('final-inning');

  // 15 south: A +1, 15 north: no score -> A wins at the limit.
  await frame(d, page, ['A', 1]);
  await frame(d, page, [null, 0]);
  await page.waitForTimeout(300);
  await shot('game-over');

  if (errors.length) console.warn(`${name} page errors:`, errors);
  await page.close();
}

const browser = await chromium.launch();
try {
  await capture('prototype', prototype, browser);
  console.log('prototype captured');
  await capture('app', app, browser);
  console.log('app captured');
} finally {
  await browser.close();
  protoServer.close();
  await new Promise((r) => appServer.httpServer.close(r));
}
