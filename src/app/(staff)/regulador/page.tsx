import type { Metadata } from "next";
import { RegulatorApp } from "@/components/regulator/RegulatorApp";

export const metadata: Metadata = { title: "Regulación clínica" };

export default function RegulatorPage() {
  return <RegulatorApp />;
}
