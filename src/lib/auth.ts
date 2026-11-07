// Staff access (RF-41 + v4 §3): DEMO_PIN plus a role selector. Both live in httpOnly cookies; the role
// cookie is signed so it cannot be edited in the browser. Roles decide which screens and APIs answer:
// the regulator only ever receives the blind view (enforced on the server, src/proxy.ts and the routes).
export const PIN_COOKIE = "demo_access";
export const ROLE_COOKIE = "demo_role";

export type Role = "admision" | "regulador" | "callcenter";
export const ROLES: { id: Role; label: string; home: string; description: string }[] = [
  { id: "admision", label: "Admisión", home: "/panel", description: "Citas, lista de espera, reasignación y tablero" },
  { id: "regulador", label: "Regulador", home: "/regulador", description: "Asigna la categoría clínica sin ver la identidad" },
  { id: "callcenter", label: "Central de llamadas", home: "/callcenter", description: "Tareas que necesitan a una persona" },
];

async function sha256Hex(text: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function pinToken(pin: string) {
  return sha256Hex(`ods3-hackathon:${pin}`);
}

export async function isValidAccess(cookieValue: string | undefined) {
  const pin = process.env.DEMO_PIN;
  if (!pin || !cookieValue) return false;
  return cookieValue === (await pinToken(pin));
}

async function roleSignature(role: Role) {
  return (await sha256Hex(`ods3-role:${role}:${process.env.DEMO_PIN ?? ""}:${process.env.CHAT_SESSION_SECRET ?? ""}`)).slice(0, 32);
}

export async function roleToken(role: Role) {
  return `${role}.${await roleSignature(role)}`;
}

export async function readRole(cookieValue: string | undefined): Promise<Role | null> {
  if (!cookieValue) return null;
  const [role, sig] = cookieValue.split(".");
  if (!ROLES.some((r) => r.id === role)) return null;
  return sig === (await roleSignature(role as Role)) ? (role as Role) : null;
}

/** Which roles may open each area. Admisión supervises everything except that it is never the regulator's view. */
export function allowed(path: string, role: Role | null) {
  if (!role) return false;
  if (path.startsWith("/regulador") || path.startsWith("/api/regulator")) return role === "regulador" || role === "admision";
  if (path.startsWith("/callcenter") || path.startsWith("/api/callcenter")) return role === "callcenter" || role === "admision";
  return role === "admision";
}

export const ROLE_LABEL: Record<Role, string> = { admision: "Admisión", regulador: "Regulador", callcenter: "Central de llamadas" };
