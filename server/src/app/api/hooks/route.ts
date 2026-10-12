import { after } from "next/server";
import { orgFromBearer } from "@/lib/auth";
import { ingestHook, type HookEvent } from "@/lib/ingest";
import { maybeClassify } from "@/lib/classify";

// Claude plugin `http` hooks post here. Hooks are synchronous for the user, so we reply 204 at once
// (an empty body: anything we return could be fed back to Claude) and write to the database afterwards.
export async function POST(req: Request) {
  let event: HookEvent;
  try {
    event = JSON.parse((await req.text()).slice(0, 2_000_000));
  } catch {
    return new Response(null, { status: 204 });
  }
  const orgId = await orgFromBearer(req).catch(() => null);
  after(async () => {
    try {
      await ingestHook(event, orgId);
      if (event.hook_event_name === "Stop") await maybeClassify();
    } catch (err) {
      console.error("hook ingest failed", err);
    }
  });
  return new Response(null, { status: 204 });
}
