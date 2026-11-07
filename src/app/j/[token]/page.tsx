import type { Metadata, Viewport } from "next";
import { JuryApp, JuryMissing } from "@/components/jury/JuryApp";
import { juryOpen, loadCard, voiceAvailable } from "@/lib/jury/server";

// The QR of a printed jury card (track E, docs/jurado.md). The token is the capability: it opens only that
// card's fictitious character. Opening it makes the card playable (jury_open: phone, appointment, reminder
// or waiting-list request, re-created after a demo reset) and is recorded for the projector.
export const metadata: Metadata = { title: "Cartilla del jurado · AsistIA", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#ffffff" };
export const dynamic = "force-dynamic";

export default async function JuryCardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const card = await loadCard(token).catch(() => null);
  if (!card) return <JuryMissing />;
  try {
    await juryOpen(card.token);
  } catch (e) {
    console.error(`[jurado] no se pudo preparar la cartilla: ${(e as Error).message}`);
  }
  const voice = card.channel === "chat" ? false : await voiceAvailable();
  return <JuryApp card={card} voice={voice} />;
}
