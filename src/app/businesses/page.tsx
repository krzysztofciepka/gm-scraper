"use client";

import { useCallback, useEffect, useState } from "react";
import { Business } from "@/lib/types";
import { BusinessTable } from "@/components/business-table";

export default function BusinessesPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchBusinesses = useCallback(async (searchTerm: string) => {
    setLoading(true);
    try {
      const url = searchTerm
        ? `/api/businesses?search=${encodeURIComponent(searchTerm)}`
        : "/api/businesses";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch businesses");
      const data = (await res.json()) as Business[];
      setBusinesses(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBusinesses(search);
  }, [fetchBusinesses, search]);

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/businesses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete business");
      await fetchBusinesses(search);
    } catch (err) {
      console.error(err);
    }
  }

  const isEmpty = !loading && businesses.length === 0;
  const hasSearch = search.trim().length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">
          Businesses
          {!loading && (
            <span className="ml-2 text-base font-normal text-muted-foreground">
              ({businesses.length})
            </span>
          )}
        </h1>
        <input
          type="search"
          placeholder="Search businesses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-64 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-ring placeholder:text-muted-foreground"
        />
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : isEmpty ? (
        <p className="text-muted-foreground text-sm">
          {hasSearch
            ? `No businesses found matching "${search}".`
            : "No businesses scraped yet. Run a scrape job to get started."}
        </p>
      ) : (
        <BusinessTable businesses={businesses} onDelete={handleDelete} />
      )}
    </div>
  );
}
