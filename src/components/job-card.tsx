"use client";

import { useEffect, useState } from "react";
import { ScrapeJob } from "@/lib/types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface JobCardProps {
  job: ScrapeJob;
}

const statusColors: Record<ScrapeJob["status"], string> = {
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  running: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
  blocked: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

export function JobCard({ job: initialJob }: JobCardProps) {
  const [job, setJob] = useState<ScrapeJob>(initialJob);

  useEffect(() => {
    setJob(initialJob);
  }, [initialJob]);

  useEffect(() => {
    if (job.status !== "pending" && job.status !== "running") return;

    const es = new EventSource(`/api/jobs/${job.id}/progress`);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Partial<ScrapeJob>;
        setJob((prev) => ({ ...prev, ...data }));
        if (data.status && data.status !== "pending" && data.status !== "running") {
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [job.id, job.status]);

  const progress =
    job.grid_cells_total > 0
      ? Math.round((job.grid_cells_completed / job.grid_cells_total) * 100)
      : 0;

  const colorClass = statusColors[job.status];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{job.city}</CardTitle>
          <span
            className={`inline-flex h-5 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colorClass}`}
          >
            {job.status}
          </span>
        </div>
        <CardDescription>{job.search_query}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Progress value={progress} />
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="flex flex-col">
            <span className="text-muted-foreground text-xs">Grid cells</span>
            <span className="font-medium">
              {job.grid_cells_completed} / {job.grid_cells_total}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground text-xs">Found</span>
            <span className="font-medium">{job.businesses_found}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground text-xs">Skipped</span>
            <span className="font-medium">{job.businesses_skipped}</span>
          </div>
        </div>
        {job.error_message && (
          <p className="text-xs text-red-400 break-words">{job.error_message}</p>
        )}
      </CardContent>
    </Card>
  );
}
