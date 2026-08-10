# Hoshi.Anime

Watch anime and read manga in one app. Dark, image-led, purple-accented.

Expo (SDK 57) · React Native 0.86 · TypeScript 6, strict.

---

## Features

**Anime**

- Discovery home with an auto-advancing Trending carousel, seasonal, popular and
  genre rails
- Detail pages with trailers, cast and studio metadata, and a season and
  adaptation graph you can navigate
- Episode grid that stays usable on a 1,100-episode series, chunked into ranges
  rather than one endless list
- In-app playback with resume, watch progress written back per episode
- Weekly release schedule, bucketed to the device timezone

**Manga**

- Chapter lists with scanlation groups, languages and off-site publisher links
- Reader with vertical and paged modes, right-to-left support, data saver,
  keep-awake and per-chapter progress
- Multiple source support with a source picker and your own local star ratings

**Both**

- Cross-linking between an anime and its manga, and back
- Local recommendations scored from what you have saved, no account required
- Offline reading, chapters downloaded to the device
- Library with saved titles, continue watching and continue reading
- Search across both libraries with cross-language title matching

---

## Running it

```bash
npm install
```

```bash
npm start
```

Scan the QR code with Expo Go, or press `a` for Android or `w` for web.

| Command | What it does |
|---|---|
| `npm start` | Dev server |
| `npm test` | Unit tests, no network |
| `npm run test:integration` | Live checks against the real APIs |
| `npm run typecheck` | `tsc --noEmit` |

### Environment variables

**None.** Every integration uses a public, unauthenticated API, so there is no
`.env`, no API key, and no `.env.example` to fill in. If that changes, the
variable belongs in a `.gitignore`'d `.env` and documented here.

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
 ├── mapping/       │   AniList to TMDB id bridge
 └── stream/        │   playback services and embed runtimes
src/domain/             provider-agnostic models
src/library/            local-first persistence (list, progress, source ratings)
src/offline/            downloaded chapters, its own storage and index
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

WATCH opens the player directly, no source prompt and no external hand-off.

