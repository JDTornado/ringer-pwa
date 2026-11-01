import { describe, expect, it } from 'vitest';
import { newId, uuidV4FromRandom } from './ids';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  it('uses crypto.randomUUID when available', () => {
    expect(newId({ randomUUID: () => 'from-randomUUID', getRandomValues: (a: Uint8Array<ArrayBuffer>) => a })).toBe('from-randomUUID');
  });

  it('falls back to getRandomValues when randomUUID is missing (insecure context)', () => {
    const insecure = { getRandomValues: (a: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(a) };
    const id = newId(insecure);
    expect(id).toMatch(V4);
  });

  it('fallback sets the version and variant bits even from all-ones bytes', () => {
    const ones = {
      getRandomValues: (a: Uint8Array<ArrayBuffer>) => {
        a.fill(0xff);
        return a;
      },
    };
    expect(uuidV4FromRandom(ones)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  it('real ids are unique v4 UUIDs', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newId()));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(V4);
  });
});
