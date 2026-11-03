import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Public_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { APP_NAME } from "@/lib/labels";
import "./globals.css";

const publicSans = Public_Sans({ variable: "--font-public-sans", subsets: ["latin"] });
const display = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], weight: ["500", "700", "800"] });

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Recupera citas de consulta externa que se pierden: recordatorios, llamadas y lista de espera.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#eef2f0",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${publicSans.variable} ${display.variable} antialiased`}>
      <body className="min-h-dvh">
        {children}
        <Toaster position="top-center" richColors closeButton toastOptions={{ duration: 4500 }} />
      </body>
    </html>
  );
}
