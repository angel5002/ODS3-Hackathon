// The screens /dev/pantallas can render (?p=…). Shared by the server page and the client view.
export const PANTALLAS = [
  "inicio",
  "chat",
  "chat-vacio",
  "formulario",
  "vencida",
  "telefono",
  "telefono-vacio",
  "telefono-cargando",
  "telefono-enlace",
  "demo",
] as const;
export type Pantalla = (typeof PANTALLAS)[number];
