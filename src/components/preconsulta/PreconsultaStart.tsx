"use client";

// /preconsulta: a person starts a demo pre-visit with a fictitious name and goes to its own link.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/Brand";
import { DISCLAIMER } from "@/lib/labels";

export function PreconsultaStart() {
  const router = useRouter();
  const [alias, setAlias] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto max-w-[640px] px-4 py-3">
          <Brand compact />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[640px] flex-1 px-4 py-6">
        <h1 className="text-[24px] font-bold leading-tight">Preconsulta</h1>
        <p className="mt-2 text-[17px] leading-relaxed">
          Antes de su cita, responda tres preguntas cortas para preparar la consulta. No es una consulta médica ni atiende emergencias.
        </p>
        <form
          className="mt-5 rounded-md border border-line bg-surface p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const res = await fetch("/api/preconsulta", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ alias }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.error ?? "No se pudo iniciar.");
              router.push(data.path);
            } catch (err) {
              setError(err instanceof Error ? err.message : "No se pudo iniciar.");
              setBusy(false);
            }
          }}
        >
          <label htmlFor="alias" className="block text-[16px] font-semibold">
            Nombre (use uno ficticio)
          </label>
          <input
            id="alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            maxLength={30}
            autoComplete="off"
            className="mt-1 min-h-12 w-full rounded-md border border-line-strong px-3 text-[16px]"
          />
          {error && (
            <p role="alert" className="mt-2 text-[15px] text-risk-alto">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="press mt-3 min-h-12 w-full rounded-md bg-brand px-4 text-[16px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
            Empezar
          </button>
        </form>
      </main>
      <footer className="border-t border-line bg-surface">
        <p className="mx-auto max-w-[640px] px-4 py-3 text-[13px] leading-snug text-muted">{DISCLAIMER}</p>
      </footer>
    </div>
  );
}
