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
    <form onSubmit={submit} className="rounded-xl border border-line bg-surface p-6">
      <div className="flex items-center gap-2">
        <Lock className="size-5 text-brand" aria-hidden />
        <h1 className="text-xl font-bold">Acceso del equipo</h1>
      </div>
      <p className="mt-2 text-sm text-muted">El panel, el tablero y los controles de demo piden el PIN del equipo.</p>
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
        className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-lg tracking-[0.3em]"
      />
      {error && (
        <p id="pin-error" role="alert" className="mt-2 text-sm text-risk-alto">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={busy || !pin} className="mt-4 w-full">
        {busy ? "Verificando…" : "Entrar"}
      </Button>
    </form>
  );
}

export default function AccessPage() {
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <Suspense>
        <AccessForm />
      </Suspense>
    </main>
  );
}
