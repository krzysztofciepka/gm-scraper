import { chromium, type Browser, type Page, type Route } from "playwright";
import type { BoundingBox, GridCell } from "@/lib/types";
import { generateGrid, subdivideCell } from "@/worker/grid";
import {
  type RawSearchResult,
  type RawBusinessDetail,
  parseSearchResults,
  parseBusinessDetail,
} from "@/worker/parser";
import { downloadPhotos } from "@/worker/media";
import { hasCustomWebsite } from "@/lib/website-filter";
import {
  insertBusiness,
  businessExists,
  linkJobBusiness,
  getDb,
  updateJobProgress,
} from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ScrapeCallbacks {
  onProgress: (update: {
    grid_cells_total: number;
    grid_cells_completed: number;
    businesses_found: number;
    businesses_skipped: number;
  }) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Grid step in degrees (~0.01 ≈ 1.1 km at mid-latitudes). */
const GRID_STEP_DEG = 0.01;

/** Subdivision threshold — if a cell yields this many results the area is dense. */
const SUBDIVISION_THRESHOLD = 20;

/** Max subdivision depth to avoid infinite recursion. */
const MAX_SUBDIVISION_DEPTH = 3;

/** Delay range between requests (ms). */
const DELAY_MIN = 2000;
const DELAY_MAX = 5000;

/** Timeout for navigation (ms). */
const NAV_TIMEOUT = 30_000;

/** Timeout for network intercept waiting (ms). */
const INTERCEPT_TIMEOUT = 15_000;

/** Maximum scroll iterations when loading search results. */
const MAX_SCROLL_ITERATIONS = 8;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomDelay(): Promise<void> {
  const ms = DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Strip the Google Maps JSONP-like prefix `)]}'\n` and parse the JSON body.
 * Returns null if parsing fails.
 */
function parseGmapsJson(raw: string): unknown | null {
  const cleaned = raw.replace(/^\)]\}'\n?/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Walk a deeply nested array structure looking for entries that match a
 * predicate. Google Maps API returns data as nested arrays, not objects.
 */
function walkNestedArray(
  data: unknown,
  predicate: (item: unknown) => boolean,
  maxDepth = 12,
  depth = 0
): unknown[] {
  if (depth > maxDepth) return [];
  const results: unknown[] = [];
  if (Array.isArray(data)) {
    if (predicate(data)) results.push(data);
    for (const child of data) {
      results.push(...walkNestedArray(child, predicate, maxDepth, depth + 1));
    }
  }
  return results;
}

/**
 * Check if a string looks like a Google Place ID (starts with "ChIJ").
 */
function isPlaceId(val: unknown): val is string {
  return typeof val === "string" && val.startsWith("ChIJ");
}

/**
 * Check if a value looks like a latitude/longitude number.
 */
function isCoord(val: unknown): boolean {
  return typeof val === "number" && Math.abs(val) > 0.1 && Math.abs(val) < 180;
}

/**
 * Attempt to extract search result entries from a Google Maps nested array
 * response. This is heuristic — we look for arrays containing a ChIJ place ID
 * near the start and coordinate pairs.
 */
function extractSearchEntries(data: unknown): RawSearchResult[] {
  const results: RawSearchResult[] = [];
  const seen = new Set<string>();

  // Google Maps search results are typically nested at a predictable depth.
  // Each entry is an array where certain indices hold known fields.
  const candidates = walkNestedArray(data, (item) => {
    if (!Array.isArray(item) || item.length < 10) return false;
    // Look for an entry that has a place ID string (ChIJ...)
    return item.some(isPlaceId);
  });

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    const flat = flattenForSearch(candidate);
    if (!flat) continue;
    if (seen.has(flat.place_id)) continue;
    seen.add(flat.place_id);
    results.push(flat);
  }

  return results;
}

/**
 * Try to flatten a single candidate array into a RawSearchResult.
 * Returns null if essential fields cannot be found.
 */
