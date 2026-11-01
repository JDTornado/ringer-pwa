import { expect, test } from '@playwright/test';
import { playerStats, runningTotals, teamStats } from '../../src/domain/derive';
import {
  NAMES,
  PARTICIPANTS,
  SEED_ROWS,
  draftFrameCount,
  enterFrame,
  expectScore,
  fillCard,
  framesFrom,
  pointButton,
  ringerButton,
  sideButton,
  startGame,
  watchConsole,
  type Row,
} from './helpers';

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = watchConsole(page);
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

const NONE: Row = [null, 0, 0, 0];
const pct = (p: number | null) => (p === null ? '—' : `${Math.round(p)}%`);

test('full seed game by tapping: score after every frame, game-over tables match derive', async ({ page }) => {
  await startGame(page);
  const expected = runningTotals(framesFrom(SEED_ROWS));

  for (const [i, row] of SEED_ROWS.entries()) {
    await enterFrame(page, row);
    const t = expected[i];
    if (!t) throw new Error('missing expectation');
    await expectScore(page, t.a, t.b);
  }

  // Ends 22-17 on inning 9 north: the game-over screen.
  await expect(page.getByTestId('winner')).toHaveText(`${NAMES.teamA} Wins`);
  await expect(page.getByTestId('innings-played')).toHaveText('9');
  await expectScore(page, 22, 17);
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByTestId('review-row').first()).toContainText('Inn 9 · North');
  await expect(page.getByTestId('review-row').first()).toContainText('22–17');
  await page.getByRole('button', { name: 'Close review' }).click();

  // Every number on both tables comes from derive.
  const frames = framesFrom(SEED_ROWS);
  const players = playerStats(PARTICIPANTS, frames);
  for (const side of ['a', 'b'] as const) {
    const table = page.getByTestId(`stats-${side}`);
    const rows = table.getByTestId('stats-row');
    const mine = players.filter((p) => p.side === side);
    await expect(rows).toHaveCount(mine.length);
    for (const [i, p] of mine.entries()) {
      await expect(rows.nth(i).locator('td')).toHaveText([
        p.name, String(p.points), String(p.shoes), String(p.live), String(p.dead), pct(p.ringerPct),
      ]);
    }
    const team = teamStats(frames, side);
    await expect(table.getByTestId('stats-total').locator('td')).toHaveText([
      'Total', String(team.points), String(team.shoes), String(team.live), String(team.dead), pct(team.ringerPct),
    ]);
  }
  // Spot-check against hand-counted values (derive.test.ts).
  await expect(page.getByTestId('stats-a').getByTestId('stats-total').locator('td')).toHaveText([
    'Total', '22', '36', '5', '5', '28%',
  ]);
  await expect(page.getByTestId('stats-b').getByTestId('stats-total').locator('td')).toHaveText([
    'Total', '17', '36', '4', '5', '25%',
  ]);
});

test('button rules: 5 disabled, 4/6 locked, 3 couples, No score moves together', async ({ page }) => {
  await startGame(page);
  const states = async (side: 'a' | 'b') =>
    Promise.all(
      [0, 1, 2].map(async (v) => {
        const b = ringerButton(page, side, v);
        const pressed = (await b.getAttribute('aria-pressed')) === 'true';
        return (await b.isDisabled()) ? 'x' : pressed ? '*' : 'o';
      }),
    ).then((s) => s.join(''));

  // Nothing chosen: every point button disabled.
  for (const p of [1, 2, 3, 4, 5, 6]) await expect(pointButton(page, p)).toBeDisabled();

  await sideButton(page, 'a').click();
  await expect(pointButton(page, 5)).toBeDisabled();
  for (const p of [1, 2, 3, 4, 6]) await expect(pointButton(page, p)).toBeEnabled();

  await pointButton(page, 4).click();
  await expect.poll(() => states('a')).toBe('x*x'); // locked at 1
  await expect.poll(() => states('b')).toBe('*xx'); // locked at 0

  await pointButton(page, 6).click();
  await expect.poll(() => states('a')).toBe('xx*');
  await expect.poll(() => states('b')).toBe('*xx');

  await pointButton(page, 3).click();
  await expect.poll(() => states('a')).toBe('x*o');
  await expect.poll(() => states('b')).toBe('*ox'); // opponent's 1 is tappable (optionStates)
  await ringerButton(page, 'a', 2).click();
  await expect.poll(() => states('a')).toBe('xo*');
  await expect.poll(() => states('b')).toBe('o*x'); // pulled to 1
  await ringerButton(page, 'a', 1).click();
  await expect.poll(() => states('b')).toBe('*ox'); // back to 0

  await sideButton(page, null).click();
  for (const p of [1, 2, 3, 4, 5, 6]) await expect(pointButton(page, p)).toBeDisabled();
  await ringerButton(page, 'a', 2).click();
  await expect.poll(() => states('a')).toBe('oo*');
  await expect.poll(() => states('b')).toBe('oo*');
  await ringerButton(page, 'b', 1).click();
  await expect.poll(() => states('a')).toBe('o*o');
  await expect.poll(() => states('b')).toBe('o*o');
  await expect(page.getByRole('button', { name: 'Confirm & Next →' })).toBeEnabled();
});

