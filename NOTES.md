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

### Direct episode download, investigated and rejected
Re-checked against the live player rather than assumed. `GET` on
`/embed/tv/1429/1/1` returns 4 KB of `text/html` containing zero `.mp4`,
`.m3u8`, `.mpd`, `<video>` or `<source>`; it is a shell that loads
`assets/VideoPlayer-*.js`. Everything media related happens after that runs.

Loading it in a browser and reading the player's own console shows what it
resolves to:

```
Decrypted sources for Yoru: {subtitles: Array(48), sources: Array(3),
  playlist: https://moon.ironwallnet.net/r2/cdn2/<opaque-token>/playlist.m3u8}
Source has multiple quality options: {0: 1080p, 1: 720p, 2: 480p}
```

Three blockers, in the order they bite:

1. **The source list arrives encrypted** and is decrypted by their own player
   at runtime; their log says so in as many words. Reaching that URL from our
   side means reimplementing or driving their decryption, which is defeating an
   anti-download measure. Not doing it.
2. **It is HLS, not a file.** Even given the URL, `.m3u8` is a manifest.
   Producing something playable means fetching every segment and muxing, which
   is a native muxer (ffmpeg, tens of MB) against a hard "do not grow the app"
   constraint.
3. **The path token is opaque and per-session**, so anything extracted would
   expire and the "download" would rot.

CORS never becomes the deciding question: blocker 1 sits in front of it.
Quality selection and subtitle tracks both exist in the decrypted payload, so
the UI side would have been easy; the source side is what makes it impossible.

No Download Episode button was added. A control that can never succeed for any
title is worse than its absence, and the offline library and Settings already
say plainly that anime cannot be saved.

### AnimePahe / AnimeKai / Toonstream, probed and rejected
All three probed directly on 2026-08-10. **None is integrable without defeating
a protection mechanism, so none was integrated.**

**Watch out: `animepahe.ru` and `animepahe.su` are not AnimePahe.** Both return
an identical 1576 byte page (server `Angie`) whose obfuscated script
base64-decodes to `https://bulsis.net/go/2954557?...&subid2=animepahe.su`, an ad
redirect network. It also fingerprints devtools by comparing `outerWidth` to
`innerWidth` before firing. These are the domains most tutorials still cite. Do
not point anything at them.

The real site is `animepahe.org`, which redirects to `animepahe.pw` and answers
**403 from Cloudflare** to any non-browser client; in a real browser it shows
"Performing security verification". Source resolution then runs through Kwik
with packed, obfuscated JS. Getting a media URL means passing the bot check
programmatically and then deobfuscating Kwik. Both are circumvention.

`animekai.bz` and `toonstream.love` share one gate: a 470 byte "Loading..."
page that mints a `Joken` JWT and requires the client to re-request with
`?ch=1&js=<jwt>&sid=<uuid>`. It exists to admit browsers and reject
programmatic clients, which is precisely what Hoshi would have to be.

| Provider | Reachable without a challenge | Public API | Source | Verdict |
|---|---|---|---|---|
| VidKing | yes | documented embed | encrypted, resolves to tokenized HLS | in use |
| AnimePahe | no, Cloudflare 403 | none | Kwik, obfuscated | rejected |
| AnimeKai | no, JS/JWT gate | none | MegaUp, encrypted | rejected |
| Toonstream | no, JS/JWT gate | none | third-party embeds | rejected |

Nothing beyond format was confirmed for the rejected three, because confirming
it would have meant getting past the gate. Blank is honest; invented values
would not be.

**Every route was tried before concluding this.** Recorded so nobody spends a
weekend re-running it:

| Route | Result |
|---|---|
| `api.consumet.org` (the main community resolver) | **HTTP 451, Unavailable For Legal Reasons** |
| `miruro.tv` / `miruro.to` API | **HTTP 410 Gone** on every path, see below |
| `anify.tv`, `anify.eltik.cc` | timeout, 404 |
| Community Vercel and Railway resolver deployments | 404 or 500, all dead |
| Toonstream `/wp-json/`, `/wp/v2/posts`, `/sitemap.xml`, `/feed/` | challenge on every path |
| Toonstream `.co`, `.net`, `.in`, `.day` | dead, dead, dead, domain auction page |
| AnimePahe `.ru`, `.su`, `.si`, `.moe`, `.com` | squatters, dead, or Cloudflare |
| AnimeKai `.to`, `.bz` | DNS failure, JS challenge |

Operator intent is explicit in every case, which settles it independently of
the technical blocks:

- `animekai.bz/robots.txt`: `User-agent: *` / `Disallow: /`
- `toonstream.love/robots.txt`: `User-agent: *` / `Disallow: /`
- `animepahe.org/robots.txt`: `Content-Signal: search=yes,ai-train=no,use=reference`,
  and a specific `User-agent: ClaudeBot` / `Disallow: /`

That last line names this assistant's crawler directly, so probing AnimePahe
stopped there. Two of the three sites disallow all automated clients outright.
There is no version of integrating them that respects what their operators
have written down.

### Miruro, checked separately, also closed
Worth recording because it fails differently and more politely than the other
three, so it looks promising right up until it isn't.

`miruro.tv/robots.txt` is **permissive**: it disallows only `/profile/`,
`/settings` and `/callback`, does not disallow `/`, and names no crawler. No
hostility to automated clients at all. The site itself is a normal Cloudflare
fronted React app.

The API is nonetheless gone. Every path under `/api/` on both `miruro.tv` and
`miruro.to` returns **HTTP 410 Gone** with `{"error":"Gone"}`:

```
/api  /api/search  /api/anime  /api/sources
/api/v1/*  /api/v2/*  /api/anilist/*  /api/hianime/*  /api/zoro/*  /api/animepahe/*
```

410 rather than 404 is the point. 404 would mean "wrong path, keep looking";
410 means "this existed and has been permanently withdrawn". It is a blanket
wildcard, identical response and identical 16 byte body across every version
and every provider sub-path, so there is no surviving endpoint to find.
`/backend/*` returns the SPA's own 404 shell, and `api.` / `backend.`
subdomains do not resolve.

Miruro was a front end over the same aggregator backends. With Consumet at 451
and Miruro at 410, that whole layer is retired, not merely moved. Anything that
still worked would have to come from scraping the SPA, whose media resolution
runs client side against the backend that is answering 410 for us.

Note the abstraction was already ready for a better provider: `PlaybackTarget`
has a `direct` variant carrying `url`, `mimeType`, `headers` and `subtitles`,
and `StreamOption` carries `quality` and `audio`. That is the normalized source
model, already built. `downloadable` and `expiresAt` were deliberately not added
because no provider can populate them, and fields no code can fill are dead
weight.

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
