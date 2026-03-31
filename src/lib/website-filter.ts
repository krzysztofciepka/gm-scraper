const BLOCKED_DOMAINS = new Set([
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "youtube.com",
  "linkedin.com",
  "yelp.com",
  "tripadvisor.com",
  "booking.com",
  "maps.google.com",
  "google.com",
  "foursquare.com",
  "zomato.com",
  "ubereats.com",
  "doordash.com",
  "grubhub.com",
  "pyszne.pl",
  "allegro.pl",
  "olx.pl",
  "pinterest.com",
  "tumblr.com",
  "reddit.com",
  "yellowpages.com",
  "bing.com",
]);

/**
 * Extracts the hostname from a URL string that may or may not include a protocol.
 * Returns null if the input cannot be parsed.
 */
function extractHostname(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Prepend a protocol if missing so URL() can parse it.
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    return new URL(withProtocol).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Returns true when the hostname matches a blocked domain exactly or as a subdomain.
 * e.g. "m.facebook.com" is blocked because it ends with ".facebook.com".
 */
function isBlockedHostname(hostname: string): boolean {
  for (const blocked of BLOCKED_DOMAINS) {
    if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
      return true;
    }
  }
  return false;
}

/**
 * Determines whether the provided URL points to a custom business website
 * (as opposed to a social network or business-directory listing).
 *
 * @returns true  – looks like a custom domain worth following up on
 * @returns false – null/undefined/empty, or a known social/directory domain
 */
export function hasCustomWebsite(url: string | null | undefined): boolean {
  if (url == null) return false;

  const hostname = extractHostname(url);
  if (!hostname) return false;

  return !isBlockedHostname(hostname);
}
