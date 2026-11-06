import type { Metadata } from "next";
import { PanelShell } from "@/components/panel/PanelShell";

export const metadata: Metadata = { title: "Panel de Admisión" };

export default function PanelPage() {
  return <PanelShell />;
}
