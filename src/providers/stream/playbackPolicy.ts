/**
 * Navigation policy for the embedded player.
 *
 * ── What the investigation found ──
 *
 * The player is a first-party HTML5 `<video>` driven by HLS.js — no nested ad
 * iframe, and no pre-roll spliced into the content stream. Loading an embed and
 * reading its resource list showed two distinct groups of third-party hosts:
 *
 *   Playback (required)
 *     api.*        source resolution / seed
 *     db.*         episode + season metadata
 *     <cdn hosts>  the HLS manifest and segments
 *
 *   Advertising / tracking
 *     script and XHR calls to ad-exchange hosts, including one carrying a
 *     base64 payload describing the viewport
 *
 * Crucially, one of the *playback* CDN hosts sits on a `.top` domain and looks
 * exactly like an ad host by name. Blocking on a "suspicious TLD" heuristic
 * would have killed video delivery outright. That is why this module blocks
 * nothing by hostname pattern.
 *
 * ── What is actually implementable ──
 *
 * react-native-webview exposes navigation interception (`onShouldStartLoadWithRequest`,
 * `onOpenWindow`) but **no subresource request interception** — there is no
 * supported cross-platform hook to cancel an individual script or XHR. So the
 * ad *requests* cannot be filtered without dropping to native code.
 *
 * What can be controlled is where the WebView is allowed to go. That is this
 * app deciding which navigations it honours inside its own player surface — not
 * a modification of the provider's page, and not a defeat of any protection
 * mechanism. It removes precisely the interruptions that matter: redirects,
 * popups, and forced navigation away from playback.
 */

/** Schemes that are never a navigation away from the player. */
const INERT_SCHEMES = ['about:', 'blob:', 'data:'];

export interface NavigationRequest {
  url: string;
  /**
   * Whether this is the main frame. Sub-frame loads cannot take the user out of
   * the app, so they are left alone — see `allowNavigation`.
   */
  isTopFrame?: boolean;
}

export interface NavigationPolicy {
  /** True when the WebView should be allowed to perform this navigation. */
  allow(request: NavigationRequest): boolean;
  /** Host the player was loaded from; everything else is off-origin. */
  readonly playerHost: string;
}

/**
 * Build a policy from the URL the player is being loaded with.
 *
 * The allowed origin is derived from that URL rather than hardcoded, so if the
 * provider ever moves domain the player keeps working instead of the policy
 * blocking its own page — the failure mode §17 warns about.
 */
export function createNavigationPolicy(playerUrl: string): NavigationPolicy {
  const playerHost = hostOf(playerUrl) ?? '';

  return {
    playerHost,
    allow: (request) => allowNavigation(request, playerHost),
  };
}

export function allowNavigation(request: NavigationRequest, playerHost: string): boolean {
  const { url, isTopFrame } = request;

  if (!url) return true;

  // about:blank and blob:/data: URLs are how the player bootstraps and how
  // HLS.js hands a MediaSource to the video element. Never interfere.
  if (INERT_SCHEMES.some((scheme) => url.startsWith(scheme))) return true;

  /*
   * Only the main frame is policed.
   *
   * A sub-frame cannot navigate the app away, so blocking one buys nothing and
   * risks breaking a player that later moves part of itself into an iframe.
   * Playback reliability outranks removing a banner.
   */
  if (isTopFrame === false) return true;

  const host = hostOf(url);

  // Unparseable target: allow rather than risk blocking something the player
  // needs. A policy that fails closed here would be a black screen.
  if (!host || !playerHost) return true;

  return isSameSite(host, playerHost);
}

/**
 * Same registrable site, so `www.example.com` and `cdn.example.com` both count
 * as the player. Compares the last two labels, which is sufficient here because
 * the only host being matched is the one the player itself was loaded from.
 */
export function isSameSite(host: string, playerHost: string): boolean {
  if (host === playerHost) return true;

  const site = registrableSite(host);
  return site !== '' && site === registrableSite(playerHost);
}

function registrableSite(host: string): string {
  const labels = host.toLowerCase().split('.').filter(Boolean);
  if (labels.length < 2) return host.toLowerCase();
  return labels.slice(-2).join('.');
}

export function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return undefined;
  }
}
