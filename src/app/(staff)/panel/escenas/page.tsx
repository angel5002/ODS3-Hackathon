import type { Metadata } from "next";
import { ScenesRehearsal } from "@/components/scenes/ScenesRehearsal";

export const metadata: Metadata = { title: "Ensayo de escenas · AsistIA" };

// Staff only (src/proxy.ts matches /panel/*): rehearse the two scenes of the pitch with the presenter keys.
// /demo's presentation mode (track D) embeds the same <ScenePlayer>.
export default function ScenesPage() {
  return <ScenesRehearsal />;
}
