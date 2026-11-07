// The hospital named by the voice agents and on the call screens, in ONE place: voice/hospital.json (the
// agents get it through scripts/voice-sync.mjs, which replaces %HOSPITAL% in voice/agents/*.json).
import hospital from "../../../voice/hospital.json";

export const HOSPITAL_NAME: string = hospital.name;
