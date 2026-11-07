import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import { Toaster } from "sonner";
import { APP_NAME } from "@/lib/labels";
import "./globals.css";

// "Stoic, versión salud" (docs/estilo.md): DM Sans for the interface, DM Serif Display for big titles and numbers,
// the pitch deck's pair. next/font self-hosts both at build time: no font request leaves the browser at runtime.
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const dmSerif = DM_Serif_Display({ variable: "--font-dm-serif", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Recupera citas de consulta externa que se pierden: recordatorios, llamadas y lista de espera.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${dmSans.variable} ${dmSerif.variable} antialiased`}>
      <body className="min-h-dvh">
        {children}
        {/* calm toasts: 14 px corners, a soft lift, the app font. The sound toast asks for bottom-center itself. */}
        <Toaster
          position="top-center"
          richColors
          closeButton
          toastOptions={{
            duration: 4500,
            style: {
              borderRadius: "14px",
              fontFamily: "var(--font-sans)",
              fontSize: "15px",
              boxShadow: "0 10px 30px -12px rgb(21 26 25 / 0.22)",
            },
          }}
        />
      </body>
    </html>
  );
}
