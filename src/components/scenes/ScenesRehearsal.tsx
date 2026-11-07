"use client";

// Rehearsal stage for the two scenes (/panel/escenas): pick a scene, then → / Space advance and ← goes back.
// At the end of scene 1, "next" moves to scene 2 (as /demo's presentation mode does).
import { useState } from "react";
import type { SceneId } from "@/lib/demo/contract";
import { ScenePlayer } from "./ScenePlayer";

export function ScenesRehearsal() {
  const [scene, setScene] = useState<SceneId>("escena1");
  const [voice2, setVoice2] = useState(false);
  return (
    <main className="flex min-h-[calc(100dvh-4rem)] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2 text-[15px]">
        {(["escena1", "escena2"] as SceneId[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={(e) => {
              setScene(s);
              e.currentTarget.blur();
            }}
            aria-pressed={scene === s}
            className={`press min-h-10 rounded-md px-3 font-semibold ${scene === s ? "bg-brand text-white" : "border border-line-strong hover:bg-sunken"}`}
          >
            {s === "escena1" ? "Escena 1 · Tito en el hospital" : "Escena 2 · Preconsulta"}
          </button>
        ))}
        {scene === "escena2" && (
          <label className="ml-2 inline-flex items-center gap-2">
            <input type="checkbox" checked={voice2} onChange={(e) => setVoice2(e.target.checked)} className="size-4" />
            Leer la IA en voz alta
          </label>
        )}
        <span className="ml-auto text-muted">→ o Espacio: avanzar · ←: volver</span>
      </div>
      <div className="relative flex-1">
        <ScenePlayer
          key={`${scene}-${voice2}`}
          scene={scene}
          voice={scene === "escena2" ? voice2 : undefined}
          onPastEnd={() => scene === "escena1" && setScene("escena2")}
        />
      </div>
    </main>
  );
}
