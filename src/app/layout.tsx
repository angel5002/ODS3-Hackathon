import type { Metadata, Viewport } from "next";
import { Public_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { APP_NAME } from "@/lib/labels";
import "./globals.css";

// one typeface for everything (docs/estilo.md)
const publicSans = Public_Sans({ variable: "--font-public-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

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
    <html lang="es" className={`${publicSans.variable} antialiased`}>
      <body className="min-h-dvh">
        {children}
        {/* flat toasts: 4 px corners, a 1 px border, the app font. The sound toast asks for bottom-center itself. */}
        <Toaster
          position="top-center"
          richColors
          closeButton
          toastOptions={{
            duration: 4500,
            style: {
              borderRadius: "4px",
              fontFamily: "var(--font-sans)",
              fontSize: "15px",
              boxShadow: "0 6px 16px -8px rgb(16 48 47 / 0.28)",
            },
          }}
        />
      </body>
    </html>
  );
}
