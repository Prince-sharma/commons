import postgres from "postgres";

// One pooled client per server instance. Neon and local Postgres both work with DATABASE_URL.
const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

export const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL ?? "postgres://localhost/commons_dev", {
    max: 5,
    idle_timeout: 20,
    prepare: false, // required behind Neon's pooler (pgbouncer)
    onnotice: () => {},
  });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
