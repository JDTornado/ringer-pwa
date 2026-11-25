import { describe, expect, it } from 'vitest';
import { cleanCode, normalizeEmail, searchRoster, type RosterEntry } from './signin';

describe('normalizeEmail', () => {
  it('trims and lower-cases a valid email', () => {
    expect(normalizeEmail('  Tom@Ringer.Test ')).toBe('tom@ringer.test');
  });
  it('rejects things that are not emails', () => {
    for (const bad of ['', 'tom', 'tom@', '@ringer.test', 'tom@ringer', 'to m@ringer.test']) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });
});

describe('cleanCode', () => {
  it('keeps only digits, up to six', () => {
    expect(cleanCode('123 456')).toBe('123456');
    expect(cleanCode('123-456')).toBe('123456');
    expect(cleanCode(' 12a3 ')).toBe('123');
    expect(cleanCode('12345678')).toBe('123456');
  });
});

describe('searchRoster', () => {
  const roster: RosterEntry[] = [
    { id: '1', name: 'Alice Moreno', team: 'Silver State Shoes' },
    { id: '2', name: 'José Ruiz', team: 'Truckee Tossers' },
    { id: '3', name: 'Rick Alvarez', team: null },
  ];
  const ids = (q: string) => searchRoster(roster, q).map((e) => e.id);

  it('returns everyone for an empty query', () => {
    expect(ids('')).toEqual(['1', '2', '3']);
    expect(ids('   ')).toEqual(['1', '2', '3']);
  });
  it('matches parts of the name in any order, ignoring case', () => {
    expect(ids('moreno')).toEqual(['1']);
    expect(ids('mor ALI')).toEqual(['1']);
  });
  it('matches the team name', () => {
    expect(ids('truckee')).toEqual(['2']);
    expect(ids('silver alice')).toEqual(['1']);
  });
  it('ignores accents', () => {
    expect(ids('jose')).toEqual(['2']);
  });
  it('handles a player with no team', () => {
    expect(ids('rick')).toEqual(['3']);
    expect(ids('rick silver')).toEqual([]);
  });
});
