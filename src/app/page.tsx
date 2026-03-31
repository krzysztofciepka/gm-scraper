"use client";

import { useCallback, useEffect, useState } from "react";
import { ScrapeJob } from "@/lib/types";
import { JobForm } from "@/components/job-form";
import { JobCard } from "@/components/job-card";

export default function DashboardPage() {
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      if (!res.ok) throw new Error("Failed to fetch jobs");
      const data = await res.json() as ScrapeJob[];
      setJobs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
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
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
        <JobForm onCreated={fetchJobs} />
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3 text-foreground">Active Jobs</h2>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : activeJobs.length === 0 ? (
          <p className="text-muted-foreground text-sm">No active jobs.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3 text-foreground">Completed Jobs</h2>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : completedJobs.length === 0 ? (
          <p className="text-muted-foreground text-sm">No completed jobs yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {completedJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
