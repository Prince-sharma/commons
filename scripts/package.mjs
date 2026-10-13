#!/usr/bin/env node
// Builds an uploadable plugin file (.zip) for one org, without changing the repo.
// Use it where GitHub sync isn't available: Claude's Settings › Plugins › Add › Upload plugin.
//   node scripts/package.mjs --token cmn_... [--url https://commons-adoption.vercel.app]
// The token is baked in, so events reach your org with no monitoring setup and no user identity.
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const token = arg("token");
const url = (arg("url") ?? "https://commons-adoption.vercel.app").replace(/\/+$/, "");
if (!token?.startsWith("cmn_")) {
  console.error("usage: node scripts/package.mjs --token cmn_... [--url https://<your-commons-host>]");
  process.exit(1);
}

const src = new URL("../plugins/commons/", import.meta.url).pathname;
const work = mkdtempSync(join(tmpdir(), "commons-"));
const dir = join(work, "commons");
cpSync(src, dir, { recursive: true });

const hooksPath = join(dir, "hooks/hooks.json");
const hooks = JSON.parse(readFileSync(hooksPath, "utf8"));
const oldUrl = Object.values(hooks.hooks)[0][0].hooks[0].url.replace(/\/api\/hooks$/, "");
for (const groups of Object.values(hooks.hooks))
  for (const g of groups)
    for (const h of g.hooks) Object.assign(h, { url: `${url}/api/hooks`, headers: { Authorization: `Bearer ${token}` } });
writeFileSync(hooksPath, JSON.stringify(hooks, null, 2) + "\n");
for (const skill of ["my-usage", "share-skill"]) {
  const p = join(dir, `skills/${skill}/SKILL.md`);
  writeFileSync(p, readFileSync(p, "utf8").replaceAll(oldUrl, url));
}

const outDir = new URL("../dist/", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const out = join(outDir, "commons.zip");
rmSync(out, { force: true });
execFileSync("zip", ["-qrX", out, ".", "-x", "*.DS_Store"], { cwd: dir });
rmSync(work, { recursive: true, force: true });
console.log(`Wrote ${out} (posts to ${url} with your org token). Don't share it outside your org.`);
