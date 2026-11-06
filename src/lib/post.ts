/** Client helper: POST JSON to our API and throw its friendly error message. */
export async function post<T = Record<string, unknown>>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "No se pudo completar la acción.");
  return data as T;
}

/** Client helper: GET JSON from our API (all reads go through the server since v4). */
export async function getJson<T = Record<string, unknown>>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "No se pudo cargar la información.");
  return data as T;
}
