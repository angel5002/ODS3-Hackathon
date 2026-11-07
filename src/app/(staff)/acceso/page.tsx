"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Headset, Lock, ShieldCheck, UsersRound } from "lucide-react";
import { Button } from "@/components/ui";
import { post } from "@/lib/post";
import { ROLES, allowed, type Role } from "@/lib/auth";

const ICON = { admision: UsersRound, regulador: ShieldCheck, callcenter: Headset };

function AccessForm() {
  const params = useSearchParams();
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<Role>(() => {
    const next = params.get("volver") ?? "";
    return next.startsWith("/regulador") ? "regulador" : next.startsWith("/callcenter") ? "callcenter" : "admision";
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const switching = params.get("cambiar") === "1";
  const next = params.get("volver");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { home } = await post<{ home: string }>("/api/access", switching && !pin ? { role } : { pin, role });
      const target = next && next.startsWith("/") && !next.startsWith("//") && allowed(next, role) ? next : home;
      // Full navigation: the client router cached the earlier redirect to this page.
      window.location.replace(target);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rise rounded-3xl bg-surface p-7 shadow-[0_24px_60px_-30px_rgba(15,42,44,0.45)] ring-1 ring-line">
      <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand">
        <Lock className="size-6" aria-hidden />
      </span>
      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">{switching ? "Cambiar de rol" : "Acceso del equipo"}</h1>
      <p className="mt-1 text-sm text-muted">Elija su rol{switching ? "" : " e ingrese el PIN"}.</p>
      <fieldset className="mt-5">
        <legend className="text-sm font-semibold">Rol</legend>
        <div className="mt-1.5 grid gap-2">
          {ROLES.map((r) => {
            const Icon = ICON[r.id];
            const on = role === r.id;
            return (
              <label
                key={r.id}
                className={`press flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 ${on ? "border-brand bg-brand-soft/60" : "border-line hover:bg-sunken"}`}
              >
                <input type="radio" name="role" value={r.id} checked={on} onChange={() => setRole(r.id)} className="sr-only" />
                <Icon className={`size-5 shrink-0 ${on ? "text-brand" : "text-muted"}`} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{r.label}</span>
                  <span className="block text-xs text-muted">{r.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {!switching && (
        <>
          <label htmlFor="pin" className="mt-5 block text-sm font-semibold">
            PIN
          </label>
          <input
            id="pin"
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "pin-error" : undefined}
            className="mt-1.5 w-full rounded-xl border border-line-strong bg-sunken px-4 py-3 text-center text-2xl tracking-[0.5em] transition-colors focus:bg-surface"
          />
        </>
      )}
      {error && (
        <p id="pin-error" role="alert" className="mt-2 text-sm text-risk-alto">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={busy || (!switching && !pin)} className="mt-5 min-h-12 w-full rounded-full">
        {busy ? "Verificando…" : `Entrar como ${ROLES.find((r) => r.id === role)!.label}`}
      </Button>
    </form>
  );
}

export default function AccessPage() {
  return (
    <main className="mx-auto max-w-sm px-4 py-14">
      <Suspense>
        <AccessForm />
      </Suspense>
    </main>
  );
}
