# Hoshi.Anime

Watch anime and read manga in one app. Dark, image-led, purple-accented.

Expo (SDK 57) · React Native · TypeScript.

---

## Running it

```bash
npm install
```

```bash
npm start
```

Scan the QR code with Expo Go, or press `a` for Android / `w` for web.

| Command | What it does |
|---|---|
| `npm start` | Dev server |
| `npm test` | Unit tests (no network) |
| `npm run test:integration` | Live checks against the real APIs |
| `npm run typecheck` | `tsc --noEmit` |

### Environment variables

**None.** Every integration uses a public, unauthenticated API, so there is no
`.env`, no API key, and no `.env.example` to fill in. If that changes, the
variable belongs in `.gitignore`'d `.env` and documented here.

---

## Architecture

One rule holds the whole thing together: **screens never touch a provider.**

```
app/                    screens, JSX and hooks only, zero fetch calls
 └── imports from ─┐
src/data/           │   TanStack Query hooks, the only thing screens may import
 └── calls ─────────┤
src/providers/      │   registry.ts picks the implementation
 ├── types.ts       │   AnimeProvider · MangaProvider · AnimeStreamProvider
 ├── anilist/       │   anime metadata, discovery, schedule, relations
 ├── mangadex/      │   manga metadata, chapters, page images
 ├── mapping/       │   AniList → TMDB id bridge
 └── stream/        │   VidKing playback
src/domain/             provider-agnostic models
src/library/            local-first persistence (list, progress, source ratings)
src/lib/                http, rate limiting, errors, title matching, routes
src/design/             tokens and primitives
```

### Swapping a provider

Write a class against the interface in `src/providers/types.ts`, then change one
line in `src/providers/registry.ts`. Nothing in `app/` changes.

Two rules keep it that way:

1. Providers throw `ProviderError` (`src/lib/errors.ts`) and nothing else.
2. Providers return domain models. `providerMeta` is an escape hatch other
   providers may read, **never `app/`**.

---

## Provider integrations

### Anime metadata, AniList

Public GraphQL, no key. **30 requests/minute**, the tightest constraint in the
app, hence the token bucket in `src/lib/rateLimiter.ts` and the long
`staleTime` in `src/data/queryClient.ts`.

Backs discovery, search, genres, recommendations, the release schedule, the
relationship graph (seasons and adaptations), and trailers.

### Anime playback, VidKing

```
https://www.vidking.net/embed/tv/{tmdbId}/{season}/{episode}
```

WATCH opens the player directly, no source prompt, no external hand-off.

VidKing addresses content by **TheMovieDB** id, which AniList does not publish,
so [arm.haglund.dev](https://arm.haglund.dev) bridges the two. Watch progress is
real: the player posts `timeupdate`/`pause`/`ended`/`seeked` with `currentTime`
and `duration`, forwarded out of the WebView by `VIDKING_EVENT_BRIDGE`. Resume
is applied through the `progress` URL parameter.

There is no user-facing source setting; playback is handled internally.

### Manga, MangaDex

Public REST, no auth for reads. ~5 requests/second per IP, requires a
descriptive `User-Agent`, collections cap at `offset + limit ≤ 10,000`.

Two behaviours worth knowing, both found against the live API:

- **No trending metric exists**, so that rail is absent rather than faked from
  follower counts.
- **Licensed chapters report `pages: 0` with an `externalUrl`.** They are listed
  and marked "Off-site"; filtering them would make a fully licensed series look
  as though it has no chapters.

### Additional manga sources, investigated, deferred

Each was probed directly. **MangaDex is the only one with a documented,
legitimate, unauthenticated API.**

| Source | Finding |
|---|---|
| MangaHook | Self-hosted Cheerio scraper (`localhost:3000`); hosted demo 404s |
| Consumet | Public API retired, self-hosting only |
| Comick | `api.comick.fun` no longer resolves |
| Weeb Central | Serves `text/html`; no API |
| MangaFire · MangaNato | No official developer API |
| Kagane | Endpoint probes return 403 |
| Atsumaru · MangaDotNet · OniSaga · Comix | No published API docs |

None were integrated by scraping or by working around gating. The registry and
source picker are built for N sources, so adding one later is a provider class
plus a registry entry.

---

## Design

Defined as values in `src/design/tokens.ts`, so drifting from it means editing
that file on purpose.

- **No shadows anywhere.** Elevation is background value plus a 1px hairline.
- **Radius 2 on artwork, 0 everywhere else.** Buttons are rectangles. No pills.
- **No cards.** Content sits on the background, separated by space.
- **Gradients only as hero scrims**, where they exist for text legibility over
  arbitrary artwork.
- **Purple is punctuation**, one primary action per screen, one selected item.
- **Text-only tab bar.** "Anime" and "Manga" have no meaningful glyph.

---

## Testing

`npm test`, 149 unit tests, no network. Response normalization, cross-language
title matching, chapter ordering, timezone bucketing, rating normalization,
contrast maths, VidKing URL building and event parsing.

`npm run test:integration`, 29 live tests against AniList, MangaDex and the ARM
mapping service. Real search, pagination, every discovery section, real page
images, the relationship graph, and error mapping.

---

## Known limitations

- **Player advertisements.** The embed exposes five documented parameters
  (`color`, `autoPlay`, `nextEpisode`, `episodeSelector`, `progress`) and none
  of them relate to advertising. Ads arrive as third-party scripts and XHR from
  ad-exchange hosts, and react-native-webview offers no supported hook to cancel
  an individual subresource; so those requests cannot be filtered without
  native code. What *is* controlled is navigation: `playbackPolicy.ts` cancels
  any attempt to take the player off its own site and refuses popups, which
  removes the redirect and popup interruptions. Non-interruptive in-page ads
  remain. Blocking by hostname was rejected on evidence: one of the HLS segment
  CDNs sits on a `.top` domain and a TLD heuristic would have killed playback.
- **Episode lists are generated.** AniList publishes a total count plus a
  partial `streamingEpisodes` array, not a canonical per-episode endpoint.
  Episodes are built from the count and enriched where a streaming entry matches
  by number; unaired ones are marked upcoming rather than shown as available.
- **Anime → manga is matched by title.** AniList names the source manga but in
  its own id space; MangaDex has no shared key, so the link is made by confident
  title match and labelled "matched by title". Manga → anime is exact, via
  MangaDex's published AniList id.
- **Chapter lists can contain duplicates**, several scanlation groups publish
  the same chapter. That is real MangaDex data; the group is shown so you can
  choose.
- **Source ratings are local.** With no account system there is no community
  average, and inventing one would be fabricating data.
