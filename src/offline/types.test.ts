import { describe, expect, it } from 'vitest';
import { formatBytes, groupByManga, totalBytes, type OfflineChapter } from './types';

function chapter(overrides: Partial<OfflineChapter> & { chapterId: string }): OfflineChapter {
  return {
    mangaId: 'mangadex:one-piece',
    mangaTitle: 'One Piece',
    language: 'en',
    pages: [],
    pageCount: 20,
    status: 'downloaded',
    progress: 1,
    bytes: 1024 * 1024,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('groupByManga', () => {
  it('groups chapters under their manga and sums size', () => {
    const groups = groupByManga([
      chapter({ chapterId: 'a', chapterNumber: '1', bytes: 1024 * 1024 }),
      chapter({ chapterId: 'b', chapterNumber: '2', bytes: 2 * 1024 * 1024 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.chapters).toHaveLength(2);
    expect(groups[0]?.bytes).toBe(3 * 1024 * 1024);
  });

  it('separates different manga', () => {
    const groups = groupByManga([
      chapter({ chapterId: 'a' }),
      chapter({ chapterId: 'b', mangaId: 'mangadex:naruto', mangaTitle: 'Naruto' }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it('orders chapters numerically, not lexically', () => {
    const groups = groupByManga([
      chapter({ chapterId: 'c', chapterNumber: '10' }),
      chapter({ chapterId: 'a', chapterNumber: '2' }),
      chapter({ chapterId: 'b', chapterNumber: '1' }),
    ]);

    expect(groups[0]?.chapters.map((entry) => entry.chapterNumber)).toEqual(['1', '2', '10']);
  });

  it('places decimal chapters between their neighbours', () => {
    const groups = groupByManga([
      chapter({ chapterId: 'c', chapterNumber: '11' }),
      chapter({ chapterId: 'b', chapterNumber: '10.5' }),
      chapter({ chapterId: 'a', chapterNumber: '10' }),
    ]);

    expect(groups[0]?.chapters.map((entry) => entry.chapterNumber)).toEqual([
      '10',
      '10.5',
      '11',
    ]);
  });

  it('sorts unnumbered chapters after numbered ones', () => {
    const groups = groupByManga([
      chapter({ chapterId: 'x', chapterNumber: undefined }),
      chapter({ chapterId: 'a', chapterNumber: '1' }),
    ]);

    expect(groups[0]?.chapters[0]?.chapterNumber).toBe('1');
  });

  it('puts the most recently touched manga first', () => {
    const groups = groupByManga([
      chapter({ chapterId: 'old', updatedAt: 100 }),
      chapter({
        chapterId: 'new',
        mangaId: 'mangadex:naruto',
        mangaTitle: 'Naruto',
        updatedAt: 9000,
      }),
    ]);

    expect(groups[0]?.title).toBe('Naruto');
  });

  it('handles nothing downloaded', () => {
    expect(groupByManga([])).toEqual([]);
  });
});

describe('formatBytes', () => {
  it('reports megabytes and gigabytes', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });

  it('does not report a rounded zero for a real file', () => {
    expect(formatBytes(1024)).toBe('<1 MB');
  });

  it('handles nothing stored', () => {
    expect(formatBytes(0)).toBe('0 MB');
  });
});

describe('totalBytes', () => {
  it('sums every chapter', () => {
    expect(
      totalBytes([
        chapter({ chapterId: 'a', bytes: 100 }),
        chapter({ chapterId: 'b', bytes: 250 }),
      ])
    ).toBe(350);
  });

  it('is zero for an empty library', () => {
    expect(totalBytes([])).toBe(0);
  });
});
