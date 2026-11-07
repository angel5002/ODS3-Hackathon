// "Preparar demo para la final" (E5, pitch v7). One sequence, used by the /demo button (staff action
// `prepare_final`) and by scripts/prepare-final.mjs. It RESETS the shared demo, so the team is told first.
//   1. every printed jury card back to its initial state (jury_rearm; reverts what a card gave to others, e.g. Tito);
//   2. temporary test cards ("j-test-…") removed (jury_drop_test only deletes test cards);
//   3. reset_demo(): test requests (S-0416…, «Prueba Jurado Ficticio»), test calls, chat sessions and tasks go away;
//   4. pre-visit sessions of the rehearsals deleted (demo-only table; answers and edits cascade);
//   5. jury_prepare(): the 8 cards playable (appointments, waiting-list requests);
//   6. seed_escena1(): Tito first in Oncología Médica, P1 assigned by a professional;
//   7. noisy-room mode ON and the published rule "mayor prioridad al cierre" (Tito only wins under it).
// No relative "@/…" imports: the script runs this file directly with Node's type stripping.
import type { SupabaseClient } from "@supabase/supabase-js";

export type PrepareStep = { step: string; ok: boolean; detail: string };
export type PrepareReport = { ok: boolean; steps: PrepareStep[]; ms: number };

async function call<T>(db: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args ?? {});
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export async function prepareFinal(db: SupabaseClient): Promise<PrepareReport> {
  const t0 = Date.now();
  const steps: PrepareStep[] = [];
  const run = async (step: string, fn: () => Promise<string>, fatal = true) => {
    try {
      steps.push({ step, ok: true, detail: await fn() });
      return true;
    } catch (e) {
      steps.push({ step, ok: false, detail: (e as Error).message });
      if (fatal) throw e;
      return false;
    }
  };

  try {
    const cards = await db.from("jury_cards").select("token, is_test").order("sort");
    if (cards.error) throw new Error(cards.error.message);
    const printed = (cards.data ?? []).filter((c) => !c.is_test).map((c) => c.token as string);
    const tests = (cards.data ?? []).filter((c) => c.is_test).map((c) => c.token as string);

    // a card whose rearm fails (e.g. a pending chain) is cleaned by the reset below anyway: not fatal
    await run(
      "Cartillas a su estado inicial",
      async () => {
        const failed: string[] = [];
        for (const t of printed) {
          const { error } = await db.rpc("jury_rearm", { p_token: t });
          if (error) failed.push(t);
        }
        if (failed.length) throw new Error(`no se pudieron reiniciar ${failed.join(", ")}`);
        return `${printed.length} cartillas`;
      },
      false,
    );
    await run("Cartillas de prueba borradas", async () => {
      for (const t of tests) await call(db, "jury_drop_test", { p_token: t });
      return `${tests.length} cartillas de prueba`;
    });
    await run("Demo reiniciada (datos y llamadas de prueba)", async () => {
      await call(db, "reset_demo");
      return "reset_demo()";
    });
    await run("Preconsultas de ensayo borradas", async () => {
      const { error, count } = await db.from("preconsulta_sessions").delete({ count: "exact" }).not("id", "is", null);
      if (error) throw new Error(error.message);
      return `${count ?? 0} sesiones`;
    });
    await run("Cartillas listas para jugar", async () => `${await call<number>(db, "jury_prepare")} cartillas`);
    await run("Tito listo (escena 1)", async () => {
      const r = await call<{ code: string; state: string; category: string }>(db, "seed_escena1", { p_specialty: "Oncología Médica" });
      return `${r.code} · ${r.category} · ${r.state}`;
    });
    await run("Sala ruidosa activada y regla publicada", async () => {
      const now = new Date().toISOString();
      const { error } = await db.from("settings_v51").upsert(
        [
          { key: "sala_ruidosa", value: "on", updated_at: now },
          { key: "regla_asignacion", value: "ventana_prioridad", updated_at: now },
        ],
        { onConflict: "key" },
      );
      if (error) throw new Error(error.message);
      return "sala ruidosa: sí · regla: mayor prioridad al cierre";
    });
    await run("Comprobación", async () => {
      const [visits, live, p1] = await Promise.all([
        db.from("jury_visits").select("id", { count: "exact", head: true }),
        db.from("voice_sessions").select("id", { count: "exact", head: true }).in("state", ["solicitando", "conectando", "activa"]),
        db.from("requests").select("code").eq("specialty", "Oncología Médica").eq("category", "P1"),
      ]);
      if ((live.count ?? 0) > 0) throw new Error(`${live.count} llamadas de voz siguen abiertas`);
      return `${printed.length} cartillas, ${visits.count ?? 0} aperturas registradas · 0 llamadas abiertas · P1 en Oncología Médica: ${(p1.data ?? []).map((r) => r.code).join(", ") || "ninguna"}`;
    }, false);
    return { ok: steps.every((s) => s.ok), steps, ms: Date.now() - t0 };
  } catch {
    return { ok: false, steps, ms: Date.now() - t0 };
  }
}
