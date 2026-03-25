# GM Scraper — Design Spec

Google Maps scraper that extracts local businesses without custom websites from a specified city, stores structured data in SQLite, and provides a web interface for job management and browsing results.

## Purpose

The user wants to identify local businesses (restaurants, repair shops, stores, etc.) that don't have their own website — as potential clients for web development services. The tool scrapes Google Maps for a given city and search query, filters out businesses that already have a custom website, and stores everything in a browsable local database.

## Architecture

Two-process design unified by SQLite:

### Process 1: Next.js App

Full TypeScript Next.js application serving both the frontend UI (React + shadcn components) and API routes.

**API Routes:**
- `POST /api/jobs` — create a new scrape job (city + search query)
- `GET /api/jobs` — list all jobs with status
- `GET /api/jobs/[id]/progress` — SSE stream for real-time progress updates
- `GET /api/businesses` — list/search businesses (with pagination, filtering)
- `GET /api/businesses/[id]` — full business detail
- `DELETE /api/businesses/[id]` — remove a business (cascade deletes photos/reviews, enables re-scraping)

### Process 2: Scraper Worker

Long-running Node.js process (same codebase, separate entry point: `npm run worker`). Polls the `scrape_jobs` table for pending jobs and executes them using Playwright with API response interception.

### Shared State: SQLite

SQLite is the single source of truth and communication layer between the two processes. The worker writes progress updates to the job row; the Next.js SSE endpoint polls and streams these to the frontend.

### Media Storage: `/media`

Photos stored as files in `/media/{google_place_id}/`, referenced by file path in the database.

## Database Schema

### `scrape_jobs`

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | Primary key |
| city | TEXT | User-provided city name |
| search_query | TEXT | e.g. "restaurants" |
| status | TEXT | pending / running / completed / failed / blocked |
| grid_cells_total | INTEGER | Total grid cells to scrape |
| grid_cells_completed | INTEGER | Cells finished so far |
| businesses_found | INTEGER | Count of businesses saved |
| businesses_skipped | INTEGER | Count skipped (has website) |
| error_message | TEXT | Nullable, set on failure |
| created_at | TEXT (ISO) | Job creation timestamp |
| updated_at | TEXT (ISO) | Last status update |

### `businesses`

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | Primary key |
| google_place_id | TEXT | Unique constraint — deduplication key |
| name | TEXT | Business name |
| address | TEXT | Short address |
| formatted_address | TEXT | Full formatted address |
| latitude | REAL | |
| longitude | REAL | |
| phone | TEXT | Local phone number |
| international_phone | TEXT | International format |
| website_url | TEXT | Kept only if social/directory link |
| rating | REAL | 1.0–5.0 |
| reviews_count | INTEGER | |
| price_level | INTEGER | 0–4 |
| category | TEXT | Primary category |
| all_categories | TEXT (JSON) | Array of all categories |
| opening_hours | TEXT (JSON) | Structured per-day hours |
| temporarily_closed | INTEGER | Boolean 0/1 |
| permanently_closed | INTEGER | Boolean 0/1 |
| description | TEXT | Business-provided description |
| about | TEXT (JSON) | Accessibility, amenities, highlights, offerings, etc. |
| menu_url | TEXT | Link to menu if available |
| reservation_url | TEXT | Booking links |
| order_url | TEXT | Delivery/order links |
| owner_title | TEXT | e.g. "Family-owned" |
| plus_code | TEXT | Plus Code location |
| street_view_available | INTEGER | Boolean 0/1 |
| scraped_at | TEXT (ISO) | When this business was scraped |

### `business_photos`

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | Primary key |
| business_id | TEXT | FK → businesses.id (CASCADE DELETE) |
| file_path | TEXT | Relative path to media file |
| source_url | TEXT | Original Google Maps URL |
| is_primary | INTEGER | Boolean 0/1 |
| order_index | INTEGER | Display order |

### `business_reviews`

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | Primary key |
| business_id | TEXT | FK → businesses.id (CASCADE DELETE) |
| author | TEXT | Reviewer name |
| author_url | TEXT | Profile URL |
| author_photo_url | TEXT | Profile photo URL |
| rating | INTEGER | 1–5 |
| text | TEXT | Review content |
| date | TEXT | Review date |
| language | TEXT | Language code |
| likes_count | INTEGER | Number of likes |
| owner_reply | TEXT (JSON) | {text, date} if owner replied |

### `scrape_job_businesses`

