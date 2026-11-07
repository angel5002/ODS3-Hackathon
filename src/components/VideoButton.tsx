"use client";

// "Vea cómo funciona (1 min)": opens the explainer video full screen. The player (Remotion) loads only on tap.
import { useState } from "react";
import dynamic from "next/dynamic";
import { PlayCircle } from "lucide-react";

const VideoPlayer = dynamic(() => import("./VideoPlayer"), { ssr: false });

export function VideoButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`press flex min-h-12 w-full items-center justify-center gap-2.5 rounded-full border border-vc-line bg-vc-card px-5 text-[16px] font-semibold text-vc-text hover:bg-vc-bg-2 ${className}`}
      >
        <PlayCircle className="size-5 shrink-0" aria-hidden strokeWidth={1.75} />
        Vea cómo funciona (1 min)
      </button>
      {open && <VideoPlayer onClose={() => setOpen(false)} />}
    </>
  );
}
