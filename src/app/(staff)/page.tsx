import Link from "next/link";
import { APP_NAME } from "@/lib/labels";

const STEPS = [
  ["Estima el riesgo", "Cada cita de mañana recibe una probabilidad de inasistencia y una explicación sencilla."],
  ["Recuerda por mensaje", "Todas las citas reciben un recordatorio con botones para confirmar o liberar el cupo."],
  ["Llama a quien no responde", "Un asistente automático llama y deja registrada la respuesta."],
  ["Ofrece el cupo libre", "El personal elige a quién de la lista de espera se le ofrece el cupo. Nada se reasigna solo."],
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-ink">{APP_NAME}</h1>
      <p className="mt-3 max-w-[62ch] text-lg leading-relaxed text-muted">
        En 2023, en el Hospital María Auxiliadora, 1 de cada 4 citas de consulta externa programadas no se atendió:
        106,100 citas, unas 347 por día, mientras otros pacientes hacían cola desde la madrugada. Este prototipo
        ayuda a recuperar esos cupos.
      </p>
      <ol className="mt-8 grid gap-3 sm:grid-cols-2">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-sm font-semibold text-brand">Paso {i + 1}</p>
            <p className="mt-1 font-semibold">{t}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{d}</p>
          </li>
        ))}
      </ol>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/panel" className="press rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-hover">
          Abrir el panel de citas
        </Link>
        <Link href="/tablero" className="press rounded-lg border border-line-strong bg-surface px-4 py-2.5 font-semibold hover:bg-sunken">
          Ver el tablero
        </Link>
        <Link href="/demo" className="press rounded-lg border border-line-strong bg-surface px-4 py-2.5 font-semibold hover:bg-sunken">
          Controles de demo
        </Link>
      </div>
      <p className="mt-4 text-sm text-muted">Las tres pantallas piden el PIN del equipo. Los pacientes entran desde los códigos QR.</p>
    </main>
  );
}
