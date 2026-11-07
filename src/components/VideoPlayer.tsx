"use client";

// The explainer video (src/video/AsistiaVideo.tsx) played live in the page with @remotion/player: no video file to
// download, so it is quick on mobile data. Full screen, no sound (the video has none), pause / back / forward / close.
import { useEffect, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { Pause, Play, RotateCcw, RotateCw, X } from "lucide-react";
import { AsistiaVideo, VIDEO } from "@/video/AsistiaVideo";

export default function VideoPlayer({ onClose }: { onClose: () => void }) {
  const ref = useRef<PlayerRef>(null);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const p = ref.current;
    if (!p) return;
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    p.addEventListener("play", on);
    p.addEventListener("pause", off);
    p.addEventListener("ended", off);
    return () => {
      p.removeEventListener("play", on);
      p.removeEventListener("pause", off);
      p.removeEventListener("ended", off);
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prev;
    };
  }, [onClose]);

  const seek = (s: number) => {
    const p = ref.current;
    if (!p) return;
    const f = Math.max(0, Math.min(VIDEO.durationInFrames - 1, p.getCurrentFrame() + s * VIDEO.fps));
    p.seekTo(f);
  };
  const btn = "grid size-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20";

  return (
    <div role="dialog" aria-modal="true" aria-label="Cómo funciona AsistIA" className="fixed inset-0 z-50 flex flex-col bg-[#0e1211]">
      <div className="flex justify-end p-3">
        <button type="button" onClick={onClose} aria-label="Cerrar" className={btn}>
          <X className="size-6" aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-2">
        <Player
          ref={ref}
          component={AsistiaVideo}
          durationInFrames={VIDEO.durationInFrames}
          fps={VIDEO.fps}
          compositionWidth={VIDEO.width}
          compositionHeight={VIDEO.height}
          autoPlay
          clickToPlay
          initiallyMuted
          acknowledgeRemotionLicense
          style={{ width: "100%", maxHeight: "100%", aspectRatio: "16 / 9" }}
        />
      </div>
      <div className="flex items-center justify-center gap-4 p-5">
        <button type="button" onClick={() => seek(-10)} aria-label="Retroceder 10 segundos" className={btn}>
          <RotateCcw className="size-6" aria-hidden />
        </button>
        <button type="button" onClick={() => ref.current?.toggle()} aria-label={playing ? "Pausar" : "Reproducir"} className="grid size-16 place-items-center rounded-full bg-white text-[#151a19]">
          {playing ? <Pause className="size-7" aria-hidden /> : <Play className="size-7" aria-hidden />}
        </button>
        <button type="button" onClick={() => seek(10)} aria-label="Avanzar 10 segundos" className={btn}>
          <RotateCw className="size-6" aria-hidden />
        </button>
      </div>
    </div>
  );
}
