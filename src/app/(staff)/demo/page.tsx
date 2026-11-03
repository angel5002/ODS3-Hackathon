import type { Metadata } from "next";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { DemoControls } from "@/components/demo/DemoControls";
import { serverDb } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Demo y códigos QR" };
export const dynamic = "force-dynamic";

type DemoPatient = {
  id: string;
  full_name: string;
  age: number;
  token: string;
  demo_role: string;
  demo_label: string;
  demo_order: number;
  caregiver_name: string | null;
  caregiver_relation: string | null;
};

export default async function DemoPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const db = serverDb();
  const [{ data: patients }, { data: card }] = await Promise.all([
    db.from("patients").select("id,full_name,age,token,demo_role,demo_label,demo_order,caregiver_name,caregiver_relation").not("demo_role", "is", null).order("demo_order"),
    db.from("metrics").select("value").eq("key", "model_card").single(),
  ]);
  const ids = (patients ?? []).map((p) => p.id);
  const [{ data: appts }, { data: waits }] = await Promise.all([
    db.from("appointments").select("patient_id,specialty,time,risk").in("patient_id", ids).eq("is_base", true),
    db.from("waitlist").select("patient_id,specialty,wait_days").in("patient_id", ids),
  ]);

  const cards = await Promise.all(
    ((patients ?? []) as DemoPatient[]).map(async (p) => {
      const url = `${origin}/t/${p.token}`;
      const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#16212c", light: "#ffffff" } });
      const a = appts?.find((x) => x.patient_id === p.id);
      const w = waits?.find((x) => x.patient_id === p.id);
      const detail = a
        ? `Cita de ${a.specialty} a las ${a.time} · riesgo ${Math.round(a.risk * 100)} %`
        : w
          ? `Lista de espera de ${w.specialty} · espera ${w.wait_days} días`
          : "";
      return { ...p, url, svg, detail };
    }),
  );

  return <DemoControls cards={cards} assumptions={card?.value?.simulation_assumptions ?? null} />;
}