function flattenForSearch(arr: unknown[]): RawSearchResult | null {
  let placeId: string | null = null;
  let name: string | null = null;
  let lat: number | null = null;
  let lng: number | null = null;
  let address = "";
  let category = "";
  let rating: number | null = null;
  let reviewsCount = 0;
  let website: string | null = null;

  // Walk through to find place_id
  walkNestedArray(arr, (item) => {
    if (Array.isArray(item)) {
      for (const el of item) {
        if (isPlaceId(el) && !placeId) placeId = el;
      }
    }
    return false;
  });

  if (!placeId) return null;

  // Collect strings and numbers for heuristic assignment
  const strings: string[] = [];
  const numbers: number[] = [];
  const coordPairs: [number, number][] = [];

  walkNestedArray(
    arr,
    (item) => {
      if (Array.isArray(item) && item.length === 2) {
        if (isCoord(item[0]) && isCoord(item[1])) {
          coordPairs.push([item[0] as number, item[1] as number]);
        }
      }
      return false;
    },
    6
  );

  collectPrimitives(arr, strings, numbers, 0, 4);

  // Coordinates: the first pair is usually lat/lng
  if (coordPairs.length > 0) {
    const [a, b] = coordPairs[0];
    // Google Maps uses lat, lng — lat is typically -90..90, lng -180..180
    if (Math.abs(a) <= 90) {
      lat = a;
      lng = b;
    } else if (Math.abs(b) <= 90) {
      lat = b;
      lng = a;
    }
  }

  // Name: first non-empty string that isn't the place_id and doesn't look like an address
  for (const s of strings) {
    if (s === placeId) continue;
    if (s.length < 2 || s.length > 200) continue;
    if (/^https?:\/\//.test(s)) {
      if (!website) website = s;
      continue;
    }
    if (!name && !s.includes(",") && s.length <= 100) {
      name = s;
    } else if (!address && s.includes(",")) {
      address = s;
    } else if (!category && s.length < 60 && !s.includes(",")) {
      // second short string without comma is likely category
      if (name) category = s;
    }
  }

  // Rating: look for a number between 1 and 5
  for (const n of numbers) {
    if (n >= 1 && n <= 5 && rating === null) {
      rating = n;
    } else if (n > 0 && n === Math.floor(n) && n < 100_000 && reviewsCount === 0) {
      reviewsCount = n;
    }
  }

  if (!name) return null;

  return {
    place_id: placeId,
    name,
    latitude: lat ?? 0,
    longitude: lng ?? 0,
    address,
    category,
    rating,
    reviews_count: reviewsCount,
    website,
  };
}

function collectPrimitives(
  arr: unknown[],
  strings: string[],
  numbers: number[],
  depth: number,
  maxDepth: number
): void {
  if (depth > maxDepth) return;
  for (const el of arr) {
    if (typeof el === "string" && el.length > 0) {
      strings.push(el);
    } else if (typeof el === "number" && isFinite(el)) {
      numbers.push(el);
    } else if (Array.isArray(el)) {
      collectPrimitives(el, strings, numbers, depth + 1, maxDepth);
    }
  }
}

/**
 * Attempt to extract business detail from a Google Maps place/getdetails
 * response.
 */
