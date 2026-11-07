// States of the development call page (shared by the server page and the client playground).
export const PLAYGROUND_STATES = [
  { id: "entrante", label: "Llamada entrante" },
  { id: "reconectar", label: "Volver a conectar" },
  { id: "conectando", label: "Conectando" },
  { id: "activa-auto", label: "Activa: conversación simulada" },
  { id: "activa-escucha", label: "Activa: te escucho" },
  { id: "activa-habla", label: "Activa: el asistente habla" },
  { id: "activa-piensa", label: "Activa: pensando" },
  { id: "guion", label: "Guion fijo con opciones" },
  { id: "finalizando", label: "Terminando" },
  { id: "finalizada", label: "Llamada finalizada" },
  { id: "ocupado-dispositivo", label: "Ocupado: otro dispositivo" },
  { id: "ocupado-capacidad", label: "Ocupado: líneas llenas" },
  { id: "sin_conexion", label: "Sin conexión de voz" },
] as const;

export type PlaygroundState = (typeof PLAYGROUND_STATES)[number]["id"];
