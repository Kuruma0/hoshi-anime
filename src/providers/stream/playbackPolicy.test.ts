import { describe, expect, it } from 'vitest';
import { allowNavigation, createNavigationPolicy, hostOf, isSameSite } from './playbackPolicy';

const PLAYER_URL = 'https://www.vidking.net/embed/tv/1429/1/1?color=6D4AA8';
const policy = createNavigationPolicy(PLAYER_URL);

describe('createNavigationPolicy', () => {
  it('derives the allowed host from the player URL rather than a constant', () => {
    // If the provider moves domain, the policy must not block its own page.
    expect(policy.playerHost).toBe('www.vidking.net');
    expect(createNavigationPolicy('https://player.example.org/x').playerHost).toBe(
      'player.example.org'
    );
  });
});

describe('allowNavigation, player traffic must never be blocked', () => {
  it('allows the initial player load', () => {
    expect(policy.allow({ url: PLAYER_URL, isTopFrame: true })).toBe(true);
  });

  it('allows the player navigating within its own site', () => {
    expect(
      policy.allow({ url: 'https://www.vidking.net/embed/tv/1429/1/2', isTopFrame: true })
    ).toBe(true);
    expect(policy.allow({ url: 'https://vidking.net/embed/movie/123', isTopFrame: true })).toBe(
      true
    );
  });

  it('allows blob: URLs; HLS.js hands the video element a MediaSource this way', () => {
    expect(
      policy.allow({ url: 'blob:https://www.vidking.net/ae5b971a-a769', isTopFrame: true })
    ).toBe(true);
  });

  it('allows about:blank and data: bootstrapping', () => {
    expect(policy.allow({ url: 'about:blank', isTopFrame: true })).toBe(true);
    expect(policy.allow({ url: 'data:text/html,<p>x', isTopFrame: true })).toBe(true);
  });

  it('leaves sub-frame loads alone', () => {
    // A sub-frame cannot navigate the app away, and blocking one risks breaking
    // a player that later moves part of itself into an iframe.
    expect(policy.allow({ url: 'https://ads.example.cyou/frame', isTopFrame: false })).toBe(true);
  });

  it('allows an unparseable URL rather than risking a black screen', () => {
    expect(policy.allow({ url: 'not a url', isTopFrame: true })).toBe(true);
  });

  it('allows everything when the player host could not be determined', () => {
    expect(allowNavigation({ url: 'https://anything.example', isTopFrame: true }, '')).toBe(true);
  });
});

describe('allowNavigation; off-origin navigation is cancelled', () => {
  const offOrigin = [
    'https://droned.thewrazeingparrots.cyou/gd/129649',
    'https://drivagebidding.cyou/x',
    'https://zv.dolesdao.com/rjd0JVt3AO0di/MWOww',
    'https://example-sportsbook.com/signup',
  ];

  it('blocks a top-frame navigation to another site', () => {
    for (const url of offOrigin) {
      expect(policy.allow({ url, isTopFrame: true }), url).toBe(false);
    }
  });

  it('blocks when isTopFrame is not reported', () => {
    // Android reports navigationType 'other' and may omit the flag; a main-frame
    // redirect must still be caught.
    expect(policy.allow({ url: 'https://drivagebidding.cyou/x' })).toBe(false);
  });

  it('does not block a playback CDN merely because its domain looks like an ad', () => {
    // The real finding: one of the HLS segment hosts is on a .top domain. A
    // "suspicious TLD" heuristic would have killed video delivery.
    const cdnPolicy = createNavigationPolicy('https://primecrown.top/embed/x');
    expect(cdnPolicy.allow({ url: 'https://primecrown.top/r2/cdn2/abc', isTopFrame: true })).toBe(
      true
    );
  });
});

describe('isSameSite', () => {
  it('treats subdomains of the player site as the player', () => {
    expect(isSameSite('cdn.vidking.net', 'www.vidking.net')).toBe(true);
    expect(isSameSite('vidking.net', 'www.vidking.net')).toBe(true);
  });

  it('does not treat a different site as the player', () => {
    expect(isSameSite('vidking.net.evil.com', 'www.vidking.net')).toBe(false);
    expect(isSameSite('notvidking.net', 'www.vidking.net')).toBe(false);
  });
});

describe('hostOf', () => {
  it('lowercases the host', () => {
    expect(hostOf('https://WWW.VidKing.NET/embed')).toBe('www.vidking.net');
  });

  it('returns undefined for a non-URL', () => {
    expect(hostOf('nonsense')).toBeUndefined();
  });
});
