// Remotion entry for the MP4 export (npx remotion render src/video/index.ts asistia). The page plays the same
// composition with @remotion/player (src/components/VideoButton.tsx).
import { Composition } from "remotion";
import { loadFont as loadSans } from "@remotion/google-fonts/DMSans";
import { loadFont as loadSerif } from "@remotion/google-fonts/DMSerifDisplay";
import { AsistiaVideo, VIDEO } from "./AsistiaVideo";

loadSans("normal", { weights: ["400", "600", "700"], subsets: ["latin"] });
loadSerif("normal", { weights: ["400"], subsets: ["latin"] });

export function RemotionRoot() {
  return <Composition id="asistia" component={AsistiaVideo} {...VIDEO} />;
}
