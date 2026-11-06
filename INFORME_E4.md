# Informe de la ejecución 4 (AsistIA v4: chat web y voz en vivo)

Fecha de inicio: 6 de noviembre de 2026. Rama `main`. Fuente de verdad: `insumos/AsistIA_Propuesta_Final_Algorritmia_v4.pdf`, `docs/requisitos_v4.md` y `docs/conversaciones.md`.

## Hito 0 · Auditoría inicial

### Punto de partida

- El repositorio llega con la **ejecución 1** completa (recordatorios, teléfonos simulados, reasignación 1 a 1, llamada con guion fijo, tablero, landing y video). **No existen** las ejecuciones 2 y 3: no hay implementación de Gemini Live ni `INFORME_E3.md`. La "cadena de respaldo" de voz parte entonces de ElevenLabs → guion fijo; Gemini queda como respaldo opcional (ver decisiones).
- `git status`: limpio salvo el kit nuevo (`CLAUDE.md`, `docs/requisitos_v4.md`, `docs/conversaciones.md`, `insumos/`, `.env.example`, `PROMPT_EJECUCION_4.md`). La carpeta `AsistIA_respaldo/`, `AsistIA_respaldo.zip`, `.env.local` y el CSV original quedan en `.gitignore`.
- `.env.local` estaba en la carpeta padre (`ASISTIA/`); se copió a la raíz del repositorio, que es donde lo leen Next.js y los scripts. Faltaba `CHAT_SESSION_SECRET` (se generó localmente al azar). `ELEVENLABS_WEBHOOK_SECRET` está vacío a propósito hasta crear el webhook.
- Skills de `CLAUDE.md`: las ocho ya estaban instaladas en `.claude/skills/`.
- Voz: el agente de prueba **AsistIA prueba** usa la voz **David – Neutral Latino** (`eleven_v4_turbo`, estabilidad 0.5, similitud 0.75, velocidad 1). `npm run voice:sync` copia esa configuración de voz a los cuatro agentes.
- Seguridad: en la ejecución 1 el navegador podía leer con la clave publicable todas las tablas (incluidos nombres y teléfonos ficticios). Eso es incompatible con la vista ciega de la v4, que debe imponerse "por ninguna vía". Ver Hito 1.

### Estado de cada requisito al empezar

| Requisito | Estado inicial | Evidencia |
|---|---|---|
| §1 Datos fijos (hoy 16/10, 1,473 citas del 19/10, personajes v4) | Parcial | Las 1,473 citas existen, pero con el modelo **con** sexo y el "hoy" es el 18/10. Faltan Luis, los candidatos de Cardiología por zonas y los cupos de Dermatología y Oftalmología |
| §2 Modelo de datos v4 (`identity`, `requests`, ofertas, asignaciones, tareas, retiros, parámetros) | Falta | Solo `patients`, `appointments`, `waitlist`, `offers` 1 a 1 (`supabase/migrations/20261103025255_init_schema.sql`) |
| §3 Pantallas y roles (PIN + rol, `/regulador`, `/callcenter`, "En vivo", `/pedir-cita`) | Parcial | PIN sin roles; existen `/panel`, `/tablero`, `/demo`, `/t/[token]` |
| RF-01 Registro de toda la demanda | Falta | La lista de espera viene generada, no hay formulario |
| RF-02 Regulación con vista ciega | Falta | — |
| RF-03 Índice de prioridad y lista ordenada | Falta | La lista se ordena por días de espera |
| RF-04 Confirmación escalonada 72/48/24 h | Parcial | Un solo recordatorio, plazo de 3 h y llamada manual (`send_reminders`, `demo_tick`) |
| RF-05 Zonas, cupos protegidos y aprobación | Falta | Oferta 1 a 1 decidida en el panel |
| RF-06 Oferta simultánea y cálculo de k | Falta | — |
| RF-07 Asignación al de mayor índice | Falta | Gana el que acepta |
| RF-08 Validación con el paciente | Falta | Al aceptar se crea la cita directamente |
| RF-09 Efecto dominó | Falta | — |
| RF-10 Reprogramación validada | Falta | "Necesito otra fecha" libera el cupo sin validación |
| RF-11 Cupo del día | Falta (P2) | — |
| RF-12 Retiro solo con motivo | Falta | — |
| RF-13 Chat web en vivo | Falta | — |
| RF-14 Bot de registro con IA | Falta | — |
| RF-15 Agentes de voz de ElevenLabs | Falta | Solo `ScriptedVoiceAgent` (`src/lib/voice/scripted.ts`) |
| RF-16 Call center y carga del personal | Falta | "Pide hablar con una persona" es solo un estado de la cita |
| RF-17 Tablero v4 (tarjetas, equidad, `r ≈ s + c·f`) | Parcial | Tablero de la E1 con escenario de 2 supuestos (30 % × 70 %) |
| RF-18 FHIR | Falta (P2) | — |
| RF-19 Nota de Obstetricia | Parcial | Aviso en el detalle (55 %), falta el ícono en la tabla con 55.5 % |

## Documentación consultada

(se completa durante la ejecución)

## Decisiones y problemas

(se completa durante la ejecución)
