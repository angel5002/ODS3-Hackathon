import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { BrandMark, Wordmark } from "@/components/Brand";
import { serverDb } from "@/lib/supabase/server";

// Development-only print page of the jury cards (track E, docs/jurado.md): A6 cards, 4 per A4 sheet, each with
// its QR to the deployed alias. tests/e2e/cartillas_pdf.py prints it to docs/cartillas/*.pdf with page.pdf().
//   /dev/cartillas            the cards (character, story, what to try)
//   /dev/cartillas?v=reserva  backup: one line of instructions per card
// Not in production. Reads the printed cards (never test cards) from public.jury_cards.
export const metadata: Metadata = { title: "Cartillas del jurado (impresión)", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const BASE = "https://asistia-e5.vercel.app";
const CHANNEL: Record<string, string> = { voz: "Por voz", chat: "Por chat", voz_o_chat: "Por voz o por chat" };
const NOTICE = "Demostración. Pacientes ficticios. Citas y modelo basados en datos abiertos reales del Hospital María Auxiliadora (2023).";

type Card = { token: string; character: string; story: string; try_line: string; channel: string; sort: number };
type Search = Record<string, string | string[] | undefined>;

const qr = (url: string) => QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#10302f", light: "#ffffff" } });

export default async function CartillasPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const reserva = (await searchParams).v === "reserva";
  const { data, error } = await serverDb()
    .from("jury_cards")
    .select("token,character,story,try_line,channel,sort")
    .eq("is_test", false)
    .order("sort");
  if (error) return <p className="p-6">No se pudieron leer las cartillas: {error.message}</p>;
  const cards = await Promise.all(
    ((data ?? []) as Card[]).map(async (c) => ({ ...c, url: `${BASE}/j/${c.token}`, svg: await qr(`${BASE}/j/${c.token}`) })),
  );
  const sheets: (typeof cards)[] = [];
  for (let i = 0; i < cards.length; i += 4) sheets.push(cards.slice(i, i + 4));

  return (
    <div className="cartillas">
      <style>{`
        @page { size: A4; margin: 0; }
        html, body { background: #fff; }
        .cartillas { color: var(--color-ink); font-family: var(--font-public-sans), system-ui, sans-serif; }
        .sheet { width: 210mm; height: 297mm; display: grid; grid-template-columns: 105mm 105mm; grid-template-rows: 148.5mm 148.5mm;
                 break-after: page; page-break-after: always; overflow: hidden; }
        .sheet:last-child { break-after: auto; page-break-after: auto; }
        .card { box-sizing: border-box; border: 0.3mm dashed #b7c4c1; padding: 7mm 7mm 5mm; display: flex; flex-direction: column; }
        .qr svg { width: 100%; height: 100%; display: block; }
        @media screen { .cartillas { background: #e9eeed; padding: 8mm 0; } .sheet { margin: 0 auto 8mm; background: #fff; } }
      `}</style>
      {sheets.map((sheet, i) => (
        <section key={i} className="sheet">
          {sheet.map((c) => (
            <article key={c.token} className="card" data-token={c.token}>
              <header className="flex items-center gap-[2mm] border-b border-line pb-[2.5mm]">
                <BrandMark className="size-[6.5mm]" />
                <Wordmark className="text-[13pt]" />
                <span className="ml-auto text-[8.5pt] font-semibold uppercase tracking-[0.08em] text-muted">Cartilla del jurado</span>
              </header>
              {reserva ? (
                <>
                  <p className="mt-[5mm] text-[9pt] font-semibold uppercase tracking-[0.08em] text-muted">Usted es</p>
                  <h2 className="text-[26pt] font-bold leading-none">{c.character}</h2>
                  <p className="mt-[4mm] text-pretty text-[13pt] font-semibold leading-snug">{c.try_line}</p>
                  <p className="mt-[3mm] text-[10pt] text-muted">Escanee el código con la cámara del celular · {CHANNEL[c.channel]}</p>
                </>
              ) : (
                <>
                  <p className="mt-[4mm] text-[8.5pt] font-semibold uppercase tracking-[0.08em] text-muted">Usted es</p>
                  <h2 className="text-[24pt] font-bold leading-none">{c.character}</h2>
                  <p className="mt-[2.5mm] text-pretty text-[10.5pt] leading-snug">{c.story}</p>
                  <div className="mt-[3mm] border-l-[1.2mm] border-brand bg-brand-soft px-[3mm] py-[2mm]">
                    <p className="text-[7.5pt] font-semibold uppercase tracking-[0.08em] text-muted">Qué puede probar · {CHANNEL[c.channel]}</p>
                    <p className="mt-[0.8mm] text-pretty text-[10.5pt] font-semibold leading-snug">{c.try_line}</p>
                  </div>
                </>
              )}
              <div className="mt-auto flex items-end gap-[4mm] pt-[3mm]">
                <div className="qr size-[34mm] shrink-0" dangerouslySetInnerHTML={{ __html: c.svg }} />
                <div className="min-w-0 pb-[0.5mm] text-[8pt] leading-snug text-muted">
                  <p className="text-[9pt] font-semibold text-ink">Escanee con la cámara</p>
                  <p className="mt-[1mm] break-all font-semibold text-ink">{c.url.replace("https://", "")}</p>
                  <p className="mt-[1.5mm]">Personaje ficticio: no use datos reales.</p>
                </div>
              </div>
              <p className="mt-[2.5mm] border-t border-line pt-[1.5mm] text-[6.5pt] leading-snug text-faint">{NOTICE}</p>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