function extractDetailFromResponse(data: unknown): RawBusinessDetail | null {
  let placeId: string | null = null;
  let name: string | null = null;
  let lat: number | null = null;
  let lng: number | null = null;
  let address = "";
  let formattedAddress = "";
  let category = "";
  let rating: number | null = null;
  let reviewsCount = 0;
  let website: string | null = null;
  let phone: string | null = null;
  let internationalPhone: string | null = null;
  let description: string | null = null;
  const photoUrls: string[] = [];
  const allCategories: string[] = [];

  const strings: string[] = [];
  const numbers: number[] = [];
  const coordPairs: [number, number][] = [];

  // Walk the nested structure
  walkNestedArray(
    data,
    (item) => {
      if (Array.isArray(item)) {
        for (const el of item) {
          if (isPlaceId(el) && !placeId) placeId = el as string;
        }
        // Coordinate pairs
        if (item.length === 2 && isCoord(item[0]) && isCoord(item[1])) {
          coordPairs.push([item[0] as number, item[1] as number]);
        }
      }
      return false;
    },
    10
  );

  if (!placeId) return null;

  collectPrimitives(data as unknown[], strings, numbers, 0, 6);

  // Extract coordinates
  if (coordPairs.length > 0) {
    const [a, b] = coordPairs[0];
    if (Math.abs(a) <= 90) {
      lat = a;
      lng = b;
    } else if (Math.abs(b) <= 90) {
      lat = b;
      lng = a;
    }
  }

  // Classify strings heuristically
  for (const s of strings) {
    if (s === placeId) continue;
    if (s.length < 1) continue;

    // Photo URLs
    if (
      s.includes("googleusercontent.com") &&
      s.startsWith("http") &&
      photoUrls.length < 10
    ) {
      photoUrls.push(s);
      continue;
    }

    // Website URLs
    if (/^https?:\/\//.test(s) && !s.includes("google.com")) {
      if (!website) website = s;
      continue;
    }

    // Phone numbers (international format)
    if (/^\+[\d\s()-]{7,}$/.test(s)) {
      if (!internationalPhone) internationalPhone = s;
      continue;
    }

    // Phone numbers (local format)
    if (/^[\d\s()-]{7,}$/.test(s) && !s.includes(",")) {
      if (!phone) phone = s;
      continue;
    }

    // Name: first short string
    if (!name && s.length <= 100 && !s.includes(",")) {
      name = s;
      continue;
    }

    // Address: string with comma
    if (s.includes(",") && s.length > 5 && s.length < 200) {
      if (!address) address = s;
      if (!formattedAddress) formattedAddress = s;
      continue;
    }

    // Category: short string without comma
    if (s.length < 60 && !s.includes(",") && name) {
      if (!category) {
        category = s;
      }
      if (allCategories.length < 10 && s.length < 60) {
        allCategories.push(s);
      }
    }
  }

  // Rating & reviews
  for (const n of numbers) {
    if (n >= 1 && n <= 5 && n === Math.round(n * 10) / 10 && rating === null) {
      rating = n;
    }
    if (n > 5 && n === Math.floor(n) && n < 1_000_000 && reviewsCount === 0) {
      reviewsCount = n;
    }
  }

  if (!name) return null;

  return {
    place_id: placeId,
    name,
    latitude: lat ?? 0,
    longitude: lng ?? 0,
    address: address || name,
    formatted_address: formattedAddress || address || name,
    category: category || "",
    rating,
    reviews_count: reviewsCount,
    website,
    phone,
    international_phone: internationalPhone,
    price_level: null,
    all_categories: allCategories.length > 0 ? allCategories : category ? [category] : [],
    opening_hours: null,
    temporarily_closed: false,
    permanently_closed: false,
    description,
    about: null,
    menu_url: null,
    reservation_url: null,
    order_url: null,
    owner_title: null,
    plus_code: null,
    street_view_available: false,
    photo_urls: photoUrls,
    reviews: [],
  };
}

// ---------------------------------------------------------------------------
// Consent handling
// ---------------------------------------------------------------------------

/**
 * Handle Google's cookie consent page that appears on first visit in the EU.
 * Clicks "Accept all" / "Zaakceptuj wszystko" if the consent page is shown.
 */
async function handleConsentPage(page: Page): Promise<void> {
  const currentUrl = page.url();
  if (!currentUrl.includes("consent.google")) return;

  console.log("[consent] Consent page detected, accepting cookies...");

  // Try multiple button selectors (different languages)
  const selectors = [
    'button:has-text("Accept all")',
    'button:has-text("Zaakceptuj wszystko")',
    'button:has-text("Akzeptieren")',
    'button:has-text("Accepter tout")',
    'button:has-text("Aceptar todo")',
    // Form-based consent (some versions use a form)
    'form[action*="consent"] button',
  ];

  for (const selector of selectors) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 2000 })) {
        await btn.click();
        await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT }).catch(() => {});
        console.log("[consent] Accepted cookies, URL now:", page.url());
        return;
      }
    } catch {
      // Try next selector
    }
  }

  console.warn("[consent] Could not find consent button, trying to continue...");
}

// ---------------------------------------------------------------------------
// Core scraping functions
// ---------------------------------------------------------------------------

/**
 * Navigate to Google Maps, search for the city name, and extract the viewport
 * bounding box from the resulting URL.
 *
 * Google Maps URLs contain viewport info in formats like:
 *   @lat,lng,zoom
 *   /search/.../@lat,lng,zoom
 *
 * We derive a bounding box from the center point and zoom level.
 */
