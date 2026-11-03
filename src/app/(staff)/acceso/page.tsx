"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui";
import { post } from "@/lib/post";

function AccessForm() {
  const params = useSearchParams();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = params.get("volver");
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/panel";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/api/access", { pin });
      // Full navigation: the client router cached the earlier redirect to this page,
      // so a soft router.replace() would bounce back here and stay "Verificando…".
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
      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">Acceso del equipo</h1>
      <p className="mt-1 text-sm text-muted">Ingrese el PIN para ver el panel.</p>
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
      {error && (
        <p id="pin-error" role="alert" className="mt-2 text-sm text-risk-alto">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={busy || !pin} className="mt-5 min-h-12 w-full rounded-full">
        {busy ? "Verificando…" : "Entrar"}
      </Button>
    </form>
  );
}

export default function AccessPage() {
  return (
    <main className="mx-auto max-w-sm px-4 py-20">
      <Suspense>
        <AccessForm />
      </Suspense>
    </main>
  );
}
