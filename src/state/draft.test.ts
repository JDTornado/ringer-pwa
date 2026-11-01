import 'fake-indexeddb/auto';
import { del, set } from 'idb-keyval';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game } from '../domain/types';
import { DEFAULT_RULES } from '../domain/types';

const KEY = 'ringer:draft';

function sampleGame(): Game {
  return {
    clientGameId: 'c0000000-0000-4000-8000-000000000001',
    teamAName: 'Silver State',
    teamBName: 'Truckee',
    participants: [
      { id: 'aS', name: 'Alice', side: 'a', end: 'south' },
      { id: 'bS', name: 'Gus', side: 'b', end: 'south' },
    ],
    rules: { ...DEFAULT_RULES },
    frames: [
      { id: 'f0', inning: 1, end: 'south', throwerA: 'aS', throwerB: 'bS', scoringSide: 'a', points: 3, ringersA: 1, ringersB: 0 },
      { id: 'f1', inning: 1, end: 'north', throwerA: 'aS', throwerB: 'bS', scoringSide: null, points: 0, ringersA: 0, ringersB: 0 },
    ],
    createdAt: '2026-11-01T18:30:00.000Z',
  };
}

async function freshModule() {
  vi.resetModules();
  return import('./draft');
}

beforeEach(async () => {
  await del(KEY);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('draft storage', () => {
  it('loadDraft returns null when nothing is saved', async () => {
    const { loadDraft } = await freshModule();
    expect(await loadDraft()).toBeNull();
  });

  it('round-trips a game', async () => {
    const { saveDraft, loadDraft } = await freshModule();
    const game = sampleGame();
    await saveDraft(game);
    expect(await loadDraft()).toEqual(game);
  });

  it('saving again overwrites (one key)', async () => {
    const { saveDraft, loadDraft } = await freshModule();
    const game = sampleGame();
    await saveDraft(game);
    await saveDraft({ ...game, frames: [] });
    expect((await loadDraft())?.frames).toEqual([]);
  });

  it('clearDraft removes it', async () => {
    const { saveDraft, loadDraft, clearDraft } = await freshModule();
    await saveDraft(sampleGame());
    await clearDraft();
    expect(await loadDraft()).toBeNull();
  });

  it.each([
    ['a string', 'garbage'],
    ['null', null],
    ['an array', [1, 2, 3]],
    ['an unversioned bare game (old shape)', sampleGame()],
    ['an older version', { version: 0, savedAt: 'x', game: sampleGame() }],
    ['a game missing frames', { version: 1, savedAt: 'x', game: { ...sampleGame(), frames: undefined } }],
    [
      'a frame with a bad end',
      { version: 1, savedAt: 'x', game: { ...sampleGame(), frames: [{ ...sampleGame().frames[0], end: 'east' }] } },
    ],
    ['unknown tie rule', { version: 1, savedAt: 'x', game: { ...sampleGame(), rules: { ...DEFAULT_RULES, tieAtLimit: 'coinFlip' } } }],
  ])('a corrupt or old-shape draft (%s) loads as null without throwing', async (_label, value) => {
    const { loadDraft } = await freshModule();
    await set(KEY, value);
    await expect(loadDraft()).resolves.toBeNull();
  });

  it('a storage read failure loads as null without throwing', async () => {
    vi.doMock('idb-keyval', async (orig) => ({
      ...(await orig<typeof import('idb-keyval')>()),
      get: () => Promise.reject(new Error('IndexedDB unavailable')),
    }));
    const { loadDraft } = await freshModule();
    await expect(loadDraft()).resolves.toBeNull();
    vi.doUnmock('idb-keyval');
  });

  it('asks for persistent storage once, best effort', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal('navigator', { storage: { persist } });
    const { saveDraft } = await freshModule();
    await saveDraft(sampleGame());
    await saveDraft(sampleGame());
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('saving still works when persist() is missing or rejects', async () => {
    vi.stubGlobal('navigator', { storage: { persist: () => Promise.reject(new Error('denied')) } });
    const { saveDraft, loadDraft } = await freshModule();
    await saveDraft(sampleGame());
    expect(await loadDraft()).not.toBeNull();

    vi.stubGlobal('navigator', {});
    const again = await freshModule();
    await again.saveDraft(sampleGame());
    expect(await again.loadDraft()).not.toBeNull();
  });
});
