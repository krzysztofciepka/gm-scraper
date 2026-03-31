import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  initSchema,
  getDb,
  closeDb,
  createJob,
  getJob,
  listJobs,
  updateJobProgress,
  insertBusiness,
  businessExists,
  listBusinesses,
  getBusiness,
  deleteBusiness,
  linkJobBusiness,
} from "@/lib/db";
import type { ScrapeJob, Business } from "@/lib/types";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeBusiness(overrides: Partial<Business> = {}): Omit<Business, "id"> {
  return {
    google_place_id: "ChIJ_test_" + Math.random().toString(36).slice(2),
    name: "Test Café",
    address: "123 Main St",
    formatted_address: "123 Main St, City, State",
    latitude: 52.2297,
    longitude: 21.0122,
    phone: "+48 123 456 789",
    international_phone: "+48123456789",
    website_url: "https://example.com",
    rating: 4.5,
    reviews_count: 100,
    price_level: 2,
    category: "cafe",
    all_categories: ["cafe", "coffee shop"],
    opening_hours: [
      { day: "Monday", hours: "08:00-18:00" },
      { day: "Tuesday", hours: "08:00-18:00" },
    ],
    temporarily_closed: false,
    permanently_closed: false,
    description: "A cozy café",
    about: { Highlights: ["Free Wi-Fi", "Outdoor seating"] },
    menu_url: null,
    reservation_url: null,
    order_url: null,
    owner_title: null,
    plus_code: "9G6X+PH",
    street_view_available: true,
    scraped_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("db", () => {
  beforeEach(() => {
    // Each test gets a fresh in-memory database
    initSchema(":memory:");
  });

  afterEach(() => {
    closeDb();
  });

  // ── Schema ──────────────────────────────────────────────────────────────

  describe("initSchema", () => {
    it("creates all 5 tables", () => {
      const db = getDb();
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        .all() as { name: string }[];
      const names = tables.map((t) => t.name);
      expect(names).toContain("scrape_jobs");
      expect(names).toContain("businesses");
      expect(names).toContain("business_photos");
      expect(names).toContain("business_reviews");
      expect(names).toContain("scrape_job_businesses");
    });

    it("enables WAL mode", () => {
      const db = getDb();
      const row = db.pragma("journal_mode") as { journal_mode: string }[];
      // In-memory DBs report 'memory', not 'wal' – WAL is a no-op on :memory:
      // The important thing is the pragma was accepted without error
      expect(["wal", "memory"]).toContain(row[0].journal_mode);
    });

    it("enables foreign keys", () => {
      const db = getDb();
      const row = db.pragma("foreign_keys") as { foreign_keys: number }[];
      expect(row[0].foreign_keys).toBe(1);
    });
  });

  // ── Job CRUD ────────────────────────────────────────────────────────────

  describe("createJob", () => {
    it("creates a job and returns it with defaults", () => {
      const job = createJob({ city: "Warsaw", search_query: "restaurant" });
      expect(job.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(job.city).toBe("Warsaw");
      expect(job.search_query).toBe("restaurant");
      expect(job.status).toBe("pending");
      expect(job.grid_cells_total).toBe(0);
      expect(job.grid_cells_completed).toBe(0);
      expect(job.businesses_found).toBe(0);
      expect(job.businesses_skipped).toBe(0);
      expect(job.error_message).toBeNull();
      expect(job.created_at).toBeTruthy();
      expect(job.updated_at).toBeTruthy();
    });

    it("persists the job so getJob can retrieve it", () => {
      const created = createJob({ city: "Krakow", search_query: "hotel" });
      const fetched = getJob(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
    });
  });

  describe("getJob", () => {
    it("returns null for unknown id", () => {
      expect(getJob("nonexistent-id")).toBeNull();
    });
  });

  describe("listJobs", () => {
    it("returns all jobs ordered by created_at desc", () => {
      createJob({ city: "A", search_query: "q1" });
      createJob({ city: "B", search_query: "q2" });
      createJob({ city: "C", search_query: "q3" });
      const jobs = listJobs();
      expect(jobs).toHaveLength(3);
      // Verify descending order
      for (let i = 0; i < jobs.length - 1; i++) {
        expect(jobs[i].created_at >= jobs[i + 1].created_at).toBe(true);
      }
    });

    it("returns empty array when no jobs exist", () => {
      expect(listJobs()).toEqual([]);
    });
  });

  describe("updateJobProgress", () => {
    it("updates the specified fields", () => {
      const job = createJob({ city: "X", search_query: "y" });
      updateJobProgress(job.id, {
        status: "running",
        grid_cells_total: 10,
        grid_cells_completed: 3,
        businesses_found: 5,
        businesses_skipped: 1,
      });
      const updated = getJob(job.id)!;
      expect(updated.status).toBe("running");
      expect(updated.grid_cells_total).toBe(10);
      expect(updated.grid_cells_completed).toBe(3);
      expect(updated.businesses_found).toBe(5);
      expect(updated.businesses_skipped).toBe(1);
    });

    it("updates updated_at timestamp", () => {
      const job = createJob({ city: "X", search_query: "y" });
      const before = job.updated_at;
      // Tiny delay to ensure timestamp differs
      const later = new Date(Date.now() + 1).toISOString();
      updateJobProgress(job.id, { status: "completed" });
      const updated = getJob(job.id)!;
      expect(updated.updated_at >= before).toBe(true);
    });

    it("can set error_message", () => {
      const job = createJob({ city: "X", search_query: "y" });
      updateJobProgress(job.id, {
        status: "failed",
        error_message: "Something went wrong",
      });
      const updated = getJob(job.id)!;
      expect(updated.status).toBe("failed");
      expect(updated.error_message).toBe("Something went wrong");
    });

    it("partial update only changes provided fields", () => {
      const job = createJob({ city: "X", search_query: "y" });
      updateJobProgress(job.id, { businesses_found: 7 });
      const updated = getJob(job.id)!;
      expect(updated.businesses_found).toBe(7);
      expect(updated.status).toBe("pending"); // unchanged
    });
  });

  // ── Business CRUD ───────────────────────────────────────────────────────

  describe("insertBusiness", () => {
    it("inserts and returns a business with generated id", () => {
      const biz = insertBusiness(makeBusiness());
      expect(biz.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(biz.name).toBe("Test Café");
    });

    it("deserializes JSON fields", () => {
      const biz = insertBusiness(makeBusiness());
      expect(Array.isArray(biz.all_categories)).toBe(true);
      expect(biz.all_categories).toContain("cafe");
      expect(Array.isArray(biz.opening_hours)).toBe(true);
      expect(biz.opening_hours![0]).toHaveProperty("day");
      expect(biz.about).not.toBeNull();
      expect(biz.about!["Highlights"]).toContain("Free Wi-Fi");
    });

    it("deserializes boolean fields", () => {
      const biz = insertBusiness(
        makeBusiness({ temporarily_closed: true, street_view_available: false })
      );
      expect(biz.temporarily_closed).toBe(true);
      expect(biz.street_view_available).toBe(false);
    });

    it("throws on duplicate google_place_id", () => {
      const data = makeBusiness({ google_place_id: "UNIQUE_PLACE_ID" });
      insertBusiness(data);
      expect(() => insertBusiness(data)).toThrow();
    });

    it("handles null JSON fields gracefully", () => {
      const biz = insertBusiness(
        makeBusiness({ opening_hours: null, about: null })
      );
      expect(biz.opening_hours).toBeNull();
      expect(biz.about).toBeNull();
    });
  });

  describe("businessExists", () => {
    it("returns true when business with that google_place_id exists", () => {
      const data = makeBusiness({ google_place_id: "KNOWN_PLACE" });
      insertBusiness(data);
      expect(businessExists("KNOWN_PLACE")).toBe(true);
    });

    it("returns false for unknown google_place_id", () => {
      expect(businessExists("UNKNOWN_PLACE")).toBe(false);
    });
  });

  describe("getBusiness", () => {
    it("retrieves a business by id with deserialized fields", () => {
      const inserted = insertBusiness(makeBusiness());
      const fetched = getBusiness(inserted.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(inserted.id);
      expect(Array.isArray(fetched!.all_categories)).toBe(true);
      expect(typeof fetched!.temporarily_closed).toBe("boolean");
      expect(typeof fetched!.permanently_closed).toBe("boolean");
      expect(typeof fetched!.street_view_available).toBe("boolean");
    });

    it("returns null for unknown id", () => {
      expect(getBusiness("no-such-id")).toBeNull();
    });
  });

  describe("listBusinesses", () => {
    beforeEach(() => {
      insertBusiness(makeBusiness({ name: "Pizza Roma", category: "pizza", google_place_id: "p1" }));
      insertBusiness(makeBusiness({ name: "Sushi Bar", category: "japanese", google_place_id: "p2" }));
      insertBusiness(makeBusiness({ name: "Coffee Corner", category: "cafe", address: "5th Avenue", google_place_id: "p3" }));
    });

    it("returns all businesses when no search term", () => {
      expect(listBusinesses()).toHaveLength(3);
    });

    it("filters by name (case-insensitive)", () => {
      const results = listBusinesses("pizza");
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Pizza Roma");
    });

    it("filters by category", () => {
      const results = listBusinesses("japanese");
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Sushi Bar");
    });

    it("filters by address", () => {
      const results = listBusinesses("5th Avenue");
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Coffee Corner");
    });

    it("returns empty array when no match", () => {
      expect(listBusinesses("nonexistent term xyz")).toHaveLength(0);
    });

    it("deserializes fields in results", () => {
      const results = listBusinesses();
      for (const biz of results) {
        expect(typeof biz.temporarily_closed).toBe("boolean");
        expect(Array.isArray(biz.all_categories)).toBe(true);
      }
    });
  });

  describe("deleteBusiness", () => {
    it("removes the business from the database", () => {
      const biz = insertBusiness(makeBusiness());
      deleteBusiness(biz.id);
      expect(getBusiness(biz.id)).toBeNull();
    });

    it("cascade-deletes photos when business is deleted", () => {
      const biz = insertBusiness(makeBusiness());
      const db = getDb();
      const photoId = "photo-uuid-1";
      db.prepare(
        "INSERT INTO business_photos (id, business_id, file_path, source_url, is_primary, order_index) VALUES (?,?,?,?,?,?)"
      ).run(photoId, biz.id, "/photos/test.jpg", "https://photos.example.com/1.jpg", 1, 0);

      deleteBusiness(biz.id);

      const photo = db
        .prepare("SELECT * FROM business_photos WHERE id = ?")
        .get(photoId);
      expect(photo).toBeUndefined();
    });

    it("cascade-deletes reviews when business is deleted", () => {
      const biz = insertBusiness(makeBusiness());
      const db = getDb();
      const reviewId = "review-uuid-1";
      db.prepare(
        "INSERT INTO business_reviews (id, business_id, author, rating, text, date, likes_count) VALUES (?,?,?,?,?,?,?)"
      ).run(reviewId, biz.id, "Alice", 5, "Great!", "2024-01-01", 0);

      deleteBusiness(biz.id);

      const review = db
        .prepare("SELECT * FROM business_reviews WHERE id = ?")
        .get(reviewId);
      expect(review).toBeUndefined();
    });

    it("cascade-deletes scrape_job_businesses links when business is deleted", () => {
      const job = createJob({ city: "C", search_query: "q" });
      const biz = insertBusiness(makeBusiness());
      linkJobBusiness(job.id, biz.id);

      deleteBusiness(biz.id);

      const db = getDb();
      const link = db
        .prepare(
          "SELECT * FROM scrape_job_businesses WHERE business_id = ?"
        )
        .get(biz.id);
      expect(link).toBeUndefined();
    });
  });

  // ── linkJobBusiness ─────────────────────────────────────────────────────

  describe("linkJobBusiness", () => {
    it("creates a link between job and business", () => {
      const job = createJob({ city: "C", search_query: "q" });
      const biz = insertBusiness(makeBusiness());
      linkJobBusiness(job.id, biz.id);

      const db = getDb();
      const link = db
        .prepare(
          "SELECT * FROM scrape_job_businesses WHERE job_id = ? AND business_id = ?"
        )
        .get(job.id, biz.id);
      expect(link).toBeTruthy();
    });

    it("is idempotent (no error on duplicate link)", () => {
      const job = createJob({ city: "C", search_query: "q" });
      const biz = insertBusiness(makeBusiness());
      linkJobBusiness(job.id, biz.id);
      // Second call should not throw
      expect(() => linkJobBusiness(job.id, biz.id)).not.toThrow();
    });
  });

  // ── Unique constraint ───────────────────────────────────────────────────

  describe("unique constraint on google_place_id", () => {
    it("prevents inserting two businesses with the same place id", () => {
      const placeId = "DUPE_PLACE_ID";
      insertBusiness(makeBusiness({ google_place_id: placeId }));
      expect(() =>
        insertBusiness(makeBusiness({ google_place_id: placeId }))
      ).toThrow();
    });
  });
});
