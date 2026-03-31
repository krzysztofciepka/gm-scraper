import { NextRequest } from "next/server";
import { initSchema, getJob } from "@/lib/db";

function ensureDb() {
  try { initSchema(); } catch { /* already initialized */ }
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
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let lastUpdatedAt = "";
      let consecutiveNoChange = 0;

      const interval = setInterval(() => {
        try {
          const job = getJob(id);
          if (!job) { sendEvent({ error: "Job not found" }); clearInterval(interval); controller.close(); return; }
          if (job.updated_at !== lastUpdatedAt) {
            lastUpdatedAt = job.updated_at;
            consecutiveNoChange = 0;
            sendEvent(job);
          } else { consecutiveNoChange++; }
          if (job.status === "completed" || job.status === "failed" || job.status === "blocked") {
            sendEvent(job); clearInterval(interval); controller.close();
          }
          if (consecutiveNoChange > 300) { clearInterval(interval); controller.close(); }
        } catch { clearInterval(interval); controller.close(); }
      }, 1000);

      request.signal.addEventListener("abort", () => { clearInterval(interval); controller.close(); });
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
