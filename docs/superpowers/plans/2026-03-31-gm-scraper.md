# GM Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Google Maps scraper that finds local businesses without custom websites in a given city, stores results in SQLite, and provides a web UI for job management and browsing.

**Architecture:** Two-process design — Next.js app (UI + API) and a scraper worker — unified by SQLite. Playwright with API response interception scrapes Google Maps. SSE streams progress to the frontend.

**Tech Stack:** TypeScript, Next.js (App Router), React, shadcn/ui, better-sqlite3, Playwright, SSE

**Spec:** `docs/superpowers/specs/2026-03-25-gm-scraper-design.md`

---

## File Structure

```
gm-scraper/
├── package.json
├── tsconfig.json
├── next.config.ts
├── vitest.config.ts
├── .gitignore                          # Already exists
├── src/
│   ├── lib/
│   │   ├── db.ts                       # SQLite connection, schema init, CRUD
│   │   ├── db.test.ts                  # DB layer tests
│   │   ├── website-filter.ts           # Domain blocklist + filter logic
│   │   ├── website-filter.test.ts      # Filter tests
│   │   └── types.ts                    # Shared TypeScript interfaces
│   ├── worker/
│   │   ├── index.ts                    # Worker entry point — job polling loop
│   │   ├── grid.ts                     # Grid generation + adaptive subdivision
│   │   ├── grid.test.ts               # Grid math tests
│   │   ├── scraper.ts                  # Playwright engine — search + detail scraping
│   │   ├── parser.ts                   # Parse intercepted Google Maps responses
│   │   ├── parser.test.ts             # Parser tests with fixture data
│   │   └── media.ts                    # Photo download + storage
│   ├── app/
│   │   ├── layout.tsx                  # Root layout with nav
│   │   ├── page.tsx                    # Dashboard — job form + job cards
│   │   ├── businesses/
│   │   │   ├── page.tsx                # Business list with search
│   │   │   └── [id]/
│   │   │       └── page.tsx            # Business detail page
│   │   └── api/
│   │       ├── jobs/
│   │       │   ├── route.ts            # POST (create) + GET (list)
│   │       │   └── [id]/
│   │       │       └── progress/
│   │       │           └── route.ts    # GET — SSE progress stream
│   │       └── businesses/
│   │           ├── route.ts            # GET (list/search)
│   │           └── [id]/
│   │               └── route.ts        # GET (detail) + DELETE
│   └── components/
│       ├── ui/                         # shadcn components (auto-installed)
│       ├── job-form.tsx                # New scrape job form
│       ├── job-card.tsx                # Job status card with live progress
│       ├── business-table.tsx          # Business list table
│       └── business-detail.tsx         # Business detail sections
├── media/                              # Photo storage (gitignored)
└── data/                               # SQLite DB file location (gitignored)
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/lib/types.ts`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd /home/kc/repos/biznes/gm-scraper
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

Accept defaults. This creates the base Next.js project with TypeScript, Tailwind, App Router, and `src/` directory.

- [ ] **Step 2: Install core dependencies**

```bash
npm install better-sqlite3 uuid playwright
npm install -D @types/better-sqlite3 @types/uuid vitest @vitejs/plugin-react
```

- [ ] **Step 3: Install Playwright browsers**

```bash
npx playwright install chromium
```

- [ ] **Step 4: Initialize shadcn/ui**

```bash
npx shadcn@latest init -d
```

Accept defaults (New York style, Zinc base color, CSS variables).

- [ ] **Step 5: Install required shadcn components**

```bash
npx shadcn@latest add button input card badge progress dialog table scroll-area tabs
```

- [ ] **Step 6: Create vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 7: Add scripts to package.json**

Add to `"scripts"` in `package.json`:

```json
"worker": "npx tsx src/worker/index.ts",
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 8: Create shared types**

Create `src/lib/types.ts`:

```typescript
export interface ScrapeJob {
  id: string;
  city: string;
  search_query: string;
  status: "pending" | "running" | "completed" | "failed" | "blocked";
  grid_cells_total: number;
  grid_cells_completed: number;
  businesses_found: number;
  businesses_skipped: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Business {
  id: string;
  google_place_id: string;
  name: string;
  address: string;
  formatted_address: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  international_phone: string | null;
  website_url: string | null;
  rating: number | null;
  reviews_count: number;
  price_level: number | null;
  category: string;
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
  scraped_at: string;
}

export interface DayHours {
  day: string;
  hours: string;
}

export interface BusinessPhoto {
  id: string;
  business_id: string;
  file_path: string;
  source_url: string;
  is_primary: boolean;
  order_index: number;
}

export interface BusinessReview {
  id: string;
  business_id: string;
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

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface GridCell {
  bounds: BoundingBox;
  index: number;
}
```

- [ ] **Step 9: Update .gitignore**

Append to `.gitignore`:

```
data/
```

(The existing `.gitignore` already has `node_modules/`, `.next/`, `.env`, `media/`, `.superpowers/`. Add `data/` for the SQLite file.)

- [ ] **Step 10: Verify setup**

```bash
npm run build
```

Expected: Successful build with no errors.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with dependencies"
```

---

## Task 2: Database Layer

**Files:**
- Create: `src/lib/db.ts`, `src/lib/db.test.ts`
- Read: `src/lib/types.ts`

- [ ] **Step 1: Write failing tests for schema initialization**

Create `src/lib/db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { getDb, initSchema, closeDb } from "./db";

describe("Database", () => {
  beforeEach(() => {
    initSchema(":memory:");
  });

  afterEach(() => {
    closeDb();
  });

  it("creates all tables", () => {
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

  it("enforces unique google_place_id", () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO businesses (id, google_place_id, name, address, formatted_address,
        latitude, longitude, reviews_count, category, all_categories,
        temporarily_closed, permanently_closed, street_view_available, scraped_at)
       VALUES ('1', 'place_abc', 'Test', 'addr', 'full addr',
        50.0, 20.0, 0, 'Restaurant', '[]',
        0, 0, 0, '2026-01-01T00:00:00Z')`
    ).run();

