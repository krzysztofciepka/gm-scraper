import { NextRequest, NextResponse } from "next/server";
import { initSchema, listBusinesses } from "@/lib/db";

function ensureDb() {
  try { initSchema(); } catch { /* already initialized */ }
}

export async function GET(request: NextRequest) {
  ensureDb();
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;
  const businesses = listBusinesses(search);
  return NextResponse.json(businesses);
}
