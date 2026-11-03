import { NextResponse, type NextRequest } from "next/server";
import { PIN_COOKIE, isValidAccess } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  if (await isValidAccess(request.cookies.get(PIN_COOKIE)?.value)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Ingrese el PIN para continuar." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/acceso";
  url.search = `?volver=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/panel/:path*", "/tablero/:path*", "/demo/:path*", "/api/staff/:path*"],
};
