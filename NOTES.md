# Hoshi.Anime, working notes

Expo SDK 57 + React Native + TypeScript. Anime and manga in one app.
See `README.md` for the full architecture; this file is the short version plus
the things that are easy to get wrong.

## The one rule

**`app/` never imports from `src/providers/`.** Screens import hooks from
`src/data/` and nothing else. Breaking this is what makes a provider
unswappable, which is the primary architectural goal.

Corollaries:
- Providers throw `ProviderError` (`src/lib/errors.ts`) and nothing else.
- Providers return domain models. `providerMeta` is readable by other providers
  (a stream provider resolving an id) but **never by `app/`**.
- New provider = new folder under `src/providers/` + one line in `registry.ts`.

## Design constraints, enforced in `src/design/tokens.ts`

No shadows. Radius 2 on artwork, 0 elsewhere. No cards. No pills. Purple is
punctuation, not a surface. Tab bar is text-only. The only gradients are the
hero scrims, which exist for text legibility over arbitrary artwork.

If you are about to write `borderRadius: 8` or add a `shadowOpacity`, stop.

## API facts, all verified live

### AniList (30 req/min, not per second)
- The token bucket and long `staleTime` are load-bearing, not tuning.
- `title.english` is often null; falling back to romaji is the normal path.
- Descriptions contain HTML even with `asHtml: false`.
- **`trailer.id` comes back with trailing whitespace** (`"LHtdKWJdif4\t"`).
  Not trimming it produces a dead embed URL.
- `relations` is the source of truth for seasons and adaptations. Do not infer
  a relationship from similar titles.
- Trailer and relations are folded into the detail query, an extra round trip
  per detail page is real money against 30/min.

### MangaDex (~5 req/s per IP)
- Requires a `User-Agent`; bans IPs for sustained 429s.
- **No trending metric.** Absent from `supportedSections` on purpose. Do not
  synthesise one from `followedCount`.
- **Feed flags narrow, not widen.** `includeEmptyPages=0` returns *zero*
  chapters for a licensed series. Do not send those flags.
- Licensed chapters have `pages: 0` + `externalUrl`. List and mark them.
- `links.al` / `links.mal` carry AniList and MAL ids; this is what makes
  manga → anime an exact lookup instead of a title guess.
- @Home hosts expire. Never persist resolved page URLs.

### Playback appears region restricted
Streams could not be resolved from a residential South African connection on
VidKing, VidLink or VidFast, while AniList and MangaDex work normally from the
same machine. VidKing's manifest returns 200 with CORS headers and its segments
then 404; VidLink renders "episode not found" on both its anime and tv routes.
That pattern points at regional availability rather than an integration bug.
Before changing provider code, confirm whether playback works on a connection
outside that region.

### Offline feasibility, settled
- **Anime downloads are not possible.** The player is an embed: our provider
  returns an embed page URL and the stream is resolved inside the player's own
  WebView, so the app never sees a manifest or a segment. Getting one would mean
  extracting from inside their player, which is out of scope on purpose.
- **Manga downloads are possible.** `/at-home/server/{id}` returns plain image
  URLs; a normal GET returns `image/png`. Nothing special is needed.

### VidLink is DISABLED
Kept in the tree, absent from registry.ts. See providers/stream/vidlink.ts for
why and how to re-enable. Do not wire it back in without checking it resolves.

### Playback: user picks the player
- `PlaybackService` walks providers in order, once. There is no route back to an
  earlier provider, so no fallback loop can form.
- **Embeds answer HTTP 200 even when they have no stream** and render "not
  found" client-side, so a status code proves nothing. VidLink's documented
  `fallback_url` is the only reliable failure signal; the player is given a
  sentinel address and the screen watches for navigation to it.
- Each provider ships an `EmbedRuntime` (bridge script, progress parser, resume
  param name). The player screen never names a provider.
- Do not add ad blocking of any kind here. It was tried, reverted, and is out of
  scope; a dependable fallback is worth more than a quieter fragile one.

### VidLink
- `https://vidlink.pro/anime/{malId}/{episode}/{sub|dub}` plus `?fallback=true`
- Also `/tv/{tmdbId}/{season}/{episode}` and `/movie/{tmdbId}`.
- Keyed on **MyAnimeList**, which AniList already gives us in `providerMeta`, so
  no ARM lookup is needed on this path.
- Resume param is `startAt`. Progress arrives as `MEDIA_DATA`, a rolling
  snapshot of every title watched keyed by id, not a per-event message.

### VidKing (playback fallback)
- `https://www.vidking.net/embed/tv/{tmdbId}/{season}/{episode}`
- Params: `color` (hex, no #), `autoPlay`, `nextEpisode`, `episodeSelector`,
  `progress` (resume seconds). **That is the entire documented surface**; there
  is no ad-related parameter, confirmed against their own docs page.
- Posts `{ type: 'PLAYER_EVENT', data: { event, currentTime, duration, ... } }`;
  events are `timeupdate | play | pause | ended | seeked`. Reaching them from RN
  needs `VIDKING_EVENT_BRIDGE` injected into the WebView.
- Keyed on **TMDB**, not AniList.
- Player is a first-party `<video>` + HLS.js. No nested ad iframe, no pre-roll
  in the content stream.
- **Do not block ad hosts by name or TLD.** The HLS segments are served from a
  `.top` domain under `/r2/cdn2/<token>/1080p/nw.jpg`, video disguised as an
  image. A "suspicious TLD" filter kills playback. Interruptions are handled by
  navigation policy only (`playbackPolicy.ts`).
- Verified live: the player performs **no** top-frame navigation, calls no
  `window.open`, and renders no navigating anchors during playback, so
  cancelling those cannot break it.

### ARM id mapping (arm.haglund.dev)
- Bridges AniList → TMDB for the player. Free, documented, no auth.
- **Returns 400, not 404, for an unmapped id.** Treating only 404 as "absent"
  surfaces a routine miss as a provider outage.
- `themoviedb-season` is often null; default to 1.

## Library / framework gotchas

- **expo-router SDK 56+ is not compatible with `@react-navigation/native`** and
  throws at bundle time. Import `ThemeProvider` / `DarkTheme` from `expo-router`.
- `tabBarIcon` returning `null` renders a fallback glyph, return a zero-size
  `View` instead.
- **FlashList v2 has no `inverted`.** RTL paging mirrors the list with
  `transform: scaleX(-1)` and flips each page back.
- **`horizontal` cannot change on a mounted list.** The reader's paged and
  vertical modes are separate components swapped by `key`; this was the
  mode-switch crash.
- `StyleSheet.absoluteFillObject` is not in these RN types, spell the offsets.
- `expo-status-bar`'s `StatusBar` has no `translucent` prop; Android
  translucency is configured in `app.json` under `androidStatusBar`.
- **A TanStack query function must never resolve to `undefined`.** Repository
  reads that can miss need `?? null`, or the query never settles and resume
  silently stops working.

## Manga provider status

MangaDex is the only source with a documented, legitimate, unauthenticated API.
Comick, Weeb Central, MangaFire, Kagane, Atsumaru, MangaNato, MangaDotNet,
OniSaga and Comix were each probed and deferred, see the header comment in
`src/providers/mangaSources.ts` for what each one returned. Do not add one by
writing a scraper or working around gating.

## Commands

```bash
npm test
```

```bash
npm run test:integration
```

```bash
npm run typecheck
```

Integration tests hit the real APIs and are excluded from `npm test` so the
default suite never fails because a provider is down.

## Before considering a change done

`npm run typecheck` and `npm test` both clean, and `npx expo export --platform
android` bundles; typecheck alone does not catch bundler-level import errors.
