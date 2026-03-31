import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import type { ScrapeJob, Business } from "@/lib/types";

// ─── Singleton DB instance ────────────────────────────────────────────────────

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    throw new Error("Database not initialized. Call initSchema() first.");
  }
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ─── Schema ───────────────────────────────────────────────────────────────────

export function initSchema(path: string = "data.db"): void {
  // Already initialized — skip (unless it's a different path, e.g. tests with :memory:)
  if (_db) {
    if (path === ":memory:") {
      _db.close();
      _db = null;
    } else {
      return;
    }
  }

  _db = new Database(path);

  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS scrape_jobs (
      id                    TEXT PRIMARY KEY,
      city                  TEXT NOT NULL,
      search_query          TEXT NOT NULL,
      status                TEXT NOT NULL DEFAULT 'pending',
      grid_cells_total      INTEGER NOT NULL DEFAULT 0,
      grid_cells_completed  INTEGER NOT NULL DEFAULT 0,
      businesses_found      INTEGER NOT NULL DEFAULT 0,
      businesses_skipped    INTEGER NOT NULL DEFAULT 0,
      error_message         TEXT,
      created_at            TEXT NOT NULL,
      updated_at            TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS businesses (
      id                    TEXT PRIMARY KEY,
      google_place_id       TEXT NOT NULL UNIQUE,
      name                  TEXT NOT NULL,
      address               TEXT NOT NULL,
      formatted_address     TEXT NOT NULL,
      latitude              REAL NOT NULL,
      longitude             REAL NOT NULL,
      phone                 TEXT,
      international_phone   TEXT,
      website_url           TEXT,
      rating                REAL,
      reviews_count         INTEGER NOT NULL DEFAULT 0,
      price_level           INTEGER,
      category              TEXT NOT NULL,
      all_categories        TEXT NOT NULL,
      opening_hours         TEXT,
      temporarily_closed    INTEGER NOT NULL DEFAULT 0,
      permanently_closed    INTEGER NOT NULL DEFAULT 0,
      description           TEXT,
      about                 TEXT,
      menu_url              TEXT,
      reservation_url       TEXT,
      order_url             TEXT,
      owner_title           TEXT,
      plus_code             TEXT,
      street_view_available INTEGER NOT NULL DEFAULT 0,
      scraped_at            TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS business_photos (
      id           TEXT PRIMARY KEY,
      business_id  TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      file_path    TEXT NOT NULL,
      source_url   TEXT NOT NULL,
      is_primary   INTEGER NOT NULL DEFAULT 0,
      order_index  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS business_reviews (
      id               TEXT PRIMARY KEY,
      business_id      TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      author           TEXT NOT NULL,
      author_url       TEXT,
      author_photo_url TEXT,
      rating           INTEGER NOT NULL,
      text             TEXT NOT NULL,
      date             TEXT NOT NULL,
      language         TEXT,
      likes_count      INTEGER NOT NULL DEFAULT 0,
      owner_reply      TEXT
    );

    CREATE TABLE IF NOT EXISTS scrape_job_businesses (
      job_id       TEXT NOT NULL REFERENCES scrape_jobs(id),
      business_id  TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      PRIMARY KEY (job_id, business_id)
    );
  `);
}

// ─── Serialization helpers ────────────────────────────────────────────────────

function serializeBusiness(
  data: Omit<Business, "id">
): Record<string, unknown> {
  return {
    ...data,
    all_categories: JSON.stringify(data.all_categories),
    opening_hours: data.opening_hours != null ? JSON.stringify(data.opening_hours) : null,
    about: data.about != null ? JSON.stringify(data.about) : null,
    temporarily_closed: data.temporarily_closed ? 1 : 0,
    permanently_closed: data.permanently_closed ? 1 : 0,
    street_view_available: data.street_view_available ? 1 : 0,
  };
}

function deserializeBusiness(row: Record<string, unknown>): Business {
  return {
    ...(row as unknown as Business),
    all_categories: JSON.parse(row.all_categories as string) as string[],
    opening_hours:
      row.opening_hours != null
        ? JSON.parse(row.opening_hours as string)
        : null,
    about: row.about != null ? JSON.parse(row.about as string) : null,
    temporarily_closed: row.temporarily_closed === 1,
    permanently_closed: row.permanently_closed === 1,
    street_view_available: row.street_view_available === 1,
  };
}

// ─── Job CRUD ─────────────────────────────────────────────────────────────────

export function createJob(params: {
  city: string;
  search_query: string;
}): ScrapeJob {
  const db = getDb();
  const now = new Date().toISOString();
  const job: ScrapeJob = {
    id: uuidv4(),
    city: params.city,
    search_query: params.search_query,
    status: "pending",
    grid_cells_total: 0,
    grid_cells_completed: 0,
    businesses_found: 0,
    businesses_skipped: 0,
    error_message: null,
    created_at: now,
    updated_at: now,
  };

  db.prepare(`
    INSERT INTO scrape_jobs
      (id, city, search_query, status, grid_cells_total, grid_cells_completed,
       businesses_found, businesses_skipped, error_message, created_at, updated_at)
    VALUES
      (@id, @city, @search_query, @status, @grid_cells_total, @grid_cells_completed,
       @businesses_found, @businesses_skipped, @error_message, @created_at, @updated_at)
  `).run(job);

  return job;
}

export function getJob(id: string): ScrapeJob | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM scrape_jobs WHERE id = ?").get(id);
  return (row as ScrapeJob) ?? null;
}

export function listJobs(): ScrapeJob[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM scrape_jobs ORDER BY created_at DESC")
    .all() as ScrapeJob[];
}

export function updateJobProgress(
  id: string,
  updates: Partial<
    Pick<
      ScrapeJob,
      | "status"
      | "grid_cells_total"
      | "grid_cells_completed"
      | "businesses_found"
      | "businesses_skipped"
      | "error_message"
    >
  >
): void {
  const db = getDb();
  const now = new Date().toISOString();

  const setClauses: string[] = ["updated_at = @updated_at"];
  const params: Record<string, unknown> = { id, updated_at: now };

  if (updates.status !== undefined) {
    setClauses.push("status = @status");
    params.status = updates.status;
  }
  if (updates.grid_cells_total !== undefined) {
    setClauses.push("grid_cells_total = @grid_cells_total");
    params.grid_cells_total = updates.grid_cells_total;
  }
  if (updates.grid_cells_completed !== undefined) {
    setClauses.push("grid_cells_completed = @grid_cells_completed");
    params.grid_cells_completed = updates.grid_cells_completed;
  }
  if (updates.businesses_found !== undefined) {
    setClauses.push("businesses_found = @businesses_found");
    params.businesses_found = updates.businesses_found;
  }
  if (updates.businesses_skipped !== undefined) {
    setClauses.push("businesses_skipped = @businesses_skipped");
    params.businesses_skipped = updates.businesses_skipped;
  }
  if (updates.error_message !== undefined) {
    setClauses.push("error_message = @error_message");
    params.error_message = updates.error_message;
  }

  db.prepare(
    `UPDATE scrape_jobs SET ${setClauses.join(", ")} WHERE id = @id`
  ).run(params);
}

// ─── Business CRUD ────────────────────────────────────────────────────────────

export function insertBusiness(data: Omit<Business, "id">): Business {
  const db = getDb();
  const id = uuidv4();
  const serialized = serializeBusiness(data);

  db.prepare(`
    INSERT INTO businesses
      (id, google_place_id, name, address, formatted_address, latitude, longitude,
       phone, international_phone, website_url, rating, reviews_count, price_level,
       category, all_categories, opening_hours, temporarily_closed, permanently_closed,
       description, about, menu_url, reservation_url, order_url, owner_title,
       plus_code, street_view_available, scraped_at)
    VALUES
      (@id, @google_place_id, @name, @address, @formatted_address, @latitude, @longitude,
       @phone, @international_phone, @website_url, @rating, @reviews_count, @price_level,
       @category, @all_categories, @opening_hours, @temporarily_closed, @permanently_closed,
       @description, @about, @menu_url, @reservation_url, @order_url, @owner_title,
       @plus_code, @street_view_available, @scraped_at)
  `).run({ id, ...serialized });

  return getBusiness(id)!;
}

export function businessExists(googlePlaceId: string): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT 1 FROM businesses WHERE google_place_id = ? LIMIT 1")
    .get(googlePlaceId);
  return row !== undefined;
}

export function getBusiness(id: string): Business | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM businesses WHERE id = ?").get(id);
  if (!row) return null;
  return deserializeBusiness(row as Record<string, unknown>);
}

export function listBusinesses(search?: string): Business[] {
  const db = getDb();
  let rows: Record<string, unknown>[];

  if (search && search.trim().length > 0) {
    const term = `%${search}%`;
    rows = db
      .prepare(
        `SELECT * FROM businesses
         WHERE name LIKE ? OR category LIKE ? OR address LIKE ?
         ORDER BY name`
      )
      .all(term, term, term) as Record<string, unknown>[];
  } else {
    rows = db
      .prepare("SELECT * FROM businesses ORDER BY name")
      .all() as Record<string, unknown>[];
  }

  return rows.map(deserializeBusiness);
}

export function deleteBusiness(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM businesses WHERE id = ?").run(id);
}

export function linkJobBusiness(jobId: string, businessId: string): void {
  const db = getDb();
  db.prepare(
    "INSERT OR IGNORE INTO scrape_job_businesses (job_id, business_id) VALUES (?, ?)"
  ).run(jobId, businessId);
}
