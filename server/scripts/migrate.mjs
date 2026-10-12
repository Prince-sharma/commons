// Applies db/schema.sql. Safe to run repeatedly.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "postgres://localhost/commons_dev";
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
await sql.unsafe(schema);
console.log("schema applied");
await sql.end();
