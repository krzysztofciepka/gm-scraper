import { NextRequest, NextResponse } from "next/server";
import { initSchema, createJob, listJobs } from "@/lib/db";

function ensureDb() {
  try { initSchema(); } catch { /* already initialized */ }
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
    return NextResponse.json({ error: "city and search_query are required" }, { status: 400 });
  }
  const job = createJob({ city: city.trim(), search_query: search_query.trim() });
  return NextResponse.json(job, { status: 201 });
}
