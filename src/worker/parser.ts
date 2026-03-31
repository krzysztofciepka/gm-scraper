import type { DayHours } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawSearchResult {
  place_id: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  category: string;
  rating: number | null;
  reviews_count: number;
  website: string | null;
}

export type ParsedSearchResult = RawSearchResult;

export interface RawReview {
  author: string;
  author_url: string | null;
  author_photo_url: string | null;
  rating: number;
  text: string;
  date: string;
  language: string | null;
  likes_count: number;
  owner_reply: { text: string; date: string } | null;
}

export interface RawBusinessDetail extends RawSearchResult {
  phone: string | null;
  international_phone: string | null;
  formatted_address: string;
  price_level: number | null;
  all_categories: string[];
  opening_hours: DayHours[] | null;
  temporarily_closed: boolean;
  permanently_closed: boolean;
  description: string | null;
  about: Record<string, string[]> | null;
  menu_url: string | null;
  reservation_url: string | null;
  order_url: string | null;
  owner_title: string | null;
  plus_code: string | null;
  street_view_available: boolean;
  photo_urls: string[];
  reviews: RawReview[];
}

export interface ParsedBusinessDetail extends RawBusinessDetail {
  // Same structure as Raw with defaults applied; re-declared for clarity.
  photo_urls: string[];
  reviews: RawReview[];
  all_categories: string[];
  temporarily_closed: boolean;
  permanently_closed: boolean;
  street_view_available: boolean;
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Normalises an array of raw search results.
 * Passes fields through as-is; website and rating remain null when absent.
 */
export function parseSearchResults(raw: RawSearchResult[]): ParsedSearchResult[] {
  return raw.map((item) => ({
    place_id: item.place_id,
    name: item.name,
    latitude: item.latitude,
    longitude: item.longitude,
    address: item.address,
    category: item.category,
    rating: item.rating ?? null,
    reviews_count: item.reviews_count,
    website: item.website ?? null,
  }));
}

/**
 * Normalises a raw business detail record, applying safe defaults for fields
 * that may be absent in partial API responses:
 *  - photo_urls  → []
 *  - reviews     → []
 *  - all_categories → []
 *  - temporarily_closed  → false
 *  - permanently_closed  → false
 *  - street_view_available → false
 */
export function parseBusinessDetail(raw: RawBusinessDetail): ParsedBusinessDetail {
  return {
    // Base search fields
    place_id: raw.place_id,
    name: raw.name,
    latitude: raw.latitude,
    longitude: raw.longitude,
    address: raw.address,
    category: raw.category,
    rating: raw.rating ?? null,
    reviews_count: raw.reviews_count,
    website: raw.website ?? null,

    // Extended detail fields
    phone: raw.phone ?? null,
    international_phone: raw.international_phone ?? null,
    formatted_address: raw.formatted_address,
    price_level: raw.price_level ?? null,
    all_categories: raw.all_categories ?? [],
    opening_hours: raw.opening_hours ?? null,
    temporarily_closed: raw.temporarily_closed ?? false,
    permanently_closed: raw.permanently_closed ?? false,
    description: raw.description ?? null,
    about: raw.about ?? null,
    menu_url: raw.menu_url ?? null,
    reservation_url: raw.reservation_url ?? null,
    order_url: raw.order_url ?? null,
    owner_title: raw.owner_title ?? null,
    plus_code: raw.plus_code ?? null,
    street_view_available: raw.street_view_available ?? false,

    // Media & reviews with default empty arrays
    photo_urls: raw.photo_urls ?? [],
    reviews: raw.reviews ?? [],
  };
}
