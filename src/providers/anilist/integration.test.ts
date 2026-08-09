import { describe, expect, it } from 'vitest';
import { AniListProvider } from './index';

/**
 * Live checks against graphql.anilist.co. Opt-in: `npm run test:integration`.
 * AniList allows 30 requests/minute, so these run serially by config.
 */

const provider = new AniListProvider({
  getAllowAdult: () => false,
  userAgent: 'HoshiAnime/1.0 (integration test)',
});

describe('AniListProvider, live', () => {
  it('serves every supported discovery section', async () => {
    for (const section of provider.supportedSections) {
      const result = await provider.getSection(section, { limit: 5 });
      expect(result.items.length, `section ${section}`).toBeGreaterThan(0);
      expect(result.items[0]?.id, `section ${section}`).toMatch(/^anilist:/);
      expect(result.items[0]?.title, `section ${section}`).toBeTruthy();
    }
  }, 120_000);

  it('finds a title by its English name', async () => {
    const result = await provider.search('Attack on Titan');
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]?.title.toLowerCase()).toContain('attack on titan');
  }, 30_000);

  it('finds the same title by its romanised Japanese name, §14', async () => {
    const english = await provider.search('Attack on Titan');
    const romaji = await provider.search('Shingeki no Kyojin');

    expect(romaji.items.length).toBeGreaterThan(0);

    // Both spellings must reach the same AniList entry.
    const englishIds = new Set(english.items.map((anime) => anime.id));
    expect(romaji.items.some((anime) => englishIds.has(anime.id))).toBe(true);
  }, 30_000);

  it('finds a title by its native Japanese name', async () => {
    const result = await provider.search('進撃の巨人');
    expect(result.items.length).toBeGreaterThan(0);
  }, 30_000);

  it('loads full detail including streaming links', async () => {
    const search = await provider.search('Attack on Titan');
    const anime = await provider.getAnime(search.items[0]!.id);

    expect(anime.synopsis).toBeTruthy();
    expect(anime.synopsis).not.toContain('<');
    expect(anime.genres.length).toBeGreaterThan(0);
    expect(anime.studios.length).toBeGreaterThan(0);
    expect(anime.alternativeTitles.length).toBeGreaterThan(0);
    // Official links back the 'external' playback surface.
    expect(anime.externalLinks.length).toBeGreaterThan(0);
  }, 30_000);

  it('builds a real episode list', async () => {
    // Attack on Titan (AniList id 16498), finished, 25 episodes.
    const episodes = await provider.getEpisodes('anilist:16498');
    expect(episodes.length).toBe(25);
    expect(episodes[0]?.number).toBe(1);
    expect(episodes.every((episode) => !episode.upcoming)).toBe(true);
  }, 30_000);

  it('returns a real weekly schedule with correct UTC bounds', async () => {
    const now = Math.floor(Date.now() / 1000);
    const week = now + 7 * 24 * 60 * 60;

    const entries = await provider.getSchedule(now, week);

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.airingAt).toBeGreaterThanOrEqual(now);
      expect(entry.airingAt).toBeLessThanOrEqual(week);
      expect(entry.episodeNumber).toBeGreaterThan(0);
      expect(entry.anime.title).toBeTruthy();
    }

    // A full week must span more than one day, or the paging stopped early.
    const days = new Set(entries.map((entry) => new Date(entry.airingAt * 1000).getUTCDay()));
    expect(days.size).toBeGreaterThan(1);
  }, 60_000);

  it('loads genres and filters by one', async () => {
    const genres = await provider.getGenres();
    expect(genres).toContain('Action');
    expect(genres).not.toContain('Hentai');

    const result = await provider.getByGenre('Action', { limit: 5 });
    expect(result.items.length).toBeGreaterThan(0);
  }, 30_000);

  it('returns recommendations', async () => {
    const recommendations = await provider.getRecommendations('anilist:16498');
    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations[0]?.title).toBeTruthy();
  }, 30_000);

  it('paginates with a working cursor', async () => {
    const first = await provider.getSection('popular', { limit: 5 });
    expect(first.nextCursor).toBe('2');

    const second = await provider.getSection('popular', { limit: 5, cursor: first.nextCursor });
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  }, 30_000);

  it('returns a real relationship graph', async () => {
    // Attack on Titan: has both a source manga and a TV sequel.
    const relations = await provider.getRelations('anilist:16498', 'anime');

    const manga = relations.find(
      (relation) => relation.kind === 'manga' && relation.relation === 'adaptation'
    );
    expect(manga, 'source manga').toBeDefined();
    expect(manga!.title.toLowerCase()).toContain('attack on titan');

    const sequel = relations.find(
      (relation) => relation.relation === 'sequel' && relation.format === 'TV'
    );
    expect(sequel, 'TV sequel').toBeDefined();
    expect(sequel!.id).toMatch(/^anilist:\d+$/);
  }, 30_000);

  it('reads the manga side of the graph to find its anime adaptation', async () => {
    // AniList manga id 53390 is the Attack on Titan manga. This is the exact
    // path used when MangaDex publishes an AniList id.
    const relations = await provider.getRelations('anilist:53390', 'manga');

    const anime = relations.find(
      (relation) => relation.kind === 'anime' && relation.relation === 'adaptation'
    );
    expect(anime).toBeDefined();
    expect(anime!.title.toLowerCase()).toContain('attack on titan');
  }, 30_000);

  it('exposes a YouTube trailer on the detail query', async () => {
    const anime = await provider.getAnime('anilist:16498');
    expect(anime.trailer?.youtubeId).toBeTruthy();
    // Real responses carry trailing whitespace on this field.
    expect(anime.trailer!.youtubeId).toBe(anime.trailer!.youtubeId.trim());
  }, 30_000);

  it('reports notFound for a missing anime rather than throwing raw', async () => {
    await expect(provider.getAnime('anilist:999999999')).rejects.toMatchObject({
      provider: 'anilist',
    });
  }, 30_000);
});
