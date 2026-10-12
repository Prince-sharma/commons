#!/usr/bin/env node
// Points the Commons plugin at a Commons server. Run this in your fork when you self-host.
//   node scripts/configure.mjs --url https://commons.example.com            (identity via Claude monitoring)
//   node scripts/configure.mjs --url https://commons.example.com --token cmn_...   (org token baked in)
// Then commit and push; Claude's org sync picks up the new plugin version.
import { readFileSync, writeFileSync } from "node:fs";

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const url = arg("url")?.replace(/\/+$/, "");
const token = arg("token");
if (!url || !/^https?:\/\//.test(url)) {
  console.error("usage: node scripts/configure.mjs --url https://<your-commons-host> [--token cmn_...]");
  process.exit(1);
}
if (token && !token.startsWith("cmn_")) {
  console.error("--token should be the org token from Commons (starts with cmn_)");
  process.exit(1);
}

const root = new URL("../plugins/commons/", import.meta.url);
const hooksPath = new URL("hooks/hooks.json", root);
const hooks = JSON.parse(readFileSync(hooksPath, "utf8"));
const oldUrl = Object.values(hooks.hooks)[0][0].hooks[0].url.replace(/\/api\/hooks$/, "");
for (const groups of Object.values(hooks.hooks)) {
  for (const g of groups) {
    for (const h of g.hooks) {
      h.url = `${url}/api/hooks`;
      if (token) h.headers = { Authorization: `Bearer ${token}` };
      else delete h.headers;
    }
  }
}
writeFileSync(hooksPath, JSON.stringify(hooks, null, 2) + "\n");

for (const skill of ["my-usage", "share-skill"]) {
  const p = new URL(`skills/${skill}/SKILL.md`, root);
  writeFileSync(p, readFileSync(p, "utf8").replaceAll(oldUrl, url));
}

// Bump the patch version so installs pick up the change.
const manifestPath = new URL(".claude-plugin/plugin.json", root);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const [a, b, c] = manifest.version.split(".").map(Number);
manifest.version = `${a}.${b}.${c + 1}`;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(`Plugin now posts to ${url}${token ? " with an org token" : ""} (version ${manifest.version}).`);
if (token) console.log("Note: the token is now in your repo. Keep the repo private; the token can only write events.");