    expect(() => {
      db.prepare(
        `INSERT INTO businesses (id, google_place_id, name, address, formatted_address,
          latitude, longitude, reviews_count, category, all_categories,
          temporarily_closed, permanently_closed, street_view_available, scraped_at)
         VALUES ('2', 'place_abc', 'Dupe', 'addr2', 'full addr2',
          50.0, 20.0, 0, 'Shop', '[]',
          0, 0, 0, '2026-01-01T00:00:00Z')`
      ).run();
    }).toThrow();
  });

  it("cascade deletes photos and reviews when business deleted", () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO businesses (id, google_place_id, name, address, formatted_address,
        latitude, longitude, reviews_count, category, all_categories,
        temporarily_closed, permanently_closed, street_view_available, scraped_at)
       VALUES ('b1', 'place_1', 'Biz', 'addr', 'full',
        50.0, 20.0, 0, 'Cat', '[]', 0, 0, 0, '2026-01-01T00:00:00Z')`
    ).run();

    db.prepare(
      `INSERT INTO business_photos (id, business_id, file_path, source_url, is_primary, order_index)
       VALUES ('p1', 'b1', '/media/place_1/1.jpg', 'http://example.com/1.jpg', 1, 0)`
    ).run();

    db.prepare(
      `INSERT INTO business_reviews (id, business_id, author, rating, text, date, likes_count)
       VALUES ('r1', 'b1', 'Jan', 5, 'Great', '2026-01-01', 0)`
    ).run();

    db.prepare("DELETE FROM businesses WHERE id = 'b1'").run();

    const photos = db.prepare("SELECT * FROM business_photos WHERE business_id = 'b1'").all();
    const reviews = db.prepare("SELECT * FROM business_reviews WHERE business_id = 'b1'").all();
    expect(photos).toHaveLength(0);
    expect(reviews).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/db.test.ts
```

Expected: FAIL — module `./db` not found.

- [ ] **Step 3: Implement database module**

Create `src/lib/db.ts`:

```typescript
import Database from "better-sqlite3";
import path from "path";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) throw new Error("Database not initialized. Call initSchema first.");
  return db;
}

export function initSchema(dbPath?: string): void {
  const resolvedPath =
    dbPath ?? path.join(process.cwd(), "data", "gm-scraper.db");

  if (resolvedPath !== ":memory:") {
    const fs = require("fs");
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS scrape_jobs (
      id TEXT PRIMARY KEY,
      city TEXT NOT NULL,
      search_query TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      grid_cells_total INTEGER NOT NULL DEFAULT 0,
      grid_cells_completed INTEGER NOT NULL DEFAULT 0,
      businesses_found INTEGER NOT NULL DEFAULT 0,
      businesses_skipped INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      google_place_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      formatted_address TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      phone TEXT,
      international_phone TEXT,
      website_url TEXT,
      rating REAL,
      reviews_count INTEGER NOT NULL DEFAULT 0,
      price_level INTEGER,
      category TEXT NOT NULL,
      all_categories TEXT NOT NULL DEFAULT '[]',
      opening_hours TEXT,
      temporarily_closed INTEGER NOT NULL DEFAULT 0,
      permanently_closed INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      about TEXT,
      menu_url TEXT,
      reservation_url TEXT,
      order_url TEXT,
      owner_title TEXT,
      plus_code TEXT,
      street_view_available INTEGER NOT NULL DEFAULT 0,
      scraped_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS business_photos (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      source_url TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      order_index INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS business_reviews (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      author TEXT NOT NULL,
      author_url TEXT,
      author_photo_url TEXT,
      rating INTEGER NOT NULL,
      text TEXT NOT NULL,
      date TEXT NOT NULL,
      language TEXT,
      likes_count INTEGER NOT NULL DEFAULT 0,
      owner_reply TEXT,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scrape_job_businesses (
      job_id TEXT NOT NULL,
      business_id TEXT NOT NULL,
      PRIMARY KEY (job_id, business_id),
      FOREIGN KEY (job_id) REFERENCES scrape_jobs(id),
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/lib/db.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Write failing tests for CRUD helpers**

Append to `src/lib/db.test.ts`:

```typescript
import { createJob, getJob, listJobs, updateJobProgress } from "./db";
import {
  insertBusiness,
  businessExists,
  listBusinesses,
  getBusiness,
  deleteBusiness,
} from "./db";

describe("Job CRUD", () => {
  beforeEach(() => {
    initSchema(":memory:");
  });
  afterEach(() => {
    closeDb();
  });

  it("creates and retrieves a job", () => {
    const job = createJob("Kraków", "restaurants");
    expect(job.city).toBe("Kraków");
    expect(job.status).toBe("pending");

    const fetched = getJob(job.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.city).toBe("Kraków");
  });

  it("lists jobs ordered by created_at desc", () => {
    createJob("A", "query1");
    createJob("B", "query2");
    const jobs = listJobs();
    expect(jobs).toHaveLength(2);
    expect(jobs[0].city).toBe("B");
  });

  it("updates job progress", () => {
    const job = createJob("C", "q");
    updateJobProgress(job.id, {
      status: "running",
      grid_cells_total: 20,
      grid_cells_completed: 5,
      businesses_found: 10,
      businesses_skipped: 3,
    });
    const updated = getJob(job.id)!;
    expect(updated.status).toBe("running");
    expect(updated.grid_cells_completed).toBe(5);
    expect(updated.businesses_found).toBe(10);
  });
});

describe("Business CRUD", () => {
  beforeEach(() => {
    initSchema(":memory:");
  });
  afterEach(() => {
    closeDb();
  });

  it("inserts and checks existence", () => {
    insertBusiness({
      id: "b1",
      google_place_id: "gp_1",
      name: "Test Biz",
      address: "123 St",
      formatted_address: "123 St, City",
      latitude: 50.06,
      longitude: 19.94,
      phone: null,
      international_phone: null,
      website_url: null,
      rating: 4.5,
      reviews_count: 10,
      price_level: 2,
      category: "Restaurant",
      all_categories: ["Restaurant", "Pizza"],
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
      scraped_at: "2026-01-01T00:00:00Z",
    });

    expect(businessExists("gp_1")).toBe(true);
    expect(businessExists("gp_nonexistent")).toBe(false);
  });

  it("lists businesses with search filter", () => {
    insertBusiness({
      id: "b1",
      google_place_id: "gp_1",
      name: "Pizza Roma",
      address: "ul. Floriańska 12",
      formatted_address: "ul. Floriańska 12, Kraków",
      latitude: 50.06,
      longitude: 19.94,
      phone: null,
      international_phone: null,
      website_url: null,
      rating: 4.5,
      reviews_count: 10,
      price_level: 2,
      category: "Restaurant",
      all_categories: ["Restaurant"],
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
      scraped_at: "2026-01-01T00:00:00Z",
    });

    const all = listBusinesses();
    expect(all).toHaveLength(1);

    const filtered = listBusinesses("Roma");
    expect(filtered).toHaveLength(1);

    const noMatch = listBusinesses("Sushi");
    expect(noMatch).toHaveLength(0);
  });

  it("gets full business detail", () => {
    insertBusiness({
      id: "b1",
      google_place_id: "gp_1",
      name: "Test",
      address: "addr",
      formatted_address: "full",
      latitude: 50.0,
      longitude: 20.0,
      phone: null,
      international_phone: null,
      website_url: null,
      rating: null,
      reviews_count: 0,
      price_level: null,
      category: "Shop",
      all_categories: ["Shop"],
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
      scraped_at: "2026-01-01T00:00:00Z",
    });

    const biz = getBusiness("b1");
    expect(biz).not.toBeNull();
    expect(biz!.name).toBe("Test");
    expect(biz!.all_categories).toEqual(["Shop"]);
  });

  it("deletes business and returns true", () => {
    insertBusiness({
      id: "b1",
      google_place_id: "gp_1",
      name: "Del",
      address: "a",
      formatted_address: "f",
      latitude: 50.0,
      longitude: 20.0,
      phone: null,
      international_phone: null,
      website_url: null,
      rating: null,
      reviews_count: 0,
      price_level: null,
      category: "Cat",
      all_categories: [],
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
      scraped_at: "2026-01-01T00:00:00Z",
    });

    expect(deleteBusiness("b1")).toBe(true);
    expect(deleteBusiness("b1")).toBe(false);
    expect(businessExists("gp_1")).toBe(false);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

```bash
npm test -- src/lib/db.test.ts
```

Expected: FAIL — functions not exported from `./db`.

- [ ] **Step 7: Implement CRUD helpers**

Append to `src/lib/db.ts`:

```typescript
import { v4 as uuidv4 } from "uuid";
import type { ScrapeJob, Business } from "./types";

export function createJob(city: string, searchQuery: string): ScrapeJob {
  const id = uuidv4();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO scrape_jobs (id, city, search_query, status, grid_cells_total,
        grid_cells_completed, businesses_found, businesses_skipped, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', 0, 0, 0, 0, ?, ?)`
    )
    .run(id, city, searchQuery, now, now);
  return getJob(id)!;
}

export function getJob(id: string): ScrapeJob | null {
  const row = getDb().prepare("SELECT * FROM scrape_jobs WHERE id = ?").get(id) as ScrapeJob | undefined;
  return row ?? null;
}

export function listJobs(): ScrapeJob[] {
  return getDb()
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
  const setClauses: string[] = ["updated_at = ?"];
  const values: unknown[] = [new Date().toISOString()];

  for (const [key, value] of Object.entries(updates)) {
    setClauses.push(`${key} = ?`);
    values.push(value);
  }

  values.push(id);
  getDb()
    .prepare(`UPDATE scrape_jobs SET ${setClauses.join(", ")} WHERE id = ?`)
    .run(...values);
}

export function insertBusiness(biz: Business): void {
  getDb()
    .prepare(
      `INSERT INTO businesses (id, google_place_id, name, address, formatted_address,
        latitude, longitude, phone, international_phone, website_url,
        rating, reviews_count, price_level, category, all_categories,
        opening_hours, temporarily_closed, permanently_closed, description,
        about, menu_url, reservation_url, order_url, owner_title, plus_code,
        street_view_available, scraped_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      biz.id,
      biz.google_place_id,
      biz.name,
      biz.address,
      biz.formatted_address,
      biz.latitude,
      biz.longitude,
      biz.phone,
      biz.international_phone,
      biz.website_url,
      biz.rating,
      biz.reviews_count,
      biz.price_level,
      biz.category,
      JSON.stringify(biz.all_categories),
      biz.opening_hours ? JSON.stringify(biz.opening_hours) : null,
      biz.temporarily_closed ? 1 : 0,
      biz.permanently_closed ? 1 : 0,
      biz.description,
      biz.about ? JSON.stringify(biz.about) : null,
      biz.menu_url,
      biz.reservation_url,
      biz.order_url,
      biz.owner_title,
      biz.plus_code,
      biz.street_view_available ? 1 : 0,
      biz.scraped_at
    );
}

export function businessExists(googlePlaceId: string): boolean {
  const row = getDb()
    .prepare("SELECT 1 FROM businesses WHERE google_place_id = ?")
    .get(googlePlaceId);
  return !!row;
}

function deserializeBusiness(row: Record<string, unknown>): Business {
  return {
    ...row,
    all_categories: JSON.parse(row.all_categories as string),
    opening_hours: row.opening_hours
      ? JSON.parse(row.opening_hours as string)
      : null,
    about: row.about ? JSON.parse(row.about as string) : null,
    temporarily_closed: !!(row.temporarily_closed as number),
    permanently_closed: !!(row.permanently_closed as number),
    street_view_available: !!(row.street_view_available as number),
  } as Business;
}

export function listBusinesses(search?: string): Business[] {
  if (search) {
    const pattern = `%${search}%`;
    return (
      getDb()
        .prepare(
          `SELECT * FROM businesses
           WHERE name LIKE ? OR category LIKE ? OR address LIKE ?
           ORDER BY scraped_at DESC`
        )
        .all(pattern, pattern, pattern) as Record<string, unknown>[]
    ).map(deserializeBusiness);
  }
  return (
    getDb()
      .prepare("SELECT * FROM businesses ORDER BY scraped_at DESC")
      .all() as Record<string, unknown>[]
  ).map(deserializeBusiness);
}

export function getBusiness(id: string): Business | null {
  const row = getDb()
    .prepare("SELECT * FROM businesses WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? deserializeBusiness(row) : null;
}

export function deleteBusiness(id: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM businesses WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

export function linkJobBusiness(jobId: string, businessId: string): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO scrape_job_businesses (job_id, business_id) VALUES (?, ?)"
    )
    .run(jobId, businessId);
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npm test -- src/lib/db.test.ts
```

Expected: All 8 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "feat: database layer with schema and CRUD helpers"
```

---

## Task 3: Website Filter

**Files:**
- Create: `src/lib/website-filter.ts`, `src/lib/website-filter.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/website-filter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { hasCustomWebsite } from "./website-filter";

describe("hasCustomWebsite", () => {
  it("returns false for null/undefined/empty", () => {
    expect(hasCustomWebsite(null)).toBe(false);
    expect(hasCustomWebsite(undefined)).toBe(false);
    expect(hasCustomWebsite("")).toBe(false);
  });

  it("returns false for Facebook URLs", () => {
    expect(hasCustomWebsite("https://www.facebook.com/pizzeriaroma")).toBe(false);
    expect(hasCustomWebsite("https://facebook.com/someplace")).toBe(false);
    expect(hasCustomWebsite("http://m.facebook.com/page")).toBe(false);
  });

  it("returns false for Instagram URLs", () => {
    expect(hasCustomWebsite("https://www.instagram.com/myshop")).toBe(false);
    expect(hasCustomWebsite("https://instagram.com/place")).toBe(false);
  });

  it("returns false for other social/directory platforms", () => {
    expect(hasCustomWebsite("https://www.yelp.com/biz/place")).toBe(false);
    expect(hasCustomWebsite("https://twitter.com/shop")).toBe(false);
    expect(hasCustomWebsite("https://www.linkedin.com/company/x")).toBe(false);
    expect(hasCustomWebsite("https://www.tiktok.com/@shop")).toBe(false);
    expect(hasCustomWebsite("https://www.youtube.com/channel/x")).toBe(false);
    expect(hasCustomWebsite("https://maps.google.com/place")).toBe(false);
    expect(hasCustomWebsite("https://www.tripadvisor.com/x")).toBe(false);
    expect(hasCustomWebsite("https://www.booking.com/hotel/x")).toBe(false);
    expect(hasCustomWebsite("https://allegro.pl/shop/x")).toBe(false);
    expect(hasCustomWebsite("https://www.olx.pl/oferta/x")).toBe(false);
  });

  it("returns true for custom domains", () => {
    expect(hasCustomWebsite("https://www.pizzeriaroma.pl")).toBe(true);
    expect(hasCustomWebsite("https://myshop.com")).toBe(true);
    expect(hasCustomWebsite("http://serwis-kowalski.pl")).toBe(true);
  });

  it("handles URLs without protocol", () => {
    expect(hasCustomWebsite("www.facebook.com/page")).toBe(false);
    expect(hasCustomWebsite("mywebsite.pl")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/website-filter.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement website filter**

Create `src/lib/website-filter.ts`:

```typescript
const SOCIAL_DIRECTORY_DOMAINS = [
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
];

function extractDomain(url: string): string | null {
  try {
    let normalized = url.trim();
    if (!normalized.match(/^https?:\/\//)) {
      normalized = "https://" + normalized;
    }
    const parsed = new URL(normalized);
    return parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");
  } catch {
    return null;
  }
}

export function hasCustomWebsite(url: string | null | undefined): boolean {
  if (!url || url.trim() === "") return false;

  const domain = extractDomain(url);
  if (!domain) return false;

  return !SOCIAL_DIRECTORY_DOMAINS.some(
    (blocked) => domain === blocked || domain.endsWith("." + blocked)
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/lib/website-filter.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/website-filter.ts src/lib/website-filter.test.ts
git commit -m "feat: website filter with social/directory domain blocklist"
```

---

## Task 4: Grid Generation

**Files:**
- Create: `src/worker/grid.ts`, `src/worker/grid.test.ts`
- Read: `src/lib/types.ts`

- [ ] **Step 1: Write failing tests**

Create `src/worker/grid.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { generateGrid, subdivideCell } from "./grid";
import type { BoundingBox, GridCell } from "@/lib/types";

describe("generateGrid", () => {
  const krakowBounds: BoundingBox = {
    north: 50.12,
    south: 49.97,
    east: 20.05,
    west: 19.80,
  };

  it("generates cells covering the entire bounding box", () => {
    const cells = generateGrid(krakowBounds, 0.05);
    expect(cells.length).toBeGreaterThan(0);

    // Verify full coverage: cells span the whole bounding box
    const minSouth = Math.min(...cells.map((c) => c.bounds.south));
    const maxNorth = Math.max(...cells.map((c) => c.bounds.north));
    const minWest = Math.min(...cells.map((c) => c.bounds.west));
    const maxEast = Math.max(...cells.map((c) => c.bounds.east));

    expect(minSouth).toBeLessThanOrEqual(krakowBounds.south);
    expect(maxNorth).toBeGreaterThanOrEqual(krakowBounds.north);
    expect(minWest).toBeLessThanOrEqual(krakowBounds.west);
    expect(maxEast).toBeGreaterThanOrEqual(krakowBounds.east);
  });

  it("creates smaller cells with smaller step size", () => {
    const coarse = generateGrid(krakowBounds, 0.1);
    const fine = generateGrid(krakowBounds, 0.05);
    expect(fine.length).toBeGreaterThan(coarse.length);
  });

  it("assigns sequential indices", () => {
    const cells = generateGrid(krakowBounds, 0.05);
    cells.forEach((cell, i) => {
      expect(cell.index).toBe(i);
    });
  });
});

describe("subdivideCell", () => {
  it("splits a cell into 4 equal sub-cells", () => {
    const cell: GridCell = {
      bounds: { north: 50.1, south: 50.0, east: 20.1, west: 20.0 },
      index: 0,
    };
    const subs = subdivideCell(cell);
    expect(subs).toHaveLength(4);

    // Each sub-cell should be half the size
    const parentLatSpan = cell.bounds.north - cell.bounds.south;
    const subLatSpan = subs[0].bounds.north - subs[0].bounds.south;
    expect(subLatSpan).toBeCloseTo(parentLatSpan / 2, 5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/worker/grid.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement grid generation**

Create `src/worker/grid.ts`:

```typescript
import type { BoundingBox, GridCell } from "@/lib/types";

export function generateGrid(bounds: BoundingBox, stepDeg: number): GridCell[] {
  const cells: GridCell[] = [];
  let index = 0;

  for (let lat = bounds.south; lat < bounds.north; lat += stepDeg) {
    for (let lng = bounds.west; lng < bounds.east; lng += stepDeg) {
      cells.push({
        bounds: {
          south: lat,
          north: Math.min(lat + stepDeg, bounds.north),
          west: lng,
          east: Math.min(lng + stepDeg, bounds.east),
        },
        index: index++,
      });
    }
  }

  return cells;
}

export function subdivideCell(cell: GridCell): GridCell[] {
  const midLat = (cell.bounds.north + cell.bounds.south) / 2;
  const midLng = (cell.bounds.east + cell.bounds.west) / 2;
  const { north, south, east, west } = cell.bounds;

  return [
    { bounds: { south, north: midLat, west, east: midLng }, index: -1 },
    { bounds: { south, north: midLat, west: midLng, east }, index: -1 },
    { bounds: { south: midLat, north, west, east: midLng }, index: -1 },
    { bounds: { south: midLat, north, west: midLng, east }, index: -1 },
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/worker/grid.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worker/grid.ts src/worker/grid.test.ts
git commit -m "feat: grid generation with adaptive subdivision"
```

---

## Task 5: Google Maps Response Parser

**Files:**
- Create: `src/worker/parser.ts`, `src/worker/parser.test.ts`
- Read: `src/lib/types.ts`

This task parses the intercepted Google Maps API responses. Google Maps returns data in a nested array format (not standard JSON). The parser extracts structured business data from these responses.

**Note:** The exact response format from Google Maps may vary and needs to be determined during initial scraping. This task provides the parser structure and types. The parsing logic will be refined in Task 8 (Scraper Engine) once we can observe real responses.

- [ ] **Step 1: Write failing tests with mock response structures**

Create `src/worker/parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  parseSearchResults,
  parseBusinessDetail,
  type RawSearchResult,
  type RawBusinessDetail,
} from "./parser";

describe("parseSearchResults", () => {
  it("extracts place_id, name, coords, and website from search results", () => {
    const raw: RawSearchResult[] = [
      {
        place_id: "ChIJ_abc123",
        name: "Pizzeria Roma",
        latitude: 50.061,
        longitude: 19.937,
        address: "ul. Floriańska 12",
        category: "Restaurant",
        rating: 4.3,
        reviews_count: 127,
        website: "https://facebook.com/pizzeriaroma",
      },
      {
        place_id: "ChIJ_def456",
        name: "Sushi Master",
        latitude: 50.065,
        longitude: 19.945,
        address: "ul. Grodzka 8",
        category: "Restaurant",
        rating: 4.7,
        reviews_count: 89,
        website: "https://sushimaster.pl",
      },
    ];

    const results = parseSearchResults(raw);
    expect(results).toHaveLength(2);
    expect(results[0].place_id).toBe("ChIJ_abc123");
    expect(results[0].name).toBe("Pizzeria Roma");
    expect(results[1].website).toBe("https://sushimaster.pl");
  });

  it("handles missing website field", () => {
    const raw: RawSearchResult[] = [
      {
        place_id: "ChIJ_abc",
        name: "No Web Shop",
        latitude: 50.0,
        longitude: 20.0,
        address: "addr",
        category: "Shop",
        rating: null,
        reviews_count: 0,
        website: null,
      },
    ];
    const results = parseSearchResults(raw);
    expect(results[0].website).toBeNull();
  });
});

describe("parseBusinessDetail", () => {
  it("extracts full business info from detail response", () => {
    const raw: RawBusinessDetail = {
      place_id: "ChIJ_abc123",
      name: "Pizzeria Roma",
      address: "ul. Floriańska 12",
      formatted_address: "ul. Floriańska 12, 31-021 Kraków, Poland",
      latitude: 50.061,
      longitude: 19.937,
      phone: "12 345 67 89",
      international_phone: "+48 12 345 67 89",
      website: "https://facebook.com/pizzeriaroma",
      rating: 4.3,
      reviews_count: 127,
      price_level: 2,
      category: "Restaurant",
      all_categories: ["Restaurant", "Pizza", "Italian"],
      opening_hours: [
        { day: "Monday", hours: "10:00–22:00" },
        { day: "Tuesday", hours: "10:00–22:00" },
      ],
      temporarily_closed: false,
      permanently_closed: false,
      description: "Best pizza in town",
      about: { "Service options": ["Dine-in", "Delivery"] },
      menu_url: "https://pizzeriaroma.menu/menu",
      reservation_url: null,
      order_url: "https://pyszne.pl/pizzeriaroma",
      owner_title: "Family-owned",
      plus_code: "3H4F+RX Kraków",
      street_view_available: true,
      photo_urls: [
        "https://lh5.googleusercontent.com/p/photo1",
        "https://lh5.googleusercontent.com/p/photo2",
      ],
      reviews: [
        {
          author: "Jan Kowalski",
          author_url: "https://maps.google.com/contrib/123",
          author_photo_url: "https://lh3.googleusercontent.com/a/photo",
          rating: 5,
          text: "Best pizza!",
          date: "3 months ago",
          language: "pl",
          likes_count: 5,
          owner_reply: { text: "Thank you!", date: "2 months ago" },
        },
      ],
    };

    const detail = parseBusinessDetail(raw);
    expect(detail.name).toBe("Pizzeria Roma");
    expect(detail.all_categories).toEqual(["Restaurant", "Pizza", "Italian"]);
    expect(detail.about).toEqual({ "Service options": ["Dine-in", "Delivery"] });
    expect(detail.photo_urls).toHaveLength(2);
    expect(detail.reviews).toHaveLength(1);
    expect(detail.reviews[0].owner_reply?.text).toBe("Thank you!");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/worker/parser.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement parser**

Create `src/worker/parser.ts`:

```typescript
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

export interface ParsedSearchResult {
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

export interface RawBusinessDetail {
  place_id: string;
  name: string;
  address: string;
  formatted_address: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  international_phone: string | null;
  website: string | null;
  rating: number | null;
  reviews_count: number;
  price_level: number | null;
  category: string;
  all_categories: string[];
  opening_hours: { day: string; hours: string }[] | null;
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

export interface ParsedBusinessDetail {
  place_id: string;
  name: string;
  address: string;
  formatted_address: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  international_phone: string | null;
  website: string | null;
  rating: number | null;
  reviews_count: number;
  price_level: number | null;
  category: string;
  all_categories: string[];
  opening_hours: { day: string; hours: string }[] | null;
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

export function parseSearchResults(
  raw: RawSearchResult[]
): ParsedSearchResult[] {
  return raw.map((r) => ({
    place_id: r.place_id,
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    address: r.address,
    category: r.category,
    rating: r.rating,
    reviews_count: r.reviews_count,
    website: r.website ?? null,
  }));
}

export function parseBusinessDetail(
  raw: RawBusinessDetail
): ParsedBusinessDetail {
  return {
    place_id: raw.place_id,
    name: raw.name,
    address: raw.address,
    formatted_address: raw.formatted_address,
    latitude: raw.latitude,
    longitude: raw.longitude,
    phone: raw.phone,
    international_phone: raw.international_phone,
    website: raw.website,
    rating: raw.rating,
    reviews_count: raw.reviews_count,
    price_level: raw.price_level,
    category: raw.category,
    all_categories: raw.all_categories ?? [],
    opening_hours: raw.opening_hours,
    temporarily_closed: raw.temporarily_closed ?? false,
    permanently_closed: raw.permanently_closed ?? false,
    description: raw.description,
    about: raw.about,
    menu_url: raw.menu_url,
    reservation_url: raw.reservation_url,
    order_url: raw.order_url,
    owner_title: raw.owner_title,
    plus_code: raw.plus_code,
    street_view_available: raw.street_view_available ?? false,
    photo_urls: raw.photo_urls ?? [],
    reviews: raw.reviews ?? [],
  };
}
```

**Important note for implementer:** This parser currently operates on a normalized interface (`RawSearchResult`, `RawBusinessDetail`). During Task 8 (Scraper Engine), you will intercept real Google Maps API responses and need to write a *raw response normalizer* that converts the actual Google Maps nested-array format into these interfaces. The normalizer will live in `scraper.ts` and feed normalized data into these parser functions. This separation keeps the parser testable with clean fixture data.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/worker/parser.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worker/parser.ts src/worker/parser.test.ts
git commit -m "feat: Google Maps response parser with normalized interfaces"
```

---

## Task 6: Media Downloader

**Files:**
- Create: `src/worker/media.ts`
- Read: `src/lib/types.ts`

- [ ] **Step 1: Implement media downloader**

Create `src/worker/media.ts`:

```typescript
import fs from "fs";
import path from "path";

const MEDIA_DIR = path.join(process.cwd(), "media");

export async function downloadPhotos(
  googlePlaceId: string,
  photoUrls: string[]
): Promise<{ filePath: string; sourceUrl: string }[]> {
  const placeDir = path.join(MEDIA_DIR, googlePlaceId);
  fs.mkdirSync(placeDir, { recursive: true });

  const results: { filePath: string; sourceUrl: string }[] = [];

  for (let i = 0; i < photoUrls.length; i++) {
    const url = photoUrls[i];
    try {
      const response = await fetch(url);
      if (!response.ok) continue;

      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = detectExtension(response.headers.get("content-type"));
      const filename = `${i}${ext}`;
      const filePath = path.join("media", googlePlaceId, filename);
      const absolutePath = path.join(MEDIA_DIR, googlePlaceId, filename);

      fs.writeFileSync(absolutePath, buffer);
      results.push({ filePath, sourceUrl: url });
    } catch (err) {
      console.error(`Failed to download photo ${i} for ${googlePlaceId}:`, err);
    }
  }

  return results;
}

function detectExtension(contentType: string | null): string {
  if (!contentType) return ".jpg";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  return ".jpg";
}
```

No unit tests here — this module does filesystem I/O and HTTP fetching, which is verified during integration testing in Task 8.

- [ ] **Step 2: Commit**

```bash
git add src/worker/media.ts
git commit -m "feat: media downloader for Google Maps photos"
```

---

## Task 7: Scraper Engine

**Files:**
- Create: `src/worker/scraper.ts`
- Read: `src/worker/parser.ts`, `src/worker/grid.ts`, `src/worker/media.ts`, `src/lib/website-filter.ts`, `src/lib/db.ts`, `src/lib/types.ts`

This is the core Playwright integration. It cannot be meaningfully unit tested — it depends on live Google Maps responses. Build it, then verify by running against a real city.

- [ ] **Step 1: Implement the scraper engine**

Create `src/worker/scraper.ts`:

```typescript
import { chromium, type Browser, type Page, type Route } from "playwright";
import { generateGrid, subdivideCell } from "./grid";
import {
  parseSearchResults,
  parseBusinessDetail,
  type RawSearchResult,
  type RawBusinessDetail,
  type ParsedSearchResult,
} from "./parser";
import { downloadPhotos } from "./media";
import { hasCustomWebsite } from "@/lib/website-filter";
import {
  getDb,
  insertBusiness,
  businessExists,
  updateJobProgress,
  linkJobBusiness,
} from "@/lib/db";
import type { BoundingBox } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

const SEARCH_DELAY_MIN = 2000;
const SEARCH_DELAY_MAX = 5000;
const MAX_RESULTS_PER_CELL = 20;
const INITIAL_GRID_STEP = 0.02; // ~2km cells

function delay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ScrapeCallbacks {
  onProgress: (update: {
    grid_cells_total: number;
    grid_cells_completed: number;
    businesses_found: number;
    businesses_skipped: number;
  }) => void;
}

export async function scrapeCity(
  jobId: string,
  city: string,
  searchQuery: string,
  callbacks: ScrapeCallbacks
): Promise<void> {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    // Block unnecessary resources to speed up loading
    await page.route("**/*.{png,jpg,jpeg,gif,svg,webp,woff,woff2,ttf}", (route: Route) =>
      route.abort()
    );
    await page.route("**/*.css", (route: Route) => route.abort());

    // Step 1: Geocode the city to get bounding box
    const bounds = await geocodeCity(page, city);

    // Step 2: Generate initial grid
    let cells = generateGrid(bounds, INITIAL_GRID_STEP);
    let totalCells = cells.length;
    let completedCells = 0;
    let foundCount = 0;
    let skippedCount = 0;

    callbacks.onProgress({
      grid_cells_total: totalCells,
      grid_cells_completed: 0,
      businesses_found: 0,
      businesses_skipped: 0,
    });

    // Step 3: Search each cell
    const cellQueue = [...cells];

    while (cellQueue.length > 0) {
      const cell = cellQueue.shift()!;

      const results = await searchCell(page, cell.bounds, searchQuery);
      await delay(SEARCH_DELAY_MIN, SEARCH_DELAY_MAX);

      // Adaptive subdivision if we hit the result cap
      if (results.length >= MAX_RESULTS_PER_CELL) {
        const subCells = subdivideCell(cell);
        cellQueue.unshift(...subCells);
        totalCells += subCells.length - 1; // replace 1 cell with 4
        callbacks.onProgress({
          grid_cells_total: totalCells,
          grid_cells_completed: completedCells,
          businesses_found: foundCount,
          businesses_skipped: skippedCount,
        });
        continue;
      }

      // Step 4: Process each result
      for (const result of results) {
        // Dedup check
        if (businessExists(result.place_id)) continue;

        // Website filter
        if (hasCustomWebsite(result.website)) {
          skippedCount++;
          continue;
        }

        // Detail scrape
        try {
          const detail = await scrapeDetail(page, result.place_id);
          await delay(SEARCH_DELAY_MIN, SEARCH_DELAY_MAX);

          if (!detail) continue;

          // Double-check website from detail (more complete data)
          if (hasCustomWebsite(detail.website)) {
            skippedCount++;
            continue;
          }

          // Download photos
          const photos = await downloadPhotos(
            detail.place_id,
            detail.photo_urls
          );

          // Insert business
          const businessId = uuidv4();
          insertBusiness({
            id: businessId,
            google_place_id: detail.place_id,
            name: detail.name,
            address: detail.address,
            formatted_address: detail.formatted_address,
            latitude: detail.latitude,
            longitude: detail.longitude,
            phone: detail.phone,
            international_phone: detail.international_phone,
            website_url: detail.website,
            rating: detail.rating,
            reviews_count: detail.reviews_count,
            price_level: detail.price_level,
            category: detail.category,
            all_categories: detail.all_categories,
            opening_hours: detail.opening_hours,
            temporarily_closed: detail.temporarily_closed,
            permanently_closed: detail.permanently_closed,
            description: detail.description,
            about: detail.about,
            menu_url: detail.menu_url,
            reservation_url: detail.reservation_url,
            order_url: detail.order_url,
            owner_title: detail.owner_title,
            plus_code: detail.plus_code,
            street_view_available: detail.street_view_available,
            scraped_at: new Date().toISOString(),
          });

          // Insert photos
          const db = getDb();
          for (let i = 0; i < photos.length; i++) {
            db.prepare(
              `INSERT INTO business_photos (id, business_id, file_path, source_url, is_primary, order_index)
               VALUES (?, ?, ?, ?, ?, ?)`
            ).run(uuidv4(), businessId, photos[i].filePath, photos[i].sourceUrl, i === 0 ? 1 : 0, i);
          }

          // Insert reviews
          for (const review of detail.reviews) {
            db.prepare(
              `INSERT INTO business_reviews (id, business_id, author, author_url, author_photo_url,
                rating, text, date, language, likes_count, owner_reply)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              uuidv4(),
              businessId,
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

          // Link job to business
          linkJobBusiness(jobId, businessId);
          foundCount++;
        } catch (err) {
          console.error(`Failed to scrape detail for ${result.place_id}:`, err);
        }
      }

      completedCells++;
      callbacks.onProgress({
        grid_cells_total: totalCells,
        grid_cells_completed: completedCells,
        businesses_found: foundCount,
        businesses_skipped: skippedCount,
      });
    }
  } finally {
    await browser.close();
  }
}

async function geocodeCity(page: Page, city: string): Promise<BoundingBox> {
  // Navigate to Google Maps and search for the city
  await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(city)}`);
  await page.waitForTimeout(3000);

  // Extract viewport bounds from the URL (Google Maps encodes bounds in the URL)
  // URL format: @lat,lng,zoom -> we need to compute bounds from center + zoom
  // Alternative: intercept the response that contains viewport data
  const url = page.url();
  const match = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),(\d+\.?\d*)z/);

  if (!match) {
    throw new Error(`Could not extract coordinates from Google Maps URL for "${city}"`);
  }

  const centerLat = parseFloat(match[1]);
  const centerLng = parseFloat(match[2]);
  const zoom = parseFloat(match[3]);

  // Approximate bounding box from center + zoom
  // At zoom 12, roughly 0.15 degrees of latitude visible
  const latSpan = 360 / Math.pow(2, zoom);
  const lngSpan = 360 / Math.pow(2, zoom);

  return {
    north: centerLat + latSpan / 2,
    south: centerLat - latSpan / 2,
    east: centerLng + lngSpan / 2,
    west: centerLng - lngSpan / 2,
  };
}

async function searchCell(
  page: Page,
  bounds: BoundingBox,
  query: string
): Promise<ParsedSearchResult[]> {
  // Navigate to Google Maps with the search query and bounds
  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLng = (bounds.east + bounds.west) / 2;

  // Calculate appropriate zoom level for the cell size
  const latSpan = bounds.north - bounds.south;
  const zoom = Math.round(Math.log2(360 / latSpan));

  const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${centerLat},${centerLng},${zoom}z`;

  // Set up response interception to capture search results
  const results: RawSearchResult[] = [];

  const responseHandler = async (response: any) => {
    const reqUrl = response.url();
    if (reqUrl.includes("/search") || reqUrl.includes("place")) {
      try {
        const text = await response.text();
        // Google Maps returns data prefixed with )]}' — strip it
        const cleaned = text.replace(/^\)\]\}'/, "");
        // Attempt to extract search results from the response
        // This will need refinement based on actual response format
        const parsed = extractSearchResultsFromResponse(cleaned);
        if (parsed.length > 0) {
          results.push(...parsed);
        }
      } catch {
        // Not all responses are parseable — ignore errors
      }
    }
  };

  page.on("response", responseHandler);

  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // Scroll the results panel to trigger loading more results
    const panel = page.locator('[role="feed"]');
    if (await panel.isVisible()) {
      await panel.evaluate((el: Element) => {
        el.scrollTop = el.scrollHeight;
      });
      await page.waitForTimeout(1500);
    }
  } finally {
    page.off("response", responseHandler);
  }

  return parseSearchResults(results);
}

function extractSearchResultsFromResponse(text: string): RawSearchResult[] {
  // Google Maps internal API returns nested arrays.
  // This function needs to be refined based on actual observed response format.
  // Starting with a best-effort parser that will be adjusted during testing.
  const results: RawSearchResult[] = [];

  try {
    // Try parsing as JSON (some endpoints return valid JSON)
    const data = JSON.parse(text);
    // Walk the nested structure to find place entries
    // This is a placeholder that will be refined when we can observe real responses
    if (Array.isArray(data)) {
      walkNestedArray(data, results);
    }
  } catch {
    // Not JSON — might be protobuf or other format
  }

  return results;
}

function walkNestedArray(arr: unknown[], results: RawSearchResult[]): void {
  // Heuristic: look for arrays that contain what looks like a place entry
  // A place entry typically has: name (string), place_id (starts with "ChIJ" or "0x"),
  // coordinates (pair of numbers), etc.
  for (const item of arr) {
    if (Array.isArray(item)) {
      // Check if this looks like a place entry
      if (
        item.length > 10 &&
        typeof item[11] === "string" // name is typically at a fixed index
      ) {
        try {
          const result = extractPlaceFromArray(item);
          if (result) results.push(result);
        } catch {
          // Not a place entry
        }
      }
      // Recurse
      walkNestedArray(item, results);
    }
  }
}

function extractPlaceFromArray(arr: unknown[]): RawSearchResult | null {
  // This is a best-effort extraction that will be refined.
  // Known indices in Google Maps nested array format (may vary):
  // These need to be verified against real responses.
  try {
    const name = findString(arr);
    const placeId = findPlaceId(arr);
    if (!name || !placeId) return null;

    const coords = findCoordinates(arr);

    return {
      place_id: placeId,
      name,
      latitude: coords?.lat ?? 0,
      longitude: coords?.lng ?? 0,
      address: findAddress(arr) ?? "",
      category: findCategory(arr) ?? "Unknown",
      rating: findRating(arr),
      reviews_count: 0,
      website: findWebsite(arr),
    };
  } catch {
    return null;
  }
}

function findPlaceId(arr: unknown[]): string | null {
  const flat = JSON.stringify(arr);
  const match = flat.match(/(ChIJ[\w-]+)/);
  return match ? match[1] : null;
}

function findString(arr: unknown[]): string | null {
  for (const item of arr) {
    if (typeof item === "string" && item.length > 1 && item.length < 200) {
      return item;
    }
  }
  return null;
}

function findCoordinates(
  arr: unknown[]
): { lat: number; lng: number } | null {
  const flat = JSON.stringify(arr);
  // Look for coordinate pairs (lat ~49-55 for Poland, lng ~14-24)
  const match = flat.match(/(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,2}\.\d{3,})/);
  if (match) {
    return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
  }
  return null;
}

function findAddress(arr: unknown[]): string | null {
  for (const item of arr) {
    if (typeof item === "string" && item.includes(",") && item.length > 5) {
      return item;
    }
  }
  return null;
}

function findCategory(arr: unknown[]): string | null {
  // Categories in Google Maps are often in a sub-array
  for (const item of arr) {
    if (Array.isArray(item)) {
      for (const sub of item) {
        if (typeof sub === "string" && sub.length < 50 && !sub.includes("http")) {
          return sub;
        }
      }
    }
  }
  return null;
}

function findRating(arr: unknown[]): number | null {
  for (const item of arr) {
    if (typeof item === "number" && item >= 1 && item <= 5) {
      return item;
    }
  }
  return null;
}

function findWebsite(arr: unknown[]): string | null {
  const flat = JSON.stringify(arr);
  const match = flat.match(/(https?:\/\/[^\s"\\,]+)/);
  return match ? match[1] : null;
}

async function scrapeDetail(
  page: Page,
  placeId: string
): Promise<ParsedBusinessDetail | null> {
  // Navigate to the place detail page
  const url = `https://www.google.com/maps/place/?q=place_id:${placeId}`;

  let detailData: RawBusinessDetail | null = null;

  const responseHandler = async (response: any) => {
    const reqUrl = response.url();
    if (reqUrl.includes("place") || reqUrl.includes("getdetails")) {
      try {
        const text = await response.text();
        const cleaned = text.replace(/^\)\]\}'/, "");
        const parsed = extractDetailFromResponse(cleaned, placeId);
        if (parsed) detailData = parsed;
      } catch {
        // Ignore
      }
    }
  };

  page.on("response", responseHandler);

  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    // If interception didn't capture enough, fall back to DOM scraping
    if (!detailData) {
      detailData = await scrapeDetailFromDOM(page, placeId);
    }
  } finally {
    page.off("response", responseHandler);
  }

  return detailData ? parseBusinessDetail(detailData) : null;
}

function extractDetailFromResponse(
  text: string,
  placeId: string
): RawBusinessDetail | null {
  // Similar to search results — parse nested array format
  // Will be refined based on actual response format
  try {
    const data = JSON.parse(text);
    // TODO: Extract detail fields from nested array structure
    // This requires observing the actual response format
    return null;
  } catch {
    return null;
  }
}

async function scrapeDetailFromDOM(
  page: Page,
  placeId: string
): Promise<RawBusinessDetail | null> {
  // Fallback: extract data directly from the DOM
  try {
    const name = await page.locator("h1").first().textContent();
    if (!name) return null;

    // Extract various fields from the page
    const address = await safeText(page, '[data-item-id="address"]');
    const phone = await safeText(page, '[data-item-id="phone"]');
    const website = await safeAttr(page, 'a[data-item-id="authority"]', "href");

    const ratingText = await safeText(page, '[role="img"][aria-label*="stars"]');
    const rating = ratingText ? parseFloat(ratingText) : null;

    const reviewsText = await safeText(page, 'button[jsaction*="review"]');
    const reviewsMatch = reviewsText?.match(/(\d+)/);
    const reviewsCount = reviewsMatch ? parseInt(reviewsMatch[1]) : 0;

    const category = await safeText(page, 'button[jsaction*="category"]');

    // Get coordinates from URL
    const pageUrl = page.url();
    const coordMatch = pageUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    const latitude = coordMatch ? parseFloat(coordMatch[1]) : 0;
    const longitude = coordMatch ? parseFloat(coordMatch[2]) : 0;

    // Get photo URLs from the page
    const photoUrls = await page.evaluate(() => {
      const imgs = document.querySelectorAll('img[src*="googleusercontent"]');
      return Array.from(imgs)
        .map((img) => (img as HTMLImageElement).src)
        .filter((src) => src.includes("/p/"))
        .slice(0, 20);
    });

    return {
      place_id: placeId,
      name: name.trim(),
      address: address ?? "",
      formatted_address: address ?? "",
      latitude,
      longitude,
      phone: phone,
      international_phone: phone,
      website: website,
      rating,
      reviews_count: reviewsCount,
      price_level: null,
      category: category ?? "Unknown",
      all_categories: category ? [category] : [],
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
      photo_urls: photoUrls,
      reviews: [],
    };
  } catch (err) {
    console.error(`DOM scraping failed for ${placeId}:`, err);
    return null;
  }
}

async function safeText(page: Page, selector: string): Promise<string | null> {
  try {
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 1000 })) {
      return await el.textContent();
    }
  } catch {}
  return null;
}

async function safeAttr(
  page: Page,
  selector: string,
  attr: string
): Promise<string | null> {
  try {
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 1000 })) {
      return await el.getAttribute(attr);
    }
  } catch {}
  return null;
}

type ParsedBusinessDetail = ReturnType<typeof parseBusinessDetail>;
```

**Key implementer notes:**
- The response interception and parsing functions (`extractSearchResultsFromResponse`, `extractDetailFromResponse`, `walkNestedArray`, etc.) are best-effort implementations. Google Maps' internal API uses nested arrays with no stable schema. **After first run, inspect the actual intercepted responses and adjust index positions and extraction logic accordingly.**
- The DOM scraping fallback (`scrapeDetailFromDOM`) provides a safety net when interception fails.
- Both approaches need manual refinement after observing real page structure. Run a single test scrape first and iterate.

- [ ] **Step 2: Verify the module compiles**

```bash
npx tsc --noEmit src/worker/scraper.ts
```

If there are type errors, fix them.

- [ ] **Step 3: Commit**

```bash
git add src/worker/scraper.ts
git commit -m "feat: Playwright scraper engine with API interception and DOM fallback"
```

---

## Task 8: Worker Process

**Files:**
- Create: `src/worker/index.ts`
- Read: `src/lib/db.ts`, `src/worker/scraper.ts`

- [ ] **Step 1: Implement the worker entry point**

Create `src/worker/index.ts`:

```typescript
import { initSchema, getDb, getJob, updateJobProgress, listJobs } from "@/lib/db";
import { scrapeCity } from "./scraper";

const POLL_INTERVAL = 3000;

async function main(): Promise<void> {
  console.log("GM Scraper Worker starting...");

  // Initialize database
  initSchema();

  // Reset any jobs stuck in "running" state (from previous crash)
  const db = getDb();
  const stuck = db
    .prepare("UPDATE scrape_jobs SET status = 'pending', updated_at = ? WHERE status = 'running'")
    .run(new Date().toISOString());
  if (stuck.changes > 0) {
    console.log(`Reset ${stuck.changes} stuck job(s) to pending.`);
  }

  console.log("Worker ready. Polling for jobs...");

  // Poll for pending jobs
  while (true) {
    const pendingJob = db
      .prepare(
        "SELECT * FROM scrape_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
      )
      .get() as any;

    if (pendingJob) {
      console.log(`Starting job ${pendingJob.id}: "${pendingJob.search_query}" in ${pendingJob.city}`);

      updateJobProgress(pendingJob.id, { status: "running" });

      try {
        await scrapeCity(pendingJob.id, pendingJob.city, pendingJob.search_query, {
          onProgress: (update) => {
            updateJobProgress(pendingJob.id, {
              ...update,
              status: "running",
            });
          },
        });

        updateJobProgress(pendingJob.id, { status: "completed" });
        console.log(`Job ${pendingJob.id} completed.`);
      } catch (err: any) {
        console.error(`Job ${pendingJob.id} failed:`, err);

        const isBlocked =
          err.message?.includes("captcha") ||
          err.message?.includes("blocked") ||
          err.message?.includes("unusual traffic");

        updateJobProgress(pendingJob.id, {
          status: isBlocked ? "blocked" : "failed",
          error_message: err.message ?? "Unknown error",
        });
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

main().catch((err) => {
  console.error("Worker crashed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify the worker starts (briefly)**

```bash
timeout 5 npm run worker || true
```

Expected: Worker prints "GM Scraper Worker starting..." and "Worker ready. Polling for jobs..." then times out (no jobs to process). Verify it doesn't crash.

- [ ] **Step 3: Commit**

```bash
git add src/worker/index.ts
git commit -m "feat: worker process with job polling and crash recovery"
```

---

## Task 9: Jobs API Routes

**Files:**
- Create: `src/app/api/jobs/route.ts`, `src/app/api/jobs/[id]/progress/route.ts`
- Read: `src/lib/db.ts`, `src/lib/types.ts`

- [ ] **Step 1: Implement jobs list + create endpoint**

Create `src/app/api/jobs/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { initSchema, createJob, listJobs } from "@/lib/db";

function ensureDb() {
  try {
    initSchema();
  } catch {
    // Already initialized
  }
}

export async function GET() {
  ensureDb();
  const jobs = listJobs();
  return NextResponse.json(jobs);
}

export async function POST(request: NextRequest) {
  ensureDb();
  const body = await request.json();
  const { city, search_query } = body;

  if (!city || !search_query) {
    return NextResponse.json(
      { error: "city and search_query are required" },
      { status: 400 }
    );
  }

  const job = createJob(city.trim(), search_query.trim());
  return NextResponse.json(job, { status: 201 });
}
```

- [ ] **Step 2: Implement SSE progress endpoint**

Create `src/app/api/jobs/[id]/progress/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { initSchema, getJob } from "@/lib/db";

function ensureDb() {
  try {
    initSchema();
  } catch {
    // Already initialized
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDb();
  const { id } = await params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Poll the job status and send updates
      let lastUpdatedAt = "";
      let consecutiveNoChange = 0;

      const interval = setInterval(() => {
        try {
          const job = getJob(id);
          if (!job) {
            sendEvent({ error: "Job not found" });
            clearInterval(interval);
            controller.close();
            return;
          }

          // Only send if data changed
          if (job.updated_at !== lastUpdatedAt) {
            lastUpdatedAt = job.updated_at;
            consecutiveNoChange = 0;
            sendEvent(job);
          } else {
            consecutiveNoChange++;
          }

          // Close stream when job is done
          if (
            job.status === "completed" ||
            job.status === "failed" ||
            job.status === "blocked"
          ) {
            sendEvent(job);
            clearInterval(interval);
            controller.close();
          }

          // Close if client likely disconnected (5 minutes no change)
          if (consecutiveNoChange > 300) {
            clearInterval(interval);
            controller.close();
          }
        } catch {
          clearInterval(interval);
          controller.close();
        }
      }, 1000);

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 3: Verify the routes load**

```bash
npm run build
```

Expected: Successful build. Fix any type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/jobs/
git commit -m "feat: jobs API routes with SSE progress streaming"
```

---

## Task 10: Businesses API Routes

**Files:**
- Create: `src/app/api/businesses/route.ts`, `src/app/api/businesses/[id]/route.ts`
- Read: `src/lib/db.ts`

- [ ] **Step 1: Implement businesses list endpoint**

Create `src/app/api/businesses/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { initSchema, listBusinesses } from "@/lib/db";

function ensureDb() {
  try {
    initSchema();
  } catch {}
}

export async function GET(request: NextRequest) {
  ensureDb();
  const search = request.nextUrl.searchParams.get("search") ?? undefined;
  const businesses = listBusinesses(search);
  return NextResponse.json(businesses);
}
```

- [ ] **Step 2: Implement business detail + delete endpoint**

Create `src/app/api/businesses/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { initSchema, getBusiness, deleteBusiness, getDb } from "@/lib/db";
import type { BusinessPhoto, BusinessReview } from "@/lib/types";
import fs from "fs";
import path from "path";

function ensureDb() {
  try {
    initSchema();
  } catch {}
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDb();
  const { id } = await params;
  const business = getBusiness(id);

  if (!business) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch photos and reviews
  const db = getDb();
  const photos = db
    .prepare(
      "SELECT * FROM business_photos WHERE business_id = ? ORDER BY order_index"
    )
    .all(id) as BusinessPhoto[];

  const reviews = db
    .prepare(
      "SELECT * FROM business_reviews WHERE business_id = ? ORDER BY likes_count DESC"
    )
    .all(id) as any[];

  // Deserialize owner_reply JSON
  const parsedReviews: BusinessReview[] = reviews.map((r) => ({
    ...r,
    owner_reply: r.owner_reply ? JSON.parse(r.owner_reply) : null,
  }));

  return NextResponse.json({
    ...business,
    photos,
    reviews: parsedReviews,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDb();
  const { id } = await params;

  // Get business to find media directory
  const business = getBusiness(id);
  if (!business) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete media files
  const mediaDir = path.join(
    process.cwd(),
    "media",
    business.google_place_id
  );
  if (fs.existsSync(mediaDir)) {
    fs.rmSync(mediaDir, { recursive: true });
  }

  // Delete from database (cascades to photos, reviews)
  deleteBusiness(id);

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Success.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/businesses/
git commit -m "feat: businesses API routes with detail, search, and delete"
```

---

## Task 11: Dashboard Page

**Files:**
- Create: `src/components/job-form.tsx`, `src/components/job-card.tsx`
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`
- Read: `src/lib/types.ts`

- [ ] **Step 1: Update root layout with navigation**

Replace contents of `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: "GM Scraper",
  description: "Google Maps business scraper",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <nav className="border-b border-border px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg">
            GM Scraper
          </Link>
          <div className="flex gap-6 text-sm">
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <Link
              href="/businesses"
              className="text-muted-foreground hover:text-foreground"
            >
              Businesses
            </Link>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Create job form component**

Create `src/components/job-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function JobForm({ onCreated }: { onCreated: () => void }) {
  const [city, setCity] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!city.trim() || !query.trim()) return;

    setLoading(true);
    try {
      await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: city.trim(), search_query: query.trim() }),
      });
      setCity("");
      setQuery("");
      onCreated();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-4 mb-6">
      <p className="text-sm text-muted-foreground mb-3">New Scrape Job</p>
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground mb-1 block">City</label>
          <Input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Kraków"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted-foreground mb-1 block">
            Search Query
          </label>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. restaurants"
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Start Scrape"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Create job card component with SSE**

Create `src/components/job-card.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { ScrapeJob } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-900 text-yellow-300",
  running: "bg-cyan-900 text-cyan-300",
  completed: "bg-green-900 text-green-300",
  failed: "bg-red-900 text-red-300",
  blocked: "bg-orange-900 text-orange-300",
};

export function JobCard({ job: initialJob }: { job: ScrapeJob }) {
  const [job, setJob] = useState(initialJob);

  useEffect(() => {
    if (job.status !== "pending" && job.status !== "running") return;

    const eventSource = new EventSource(`/api/jobs/${job.id}/progress`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!data.error) setJob(data);
      } catch {}
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [job.id, job.status]);

  const progress =
    job.grid_cells_total > 0
      ? Math.round((job.grid_cells_completed / job.grid_cells_total) * 100)
      : 0;

  return (
    <Card className="mb-3">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="font-medium">{job.city}</span>
            <span className="text-muted-foreground mx-2">&middot;</span>
            <span className="text-muted-foreground">{job.search_query}</span>
          </div>
          <Badge className={STATUS_STYLES[job.status] ?? ""}>{job.status}</Badge>
        </div>

        {(job.status === "running" || job.status === "completed") && (
          <>
            <Progress value={progress} className="mb-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                Grid: {job.grid_cells_completed}/{job.grid_cells_total} cells
              </span>
              <span className="text-green-400">Found: {job.businesses_found}</span>
              <span className="text-orange-400">
                Skipped: {job.businesses_skipped}
              </span>
            </div>
          </>
        )}

        {job.error_message && (
          <p className="text-sm text-red-400 mt-2">{job.error_message}</p>
        )}

        <p className="text-xs text-muted-foreground mt-2">
          {new Date(job.created_at).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Implement dashboard page**

Replace contents of `src/app/page.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { JobForm } from "@/components/job-form";
import { JobCard } from "@/components/job-card";
import type { ScrapeJob } from "@/lib/types";

export default function DashboardPage() {
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);

  const fetchJobs = useCallback(async () => {
    const res = await fetch("/api/jobs");
    const data = await res.json();
    setJobs(data);
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const activeJobs = jobs.filter(
    (j) => j.status === "pending" || j.status === "running"
  );
  const completedJobs = jobs.filter(
    (j) => j.status === "completed" || j.status === "failed" || j.status === "blocked"
  );

  return (
    <div>
      <JobForm onCreated={fetchJobs} />

      {activeJobs.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm text-muted-foreground mb-3">Active Jobs</h2>
          {activeJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      {completedJobs.length > 0 && (
        <div>
          <h2 className="text-sm text-muted-foreground mb-3">Completed</h2>
          {completedJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      {jobs.length === 0 && (
        <p className="text-center text-muted-foreground mt-12">
          No scrape jobs yet. Create one above to get started.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Expected: Success.

- [ ] **Step 6: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx src/components/job-form.tsx src/components/job-card.tsx
git commit -m "feat: dashboard page with job form and live progress cards"
```

---

## Task 12: Business List Page

**Files:**
- Create: `src/components/business-table.tsx`, `src/app/businesses/page.tsx`
- Read: `src/lib/types.ts`

- [ ] **Step 1: Create business table component**

Create `src/components/business-table.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Business } from "@/lib/types";

export function BusinessTable({
  businesses,
  onDelete,
}: {
  businesses: Business[];
  onDelete: (id: string) => void;
}) {
  const [deleteTarget, setDeleteTarget] = useState<Business | null>(null);

  const handleDelete = () => {
    if (deleteTarget) {
      onDelete(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Rating</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {businesses.map((biz) => (
            <TableRow key={biz.id}>
              <TableCell>
                <Link
                  href={`/businesses/${biz.id}`}
                  className="font-medium hover:underline"
                >
                  {biz.name}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{biz.category}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{biz.address}</TableCell>
              <TableCell className="text-yellow-400">
                {biz.rating ? `★ ${biz.rating}` : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {biz.phone ?? "—"}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-300"
                  onClick={() => setDeleteTarget(biz)}
                >
                  ✕
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete business?</DialogTitle>
            <DialogDescription>
              This will permanently delete &ldquo;{deleteTarget?.name}&rdquo; and all its
              photos and reviews. This business will be eligible for re-scraping.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Create business list page**

Create `src/app/businesses/page.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { BusinessTable } from "@/components/business-table";
import type { Business } from "@/lib/types";

export default function BusinessesPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [search, setSearch] = useState("");

  const fetchBusinesses = useCallback(async () => {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    const res = await fetch(`/api/businesses${params}`);
    const data = await res.json();
    setBusinesses(data);
  }, [search]);

  useEffect(() => {
    fetchBusinesses();
  }, [fetchBusinesses]);

  const handleDelete = async (id: string) => {
    await fetch(`/api/businesses/${id}`, { method: "DELETE" });
    fetchBusinesses();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">
          Businesses{" "}
          <span className="text-muted-foreground text-base font-normal">
            ({businesses.length})
          </span>
        </h1>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, category, address..."
          className="w-80"
        />
      </div>

      {businesses.length > 0 ? (
        <BusinessTable businesses={businesses} onDelete={handleDelete} />
      ) : (
        <p className="text-center text-muted-foreground mt-12">
          {search
            ? "No businesses match your search."
            : "No businesses scraped yet."}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Success.

- [ ] **Step 4: Commit**

```bash
git add src/components/business-table.tsx src/app/businesses/page.tsx
git commit -m "feat: business list page with search and delete"
```

---

## Task 13: Business Detail Page

**Files:**
- Create: `src/components/business-detail.tsx`, `src/app/businesses/[id]/page.tsx`
- Read: `src/lib/types.ts`

- [ ] **Step 1: Create business detail component**

Create `src/components/business-detail.tsx`:

```tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { Business, BusinessPhoto, BusinessReview } from "@/lib/types";

interface BusinessDetailProps {
  business: Business & { photos: BusinessPhoto[]; reviews: BusinessReview[] };
}

export function BusinessDetail({ business }: BusinessDetailProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{business.name}</h1>
        <div className="flex gap-2 mt-1 flex-wrap">
          {business.all_categories.map((cat) => (
            <Badge key={cat} variant="secondary">
              {cat}
            </Badge>
          ))}
        </div>
        <div className="flex gap-3 mt-2 text-sm">
          {business.rating && (
            <span className="text-yellow-400">
              ★ {business.rating} ({business.reviews_count} reviews)
            </span>
          )}
          {business.price_level !== null && (
            <span className="text-muted-foreground">
              {"$".repeat(business.price_level + 1)}
            </span>
          )}
        </div>
      </div>

      {/* Contact + Hours */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs uppercase text-muted-foreground mb-2">Contact</p>
            <div className="space-y-1 text-sm">
              <p>{business.formatted_address}</p>
              {business.phone && <p>{business.phone}</p>}
              {business.international_phone &&
                business.international_phone !== business.phone && (
                  <p className="text-muted-foreground">{business.international_phone}</p>
                )}
              {business.website_url && (
                <p className="text-blue-400 break-all">{business.website_url}</p>
              )}
              {business.menu_url && (
                <a
                  href={business.menu_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline block"
                >
                  Menu
                </a>
              )}
            </div>
          </CardContent>
        </Card>

        {business.opening_hours && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs uppercase text-muted-foreground mb-2">Hours</p>
              <div className="space-y-1 text-sm text-muted-foreground">
                {business.opening_hours.map((h) => (
                  <div key={h.day} className="flex justify-between">
                    <span>{h.day}</span>
                    <span>{h.hours}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* About / Amenities */}
      {business.about && Object.keys(business.about).length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs uppercase text-muted-foreground mb-2">About</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(business.about).flatMap(([group, items]) =>
                items.map((item) => (
                  <Badge key={`${group}-${item}`} variant="outline">
                    {item}
                  </Badge>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Photos */}
      {business.photos.length > 0 && (
        <div>
          <p className="text-xs uppercase text-muted-foreground mb-2">
            Photos ({business.photos.length})
          </p>
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-3">
              {business.photos.map((photo) => (
                <img
                  key={photo.id}
                  src={`/${photo.file_path}`}
                  alt={business.name}
                  className="h-32 w-auto rounded-md object-cover"
                />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      )}

      {/* Reviews */}
      {business.reviews.length > 0 && (
        <div>
          <p className="text-xs uppercase text-muted-foreground mb-2">
            Reviews ({business.reviews.length})
          </p>
          <div className="space-y-3">
            {business.reviews.map((review) => (
              <Card key={review.id}>
                <CardContent className="pt-4">
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-sm">{review.author}</span>
                    <span className="text-yellow-400 text-sm">
                      {"★".repeat(review.rating)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{review.text}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {review.date}
                    {review.likes_count > 0 && ` · ${review.likes_count} likes`}
                  </p>
                  {review.owner_reply && (
                    <div className="mt-2 ml-4 pl-3 border-l-2 border-border">
                      <p className="text-xs text-muted-foreground">Owner reply:</p>
                      <p className="text-sm text-muted-foreground">
                        {review.owner_reply.text}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Future placeholder */}
      {/* Reserved for website project status integration */}
    </div>
  );
}
```

- [ ] **Step 2: Create business detail page**

Create `src/app/businesses/[id]/page.tsx`:

```tsx
"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BusinessDetail } from "@/components/business-detail";

export default function BusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [business, setBusiness] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    fetch(`/api/businesses/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then(setBusiness)
      .catch(() => setBusiness(null))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    await fetch(`/api/businesses/${id}`, { method: "DELETE" });
    router.push("/businesses");
  };

  if (loading) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  if (!business) {
    return <p className="text-muted-foreground">Business not found.</p>;
  }

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <Button variant="ghost" onClick={() => router.back()}>
          &larr; Back
        </Button>
        <Button variant="destructive" onClick={() => setShowDelete(true)}>
          Delete
        </Button>
      </div>

      <BusinessDetail business={business} />

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete business?</DialogTitle>
            <DialogDescription>
              This will permanently delete &ldquo;{business.name}&rdquo; and all its
              photos and reviews.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Success.

- [ ] **Step 4: Commit**

```bash
git add src/components/business-detail.tsx src/app/businesses/
git commit -m "feat: business detail page with photos, reviews, and delete"
```

---

## Task 14: Static Media Serving + Final Wiring

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Configure Next.js to serve media files**

Update `next.config.ts` to serve the `media/` directory as static files:

```typescript
import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Serve media files from the media directory
  async rewrites() {
    return [
      {
        source: "/media/:path*",
        destination: "/api/media/:path*",
      },
    ];
  },
};

export default nextConfig;
```

Then create `src/app/api/media/[...path]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const filePath = path.join(process.cwd(), "media", ...segments);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : "image/jpeg";

  return new NextResponse(buffer, {
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=86400" },
  });
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Success.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts src/app/api/media/
git commit -m "feat: media file serving for business photos"
```

---

## Task 15: Smoke Test

**Files:** None (manual verification)

- [ ] **Step 1: Start the application**

In one terminal:
```bash
npm run dev
```

In another terminal:
```bash
npm run worker
```

- [ ] **Step 2: Verify the dashboard loads**

Open `http://localhost:3000` in a browser. Verify:
- Navigation shows "GM Scraper" with Dashboard and Businesses links
- Job form displays with City and Search Query inputs
- "No scrape jobs yet" message shows

- [ ] **Step 3: Create a test scrape job**

In the dashboard, enter:
- City: "Kraków"
- Search Query: "fryzjer" (hairdresser — small category for quick test)

Click "Start Scrape". Verify:
- Job appears in Active Jobs with "pending" badge
- Progress bar appears when worker picks it up
- Counts update in real time

- [ ] **Step 4: Verify business list**

Navigate to `/businesses`. Verify:
- Scraped businesses appear in the table
- Search filtering works
- Click a business name to go to detail

- [ ] **Step 5: Verify business detail**

On a detail page, verify:
- All available data displays (name, address, rating, category, hours)
- Photos load from `/media/` path
- Reviews display with ratings
- Delete button works (returns to list, business gone)

- [ ] **Step 6: Observe scraper behavior**

Monitor the worker terminal output. Check:
- Grid generation and progress logging
- Businesses with custom websites are skipped
- Photos download successfully
- No unhandled errors

- [ ] **Step 7: Iterate on scraper parsing**

**This is the critical refinement step.** After observing the real Google Maps responses intercepted by Playwright:
1. Check the worker console for any parsing issues
2. Adjust `extractSearchResultsFromResponse` and `walkNestedArray` in `src/worker/scraper.ts` based on the actual response format
3. Adjust `extractDetailFromResponse` similarly
4. If the DOM fallback is needed more than API interception, enhance `scrapeDetailFromDOM`

This is exploratory work — iterate until data extraction is reliable.

- [ ] **Step 8: Commit any refinements**

```bash
git add -A
git commit -m "fix: refine scraper parsing based on live response format"
```

- [ ] **Step 9: Run all tests**

```bash
npm test
```

Expected: All unit tests pass.

- [ ] **Step 10: Final commit**

```bash
git add -A
git commit -m "chore: smoke test verified, all systems working"
```