export async function geocodeCity(
  page: Page,
  city: string
): Promise<BoundingBox> {
  const encodedCity = encodeURIComponent(city);
  await page.goto(
    `https://www.google.com/maps/search/${encodedCity}`,
    { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT }
  );

  // Handle Google consent page (appears on first visit in EU)
  await handleConsentPage(page);

  // Wait a moment for URL to settle after redirects
  await page.waitForTimeout(2000);

  const url = page.url();
  console.log(`[geocode] URL after navigation: ${url}`);

  // Try to extract @lat,lng,zoom from URL
  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+),(\d+\.?\d*)z/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    const zoom = parseFloat(atMatch[3]);
    return boundsFromCenter(lat, lng, zoom);
  }

  // Fallback: try viewport parameters in URL
  const viewportMatch = url.match(
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/
  );
  if (viewportMatch) {
    const lat = parseFloat(viewportMatch[1]);
    const lng = parseFloat(viewportMatch[2]);
    // Default to zoom ~13 for city-level view
    return boundsFromCenter(lat, lng, 13);
  }

  // Last resort: try to extract from the page's JavaScript state
  const coords = await page.evaluate(() => {
    const meta = document.querySelector('meta[content*="POINT"]');
    if (meta) {
      const match = meta
        .getAttribute("content")
        ?.match(/(-?\d+\.\d+)\s+(-?\d+\.\d+)/);
      if (match) {
        return { lat: parseFloat(match[2]), lng: parseFloat(match[1]) };
      }
    }
    return null;
  });

  if (coords) {
    return boundsFromCenter(coords.lat, coords.lng, 13);
  }

  throw new Error(`Could not geocode city: ${city}`);
}

/**
 * Derive a bounding box from a center point and zoom level.
 * Approximation: at zoom Z, the visible area is roughly 360/2^Z degrees wide.
 */
function boundsFromCenter(
  lat: number,
  lng: number,
  zoom: number
): BoundingBox {
  // At zoom 13, roughly ±0.05 degrees is visible (~10km)
  const degreesPerTile = 360 / Math.pow(2, zoom);
  const latSpan = degreesPerTile * 1.5; // Account for vertical tiles
  const lngSpan = degreesPerTile * 2; // Account for horizontal tiles

  return {
    north: lat + latSpan / 2,
    south: lat - latSpan / 2,
    east: lng + lngSpan / 2,
    west: lng - lngSpan / 2,
  };
}

/**
 * Search Google Maps for a query positioned at a specific grid cell.
 * Intercepts network responses to capture the raw place list data.
 */
export async function searchCell(
  page: Page,
  bounds: BoundingBox,
  query: string
): Promise<RawSearchResult[]> {
  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLng = (bounds.east + bounds.west) / 2;
  const encodedQuery = encodeURIComponent(query);

  // Build a URL that positions the map at the cell center
  const url =
    `https://www.google.com/maps/search/${encodedQuery}` +
    `/@${centerLat},${centerLng},15z`;

  // Collect intercepted response bodies
  const interceptedBodies: string[] = [];

  const responseHandler = async (response: {
    url: () => string;
    text: () => Promise<string>;
  }) => {
    const rUrl = response.url();
    if (rUrl.includes("/search") && !rUrl.includes(".js") && !rUrl.includes(".css")) {
      try {
        const body = await response.text();
        if (body.includes("ChIJ")) {
          interceptedBodies.push(body);
        }
      } catch {
        // Response may have been disposed
      }
    }
  };

  page.on("response", responseHandler);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });

    // Wait for search results to appear or a timeout
    await Promise.race([
      page.waitForSelector('[role="feed"]', { timeout: INTERCEPT_TIMEOUT }).catch(() => null),
      page.waitForSelector(".Nv2PK", { timeout: INTERCEPT_TIMEOUT }).catch(() => null),
      new Promise((resolve) => setTimeout(resolve, INTERCEPT_TIMEOUT)),
    ]);

    // Scroll to load more results
    await scrollSearchResults(page);

    // Give a moment for remaining network responses
    await page.waitForTimeout(1500);
  } finally {
    page.off("response", responseHandler);
  }

  // Parse all intercepted bodies for search results
  const allResults: RawSearchResult[] = [];
  const seenIds = new Set<string>();

  for (const body of interceptedBodies) {
    const parsed = parseGmapsJson(body);
    if (!parsed) continue;
    const entries = extractSearchEntries(parsed);
    for (const entry of entries) {
      if (!seenIds.has(entry.place_id)) {
        seenIds.add(entry.place_id);
        allResults.push(entry);
      }
    }
  }

  // If network intercept found nothing, try DOM fallback for search results
  if (allResults.length === 0) {
    const domResults = await extractSearchFromDom(page);
    for (const entry of domResults) {
      if (!seenIds.has(entry.place_id)) {
        seenIds.add(entry.place_id);
        allResults.push(entry);
      }
    }
  }

  return parseSearchResults(allResults);
}

/**
 * Scroll the search results panel to trigger loading of additional results.
 */
