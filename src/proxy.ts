import { NextResponse, type NextRequest } from "next/server";
import { PIN_COOKIE, ROLE_COOKIE, ROLES, allowed, isValidAccess, readRole } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const api = path.startsWith("/api/");
  const pinOk = await isValidAccess(request.cookies.get(PIN_COOKIE)?.value);
  const role = pinOk ? await readRole(request.cookies.get(ROLE_COOKIE)?.value) : null;
  if (pinOk && allowed(path, role)) return NextResponse.next();

  if (api) {
    const msg = !pinOk ? "Ingrese el PIN para continuar." : "Su rol no tiene acceso a esta información.";
    return NextResponse.json({ error: msg }, { status: pinOk ? 403 : 401 });
  }
  const url = request.nextUrl.clone();
  if (pinOk && role) {
    // wrong role for this screen: go to the role's own home
    url.pathname = ROLES.find((r) => r.id === role)?.home ?? "/acceso";
    url.search = "";
    return NextResponse.redirect(url);
  }
  url.pathname = "/acceso";
  url.search = `?volver=${encodeURIComponent(path)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/panel/:path*",
    "/tablero/:path*",
    "/demo/:path*",
    "/regulador/:path*",
    "/callcenter/:path*",
    "/api/staff/:path*",
    "/api/regulator/:path*",
    "/api/callcenter/:path*",
  ],
};
