import type { Metadata } from "next";
import { Board } from "@/components/board/Board";

export const metadata: Metadata = { title: "Tablero" };

export default function BoardPage() {
  return <Board />;
}
