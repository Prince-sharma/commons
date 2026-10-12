# Commons

**See how your organization uses Claude, and share the skills that work.**

Commons is an open-source Claude plugin plus a small server. Once an admin sets it up, every Cowork and Claude Code
session reports what kind of work was done, which skills and connectors ran, and what it cost. You get:

- **Analytics:** active people vs seats, how deeply people use Claude (light / regular / advanced), what they use it
  for (categories learned from your own usage), top skills, and recurring tasks.
- **Skills:** every skill in use ranked by real runs; suggested new skills for recurring work that nobody has a
  skill for yet (drafted for you); and skills employees share with `/commons:share-skill`.
- **In Claude:** `/commons:my-usage` shows each person their last 7 days and the skills colleagues use.

Employees install nothing. An admin does two things in Claude's settings.

## How it works

```
 Claude (Cowork / Claude Code)                                        Commons server
 ┌──────────────────────────────────────────┐   POST /api/hooks      ┌───────────────────────────────┐
 │ commons plugin (Required for everyone)   │ ─────────────────────► │ sessions, prompts, tool events│
 │   http hooks: prompt, tool use, turn end │   (no secrets)         │                               │
 │   /commons:my-usage, /commons:share-skill│                        │ Sarvam labels each session:   │
 │                                          │   POST /v1/logs        │   category · task · summary   │
 │ Claude monitoring export (admin setting) │ ─────────────────────► │                               │
 │   user email, tokens, cost, tool calls   │   Bearer <org token>   │ Dashboard: Analytics · Skills │
 └──────────────────────────────────────────┘                        └───────────────────────────────┘
```

The plugin is identical for every organization and carries no secrets. Claude's **monitoring export**, which the
admin points at Commons with an org token, tells Commons which organization and person each session belongs to,
plus tokens and cost. Plugin events are matched to that stream by session id. Plugin events that no organization
ever claims are deleted after 6 hours.

## Option 1: use the hosted Commons

1. Ask for an account. You receive an **organization ID**, a **dashboard password** and an **org token**.
2. **Monitoring** (Claude Owner): Admin settings › Cowork › Monitoring:
   - OTLP endpoint: `https://commons-adoption.vercel.app`
   - OTLP protocol: `http/json`
   - OTLP headers: `Authorization=Bearer <org token>`
3. **Plugin** (Claude Owner): Organization settings › Plugins & skills › **Add › Sync from GitHub** ›
   `Prince-sharma/commons`. Then on **Inventory**, set `commons` › Default access › **Required**.
4. Start a **new** Cowork session, run a task, and open **Live events** in the dashboard. You should see
   monitoring and plugin events within a minute.

Claude Code users: add the managed-settings block shown on the dashboard's Settings page.

## Option 2: self-host

You need a Vercel account (or any Node host), a Postgres database, a Sarvam API key and a GitHub account.

1. **Fork** this repository.
2. **Deploy the server** from `server/`:
   - Vercel: import the fork, set **Root Directory** to `server`, add a Postgres database (e.g. Neon from the
     Vercel Marketplace), and set the variables in [`server/.env.example`](server/.env.example).
   - The schema is applied on every build.
3. Open `https://<your-host>/setup`, sign in with `SUPERADMIN_PASSWORD`, and **create your organization**. Copy the
   organization ID, password and org token.
4. **Point the plugin at your server**, then commit and push:
   ```bash
   node scripts/configure.mjs --url https://<your-host>
   ```
5. In Claude, do steps 2–4 of Option 1 with your own host and your fork's repository.

## What is collected

| Data | Source | Kept |
|---|---|---|
| Prompt text | plugin hook, monitoring export | 30 days, to label the kind of work; labels stay |
| Skill, connector and tool names | plugin hook, monitoring export | yes |
| File **extensions** of files Claude created | plugin hook, monitoring export | yes |
| Email, tokens, model, estimated cost | monitoring export | yes |
| Claude's replies, file contents, file paths, tool outputs, folder paths | may be sent by Claude | **dropped on arrival, never stored** |

Prompts are sent to [Sarvam](https://www.sarvam.ai) for labelling. The dashboard shows organization totals,
recurring tasks and skills; prompt text appears only as three example prompts on a suggested skill, for admins.
Admins can reduce what monitoring sends with the `otlpContentCapture` device setting.
See [PRIVACY.md](PRIVACY.md).

## Where it works

| Surface | Covered |
|---|---|
| Cowork (Team, Enterprise) | Yes: monitoring + plugin |
| Claude Code | Yes: plugin via account sync; monitoring via managed settings |
| claude.ai chat | No: plugins don't run hooks in chat |

## Repository

| Path | What |
|---|---|
| `.claude-plugin/marketplace.json` | The marketplace Claude syncs |
| `plugins/commons/` | The plugin: `hooks/hooks.json`, `skills/my-usage`, `skills/share-skill` |
| `server/` | Next.js + Postgres server and dashboard ([details](server/README.md)) |
| `scripts/configure.mjs` | Points the plugin at your server (self-hosting) |

## License

MIT
