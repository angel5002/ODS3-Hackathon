// Simple PIN gate for staff screens (RF-41). The URL is public; the PIN keeps
// casual visitors out of the panel, the board and the demo controls.
export const PIN_COOKIE = "demo_access";

export async function pinToken(pin: string) {
  const data = new TextEncoder().encode(`ods3-hackathon:${pin}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isValidAccess(cookieValue: string | undefined) {
  const pin = process.env.DEMO_PIN;
  if (!pin || !cookieValue) return false;
  return cookieValue === (await pinToken(pin));
}
