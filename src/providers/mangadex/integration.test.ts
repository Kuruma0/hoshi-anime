import { describe, expect, it } from 'vitest';
import { MangaDexProvider } from './index';
import { isReadable } from './normalize';

/**
 * Live integration checks against api.mangadex.org.
 *
 * Excluded from `npm test` because they need network and are subject to the
 * real rate limit. Run explicitly with `npm run test:integration` to confirm the
 * provider still matches the API after an upstream change.
 */

const provider = new MangaDexProvider({
  getContentRatings: () => ['safe', 'suggestive'],
  userAgent: 'HoshiAnime/1.0 (integration test)',
});

describe('MangaDexProvider — live', () => {
  it('searches and returns normalized results', async () => {
    const result = await provider.search('chainsaw man');

    expect(result.items.length).toBeGreaterThan(0);
    const first = result.items[0]!;
    expect(first.id).toMatch(/^mangadex:/);
    expect(first.title).toBeTruthy();
    expect(first.cover?.url).toContain('uploads.mangadex.org');
    // Local re-ranking should put the exact title first.
    expect(first.title.toLowerCase()).toContain('chainsaw man');
  }, 30_000);

  it('finds a title by its Japanese name', async () => {
    const result = await provider.search('進撃の巨人');
    expect(result.items.length).toBeGreaterThan(0);
  }, 30_000);

  it('serves every supported discovery section', async () => {
    for (const section of provider.supportedSections) {
      const result = await provider.getSection(section, { limit: 5 });
      expect(result.items.length, `section ${section}`).toBeGreaterThan(0);
    }
  }, 60_000);

  it('rejects a section it does not support instead of faking one', async () => {
    // MangaDex publishes no trending metric; the provider must say so.
    await expect(provider.getSection('trending' as never)).rejects.toThrow(/does not support/);
  }, 30_000);

  it('paginates with a working cursor', async () => {
    const first = await provider.getSection('popular', { limit: 5 });
    expect(first.nextCursor).toBeDefined();

    const second = await provider.getSection('popular', { limit: 5, cursor: first.nextCursor });
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  }, 30_000);

  it('loads genres and filters by one', async () => {
    const genres = await provider.getGenres();
    expect(genres).toContain('Romance');

    const result = await provider.getByGenre('Romance', { limit: 5 });
    expect(result.items.length).toBeGreaterThan(0);
  }, 30_000);

  it('fetches full metadata for a known title', async () => {
    const search = await provider.search('chainsaw man');
    const manga = await provider.getManga(search.items[0]!.id);

    expect(manga.authors.length).toBeGreaterThan(0);
    expect(manga.genres.length).toBeGreaterThan(0);
    expect(manga.description).toBeTruthy();
    expect(manga.alternativeTitles.length).toBeGreaterThan(0);
  }, 30_000);

  it('returns officially licensed chapters rather than hiding them', async () => {
    // Every English Chainsaw Man chapter is Viz-licensed: pages: 0 with an
    // externalUrl. Filtering those out would leave the detail page looking as
    // though the manga has no chapters at all.
    const chapters = await provider.getChapters(
      'mangadex:a77742b1-befd-49a4-bff5-1ad4e6b0ef7b',
      { language: 'en', limit: 100 }
    );

    expect(chapters.items.length).toBeGreaterThan(0);
    const external = chapters.items.filter((chapter) => chapter.externalUrl);
    expect(external.length).toBeGreaterThan(0);
    expect(external.every((chapter) => !isReadable(chapter))).toBe(true);
  }, 30_000);

  it('resolves real page images for a readable chapter', async () => {
    // Sourced from recently-updated rather than a fixed title, so the test does
    // not break when one series becomes licensed.
    const recent = await provider.getSection('recentlyUpdated', { limit: 10 });

    for (const manga of recent.items) {
      const chapters = await provider.getChapters(manga.id, { language: 'en', limit: 20 });
      const readable = chapters.items.find(isReadable);
      if (!readable) continue;

      const pages = await provider.getChapterPages(readable.id);
      expect(pages.pages.length).toBe(readable.pageCount);
      expect(pages.pages[0]).toMatch(/^https:\/\/.+\/data\/[a-f0-9]+\//);
      expect(pages.dataSaverPages.length).toBe(pages.pages.length);
      expect(pages.expiresAt).toBeGreaterThan(Date.now());
      return;
    }

    throw new Error('No readable chapter found across 10 recently-updated titles.');
  }, 120_000);

  it('reports notFound for a missing manga rather than throwing raw', async () => {
    await expect(
      provider.getManga('mangadex:00000000-0000-0000-0000-000000000000')
    ).rejects.toMatchObject({ kind: 'notFound', provider: 'mangadex' });
  }, 30_000);
});
