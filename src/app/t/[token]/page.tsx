import type { Metadata, Viewport } from "next";
import { PhoneApp } from "@/components/phone/PhoneApp";

export const metadata: Metadata = { title: "Mensajes del hospital (simulado)" };
export const viewport: Viewport = { themeColor: "#ffffff" };

export default async function PhonePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PhoneApp token={token} />;
}
