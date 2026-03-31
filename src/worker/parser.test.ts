import { describe, it, expect } from "vitest";
import {
  parseSearchResults,
  parseBusinessDetail,
} from "@/worker/parser";
import type {
  RawSearchResult,
  RawBusinessDetail,
  RawReview,
} from "@/worker/parser";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseSearchResult: RawSearchResult = {
  place_id: "ChIJ_abc123",
  name: "Test Cafe",
  latitude: 52.2297,
  longitude: 21.0122,
  address: "ul. Marszałkowska 1, Warszawa",
  category: "cafe",
  rating: 4.5,
  reviews_count: 120,
  website: "https://testcafe.pl",
};

const baseReview: RawReview = {
  author: "Jan Kowalski",
  author_url: "https://maps.google.com/contrib/123",
  author_photo_url: "https://lh3.googleusercontent.com/photo.jpg",
  rating: 5,
  text: "Świetna kawa!",
  date: "2024-01-15",
  language: "pl",
  likes_count: 3,
  owner_reply: { text: "Dziękujemy!", date: "2024-01-16" },
};

const baseDetail: RawBusinessDetail = {
  place_id: "ChIJ_abc123",
  name: "Test Cafe",
  latitude: 52.2297,
  longitude: 21.0122,
  address: "ul. Marszałkowska 1, Warszawa",
  category: "cafe",
  rating: 4.5,
  reviews_count: 120,
  website: "https://testcafe.pl",
  phone: "+48 22 123 4567",
  international_phone: "+48221234567",
  formatted_address: "ul. Marszałkowska 1, 00-001 Warszawa, Poland",
  price_level: 2,
  all_categories: ["cafe", "coffee_shop"],
  opening_hours: [
    { day: "Monday", hours: "08:00–20:00" },
    { day: "Tuesday", hours: "08:00–20:00" },
  ],
  temporarily_closed: false,
  permanently_closed: false,
  description: "A great place for coffee.",
  about: { Highlights: ["Wi-Fi", "Outdoor seating"] },
  menu_url: "https://testcafe.pl/menu",
  reservation_url: null,
  order_url: null,
  owner_title: "Owner",
  plus_code: "3G9X+QQ Warsaw",
  street_view_available: true,
  photo_urls: [
    "https://maps.google.com/photo1.jpg",
    "https://maps.google.com/photo2.jpg",
  ],
  reviews: [baseReview],
};

// ---------------------------------------------------------------------------
// parseSearchResults
// ---------------------------------------------------------------------------

