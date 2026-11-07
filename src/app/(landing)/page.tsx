import type { Viewport } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandMark } from "@/components/Brand";
import { EvidenceLink } from "@/components/Evidence";
import { VideoButton } from "@/components/VideoButton";
import { DISCLAIMER } from "@/lib/labels";

// Public front page (7/11, the QR of the final points here): no PIN, one main action. Static: it reads nothing and
// writes nothing on load (no session, no database). The staff area keeps its PIN (/acceso, src/proxy.ts).
// The previous landing lives at /proyecto.
export const dynamic = "force-static";
export const viewport: Viewport = { themeColor: "#f6f7f6" };

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-vc-bg text-vc-text">
      <main className="mx-auto flex w-full max-w-[520px] flex-1 flex-col px-6 pb-8 pt-14">
        <div className="flex items-center gap-3">
          <BrandMark className="size-10" />
          <span className="text-[26px] font-bold tracking-[-0.01em]">
            Asist<span className="text-accent">IA</span>
          </span>
        </div>
        <h1 className="mt-10 text-balance font-display text-[42px] leading-[1.04]">Pida su cita aquí.</h1>
        <p className="mt-4 max-w-[34ch] text-pretty text-[18px] leading-snug text-vc-text-2">
          Un asistente que confirma citas, ofrece los cupos que se liberan y mide cada etapa de la atención.
        </p>

        <div className="mt-auto flex flex-col gap-3 pt-12">
          <Link
            href="/pedir-cita"
            prefetch={false}
            className="press flex min-h-16 w-full items-center justify-center gap-3 rounded-full bg-vc-primary px-6 text-[19px] font-semibold text-vc-on-primary hover:bg-vc-primary-press"
          >
            Pedir una cita
            <ArrowRight className="size-5" aria-hidden />
          </Link>
          <VideoButton />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-5">
            <EvidenceLink />
            <Link href="/acceso" prefetch={false} className="min-h-11 content-center text-[15px] text-vc-text-3 underline-offset-4 hover:underline">
              Acceso del personal
            </Link>
          </div>
        </div>
      </main>
      <footer className="px-6 pb-5 text-center text-[13px] leading-snug text-vc-text-3">{DISCLAIMER}</footer>
    </div>
  );
}
