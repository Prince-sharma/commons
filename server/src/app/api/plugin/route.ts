import { currentClaims, sha256 } from "@/lib/auth";
import { sql } from "@/lib/db";
import { zip } from "@/lib/zip";

// Builds the Commons plugin with this org's token and this server's address baked in, for
// Claude's Settings › Plugins › Add › Upload plugin. The plugin files come from the public repo,
// so the zip always matches the latest plugin. The token is never stored in plain text, so the
// admin pastes it here.
const FILES = [
  ".claude-plugin/plugin.json",
  "hooks/hooks.json",
  "skills/my-usage/SKILL.md",
  "skills/share-skill/SKILL.md",
  "README.md",
];

export async function POST(req: Request) {
  const claims = await currentClaims();
  if (claims?.role !== "admin" || !claims.orgId) return new Response("Sign in first.", { status: 401 });
  const token = String((await req.formData()).get("token") ?? "").trim();
  const [org] = await sql<{ slug: string }[]>`
    select slug from orgs where id = ${claims.orgId} and token_hash = ${sha256(token)}`;
  if (!org) return new Response("That isn't this organization's current org token.", { status: 400 });

  const base = process.env.COMMONS_URL ?? new URL(req.url).origin;
  const repo = process.env.COMMONS_PLUGIN_REPO ?? "Prince-sharma/commons";
  const raw = `https://raw.githubusercontent.com/${repo}/main/plugins/commons/`;
  const texts = await Promise.all(
    FILES.map(async (p) => {
      const r = await fetch(raw + p, { cache: "no-store" });
      if (!r.ok) throw new Error(`fetch ${p}: ${r.status}`);
      return r.text();
    }),
  );
  const files = FILES.map((path, i) => ({ path, data: texts[i] }));

  const hooksFile = files.find((f) => f.path === "hooks/hooks.json")!;
  const hooks = JSON.parse(hooksFile.data);
  const oldBase = (Object.values(hooks.hooks) as { hooks: { url: string }[] }[][])[0][0].hooks[0].url.replace(/\/api\/hooks$/, "");
  for (const groups of Object.values(hooks.hooks) as { hooks: Record<string, unknown>[] }[][])
    for (const g of groups)
      for (const h of g.hooks) Object.assign(h, { url: `${base}/api/hooks`, headers: { Authorization: `Bearer ${token}` } });
  hooksFile.data = JSON.stringify(hooks, null, 2) + "\n";
  for (const f of files) if (f.path.endsWith("SKILL.md")) f.data = f.data.replaceAll(oldBase, base);

  return new Response(new Uint8Array(zip(files)), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="commons-${org.slug}.zip"`,
      "cache-control": "no-store",
    },
  });
}
