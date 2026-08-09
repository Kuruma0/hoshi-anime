import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ContentRating } from '@/domain/manga';

export type ReaderMode = 'vertical' | 'paged';

/** Page-turn direction in paged mode. Traditional manga is right-to-left. */
export type ReadingDirection = 'ltr' | 'rtl';

export interface SettingsState {
  /* Manga */
  chapterLanguage: string;
  contentRatings: ContentRating[];
  readerMode: ReaderMode;
  readingDirection: ReadingDirection;
  /** Serve smaller re-encoded page images. */
  dataSaver: boolean;
  /** Keep the screen awake while reading. */
  keepAwakeWhileReading: boolean;
  /** Preferred manga source id, remembered per user rather than per title. */
  preferredMangaSource?: string;

  /**
   * Preferred video provider id.
   *
   * Remembered across titles so a viewer who found one that works for them is
   * not made to choose again on every episode. Undefined means "use the
   * application default", which is what a first run gets.
   */
  preferredVideoProvider?: string;

  /* Global */
  reduceMotion: boolean;

  setChapterLanguage: (language: string) => void;
  setContentRatings: (ratings: ContentRating[]) => void;
  setReaderMode: (mode: ReaderMode) => void;
  setReadingDirection: (direction: ReadingDirection) => void;
  setDataSaver: (enabled: boolean) => void;
  setKeepAwakeWhileReading: (enabled: boolean) => void;
  setPreferredMangaSource: (sourceId: string | undefined) => void;
  setPreferredVideoProvider: (providerId: string | undefined) => void;
  setReduceMotion: (enabled: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      chapterLanguage: 'en',
      // Safe + suggestive only. MangaDex's own default is more permissive; not
      // narrowing it would put adult covers on the trending row out of the box.
      contentRatings: ['safe', 'suggestive'],
      readerMode: 'vertical',
      readingDirection: 'ltr',
      dataSaver: false,
      keepAwakeWhileReading: true,
      preferredMangaSource: undefined,
      reduceMotion: false,

      setChapterLanguage: (chapterLanguage) => set({ chapterLanguage }),
      setContentRatings: (contentRatings) => set({ contentRatings }),
      setReaderMode: (readerMode) => set({ readerMode }),
      setReadingDirection: (readingDirection) => set({ readingDirection }),
      setDataSaver: (dataSaver) => set({ dataSaver }),
      setKeepAwakeWhileReading: (keepAwakeWhileReading) => set({ keepAwakeWhileReading }),
      setPreferredMangaSource: (preferredMangaSource) => set({ preferredMangaSource }),
      setPreferredVideoProvider: (preferredVideoProvider) => set({ preferredVideoProvider }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
    }),
    {
      // v2: streaming-source configuration was removed; playback is now handled
      // internally, so the old persisted shape is deliberately not migrated.
      name: 'hoshi.settings.v2',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

/** Read settings outside React (providers, resolvers). */
export function getSettings(): SettingsState {
  return useSettings.getState();
}
