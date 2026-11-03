import { SiteFooter } from "@/components/SiteFooter";
import { StaffHeader } from "@/components/StaffHeader";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:font-semibold">
        Saltar al contenido
      </a>
      <StaffHeader />
      <div id="contenido" className="flex-1">
        {children}
      </div>
      <SiteFooter />
    </div>
  );
}