| Column | Type | Notes |
|--------|------|-------|
| job_id | TEXT | FK → scrape_jobs.id |
| business_id | TEXT | FK → businesses.id |
| PRIMARY KEY | | (job_id, business_id) |

## Scraping Engine

### Grid-Based Area Coverage

1. **Geocode the city** — Search the city name in Google Maps via Playwright, intercept the response to get viewport bounds (bounding box).
2. **Generate grid** — Subdivide the bounding box into cells. Start with a coarse grid and adaptively subdivide cells that hit Google Maps' result cap (~20 results per viewport).
3. **Search each cell** — Position the Playwright viewport over each grid cell, perform the search query, intercept the network responses containing place list data.

### Data Extraction Pipeline

1. **Search results** → extract `place_id` + basic info per business
2. **Deduplication** → check `google_place_id` against database, skip existing
3. **Website filter** → check the website field against a blocklist of social/directory domains (facebook.com, instagram.com, yelp.com, linkedin.com, twitter.com, tiktok.com, youtube.com, etc.). If the website is a custom domain (not on the blocklist), skip the business. If no website or only social links, keep it.
4. **Detail scraping** → navigate to each passing business's place page, intercept API responses to capture all fields (hours, reviews, about data, photo URLs, menus, etc.)
5. **Media download** → download photos from intercepted URLs, save to `/media/{google_place_id}/`
6. **Progress updates** → update the `scrape_jobs` row after each grid cell and batch of details

### API Interception Strategy

Playwright intercepts network responses from Google Maps' internal endpoints rather than parsing the DOM. This gives structured data (JSON/protobuf) that is more reliable than scraping HTML elements. The browser handles session management, cookies, and anti-bot measures naturally.

### Rate Limiting

Random delays between requests (2–5 seconds). Single browser instance, sequential processing. This is a local tool scraping one city at a time — throughput is not a priority, reliability is.

### Idempotency

- `google_place_id` unique constraint prevents duplicate entries
- A business already in the database is skipped regardless of which job encounters it
- Deleting a business via the UI removes its database entry (cascade deletes photos/reviews), making it eligible for re-scraping

## Web Interface

Built with Next.js (React) and shadcn components.

### Dashboard (Home Page — `/`)

- **New Job form** at the top: city name input + search query input + "Start Scrape" button
- **Active jobs** section: cards showing city, query, status badge, live progress bar (grid cells completed/total), real-time counts (found/skipped) via SSE
- **Completed jobs** section: past jobs with final counts and timestamps

### Business List (`/businesses`)

- Searchable, filterable table of all scraped businesses
- Columns: name, category, address, rating, phone
- Text search filtering by name/category/address
- Delete button per row (with confirmation dialog)
- Rows link to detail page

### Business Detail (`/businesses/[id]`)

- **Header**: name, categories, rating, price level, delete button
- **Contact card**: address, phone, website (if social only)
- **Hours card**: structured opening hours per day
- **About section**: amenities, accessibility, highlights as tag badges
- **Photos**: horizontal scrollable gallery of downloaded photos
- **Reviews**: list of reviews with author, rating, text, date, likes, owner replies
- **Placeholder section** (hidden): reserved space for future "Website Project Status" integration

### shadcn Components Used

Table, Card, Button, Input, Dialog, Progress, Badge, Tabs, ScrollArea

## Error Handling

- **Google blocks/CAPTCHAs** — Pause the job with status `blocked`, log the error. User can see this on the dashboard and retry.
- **Individual place scrape failure** — Mark as errored in logs, continue to next business. Don't fail the entire job.
- **Grid cell hits result cap** — Automatically subdivide into 4 smaller cells and re-scrape each for complete coverage.
- **Worker crash mid-job** — Job stays `running` in the database. On worker restart, reset any `running` jobs back to `pending` to resume.
- **Duplicate across jobs** — Same business found by "restaurants" and "pizza" is deduplicated by `google_place_id` via the junction table `scrape_job_businesses`.

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Next.js (App Router)
- **UI**: React + shadcn/ui
- **Database**: SQLite via better-sqlite3
- **Scraping**: Playwright (Chromium)
- **Real-time**: Server-Sent Events (SSE)

## Out of Scope (Future)

- Website prototyping progress integration (detail page has placeholder)
- Map visualization of scraped businesses
- Export functionality (CSV, etc.)
- Multi-city concurrent scraping
- Automated scheduling / recurring scrapes
