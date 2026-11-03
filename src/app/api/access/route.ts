import { NextResponse } from "next/server";
import { PIN_COOKIE, pinToken } from "@/lib/auth";

export async function POST(req: Request) {
  const { pin } = await req.json().catch(() => ({ pin: "" }));
  const expected = process.env.DEMO_PIN;
  if (!expected || String(pin).trim() !== expected) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return NextResponse.json({ error: "PIN incorrecto. Revise los dígitos e intente de nuevo." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PIN_COOKIE, await pinToken(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
