import { sql } from "@/lib/db";
import { orgFromBearer } from "@/lib/auth";

// /commons:share-skill posts a SKILL.md here. The org comes from a baked token if present,
// otherwise from the session (claimed by the monitoring stream, now or later).
export async function POST(req: Request) {
  const md = (await req.text()).slice(0, 100_000);
  if (!/^---\s*\n[\s\S]*?\bname\s*:/m.test(md)) {
    return Response.json({ error: "expected a SKILL.md with YAML frontmatter and a name" }, { status: 400 });
  }
  const sessionId = req.headers.get("x-claude-session-id")?.slice(0, 100) || null;
  const name = /^name\s*:\s*["']?([^"'\n]+)/m.exec(md)?.[1]?.trim() ?? null;
  let orgId = await orgFromBearer(req);
  let email: string | null = null;
  if (sessionId) {
    const [s] = await sql<{ org_id: string | null; email: string | null }[]>`select org_id, email from sessions where id = ${sessionId}`;
    orgId ??= s?.org_id ?? null;
    email = s?.email ?? null;
  }
  const [row] = await sql<{ id: number }[]>`
    insert into submissions (org_id, session_id, email, name, skill_md)
    values (${orgId}, ${sessionId}, ${email}, ${name}, ${md}) returning id`;
  return Response.json({ id: row.id, status: "pending review" }, { status: 202 });
}
