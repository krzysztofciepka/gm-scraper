"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface JobFormProps {
  onCreated: () => void;
}

export function JobForm({ onCreated }: JobFormProps) {
  const [city, setCity] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!city.trim() || !searchQuery.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: city.trim(), search_query: searchQuery.trim() }),
      });
      if (!res.ok) {
        throw new Error(`Failed to create job: ${res.statusText}`);
      }
      setCity("");
      setSearchQuery("");
      onCreated();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-end">
      <div className="flex flex-col gap-1 flex-1">
        <label htmlFor="city" className="text-sm font-medium text-foreground">
          City
        </label>
        <Input
          id="city"
          placeholder="e.g. Warsaw"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          disabled={loading}
        />
      </div>
      <div className="flex flex-col gap-1 flex-1">
        <label htmlFor="search_query" className="text-sm font-medium text-foreground">
          Search Query
        </label>
        <Input
          id="search_query"
          placeholder="e.g. restaurants"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={loading}
        />
      </div>
      <Button type="submit" disabled={loading || !city.trim() || !searchQuery.trim()}>
        {loading ? "Creating..." : "Start Job"}
      </Button>
    </form>
  );
}
