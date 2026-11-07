// Pre-visit (track C), for /demo (track D) and the staff pages.
//
//   <DoctorSummary summary={detail} />                 // presentational: the doctor's summary
//   <DoctorLive sessionId={id} compact />               // live (polls /api/staff/preconsulta?id=, 1.5 s), "Corregir"
//   <PreconsultaDesk />                                 // create a link + list + live view (staff)
//   <PreconsultaChat token={token} />                   // the patient's chat (public page /preconsulta/<token>)
//
// Create a link from code: POST /api/staff/preconsulta {action:"create", alias, time?: "10:15", gender?: "m"|"f"}
//   → { id, token, path: "/preconsulta/<token>" }   (staff only)
export { DoctorSummary, type DoctorSummaryProps, type PreconsultaEdit, type EditableField } from "./DoctorSummary";
export { DoctorLive, PreconsultaDesk, type DoctorLiveProps, type DoctorDetail, type PreconsultaDeskProps } from "./DoctorLive";
export { PreconsultaChat, type PreconsultaChatProps, type PatientView } from "./PreconsultaChat";
export type { PreconsultaDetail } from "@/lib/preconsulta/machine";
