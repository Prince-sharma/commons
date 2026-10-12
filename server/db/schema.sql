-- Commons schema. Idempotent: `npm run db:migrate` applies it on every deploy.
-- Privacy rules enforced by the ingest code, not the schema:
--   never stored: file contents or paths, tool outputs, assistant responses, transcript paths.
--   prompt text is nulled after 30 days by the purge job.

create table if not exists orgs (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  token_hash    text not null unique,     -- sha256 of the org token (OTLP auth, optional hook auth)
  password_hash text not null,            -- dashboard password (scrypt)
  seats         int,
  created_at    timestamptz not null default now()
);

create table if not exists people (
  org_id     uuid not null references orgs on delete cascade,
  email      text not null,
  account_id text,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (org_id, email)
);

-- One row per Claude session (Cowork task or Claude Code session).
-- org_id/email are null until the monitoring stream (or a baked org token) claims the session.
create table if not exists sessions (
  id             text primary key,
  org_id         uuid references orgs on delete cascade,
  email          text,
  surface        text,                    -- cowork | claude-code
  first_at       timestamptz not null default now(),
  last_at        timestamptz not null default now(),
  has_hooks      boolean not null default false,
  has_otel       boolean not null default false,
  model          text,
  input_tokens   bigint not null default 0,
  output_tokens  bigint not null default 0,
  cache_tokens   bigint not null default 0,
  cost_usd       numeric(12,6) not null default 0,
  category       text,
  task_id        int,
  summary        text,
  classified_at  timestamptz
);
create index if not exists sessions_org_first on sessions (org_id, first_at);
create index if not exists sessions_unclassified on sessions (classified_at) where classified_at is null;

create table if not exists prompts (
  id          text primary key,           -- prompt_id (hooks) = prompt.id (OTel)
  session_id  text not null references sessions on delete cascade,
  ts          timestamptz not null,
  text        text,                       -- nulled after 30 days
  length      int,
  slash_skill text
);
create index if not exists prompts_session on prompts (session_id, ts);

create table if not exists tool_events (
  id          bigserial primary key,
  dedup_key   text not null unique,
  session_id  text not null references sessions on delete cascade,
  prompt_id   text,
  ts          timestamptz not null,
  source      text not null,              -- hook | otel
  tool_name   text not null,
  skill_key   text,
  skill_raw   text,
  invocation  text,                       -- model | user-slash
  mcp_server  text,
  mcp_tool    text,
  file_ext    text,
  success     boolean
);
create index if not exists tool_events_session on tool_events (session_id);

create table if not exists api_requests (
  dedup_key     text primary key,         -- session.id:event.sequence
  session_id    text not null references sessions on delete cascade,
  ts            timestamptz not null,
  model         text,
  input_tokens  bigint,
  output_tokens bigint,
  cache_tokens  bigint,
  cost_usd      numeric(12,6)
);

-- Content-free event log for the Live events page (install-day checks). Kept 7 days.
create table if not exists live_events (
  id         bigserial primary key,
  org_id     uuid references orgs on delete cascade,
  session_id text,
  ts         timestamptz not null default now(),
  source     text not null,               -- hook | otel
  kind       text not null,
  detail     text
);
create index if not exists live_events_org on live_events (org_id, id desc);
create index if not exists live_events_session on live_events (session_id);

-- Emergent taxonomy, per org, written by the classifier.
create table if not exists categories (
  org_id uuid not null references orgs on delete cascade,
  name   text not null,
  primary key (org_id, name)
);

create table if not exists tasks (
  id         serial primary key,
  org_id     uuid not null references orgs on delete cascade,
  label      text not null,
  category   text not null,
  draft_md   text,                        -- SKILL.md drafted from this task's sessions
  dismissed  boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, label)
);

create table if not exists submissions (
  id         serial primary key,
  org_id     uuid references orgs on delete cascade,
  session_id text,
  email      text,
  name       text,
  skill_md   text not null,
  status     text not null default 'pending', -- pending | approved | returned
  note       text,
  created_at timestamptz not null default now()
);

create table if not exists job_runs (
  name     text primary key,
  last_run timestamptz not null
);
