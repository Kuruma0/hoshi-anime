import { describe, expect, it } from 'vitest';
import { ArmMappingClient } from './arm';

/**
 * Live checks against arm.haglund.dev, the AniList → TMDB bridge the player
 * depends on. Opt-in: `npm run test:integration`.
 */

const client = new ArmMappingClient('HoshiAnime/1.0 (integration test)');

describe('ArmMappingClient — live', () => {
  it('maps a well-known AniList id to TMDB', async () => {
    // Attack on Titan.
    const target = await client.resolveTmdb(16498);

    expect(target).toBeDefined();
    expect(target!.tmdbId).toBe(1429);
    expect(target!.season).toBe(1);
    expect(target!.isMovie).toBe(false);
  }, 30_000);

  it('carries the TMDB season for a later anime season', async () => {
    // Jujutsu Kaisen — AniList lists seasons separately, TMDB nests them.
    const target = await client.resolveTmdb(113415);
    expect(target?.tmdbId).toBe(95479);
    expect(target?.season).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('defaults to season 1 when the mapping omits one', async () => {
    // One Piece maps with a null season.
    const target = await client.resolveTmdb(21);
    expect(target?.tmdbId).toBe(37854);
    expect(target?.season).toBe(1);
  }, 30_000);

  it('reports an unmapped id as absent, not as an outage', async () => {
    // The service answers 400 for an unknown id; that must read as "no mapping"
    // so the player shows "unavailable" instead of a retryable error.
    await expect(client.resolveTmdb(999_999_999)).resolves.toBeUndefined();
    await expect(client.lookup(999_999_999)).resolves.toBeNull();
  }, 30_000);

  it('caches so a repeated lookup costs nothing', async () => {
    const first = await client.lookup(16498);
    const second = await client.lookup(16498);
    expect(second).toBe(first);
  }, 30_000);
});