async function scrollSearchResults(page: Page): Promise<void> {
  for (let i = 0; i < MAX_SCROLL_ITERATIONS; i++) {
    const scrolled = await page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]');
      if (!feed) return false;
      const prev = feed.scrollTop;
      feed.scrollTop += 800;
      return feed.scrollTop !== prev;
    });

    if (!scrolled) break;

    // Wait for potential new results to load
    await page.waitForTimeout(800);
  }
}

/**
 * DOM fallback: scrape search results directly from the page HTML.
 */
async function extractSearchFromDom(page: Page): Promise<RawSearchResult[]> {
  return page.evaluate(() => {
    const results: Array<{
      place_id: string;
      name: string;
      latitude: number;
      longitude: number;
      address: string;
      category: string;
      rating: number | null;
      reviews_count: number;
      website: string | null;
    }> = [];

    // Each result card in Google Maps search
    const cards = document.querySelectorAll(".Nv2PK, [data-result-index]");
    cards.forEach((card) => {
      const linkEl = card.querySelector("a[href*='/maps/place/']");
      if (!linkEl) return;

      const href = linkEl.getAttribute("href") || "";
      // Extract place ID from data attributes or URL
      const placeIdMatch = href.match(/place_id[=:]([^&/]+)/) ||
        href.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/);
      const ftidMatch = href.match(/ftid=(0x[0-9a-f]+:0x[0-9a-f]+)/);
      const chijMatch = href.match(/(ChIJ[A-Za-z0-9_-]+)/);

      const placeId =
        chijMatch?.[1] ||
        placeIdMatch?.[1] ||
        ftidMatch?.[1] ||
        `dom_${results.length}`;

      const nameEl = card.querySelector(".qBF1Pd, .fontHeadlineSmall");
      const name = nameEl?.textContent?.trim() || "Unknown";

      const ratingEl = card.querySelector(".MW4etd, [role='img']");
      const ratingText = ratingEl?.textContent?.trim() || ratingEl?.getAttribute("aria-label") || "";
      const ratingMatch = ratingText.match(/([\d.]+)/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

      const reviewCountEl = card.querySelector(".UY7F9");
      const reviewText = reviewCountEl?.textContent?.replace(/[().,]/g, "").trim() || "0";
      const reviewsCount = parseInt(reviewText, 10) || 0;

      const categoryEl = card.querySelector(".W4Efsd:nth-child(1) .W4Efsd span:first-child");
      const category = categoryEl?.textContent?.trim() || "";

      const addressEl = card.querySelector(".W4Efsd:nth-child(2)");
      const address = addressEl?.textContent?.trim() || "";

      results.push({
        place_id: placeId,
        name,
        latitude: 0,
        longitude: 0,
        address,
        category,
        rating: rating && rating >= 1 && rating <= 5 ? rating : null,
        reviews_count: reviewsCount,
        website: null,
      });
    });

    return results;
  });
}

/**
 * Navigate to a specific place detail page and extract business details.
 * First tries network intercept, then falls back to DOM scraping.
 */
export async function scrapeDetail(
  page: Page,
  placeId: string
): Promise<RawBusinessDetail | null> {
  const url = `https://www.google.com/maps/place/?q=place_id:${placeId}`;

  const interceptedBodies: string[] = [];

  const responseHandler = async (response: {
    url: () => string;
    text: () => Promise<string>;
  }) => {
    const rUrl = response.url();
    if (
      (rUrl.includes("/place") || rUrl.includes("getdetails")) &&
      !rUrl.includes(".js") &&
      !rUrl.includes(".css")
    ) {
      try {
        const body = await response.text();
        if (body.includes(placeId) || body.includes("ChIJ")) {
          interceptedBodies.push(body);
        }
      } catch {
        // Response may have been disposed
      }
    }
  };

  page.on("response", responseHandler);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });

    // Wait for detail content to appear
    await Promise.race([
      page.waitForSelector("h1", { timeout: INTERCEPT_TIMEOUT }).catch(() => null),
      page.waitForSelector('[data-item-id]', { timeout: INTERCEPT_TIMEOUT }).catch(() => null),
      new Promise((resolve) => setTimeout(resolve, INTERCEPT_TIMEOUT)),
    ]);

    // Brief wait for remaining responses
    await page.waitForTimeout(2000);
  } finally {
    page.off("response", responseHandler);
  }

  // Try API response parsing first
  for (const body of interceptedBodies) {
    const parsed = parseGmapsJson(body);
    if (!parsed) continue;
    const detail = extractDetailFromResponse(parsed);
    if (detail && detail.name) {
      return detail;
    }
  }

  // Fall back to DOM scraping
  console.log(`[detail] Falling back to DOM scraping for ${placeId}`);
  return scrapeDetailFromDom(page, placeId);
}

