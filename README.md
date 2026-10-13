# Commons

**See how your organization uses Claude, and share the skills that work.**

Commons is an open-source Claude plugin plus a small server. Once an admin adds the plugin, every Cowork and Claude
Code session reports what kind of work was done and which skills and connectors ran. It is **anonymous by default**:
no names or emails are collected. You get:

- **Analytics:** what people use Claude for (categories learned from your own usage), top skills and connectors,
  recurring tasks, and file types created.
- **Skills:** every skill in use ranked by real runs; suggested new skills for recurring work that nobody has a
  skill for yet (drafted for you); and skills employees share with `/commons:share-skill`.
- **In Claude:** `/commons:my-usage` shows the skills colleagues use.

Employees install nothing. An admin uploads one plugin file.

## How it works

```
 Claude (Cowork / Claude Code)                                        Commons server
 ┌──────────────────────────────────────────┐   POST /api/hooks      ┌───────────────────────────────┐
 │ commons plugin (Required for everyone)   │ ─────────────────────► │ sessions, prompts, tool events│
 │   http hooks: prompt, tool use, turn end │   Bearer <org token>   │                               │
 │   /commons:my-usage, /commons:share-skill│                        │ Sarvam labels each session:   │
 │                                          │                        │   category · task · summary   │
 │ optional: Claude monitoring export       │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─► │                               │
 │   adds people, tokens, cost              │   POST /v1/logs        │ Dashboard: Analytics · Skills │
 └──────────────────────────────────────────┘                        └───────────────────────────────┘
```

Each organization's plugin file has its **org token** built in, so its events land in that organization and nowhere
else. The token can only send events. Turning on Claude's monitoring export (Team and Enterprise) is optional: it adds
who did what, tokens and cost.

## Option 1: use the hosted Commons

1. Ask for an account. You receive an **organization ID**, a **dashboard password** and an **org token**.
2. Sign in at https://commons-adoption.vercel.app › **Settings** › paste the org token › **Download plugin (.zip)**.
3. In Claude (Owner; on a personal plan, your own Settings):
   - **Plugins › Add › Upload plugin** › choose the .zip. On Team and Enterprise, set it to **Required**.
   - **Capabilities › Network egress** › allow `commons-adoption.vercel.app`. Cowork blocks unknown sites.
4. Start a **new** Cowork session, run a task, and open **Live events**. Plugin events appear within seconds; the
   session is labelled a minute or two later.

Claude Code: install the same plugin, e.g. `claude --plugin-dir <unzipped folder>`.

## Option 2: self-host

You need a Vercel account (or any Node host), a Postgres database, a Sarvam API key and a GitHub account.

1. **Fork** this repository.
2. **Deploy the server** from `server/`:
   - Vercel: import the fork, set **Root Directory** to `server`, add a Postgres database (e.g. Neon from the
     Vercel Marketplace), and set the variables in [`server/.env.example`](server/.env.example).
   - The schema is applied on every build.
3. Open `https://<your-host>/setup`, sign in with `SUPERADMIN_PASSWORD`, and **create your organization**. Copy the
   organization ID, password and org token.
4. Set `COMMONS_PLUGIN_REPO=<you>/<fork>` on the server, then do steps 2–4 of Option 1 with your own host.
   Or build the file locally: `node scripts/package.mjs --url https://<your-host> --token cmn_...` writes
   `dist/commons.zip`.

## What is collected

| Data | Source | Kept |
|---|---|---|
| Prompt text | plugin hook | 30 days, to label the kind of work; labels stay |
| Skill, connector and tool names | plugin hook | yes |
| File **extensions** of files Claude created | plugin hook | yes |
| Email, tokens, model, estimated cost | only if you turn on the monitoring export | yes |
| Claude's replies, file contents, file paths, tool outputs, folder paths | may be sent by Claude | **dropped on arrival, never stored** |

Prompts are sent to [Sarvam](https://www.sarvam.ai) for labelling. The dashboard shows organization totals,
recurring tasks and skills; prompt text appears only as three example prompts on a suggested skill, for admins.
Admins can reduce what monitoring sends with the `otlpContentCapture` device setting.
See [PRIVACY.md](PRIVACY.md).

## Where it works

| Surface | Covered |
|---|---|
| Cowork (Pro, Max, Team, Enterprise) | Yes: plugin (+ optional monitoring on Team/Enterprise) |
| Claude Code | Yes: plugin (+ optional monitoring via managed settings) |
| claude.ai chat | No: plugins don't run hooks in chat |

## Repository

| Path | What |
|---|---|
| `.claude-plugin/marketplace.json` | The marketplace Claude syncs |
| `plugins/commons/` | The plugin: `hooks/hooks.json`, `skills/my-usage`, `skills/share-skill` |
| `server/` | Next.js + Postgres server and dashboard ([details](server/README.md)) |
| `scripts/package.mjs` | Builds an uploadable plugin .zip for one org |
| `scripts/configure.mjs` | Points the repo's plugin at your server (GitHub sync + monitoring setups) |

## License

MIT
