import { sql } from "@/lib/db";
import { classifyPending, consolidateCategories } from "@/lib/classify";

export const maxDuration = 300;

// Vercel Cron calls this daily with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  // Privacy retention
  const prompts = await sql`update prompts set text = null where text is not null and ts < now() - interval '30 days'`;
  const live = await sql`delete from live_events where ts < now() - interval '7 days'`;
  // Hook-only sessions no org ever claimed (spoofed, or monitoring not configured) are dropped with their prompts.
  const orphans = await sql`delete from sessions where org_id is null and last_at < now() - interval '6 hours'`;
  await sql`delete from submissions where org_id is null and created_at < now() - interval '7 days'`;

  const classified = await classifyPending(200);
  const orgs = await sql<{ id: string }[]>`select id from orgs`;
  for (const o of orgs) await consolidateCategories(o.id).catch((e) => console.error("consolidate", o.id, e));

  return Response.json({ purgedPrompts: prompts.count, purgedLive: live.count, orphanSessions: orphans.count, classified });
}
