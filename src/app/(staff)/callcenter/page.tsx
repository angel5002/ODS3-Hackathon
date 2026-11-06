import type { Metadata } from "next";
import { CallCenterApp } from "@/components/callcenter/CallCenterApp";

export const metadata: Metadata = { title: "Call center" };

export default function CallCenterPage() {
  return <CallCenterApp />;
}
