"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "./db";
import {
  checkPassword, hashPassword, newPassword, newToken, requireOrg, requireSuperadmin, safeEqual, sha256, signIn, signOut,
} from "./auth";
import { draftSkill } from "./classify";

export type FormState = { error?: string; ok?: string; secrets?: Record<string, string> } | undefined;

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const slug = String(form.get("org") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const [org] = await sql<{ id: string; password_hash: string }[]>`select id, password_hash from orgs where slug = ${slug}`;
  if (!org || !checkPassword(password, org.password_hash)) return { error: "Wrong organization ID or password." };
  await signIn({ role: "admin", orgId: org.id });
  redirect("/");
}

export async function superLogin(_: FormState, form: FormData): Promise<FormState> {
  const expected = process.env.SUPERADMIN_PASSWORD;
  if (!expected) return { error: "SUPERADMIN_PASSWORD is not set on the server." };
  if (!safeEqual(String(form.get("password") ?? ""), expected)) return { error: "Wrong password." };
  await signIn({ role: "superadmin" });
  redirect("/setup");
}

export async function logout() {
  await signOut();
  redirect("/login");
}

export async function createOrg(_: FormState, form: FormData): Promise<FormState> {
  await requireSuperadmin();
  const name = String(form.get("name") ?? "").trim();
  const seats = Number(form.get("seats")) || null;
  if (!name) return { error: "Name is required." };
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) + "-" + newToken().slice(-4).toLowerCase();
  const token = newToken(), password = newPassword();
  await sql`insert into orgs (name, slug, token_hash, password_hash, seats)
            values (${name}, ${slug}, ${sha256(token)}, ${hashPassword(password)}, ${seats})`;
  revalidatePath("/setup");
  return { ok: `Created ${name}. Copy these now: they are not shown again.`, secrets: { "Organization ID": slug, "Dashboard password": password, "Org token": token } };
}

export async function rotateToken(): Promise<FormState> {
  const org = await requireOrg();
  const token = newToken();
  await sql`update orgs set token_hash = ${sha256(token)} where id = ${org.id}`;
  return { ok: "New token created. Update Cowork monitoring (and any baked plugin) with it; the old one stopped working.", secrets: { "Org token": token } };
}

export async function updateSeats(form: FormData) {
  const org = await requireOrg();
  const seats = Number(form.get("seats")) || null;
  await sql`update orgs set seats = ${seats} where id = ${org.id}`;
  revalidatePath("/");
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const org = await requireOrg();
  const pw = String(form.get("password") ?? "");
  if (pw.length < 10) return { error: "Use at least 10 characters." };
  await sql`update orgs set password_hash = ${hashPassword(pw)} where id = ${org.id}`;
  return { ok: "Password changed." };
}

export async function draftSkillAction(form: FormData) {
  const org = await requireOrg();
  await draftSkill(org.id, Number(form.get("taskId")));
  revalidatePath("/skills");
}

export async function dismissSuggestion(form: FormData) {
  const org = await requireOrg();
  await sql`update tasks set dismissed = true where id = ${Number(form.get("taskId"))} and org_id = ${org.id}`;
  revalidatePath("/skills");
}

export async function reviewSubmission(form: FormData) {
  const org = await requireOrg();
  const status = form.get("status") === "approved" ? "approved" : "returned";
  await sql`update submissions set status = ${status}, note = ${String(form.get("note") ?? "") || null}
            where id = ${Number(form.get("id"))} and org_id = ${org.id}`;
  revalidatePath("/skills");
}
