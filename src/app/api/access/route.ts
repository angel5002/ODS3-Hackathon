import { NextResponse } from "next/server";
import { PIN_COOKIE, ROLE_COOKIE, ROLES, isValidAccess, pinToken, roleToken, type Role } from "@/lib/auth";

const COOKIE = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

// POST { pin, role } logs in; POST { role } with a valid PIN cookie only switches the role.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const role: Role = ROLES.some((r) => r.id === body.role) ? body.role : "admision";
  const expected = process.env.DEMO_PIN;
  const cookie = req.headers.get("cookie") ?? "";
  const current = /(?:^|;\s*)demo_access=([^;]+)/.exec(cookie)?.[1];
  const hasPin = body.pin == null && (await isValidAccess(current));
  if (!hasPin && (!expected || String(body.pin ?? "").trim() !== expected)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return NextResponse.json({ error: "PIN incorrecto. Revise los dígitos e intente de nuevo." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, home: ROLES.find((r) => r.id === role)!.home });
  if (!hasPin) res.cookies.set(PIN_COOKIE, await pinToken(expected!), COOKIE);
  res.cookies.set(ROLE_COOKIE, await roleToken(role), COOKIE);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(PIN_COOKIE);
  res.cookies.delete(ROLE_COOKIE);
  return res;
}
