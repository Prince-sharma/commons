import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { sql } from "./db";

const COOKIE = "commons_session";

export type Org = { id: string; name: string; slug: string; seats: number | null };
type Claims = { role: "admin" | "superadmin"; orgId?: string };

export function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

export function newToken() {
  return "cmn_" + randomBytes(24).toString("base64url");
}

export function newPassword() {
  return randomBytes(12).toString("base64url");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(password, salt, 32).toString("hex")}`;
}

export function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = scryptSync(password, Buffer.from(salt, "hex"), 32);
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(sha256(a)), y = Buffer.from(sha256(b));
  return timingSafeEqual(x, y);
}

/** Resolves an org from `Authorization: Bearer cmn_…` (OTLP exporters and org-baked plugins). */
export async function orgFromBearer(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith("cmn_")) return null;
  const [row] = await sql<{ id: string }[]>`select id from orgs where token_hash = ${sha256(token)}`;
  return row?.id ?? null;
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(s ?? "dev-only-secret-change-me");
}

export async function signIn(claims: Claims) {
  const jwt = await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(secret());
  (await cookies()).set(COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function signOut() {
  (await cookies()).delete(COOKIE);
}

export async function currentClaims(): Promise<Claims | null> {
  const jwt = (await cookies()).get(COOKIE)?.value;
  if (!jwt) return null;
  try {
    const { payload } = await jwtVerify(jwt, secret());
    return payload as unknown as Claims;
  } catch {
    return null;
  }
}

/** For dashboard pages: the signed-in org, or a redirect to /login. */
export async function requireOrg(): Promise<Org> {
  const claims = await currentClaims();
  if (claims?.role !== "admin" || !claims.orgId) redirect("/login");
  const [org] = await sql<Org[]>`select id, name, slug, seats from orgs where id = ${claims.orgId}`;
  if (!org) redirect("/login");
  return org;
}

export async function requireSuperadmin() {
  const claims = await currentClaims();
  if (claims?.role !== "superadmin") redirect("/setup/login");
}
