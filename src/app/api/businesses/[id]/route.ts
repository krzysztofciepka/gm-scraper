import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { initSchema, getBusiness, deleteBusiness, getDb } from "@/lib/db";

function ensureDb() {
  try { initSchema(); } catch { /* already initialized */ }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDb();
  const { id } = await params;

  const business = getBusiness(id);
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const db = getDb();
  const photos = db
    .prepare("SELECT * FROM business_photos WHERE business_id = ? ORDER BY order_index")
    .all(id);

  const rawReviews = db
    .prepare("SELECT * FROM business_reviews WHERE business_id = ? ORDER BY likes_count DESC")
    .all(id) as Record<string, unknown>[];

  const reviews = rawReviews.map((review) => ({
    ...review,
    owner_reply:
      review.owner_reply != null
        ? JSON.parse(review.owner_reply as string)
        : null,
  }));

  return NextResponse.json({ ...business, photos, reviews });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDb();
  const { id } = await params;

  const business = getBusiness(id);
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const mediaDir = path.join(process.cwd(), "media", business.google_place_id);
  if (fs.existsSync(mediaDir)) {
    fs.rmSync(mediaDir, { recursive: true, force: true });
  }

  deleteBusiness(id);

  return NextResponse.json({ success: true });
}
