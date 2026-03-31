import { initSchema, getDb, updateJobProgress } from "@/lib/db";
import { scrapeCity } from "./scraper";

const POLL_INTERVAL = 3000;

async function main(): Promise<void> {
  console.log("GM Scraper Worker starting...");
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

  while (true) {
    const pendingJob = db
      .prepare("SELECT * FROM scrape_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1")
      .get() as any;

    if (pendingJob) {
      console.log(`Starting job ${pendingJob.id}: "${pendingJob.search_query}" in ${pendingJob.city}`);
      updateJobProgress(pendingJob.id, { status: "running" });

      try {
        await scrapeCity(pendingJob.id, pendingJob.city, pendingJob.search_query, {
          onProgress: (update) => {
            updateJobProgress(pendingJob.id, { ...update, status: "running" });
          },
        });
        updateJobProgress(pendingJob.id, { status: "completed" });
        console.log(`Job ${pendingJob.id} completed.`);
      } catch (err: any) {
        console.error(`Job ${pendingJob.id} failed:`, err);
        const isBlocked = err.message?.includes("captcha") || err.message?.includes("blocked") || err.message?.includes("unusual traffic");
        updateJobProgress(pendingJob.id, {
          status: isBlocked ? "blocked" : "failed",
          error_message: err.message ?? "Unknown error",
        });
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

main().catch((err) => { console.error("Worker crashed:", err); process.exit(1); });
