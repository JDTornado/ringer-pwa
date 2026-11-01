import { expect, type Page } from '@playwright/test';
import type { End, Frame, Participant, Side } from '../../src/domain/types';

export const NAMES = {
  teamA: 'Silver State',
  aSouth: 'Alice',
  aNorth: 'Rick',
  teamB: 'Truckee',
  bSouth: 'Gus',
  bNorth: 'Bob',
};

/** [scoringSide, points, ringersA, ringersB] */
export type Row = [Side | null, number, number, number];

/** supabase/seed.sql game 1 (also in src/domain/derive.test.ts). Ends 22-17 at 9 north. */
export const SEED_ROWS: Row[] = [
  ['a', 3, 1, 0], ['b', 1, 0, 0],
  [null, 0, 1, 1], ['a', 2, 0, 0],
  ['b', 3, 0, 1], ['a', 1, 1, 1],
  ['b', 4, 0, 1], ['a', 6, 2, 0],
  [null, 0, 0, 0], ['b', 3, 1, 2],
  ['a', 1, 0, 0], ['b', 2, 0, 0],
  ['a', 3, 1, 0], [null, 0, 2, 2],
  ['b', 1, 0, 0], ['a', 4, 1, 0],
  ['b', 3, 0, 1], ['a', 2, 0, 0],
];

export const PARTICIPANTS: Participant[] = [
  { id: 'aS', name: NAMES.aSouth, side: 'a', end: 'south' },
  { id: 'aN', name: NAMES.aNorth, side: 'a', end: 'north' },
  { id: 'bS', name: NAMES.bSouth, side: 'b', end: 'south' },
  { id: 'bN', name: NAMES.bNorth, side: 'b', end: 'north' },
];

/** The same rows as domain frames, for computing expectations with derive. */
export function framesFrom(rows: Row[]): Frame[] {
  return rows.map(([scoringSide, points, ringersA, ringersB], i) => {
    const end: End = i % 2 === 0 ? 'south' : 'north';
    return {
      id: `f${i}`,
      inning: Math.floor(i / 2) + 1,
      end,
      throwerA: end === 'south' ? 'aS' : 'aN',
      throwerB: end === 'south' ? 'bS' : 'bN',
      scoringSide,
      points,
      ringersA,
      ringersB,
    };
  });
}

/** Collects console errors and uncaught exceptions for a page. */
export function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

export async function startGame(page: Page, url = '/'): Promise<void> {
  await page.goto(url);
  await page.getByLabel('Team A name').fill(NAMES.teamA);
  await page.getByLabel('Team A South player').fill(NAMES.aSouth);
  await page.getByLabel('Team A North player').fill(NAMES.aNorth);
  await page.getByLabel('Team B name').fill(NAMES.teamB);
  await page.getByLabel('Team B South player').fill(NAMES.bSouth);
  await page.getByLabel('Team B North player').fill(NAMES.bNorth);
  await page.getByRole('button', { name: 'Start Game →' }).click();
  await expect(page.getByTestId('slot')).toHaveText('Inning 1 · South');
}

export const sideButton = (page: Page, side: Side | null) =>
  page
    .getByRole('group', { name: 'Who scored' })
    .getByRole('button', {
      name: side === 'a' ? NAMES.teamA : side === 'b' ? NAMES.teamB : 'No score',
      exact: true,
    });

export const pointButton = (page: Page, points: number) =>
  page.getByRole('group', { name: 'Points' }).getByRole('button', { name: String(points), exact: true });

/** Ringer buttons for the card's side-A (0) or side-B (1) thrower. */
export const ringerButton = (page: Page, side: Side, value: number) =>
  page
    .getByRole('group', { name: / ringers$/ })
    .nth(side === 'a' ? 0 : 1)
    .getByRole('button', { name: String(value), exact: true });

export async function expectScore(page: Page, a: number, b: number): Promise<void> {
  await expect(page.getByTestId('score-a')).toHaveText(String(a));
  await expect(page.getByTestId('score-b')).toHaveText(String(b));
}

/** Enter a verdict on the card by tapping, as a scorekeeper would. */
export async function fillCard(page: Page, [side, points, ra, rb]: Row): Promise<void> {
  await sideButton(page, side).click();
  if (side !== null) await pointButton(page, points).click();
  if ((await ringerButton(page, 'a', ra).getAttribute('aria-pressed')) !== 'true') {
    await ringerButton(page, 'a', ra).click();
  }
  if ((await ringerButton(page, 'b', rb).getAttribute('aria-pressed')) !== 'true') {
    await ringerButton(page, 'b', rb).click();
  }
  await expect(ringerButton(page, 'a', ra)).toHaveAttribute('aria-pressed', 'true');
  await expect(ringerButton(page, 'b', rb)).toHaveAttribute('aria-pressed', 'true');
}

export async function enterFrame(page: Page, row: Row): Promise<void> {
  await fillCard(page, row);
  await page.getByRole('button', { name: 'Confirm & Next →' }).click();
}

/** Frames in the saved IndexedDB draft, or null if there is no draft. */
export function draftFrameCount(page: Page): Promise<number | null> {
  return page.evaluate(
    () =>
      new Promise<number | null>((resolve) => {
        const open = indexedDB.open('keyval-store');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          try {
            const get = open.result.transaction('keyval', 'readonly').objectStore('keyval').get('ringer:draft');
            get.onsuccess = () => resolve(get.result ? get.result.game.frames.length : null);
            get.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        };
      }),
  );
}
