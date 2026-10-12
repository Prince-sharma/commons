# Commons server

Next.js app that receives Claude plugin hooks (`/api/hooks`) and Claude's monitoring export (`/v1/logs`, OTLP/JSON),
labels sessions with Sarvam, and serves the dashboard. See the [repository README](../README.md) for setup.

```bash
cp .env.example .env.local      # fill in the values
npm install
npm run db:migrate
npm run dev                      # http://localhost:3000, /setup to create an org
npm run seed:demo                # optional: a demo org with 30 days of data
BASE=http://localhost:3000 TOKEN=cmn_... npm run test:replay   # ingest + privacy checks
```

| Path | What |
|---|---|
| `src/app/api/hooks` | Plugin hooks. Replies 204 at once, writes after the response |
| `src/app/v1/logs` | OTLP/JSON logs from Cowork monitoring and Claude Code telemetry (`Authorization: Bearer <org token>`) |
| `src/app/api/me/usage`, `api/skills/submit` | Called by `/commons:my-usage` and `/commons:share-skill` |
| `src/app/api/cron/daily` | Retention, orphan cleanup, classification catch-up, category merging |
| `src/lib/ingest.ts` | Hook + OTLP → sessions, prompts, tool events; privacy filtering |
| `src/lib/classify.ts` | Sarvam labelling: category, task, summary; emergent categories |
| `src/lib/metrics.ts` | Every number on the Analytics page |
| `db/schema.sql` | Postgres schema (applied on every build) |
