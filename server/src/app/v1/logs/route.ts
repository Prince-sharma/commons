import { after } from "next/server";
import { orgFromBearer } from "@/lib/auth";
import { ingestOtlp } from "@/lib/ingest";

// OTLP/HTTP JSON logs from Cowork monitoring and Claude Code telemetry.
// Configure exporters with protocol http/json and `Authorization=Bearer <org token>`.
export async function POST(req: Request) {
  const orgId = await orgFromBearer(req);
  if (!orgId) return Response.json({ error: "invalid org token" }, { status: 401 });
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("json")) {
    return Response.json({ error: "use OTLP protocol http/json" }, { status: 415 });
  }
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "invalid JSON" }, { status: 400 });
  after(async () => {
    try {
      await ingestOtlp(body, orgId);
    } catch (err) {
      console.error("otlp ingest failed", err);
    }
  });
  return Response.json({});
}
