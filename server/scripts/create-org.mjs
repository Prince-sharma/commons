// Creates an org and prints its token and dashboard password (shown once).
// Usage: DATABASE_URL=... node scripts/create-org.mjs "Acme Corp" [seats]
import { createHash, randomBytes, scryptSync } from "node:crypto";
import postgres from "postgres";

const [name, seats] = process.argv.slice(2);
if (!name) {
  console.error('usage: node scripts/create-org.mjs "<org name>" [seats]');
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL ?? "postgres://localhost/commons_dev", { max: 1, prepare: false });
const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + randomBytes(2).toString("hex");
const token = "cmn_" + randomBytes(24).toString("base64url");
const password = randomBytes(12).toString("base64url");
const salt = randomBytes(16);
const passwordHash = `${salt.toString("hex")}:${scryptSync(password, salt, 32).toString("hex")}`;
await sql`insert into orgs (name, slug, token_hash, password_hash, seats)
          values (${name}, ${slug}, ${createHash("sha256").update(token).digest("hex")}, ${passwordHash}, ${seats ? Number(seats) : null})`;
console.log(JSON.stringify({ name, slug, token, password }, null, 2));
await sql.end();