describe("parseSearchResults", () => {
  it("returns one result per input item", () => {
    const results = parseSearchResults([baseSearchResult]);
    expect(results).toHaveLength(1);
  });

  it("extracts all fields correctly", () => {
    const [result] = parseSearchResults([baseSearchResult]);
    expect(result.place_id).toBe("ChIJ_abc123");
    expect(result.name).toBe("Test Cafe");
    expect(result.latitude).toBe(52.2297);
    expect(result.longitude).toBe(21.0122);
    expect(result.address).toBe("ul. Marszałkowska 1, Warszawa");
    expect(result.category).toBe("cafe");
    expect(result.rating).toBe(4.5);
    expect(result.reviews_count).toBe(120);
    expect(result.website).toBe("https://testcafe.pl");
  });

  it("preserves null website as null", () => {
    const raw: RawSearchResult = { ...baseSearchResult, website: null };
    const [result] = parseSearchResults([raw]);
    expect(result.website).toBeNull();
  });

  it("preserves null rating as null", () => {
    const raw: RawSearchResult = { ...baseSearchResult, rating: null };
    const [result] = parseSearchResults([raw]);
    expect(result.rating).toBeNull();
  });

  it("handles an empty array", () => {
    expect(parseSearchResults([])).toEqual([]);
  });

  it("handles multiple results independently", () => {
    const second: RawSearchResult = {
      ...baseSearchResult,
      place_id: "ChIJ_xyz999",
      name: "Another Place",
      website: null,
    };
    const results = parseSearchResults([baseSearchResult, second]);
    expect(results).toHaveLength(2);
    expect(results[0].place_id).toBe("ChIJ_abc123");
    expect(results[1].place_id).toBe("ChIJ_xyz999");
    expect(results[1].website).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseBusinessDetail
// ---------------------------------------------------------------------------

describe("parseBusinessDetail", () => {
  it("extracts all base search fields", () => {
    const result = parseBusinessDetail(baseDetail);
    expect(result.place_id).toBe("ChIJ_abc123");
    expect(result.name).toBe("Test Cafe");
    expect(result.latitude).toBe(52.2297);
    expect(result.longitude).toBe(21.0122);
    expect(result.address).toBe("ul. Marszałkowska 1, Warszawa");
    expect(result.category).toBe("cafe");
    expect(result.rating).toBe(4.5);
    expect(result.reviews_count).toBe(120);
    expect(result.website).toBe("https://testcafe.pl");
  });

  it("extracts extended detail fields", () => {
    const result = parseBusinessDetail(baseDetail);
    expect(result.phone).toBe("+48 22 123 4567");
    expect(result.international_phone).toBe("+48221234567");
    expect(result.formatted_address).toBe(
      "ul. Marszałkowska 1, 00-001 Warszawa, Poland"
    );
    expect(result.price_level).toBe(2);
    expect(result.all_categories).toEqual(["cafe", "coffee_shop"]);
    expect(result.opening_hours).toEqual([
      { day: "Monday", hours: "08:00–20:00" },
      { day: "Tuesday", hours: "08:00–20:00" },
    ]);
    expect(result.temporarily_closed).toBe(false);
    expect(result.permanently_closed).toBe(false);
    expect(result.description).toBe("A great place for coffee.");
    expect(result.about).toEqual({ Highlights: ["Wi-Fi", "Outdoor seating"] });
    expect(result.menu_url).toBe("https://testcafe.pl/menu");
    expect(result.reservation_url).toBeNull();
    expect(result.order_url).toBeNull();
    expect(result.owner_title).toBe("Owner");
    expect(result.plus_code).toBe("3G9X+QQ Warsaw");
    expect(result.street_view_available).toBe(true);
  });

  it("extracts photo_urls", () => {
    const result = parseBusinessDetail(baseDetail);
    expect(result.photo_urls).toEqual([
      "https://maps.google.com/photo1.jpg",
      "https://maps.google.com/photo2.jpg",
    ]);
  });

  it("extracts reviews with all fields including owner_reply", () => {
    const result = parseBusinessDetail(baseDetail);
    expect(result.reviews).toHaveLength(1);
    const review = result.reviews[0];
    expect(review.author).toBe("Jan Kowalski");
    expect(review.author_url).toBe(
      "https://maps.google.com/contrib/123"
    );
    expect(review.author_photo_url).toBe(
      "https://lh3.googleusercontent.com/photo.jpg"
    );
    expect(review.rating).toBe(5);
    expect(review.text).toBe("Świetna kawa!");
    expect(review.date).toBe("2024-01-15");
    expect(review.language).toBe("pl");
    expect(review.likes_count).toBe(3);
    expect(review.owner_reply).toEqual({
      text: "Dziękujemy!",
      date: "2024-01-16",
    });
  });

  it("defaults photo_urls to empty array when missing", () => {
    const raw: RawBusinessDetail = { ...baseDetail, photo_urls: undefined as unknown as string[] };
    const result = parseBusinessDetail(raw);
    expect(result.photo_urls).toEqual([]);
  });

  it("defaults reviews to empty array when missing", () => {
    const raw: RawBusinessDetail = { ...baseDetail, reviews: undefined as unknown as RawReview[] };
    const result = parseBusinessDetail(raw);
    expect(result.reviews).toEqual([]);
  });

  it("defaults temporarily_closed to false when missing", () => {
    const raw: RawBusinessDetail = {
      ...baseDetail,
      temporarily_closed: undefined as unknown as boolean,
    };
    const result = parseBusinessDetail(raw);
    expect(result.temporarily_closed).toBe(false);
  });

  it("defaults permanently_closed to false when missing", () => {
    const raw: RawBusinessDetail = {
      ...baseDetail,
      permanently_closed: undefined as unknown as boolean,
    };
    const result = parseBusinessDetail(raw);
    expect(result.permanently_closed).toBe(false);
  });

  it("defaults street_view_available to false when missing", () => {
    const raw: RawBusinessDetail = {
      ...baseDetail,
      street_view_available: undefined as unknown as boolean,
    };
    const result = parseBusinessDetail(raw);
    expect(result.street_view_available).toBe(false);
  });

  it("defaults all_categories to empty array when missing", () => {
    const raw: RawBusinessDetail = {
      ...baseDetail,
      all_categories: undefined as unknown as string[],
    };
    const result = parseBusinessDetail(raw);
    expect(result.all_categories).toEqual([]);
  });

  it("preserves null nullable fields as null", () => {
    const raw: RawBusinessDetail = {
      ...baseDetail,
      phone: null,
      international_phone: null,
      website: null,
      rating: null,
      price_level: null,
      opening_hours: null,
      description: null,
      about: null,
      menu_url: null,
      reservation_url: null,
      order_url: null,
      owner_title: null,
      plus_code: null,
    };
    const result = parseBusinessDetail(raw);
    expect(result.phone).toBeNull();
    expect(result.international_phone).toBeNull();
    expect(result.website).toBeNull();
    expect(result.rating).toBeNull();
    expect(result.price_level).toBeNull();
    expect(result.opening_hours).toBeNull();
    expect(result.description).toBeNull();
    expect(result.about).toBeNull();
    expect(result.menu_url).toBeNull();
    expect(result.reservation_url).toBeNull();
    expect(result.order_url).toBeNull();
    expect(result.owner_title).toBeNull();
    expect(result.plus_code).toBeNull();
  });

  it("handles review with null nullable fields", () => {
    const reviewWithNulls: RawReview = {
      ...baseReview,
      author_url: null,
      author_photo_url: null,
      language: null,
      owner_reply: null,
    };
    const raw: RawBusinessDetail = {
      ...baseDetail,
      reviews: [reviewWithNulls],
    };
    const result = parseBusinessDetail(raw);
    const review = result.reviews[0];
    expect(review.author_url).toBeNull();
    expect(review.author_photo_url).toBeNull();
    expect(review.language).toBeNull();
    expect(review.owner_reply).toBeNull();
  });
});