VidKing addresses content by **TheMovieDB** id, which AniList does not publish,
so [arm.haglund.dev](https://arm.haglund.dev) bridges the two. Watch progress is
real: the player posts `timeupdate`, `pause`, `ended` and `seeked` with
`currentTime` and `duration`, forwarded out of the WebView by
`VIDKING_EVENT_BRIDGE`. Resume is applied through the `progress` URL parameter.

Playback runs through a `PlaybackService` that takes a list of providers and
falls back down it when one reports failure, so a second source is a constructor
argument rather than a rewrite. Each provider supplies an `EmbedRuntime`: its
bridge script, its progress parser, and the name of its resume parameter. The
player screen deals only in `PlaybackProgress` and never names a provider, which
is what keeps one watch-progress system rather than one per player.

**VidLink is currently disabled.** Its provider and runtime are still in
`src/providers/stream/`, tested and intact, but `registry.ts` deliberately does
not import them: the service returned "episode not found" for every title
probed, on both its anime and tv routes. Re-enabling it is one import and one
array entry.

### Manga, MangaDex

Public REST, no auth for reads. Roughly 5 requests/second per IP, requires a
descriptive `User-Agent`, and collections cap at `offset + limit ≤ 10,000`.

Two behaviours worth knowing, both found against the live API:

- **No trending metric exists**, so that rail is absent rather than faked from
  follower counts.
- **Licensed chapters report `pages: 0` with an `externalUrl`.** They are listed
  and marked "Off-site"; filtering them would make a fully licensed series look
  as though it has no chapters.

### Additional anime sources, investigated, rejected

AnimePahe, AnimeKai and Toonstream were each probed directly. **All three sit
behind bot protection, and none was integrated.**

| Provider | Reachable programmatically | Public API | Source | Verdict |
|---|---|---|---|---|
| VidKing | yes | documented embed | encrypted, tokenized HLS | in use |
| AnimePahe | no, Cloudflare 403 | none | Kwik, obfuscated | rejected |
| AnimeKai | no, JS challenge | none | MegaUp, encrypted | rejected |
| Toonstream | no, JS challenge | none | third-party embeds | rejected |

AnimePahe's real domain answers 403 to any non-browser client and resolves
sources through obfuscated Kwik scripts. AnimeKai and Toonstream share a
JavaScript challenge that mints a JWT and rejects clients that cannot run it.
Getting a media URL from any of them means defeating the check, which this
project does not do.

The aggregator route was tried too, and is also closed: `api.consumet.org`, the
resolver most projects depend on, now answers **HTTP 451, Unavailable For Legal
Reasons**, and the surviving community deployments are dead.

Operator intent is explicit and settles it independently of the technical
blocks. AnimeKai and Toonstream both publish `User-agent: * / Disallow: /`, and
AnimePahe publishes `Content-Signal: ai-train=no` together with a specific
`User-agent: ClaudeBot / Disallow: /`. There is no version of integrating these
that respects what their operators have written down.

Worth knowing if you go looking: **`animepahe.ru` and `animepahe.su` are not
AnimePahe.** They serve an obfuscated redirect to an ad network and fingerprint
devtools. Those are the domains most guides still cite. `NOTES.md` has the
decoded payload and the full route-by-route log.

The provider abstraction was already ready for a better source: `PlaybackTarget`
has a `direct` variant carrying url, MIME type, headers and subtitle tracks, and
`StreamOption` carries quality and audio track. Adding a provider that resolves
legitimately is a class plus a registry line, with no player changes.

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

## Offline

**Manga chapters download; anime does not.** That asymmetry is a property of the
providers, not a missing feature.

MangaDex serves page images as ordinary files over plain HTTP GET, so a chapter
is a directory of images and downloading it is honest. The video providers hand
back an embed *page* URL, and the actual stream is resolved inside that page's
own player at runtime. The app never receives a manifest or a media file, so
there is nothing to save. Rather than ship a download button that stores a URL
which stops working the moment you lose signal, the offline library says so
directly.

A direct "Download Episode" action was investigated against the live player and
rejected on evidence. The embed URL returns a 4 KB HTML shell with no media
reference of any kind; the player then resolves an **encrypted** source list at
runtime and decrypts it itself, yielding a tokenized HLS playlist with 1080p,
720p and 480p variants. Reaching that URL would mean defeating the encryption,
which this project does not do. Even past it, HLS is a manifest rather than a
file, so a playable download would need a bundled muxer, against the constraint
that the app stay small. `NOTES.md` records the exact evidence.

Downloads live in their own AsyncStorage index and their own directory,
separate from the query cache, so clearing cached metadata never deletes
something the user chose to keep. Pages are fetched sequentially, and a failed
chapter removes its partial directory so a retry starts clean.

Connection state is bridged into TanStack Query's `onlineManager` once, at the
root. Query pauses rather than retries while offline, which is what actually
stops the app reissuing requests that cannot succeed, and paused queries resume
on their own when the connection returns. The reader checks for a local copy
first and skips the network entirely when it finds one.

---

## Recommendations

**Deterministic and rule based. There is no machine learning and no model.**
Every number is hand chosen, every result is traceable to its inputs, and
nothing leaves the device. The engine is `src/lib/recommend.ts`, which is pure;
`src/data/recommendations.ts` owns fetching and caching.

```
activity      saved list AND watch history (nothing else is collected)
   |
signals       completed 1.0 | watching 0.6 | saved 0.5 | abandoned -0.35
   |          each multiplied by recency, half life 120 days
profile       weighted genre and studio affinity, normalised to 1
   |          plus a quality baseline and an era centre
candidates    trending + popular + top rated + airing, already cached
   |
score         0.50 genre + 0.20 studio + 0.15 quality + 0.10 era
   |          + 0.05 popularity   (sums to 1)
filter        drop saved, completed and abandoned; keep in-progress
   |
diversify     greedy re-rank, 0.35 penalty per repeated genre,
   |          hard cap of 2 titles per studio
explain       reason taken from the highest weighted component
```

A few decisions worth stating outright:

- **There is no rating weight**, because the app has no per-title user rating
  for anime. Documenting one would describe code that does not exist.
- **Negative signals are deliberately weak.** Abandoning counts as `-0.35`
  against a completion's `1.0`, so one dropped show nudges a genre rather than
  vetoing it. People drop things for reasons unrelated to taste.
- **Quality is measured against the viewer's own baseline**, not in absolute
  terms, so broad taste is not narrowed to the top hundred.
- **Popularity is last and smallest.** Give it real weight and every list
  collapses into the same famous shows for everybody.
- **Cold start is not an error state.** Under two positive signals the row
  becomes an interleaved blend of trending, popular, top rated and this season,
  labelled as exactly that instead of dressed up as personal.

`ScoreBreakdown` carries every component through to the result, so any ranking
can be inspected rather than taken on trust. In development the hook also logs
per-stage counts (signals, candidates, excluded, ranked, returned), because "the
row is empty" has several possible causes that look identical on screen.

**Watching counts on its own.** Playing episodes builds the profile with no
Add to list, no rating and no favourite required. This is worth stating because
it did not used to be true: recommendations read the saved list and nothing
else, so anyone who watched without saving got an empty row reading "Nothing
here yet". Watch history is now a first-class signal and is part of the cache
key, so finishing an episode refreshes the row.

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

---

## Testing

`npm test`, **259 unit tests**, no network. Response normalization,
cross-language title matching, chapter ordering, timezone bucketing, rating
normalization, contrast maths, episode range chunking, the whole recommendation
pipeline (signal weighting, recency decay, scoring, diversity, cold start),
offline grouping and size formatting, and embed URL building and event parsing
for both players.

`npm run test:integration`, **29 live tests** against AniList, MangaDex and the
ARM mapping service. Real search, pagination, every discovery section, real page
images, the relationship graph, and error mapping. Kept in a separate config
because `npm test` must never fail because a provider is down.

---

## Known limitations

- **Player advertisements.** The embed exposes five documented parameters
  (`color`, `autoPlay`, `nextEpisode`, `episodeSelector`, `progress`) and none
  of them relate to advertising. Ads arrive as third-party scripts and XHR from
  ad-exchange hosts, and react-native-webview offers no supported hook to cancel
  an individual subresource, so they cannot be filtered without native code.
  Blocking by hostname was rejected on evidence: one of the HLS segment CDNs
  sits on a `.top` domain and a TLD heuristic would have killed playback
  outright. The player screen states this rather than pretending otherwise.
- **Playback availability is regional.** VidKing manifests resolve but segments
  have been observed 404ing from its rotating CDN hosts on some connections.
  Nothing in the app can fix that.
- **Episode lists are generated.** AniList publishes a total count plus a
  partial `streamingEpisodes` array, not a canonical per-episode endpoint.
  Episodes are built from the count and enriched where a streaming entry matches
  by number; unaired ones are marked upcoming rather than shown as available.
- **Anime to manga is matched by title.** AniList names the source manga but in
  its own id space; MangaDex has no shared key, so the link is made by confident
  title match and labelled "matched by title". Manga to anime is exact, via
  MangaDex's published AniList id.
- **Chapter lists can contain duplicates**, because several scanlation groups
  publish the same chapter. That is real MangaDex data; the group is shown so
  you can choose.
- **Episodes cannot be downloaded as files.** See Offline above: the player
  decrypts its source list at runtime and serves tokenized HLS, so there is no
  downloadable file to hand to the OS.
- **Source ratings and recommendations are local.** With no account system there
  is no community average, and inventing one would be fabricating data.

---

## Licence and content

Hoshi.Anime is a client. It hosts no anime, no manga and no video, and it stores
nothing on a server. All metadata, page images and playback come from the
third-party services named above, under their own terms. Nothing in this app
bypasses authentication, DRM, paywalls or provider protections.