test('edit an earlier frame: totals update', async ({ page }) => {
  await startGame(page);
  for (const row of SEED_ROWS.slice(0, 3)) await enterFrame(page, row);
  await expectScore(page, 3, 1);

  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByTestId('review-row').filter({ hasText: 'Inn 1 · South' }).click();
  await expect(page.getByTestId('editing-banner')).toContainText('Editing Inning 1 · South');
  await expect(sideButton(page, 'a')).toHaveAttribute('aria-pressed', 'true');
  await expect(pointButton(page, 3)).toHaveAttribute('aria-pressed', 'true');

  // Inning 1 south was Silver State +3; it was really Truckee +2.
  await fillCard(page, ['b', 2, 0, 0]);
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByTestId('editing-banner')).toHaveCount(0);
  await expectScore(page, 0, 3);
  await expect(page.getByTestId('slot')).toHaveText('Inning 2 · North');
});

test('an edit that would end the game early is blocked with a message', async ({ page }) => {
  await startGame(page);
  // 18-0 after inning 3 south, then two no-score frames (next: 4 north).
  const rows: Row[] = [['a', 6, 2, 0], NONE, ['a', 6, 2, 0], NONE, ['a', 6, 2, 0], NONE, NONE];
  for (const row of rows) await enterFrame(page, row);
  await expectScore(page, 18, 0);

  // Making 1 north a Silver State +3 would hit 21 at 3 south, before 4 south.
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByTestId('review-row').filter({ hasText: 'Inn 1 · North' }).click();
  await fillCard(page, ['a', 3, 1, 0]);
  await page.getByRole('button', { name: 'Save Changes' }).click();

  await expect(page.getByTestId('edit-error')).toContainText('would end the game at Inning 3 · South');
  await expect(page.getByTestId('editing-banner')).toBeVisible();
  await expectScore(page, 18, 0);

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('edit-error')).toHaveCount(0);
  await expect(page.getByTestId('slot')).toHaveText('Inning 4 · North');
  await expectScore(page, 18, 0);
});

test('draft: reload resumes the same slot and score; Abandon clears it', async ({ page }) => {
  await startGame(page);
  for (const row of SEED_ROWS.slice(0, 5)) await enterFrame(page, row);
  await expectScore(page, 5, 4);
  await expect(page.getByTestId('slot')).toHaveText('Inning 3 · North');
  await expect.poll(() => draftFrameCount(page)).toBe(5);

  await page.reload();
  await expect(page.getByTestId('slot')).toHaveText('Inning 3 · North');
  await expectScore(page, 5, 4);
  await expect(page.getByTestId('now-pitching')).toContainText(NAMES.aNorth);

  // Abandon, with the in-app confirmation step.
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Abandon game' }).click();
  await expect(page.getByRole('alert')).toContainText('Abandon this game?');
  await page.getByRole('button', { name: 'Abandon', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New Game' })).toBeVisible();
  await expect.poll(() => draftFrameCount(page)).toBeNull();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'New Game' })).toBeVisible();
  await expect(page.getByLabel('Team A name')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Start Game →' })).toBeDisabled();
});

test('a finished game resumes on game over; New Game returns to an empty setup', async ({ page }) => {
  await startGame(page);
  for (const row of SEED_ROWS) await enterFrame(page, row);
  await expect(page.getByTestId('winner')).toBeVisible();
  await expect.poll(() => draftFrameCount(page)).toBe(18);

  await page.reload();
  await expect(page.getByTestId('winner')).toHaveText(`${NAMES.teamA} Wins`);

  await page.getByRole('button', { name: 'New Game' }).click();
  await expect(page.getByRole('heading', { name: 'New Game' })).toBeVisible();
  await expect(page.getByLabel('Team A South player')).toHaveValue('');
  await expect.poll(() => draftFrameCount(page)).toBeNull();
});

test.describe('extra innings', () => {
  // Also exercises the reduced-motion path (no card slide, no pulse).
  test.use({ reducedMotion: 'reduce' });

  test('a 15-inning tie goes to extra innings; sudden death ends it', async ({ page }) => {
    await startGame(page);
    for (let i = 0; i < 28; i++) await enterFrame(page, NONE);
    await expect(page.getByTestId('slot')).toHaveText('Inning 15 · South');
    await expect(page.getByTestId('inning-band')).toHaveText('Final Inning');

    await enterFrame(page, ['a', 1, 0, 0]);
    await enterFrame(page, ['b', 1, 0, 0]);
    await expectScore(page, 1, 1);
    await expect(page.getByTestId('slot')).toHaveText('Inning 16 · South');
    await expect(page.getByTestId('inning-band')).toHaveText('Extra Innings');
    await expect(page.getByTestId('progress-label')).toHaveText('Inning 15 of 15');

    await enterFrame(page, NONE); // 16 south: still tied
    await expect(page.getByTestId('inning-band')).toHaveText('Extra Innings');
    await enterFrame(page, ['b', 1, 0, 0]); // 16 north: Truckee scores first

    await expect(page.getByTestId('winner')).toHaveText(`${NAMES.teamB} Wins`);
    await expect(page.getByTestId('innings-played')).toHaveText('16');
    await expectScore(page, 1, 2);
  });
});