/**
 * DOM fallback for detail scraping — extracts info directly from the rendered page.
 */
async function scrapeDetailFromDom(
  page: Page,
  placeId: string
): Promise<RawBusinessDetail | null> {
  return page.evaluate(
    (pid: string) => {
      const h1 = document.querySelector("h1");
      const name = h1?.textContent?.trim();
      if (!name) return null;

      // Address
      const addressEl = document.querySelector(
        '[data-item-id="address"] .fontBodyMedium, [data-item-id*="address"]'
      );
      const address = addressEl?.textContent?.trim() || "";

      // Phone
      const phoneEl = document.querySelector(
        '[data-item-id*="phone"] .fontBodyMedium, [data-item-id*="phone"]'
      );
      const phone = phoneEl?.textContent?.trim() || null;

      // Website
      const websiteEl = document.querySelector(
        '[data-item-id="authority"] a, a[data-item-id*="authority"]'
      );
      const website = websiteEl?.getAttribute("href") || null;

      // Rating
      const ratingEl = document.querySelector('[role="img"][aria-label*="star"]');
      const ratingLabel = ratingEl?.getAttribute("aria-label") || "";
      const ratingMatch = ratingLabel.match(/([\d.]+)/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

      // Review count
      const reviewEl = document.querySelector('button[jsaction*="review"]');
      const reviewText = reviewEl?.textContent?.replace(/[^0-9]/g, "") || "0";
      const reviewsCount = parseInt(reviewText, 10) || 0;

      // Category
      const categoryEl = document.querySelector(
        'button[jsaction*="category"]'
      );
      const category = categoryEl?.textContent?.trim() || "";

      // Photos
      const photoEls = document.querySelectorAll(
        'img[src*="googleusercontent"]'
      );
      const photoUrls: string[] = [];
      photoEls.forEach((img) => {
        const src = img.getAttribute("src");
        if (src && photoUrls.length < 10) photoUrls.push(src);
      });

      // Description
      const descEl = document.querySelector(
        '[data-item-id="description"], .PYvSYb'
      );
      const description = descEl?.textContent?.trim() || null;

      return {
        place_id: pid,
        name,
        latitude: 0,
        longitude: 0,
        address: address || name,
        formatted_address: address || name,
        category,
        rating: rating && rating >= 1 && rating <= 5 ? rating : null,
        reviews_count: reviewsCount,
        website,
        phone,
        international_phone: null as string | null,
        price_level: null as number | null,
        all_categories: category ? [category] : ([] as string[]),
        opening_hours: null as Array<{ day: string; hours: string }> | null,
        temporarily_closed: false,
        permanently_closed: false,
        description,
        about: null as Record<string, string[]> | null,
        menu_url: null as string | null,
        reservation_url: null as string | null,
        order_url: null as string | null,
        owner_title: null as string | null,
        plus_code: null as string | null,
        street_view_available: false,
        photo_urls: photoUrls,
        reviews: [] as Array<{
          author: string;
          author_url: string | null;
          author_photo_url: string | null;
          rating: number;
          text: string;
          date: string;
          language: string | null;
          likes_count: number;
          owner_reply: { text: string; date: string } | null;
        }>,
      };
    },
    placeId
  );
}

// ---------------------------------------------------------------------------
// Resource blocking
// ---------------------------------------------------------------------------

/**
 * Block unnecessary resources (images, fonts, CSS) in the browser
 * to reduce bandwidth and speed up scraping.
 */
async function blockUnnecessaryResources(page: Page): Promise<void> {
  await page.route("**/*", (route: Route) => {
    const resourceType = route.request().resourceType();
    if (["image", "font", "stylesheet", "media"].includes(resourceType)) {
      return route.abort();
    }
    return route.continue();
  });
}

// ---------------------------------------------------------------------------
// Main orchestration
// ---------------------------------------------------------------------------

/**
 * Main scraping orchestration function.
 *
 * 1. Launch Playwright Chromium (headless)
 * 2. Block unnecessary resources
 * 3. Geocode city → generate grid
 * 4. For each cell: search, deduplicate, website filter, detail scrape,
 *    download photos, insert to DB
 * 5. Adaptive subdivision if cell hits 20+ results
 * 6. Progress callbacks after each cell
 * 7. Random delays between requests
 */
export async function scrapeCity(
  jobId: string,
  city: string,
  searchQuery: string,
  callbacks: ScrapeCallbacks
): Promise<void> {
  let browser: Browser | null = null;

  try {
    console.log(`[scrapeCity] Starting job ${jobId}: "${searchQuery}" in ${city}`);

    // Launch browser
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      locale: "en-US",
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/120.0.0.0 Safari/537.36",
    });

    // Pre-set consent cookie to skip EU consent page
    await context.addCookies([
      {
        name: "SOCS",
        value: "CAESHAgCEhJnd3NfMjAyNDA1MTUtMF9SQzIaAmVuIAEaBgiA_LmzBg",
        domain: ".google.com",
        path: "/",
      },
    ]);

    const page = await context.newPage();

    // Block unnecessary resources to save bandwidth
    await blockUnnecessaryResources(page);

    // Accept cookies dialog if it appears (Google consent)
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    // 1. Geocode city
    console.log(`[scrapeCity] Geocoding: ${city}`);
    const bounds = await geocodeCity(page, city);
    console.log(`[scrapeCity] Bounds:`, bounds);

    // 2. Generate grid
    const grid = generateGrid(bounds, GRID_STEP_DEG);
    console.log(`[scrapeCity] Grid cells: ${grid.length}`);

    // Track progress
    let cellsCompleted = 0;
    let businessesFound = 0;
    let businessesSkipped = 0;
    const totalCells = grid.length;
    const seenPlaceIds = new Set<string>();

    // Update job with grid info
    updateJobProgress(jobId, {
      status: "running",
      grid_cells_total: totalCells,
    });

    callbacks.onProgress({
      grid_cells_total: totalCells,
      grid_cells_completed: 0,
      businesses_found: 0,
      businesses_skipped: 0,
    });

    // 3. Process each cell
    const processCell = async (cell: GridCell, depth: number): Promise<void> => {
      console.log(
        `[scrapeCity] Processing cell ${cell.index} (depth ${depth}): ` +
          `[${cell.bounds.south.toFixed(4)}, ${cell.bounds.west.toFixed(4)}] → ` +
          `[${cell.bounds.north.toFixed(4)}, ${cell.bounds.east.toFixed(4)}]`
      );

      // Search for businesses in this cell
      const searchResults = await searchCell(page, cell.bounds, searchQuery);
      console.log(
        `[scrapeCity] Cell ${cell.index}: found ${searchResults.length} results`
      );

      // Adaptive subdivision if dense area
      if (
        searchResults.length >= SUBDIVISION_THRESHOLD &&
        depth < MAX_SUBDIVISION_DEPTH
      ) {
        console.log(
          `[scrapeCity] Cell ${cell.index}: ${searchResults.length} results, subdividing (depth ${depth + 1})`
        );
        const subCells = subdivideCell(cell);
        for (const subCell of subCells) {
          await randomDelay();
          await processCell(subCell, depth + 1);
        }
        return;
      }

      // Process each result
      for (const result of searchResults) {
        // Deduplicate
        if (seenPlaceIds.has(result.place_id)) {
          continue;
        }
        seenPlaceIds.add(result.place_id);

        // Check if already in DB
        if (businessExists(result.place_id)) {
          // Link existing business to this job
          const db = getDb();
          const existingRow = db
            .prepare("SELECT id FROM businesses WHERE google_place_id = ?")
            .get(result.place_id) as { id: string } | undefined;
          if (existingRow) {
            linkJobBusiness(jobId, existingRow.id);
          }
          businessesSkipped++;
          continue;
        }

        // Website filter — skip businesses WITH custom websites (we want those WITHOUT)
        if (hasCustomWebsite(result.website)) {
          businessesSkipped++;
          continue;
        }

        // Scrape detail
        await randomDelay();
        let detail: RawBusinessDetail | null = null;
        try {
          detail = await scrapeDetail(page, result.place_id);
        } catch (err) {
          console.error(
            `[scrapeCity] Error scraping detail for ${result.place_id}:`,
            err
          );
        }

        if (!detail) {
          // Create a minimal detail from search result
          detail = {
            ...result,
            formatted_address: result.address,
            phone: null,
            international_phone: null,
            price_level: null,
            all_categories: result.category ? [result.category] : [],
            opening_hours: null,
            temporarily_closed: false,
            permanently_closed: false,
            description: null,
            about: null,
            menu_url: null,
            reservation_url: null,
            order_url: null,
            owner_title: null,
            plus_code: null,
            street_view_available: false,
            photo_urls: [],
            reviews: [],
          };
        }

        // Parse & normalize the detail
        const parsedDetail = parseBusinessDetail(detail);

        // Download photos
        let photoRecords: { filePath: string; sourceUrl: string }[] = [];
        if (parsedDetail.photo_urls.length > 0) {
          try {
            photoRecords = await downloadPhotos(
              parsedDetail.place_id,
              parsedDetail.photo_urls
            );
          } catch (err) {
            console.error(
              `[scrapeCity] Error downloading photos for ${parsedDetail.place_id}:`,
              err
            );
          }
        }

        // Insert into DB
        try {
          const business = insertBusiness({
            google_place_id: parsedDetail.place_id,
            name: parsedDetail.name,
            address: parsedDetail.address,
            formatted_address: parsedDetail.formatted_address,
            latitude: parsedDetail.latitude,
            longitude: parsedDetail.longitude,
            phone: parsedDetail.phone,
            international_phone: parsedDetail.international_phone,
            website_url: parsedDetail.website,
            rating: parsedDetail.rating,
            reviews_count: parsedDetail.reviews_count,
            price_level: parsedDetail.price_level,
            category: parsedDetail.category,
            all_categories: parsedDetail.all_categories,
            opening_hours: parsedDetail.opening_hours,
            temporarily_closed: parsedDetail.temporarily_closed,
            permanently_closed: parsedDetail.permanently_closed,
            description: parsedDetail.description,
            about: parsedDetail.about,
            menu_url: parsedDetail.menu_url,
            reservation_url: parsedDetail.reservation_url,
            order_url: parsedDetail.order_url,
            owner_title: parsedDetail.owner_title,
            plus_code: parsedDetail.plus_code,
            street_view_available: parsedDetail.street_view_available,
            scraped_at: new Date().toISOString(),
          });

          // Link business to job
          linkJobBusiness(jobId, business.id);

          // Insert photos
          if (photoRecords.length > 0) {
            const db = getDb();
            const insertPhoto = db.prepare(
              `INSERT INTO business_photos (id, business_id, file_path, source_url, is_primary, order_index)
               VALUES (?, ?, ?, ?, ?, ?)`
            );
            for (let i = 0; i < photoRecords.length; i++) {
              insertPhoto.run(
                uuidv4(),
                business.id,
                photoRecords[i].filePath,
                photoRecords[i].sourceUrl,
                i === 0 ? 1 : 0,
                i
              );
            }
          }

          // Insert reviews
          if (parsedDetail.reviews.length > 0) {
            const db = getDb();
            const insertReview = db.prepare(
              `INSERT INTO business_reviews
                (id, business_id, author, author_url, author_photo_url, rating, text, date, language, likes_count, owner_reply)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );
            for (const review of parsedDetail.reviews) {
              insertReview.run(
                uuidv4(),
                business.id,
                review.author,
                review.author_url,
                review.author_photo_url,
                review.rating,
                review.text,
                review.date,
                review.language,
                review.likes_count,
                review.owner_reply ? JSON.stringify(review.owner_reply) : null
              );
            }
          }

          businessesFound++;
          console.log(
            `[scrapeCity] Inserted: ${business.name} (${business.google_place_id})`
          );
        } catch (err) {
          console.error(
            `[scrapeCity] Error inserting business ${parsedDetail.place_id}:`,
            err
          );
          businessesSkipped++;
        }
      }

      // Update progress
      cellsCompleted++;
      updateJobProgress(jobId, {
        grid_cells_completed: cellsCompleted,
        businesses_found: businessesFound,
        businesses_skipped: businessesSkipped,
      });

      callbacks.onProgress({
        grid_cells_total: totalCells,
        grid_cells_completed: cellsCompleted,
        businesses_found: businessesFound,
        businesses_skipped: businessesSkipped,
      });
    };

    // Process all grid cells
    for (const cell of grid) {
      await processCell(cell, 0);
      await randomDelay();
    }

    // Mark job as completed
    updateJobProgress(jobId, {
      status: "completed",
      grid_cells_completed: cellsCompleted,
      businesses_found: businessesFound,
      businesses_skipped: businessesSkipped,
    });

    console.log(
      `[scrapeCity] Job ${jobId} completed: ${businessesFound} found, ${businessesSkipped} skipped`
    );
  } catch (err) {
    console.error(`[scrapeCity] Job ${jobId} failed:`, err);
    updateJobProgress(jobId, {
      status: "failed",
      error_message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
