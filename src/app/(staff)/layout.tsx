import { SiteFooter } from "@/components/SiteFooter";
import { StaffHeader } from "@/components/StaffHeader";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <StaffHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
