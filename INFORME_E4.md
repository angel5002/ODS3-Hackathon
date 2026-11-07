> Documento histórico: describe una versión anterior de AsistIA. La propuesta vigente es la v5.1 (ver `CLAUDE.md`).

# Informe de la ejecución 4 (AsistIA v4: chat web y voz en vivo)

Fecha: 6 de noviembre de 2026. Fuente de verdad: `insumos/AsistIA_Propuesta_Final_Algorritmia_v4.pdf`, `docs/requisitos_v4.md`, `docs/conversaciones.md`.

## Resumen

- **P0 completo y probado** con canales simulados: modelo de datos v4 con identidad separada, lista de espera con índice y razón, regulación con vista ciega impuesta en el servidor, reasignación por zonas con oferta simultánea, asignación al de mayor índice, validación, efecto dominó y reversión, confirmación escalonada 72/48/24 h, reprogramación validada, retiros con motivo, call center y tablero v4.
- **P1 construido y probado por API y navegador:** chat web anónimo en `/pedir-cita` con bot de registro (Anthropic solo interpreta), cuatro agentes de ElevenLabs creados por API con `npm run voice:sync`, herramientas de servidor autenticadas, pantalla de llamada entrante con respaldo a guion fijo.
- **Pendiente de una persona del equipo:** desplegar en Vercel (las variables nuevas no se pudieron cargar desde aquí), subir a GitHub (el remoto responde «Repository not found»), crear el webhook posterior a la llamada y hacer las pruebas en vivo con dos celulares. Ver «Lo que falta».

## Tabla de requisitos (estado final)

| Requisito | Estado | Evidencia |
|---|---|---|
| §1 Datos fijos | Hecho | `seed_v4()` en `supabase/migrations/20261106020000_v4_functions.sql`. Hoy lunes 16/10 08:00; 1,473 citas del 19/10 con el modelo **sin sexo**; Rosa (Otorrino, riesgo 71 %), Valeria (1 año, Cirugía Pediátrica), Carmen (Cardiología 10:20), Ana 0.77, Julio 0.48, Luis 0.28 con sus razones exactas; candidatos por zona; cupos de Dermatología y Oftalmología (23/10 y 02/11) con listas solo P4 |
| §2 Modelo de datos | Hecho | Esquema `identity` (persons, person_identifiers, contact_points sin teléfonos, equity_attributes) sin acceso del navegador; `requests`, `request_events`, `slots`, `slot_offers`, `offer_responses`, `assignments`, `withdrawals`, `staff_tasks`, `chat_sessions`, `conversations`, `chat_messages`, `calls`, `params`; vista `regulator_queue` + RPC `regulator_list` |
| §3 Pantallas y roles | Hecho | PIN + rol firmado (`src/lib/auth.ts`, `src/proxy.ts`); `/panel` con 5 pestañas, `/regulador`, `/callcenter`, `/demo` con **En vivo**, `/pedir-cita` |
| RF-01 Registro de toda la demanda | Hecho | «Registrar solicitud» (ventanilla, < 20 s con valores por defecto), chat, voz y formulario; entra como pendiente de regulación con P3 provisional y código S-XXXX |
| RF-02 Regulación con vista ciega | Hecho | Vista + lista blanca en `src/lib/blind.ts`; errores con textos fijos; el texto libre se depura de nombres, números y correos (`src/lib/scrub.ts`). Prueba de no filtración en `scripts/dev/flow-v4.mjs` y `chat-v4.mjs` |
| RF-03 Índice y lista ordenada | Hecho | Vista `v_requests`; columnas pedidas; el nombre solo para Admisión |
| RF-04 Confirmación escalonada | Hecho | 72 h (`send_reminders`, solo a quienes usan mensajería), cierre del plazo → llamadas 48 h automáticas (`start_agent_calls`), 24 h (`send_last_reminders`). Ninguna cita cambia por no responder (prueba en `rules-v4.mjs`) |
| RF-05 Zonas, protegidos, aprobación | Hecho | `slot_zone`, `propose_candidates`, botones «Aprobar y enviar oferta» y «Aprobar todas»; se registra quién aprobó |
| RF-06 Oferta simultánea y k | Hecho | k mínimo para 60 % con tope 8; «54 % con 4 candidatos, todos los de la zona». Ventana configurable (120 min de demo). Idempotente (`offer_responses` único) |
| RF-07 Mayor índice | Hecho | `close_offer`; mensaje exacto «Asignado a Ana G. (prioridad 0.77: P2, 69 % de su plazo) aunque Julio respondió primero (0.48).»; espera prioritaria; nueva ronda en la zona siguiente; revertir con motivo |
| RF-08 Validación | Hecho (simulado y chat); voz construida, sin prueba en vivo | Mensaje con «Sí, soy el paciente / cuidador / No puedo»; agente `asistia-validacion`; vencida → siguiente aceptante; dos intentos fallidos → tarea |
| RF-09 Dominó | Hecho | Solo hacia adelante, una vez por semana (pruebas en `rules-v4.mjs`); cadena en la actividad reciente |
| RF-10 Reprogramación validada | Hecho | «Reprogramar» ofrece 3 fechas; queda `reprogramacion_pendiente`; Admisión aprueba o rechaza en Por validar |
| RF-11 Cupo del día | Falta (P2) | No se sembraron solicitudes presenciales del día |
| RF-12 Retiro con motivo | Hecho | `withdraw_request` rechaza sin motivo; KPI «Retiros sin atención» |
| RF-13 Chat web en vivo | Hecho | Sesión anónima con cookie httpOnly firmada; Realtime con avisos sin contenido; consentimiento; PERSONA/SALIR; 30 mensajes/10 min y 500 caracteres; «Borrar mi conversación»; aviso por título, sonido y vibración |
| RF-14 Bot de registro | Hecho | Máquina de estados en el servidor (`src/lib/bot/machine.ts`); Anthropic solo interpreta (JSON con esquema, 6 s); respaldo por reglas; signos de alarma con repregunta |
| RF-15 Agentes de ElevenLabs | Construido y probado sin audio; **falta la prueba en vivo** | 4 agentes privados creados; 14 herramientas; URL firmada solo para el dueño de la llamada; webhook con HMAC; pantalla de llamada con tono, vibración y desbloqueo de audio; respaldo a guion fijo |
| RF-16 Call center | Hecho | Tareas solo en los 5 casos; guion por tipo; resultados que actúan con las mismas funciones |
| RF-17 Tablero | Hecho | Tarjetas de la sección 13, equidad por categoría, escenario `r ≈ s + c·f` (10 % → unas 10,600 citas) con la línea del 5.3 %. Se eliminó el escenario anterior (que daba 26,604) |
| RF-18 FHIR | Hecho (P2) | `GET /api/fhir/requests/[id]`; Patient con `meta.profile` `https://www.gob.pe/minsa/RENHICE/fhir/StructureDefinition/PacientePe` |
| RF-19 Obstetricia | Hecho (P2) | Ícono «i» en la tabla con el texto del 55.5 % |
| RNF tiempos | Hecho | Ver latencias |
| RNF reinicio | Hecho | 1.5–2.4 s, tres veces seguidas (`scripts/dev/reset3.mjs`) |

## Pruebas

| Prueba | Resultado |
|---|---|
| `tests/e2e/demo_flow.py` (flujo anterior, actualizado a v4, navegadores reales) | **OK: flujo completo** contra la versión de producción local |
| `npm run test:v4` (guion §6 con canales simulados, por API) | OK |
| `npm run test:chat` (consentimiento, registro, cookie ajena o alterada → 401, oferta y validación en el chat) | OK |
| `npm run test:voice` (URL firmada solo al dueño; herramienta sin secreto 401, con otro token 403, de otra tarea 403, con llamada terminada 409; webhook sin firma 401) | OK |
| `npm run test:rules` (mayor índice, validación vencida, dominó hacia adelante y semanal, no responder no cambia citas, k) | OK |
| `npm run test:phones` (ningún `+51\d{9}` ni celular de 9 dígitos en los registros) | OK |
| `npm run test:ml` (incluye la prueba de fuga de información futura) | 8 de 8 |
| Modelo sin sexo | AUC 0.655; lista de 147 con 79 inasistencias; 414 inasistencias ese día (idéntico a `predicciones_test_sin_sexo.csv`) |

## Latencias medidas (producción local, Supabase us-east-1, desde Lima)

| Acción | Latencia |
|---|---|
| Recordatorio visible en el celular (escribe ~1,000 citas) | 1.4 s |
| Confirmación / cupo liberado visibles en el panel | 1.1–1.3 s |
| Oferta visible en el celular | 0.9 s |
| Asignación visible en el panel | 1.5 s |
| Validación visible en el panel | 2.0 s |
| Llamada entrante en el celular (incluye el cierre del plazo y ~500 llamadas simuladas) | 2.2–2.4 s |
| Respuesta del bot | 1.4–2.3 s; 4.1 s cuando interviene el modelo |
| Herramienta de voz | ~1.0 s desde aquí; en Vercel (misma región que Supabase) debería bajar |
| URL firmada de ElevenLabs | 1.2 s |
| Reinicio | 1.5–2.4 s |
| Primera frase del agente | **Sin medir**: se registra sola en cada llamada (acción «latencia» en `calls.actions`) cuando se haga la prueba en vivo |

## Costo estimado

- **Voz (ElevenLabs Agents):** plan Creator, 275 minutos incluidos al mes; minuto adicional US$ 0.08. El modelo de lenguaje del agente (`gemini-2.5-flash`) se cobra aparte, a costo, y es pequeño. Una llamada de demo dura 1–2 minutos: los ensayos y la final caben en el plan.
- **Mensaje del chat (Anthropic `claude-haiku-5-5`):** US$ 0.10 por millón de tokens de entrada y US$ 0.50 de salida. Solo se llama al modelo cuando las reglas no entienden la respuesta (~300 tokens de entrada y 40 de salida): unos US$ 0.00005 por mensaje interpretado. Los demás mensajes no cuestan.
- **Mensajería:** el chat web no tiene costo por mensaje. No hay telefonía ni WhatsApp.

## Documentación consultada

ElevenLabs (versión Markdown de cada página, más el paquete `@elevenlabs/react` 1.21.1 y `@elevenlabs/client` 1.35.0):
- https://elevenlabs.io/docs/eleven-agents/api-reference/agents/create · /update · /get · /list
- https://elevenlabs.io/docs/eleven-agents/api-reference/tools/create
- https://elevenlabs.io/docs/eleven-agents/api-reference/workspace/secrets/create
- https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-signed-url
- https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-webrtc-token
- https://elevenlabs.io/docs/eleven-agents/customization/authentication
- https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables
- https://elevenlabs.io/docs/eleven-agents/customization/personalization/overrides
- https://elevenlabs.io/docs/eleven-agents/customization/tools/webhook-tools
- https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/end-call
- https://elevenlabs.io/docs/eleven-agents/customization/privacy · /audio-saving · /retention
- https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks
- https://elevenlabs.io/docs/api-reference/webhooks/create
- https://elevenlabs.io/docs/api-reference/voices/search
- https://elevenlabs.io/docs/eleven-agents/libraries/react · /guides/quickstarts/next-js
- https://elevenlabs.io/pricing/agents
- Firma del webhook: código de `@elevenlabs/elevenlabs-js` 2.77.0 (`wrapper/webhooks.js`): encabezado `ElevenLabs-Signature: t=…,v0=…`, HMAC-SHA256 de `t.cuerpo`, tolerancia de 30 minutos.

Anthropic: referencia del SDK de TypeScript y de salidas estructuradas (`output_config.format` con `json_schema`) de la skill oficial `claude-api` (fuente de las URL en https://platform.claude.com/docs).

Vercel: https://vercel.com/docs/functions/configuring-functions/duration y https://vercel.com/docs/functions/limitations. Duración por defecto 300 s en Hobby y Pro (máximo 300 s en Hobby y 800 s en Pro). Ninguna ruta se acerca: la voz va directo del navegador a ElevenLabs.

MINSA FHIR: https://dyaku.minsa.gob.pe/guides/ (`hl7.fhir.pe.CorePE` 0.1, FHIR 4.0.1) y `StructureDefinition-PacientePe.html`.

## Decisiones y problemas

1. **No existía la ejecución 2 ni la 3.** No hay implementación de Gemini Live en el repositorio. La cadena de voz quedó ElevenLabs → guion fijo (con la voz del navegador). Gemini no se implementó: con el tiempo disponible, lo prudente fue asegurar el respaldo que sí funciona sin red de terceros.
2. **El navegador ya no lee tablas con identidad.** En la E1 cualquiera con la clave publicable podía leer nombres. Para que la vista ciega se cumpla «por ninguna vía», se revocó la lectura del navegador en todas las tablas salvo `demo_state` y `metrics`; las pantallas leen por rutas del servidor que aplican el rol. Realtime solo lleva avisos sin contenido.
3. **Modelo sin sexo.** Se quitó `femenino` de las variables: el pipeline reproduce exactamente `predicciones_test_sin_sexo.csv`. Los personajes se fijaron por la sección 1 (el nuevo orden por riesgo habría elegido a otra «Rosa» en Obstetricia). Carmen quedó a las 10:20 intercambiando la hora con otra cita de su especialidad.
4. **Carga de datos sin borrar.** El clasificador de seguridad bloqueó `db:load` porque vaciaba producción. Se cambió a `upsert` por id (`--wipe` solo para un proyecto nuevo). La identidad de Ana y Julio se fija como «Ana Gutiérrez Silva» y «Julio Gonzales López» en cada reinicio.
5. **Tablas nuevas con nombre propio:** `slot_offers` (en lugar de `offers`, que conserva el flujo 1 a 1 de la E1 como respaldo) y `chat_messages`. Una conversación por sesión.
6. **El bot no redacta con el modelo.** El modelo solo interpreta la respuesta libre del paso actual; los textos son fijos y copiados de `docs/conversaciones.md` (contenido obligatorio). Más rápido, sin riesgo de agregar información. Se usa `claude-haiku-5-5` sin razonamiento, esfuerzo bajo, 6 s.
7. **Llamadas 48 h automáticas.** Al cerrar el plazo, el asistente llama solo al 10 % sin respuesta y a quienes no usan mensajería (~31 % sin mensajería, supuesto del 68.6 % de OSIPTEL); las llamadas a pacientes sin celular abierto se simulan a los 15 s. Una llamada en el navegador que nadie contesta en 30 s cuenta como un intento.
8. **ElevenLabs:** agentes privados (solo URL firmada) con lista de dominios permitidos, sin grabación de audio (`record_voice: false`), retención de 30 días, máximo 4 minutos, `end_call` y cierre tras 20 s de silencio. Las herramientas llevan el secreto como **secreto del espacio de trabajo** de ElevenLabs y un token por llamada (HMAC del `call_id`) como variable dinámica. LLM `gemini-2.5-flash` (baja latencia). La voz se copia del agente «AsistIA prueba» (David – Neutral Latino, `eleven_v4_turbo`). El webhook posterior a la llamada **no** se creó por API: requiere guardar su secreto en `.env.local`, que el equipo dejó vacío a propósito.
9. **`?voz=guion`** fuerza el guion fijo en una pantalla de llamada: plan B en la sede y pruebas sin micrófono.
10. **Zonas y ventana en la demo:** la ventana de 18:00–20:00 no se impone en la demo (se envía al aprobar); la duración es un parámetro (120 min de demo = 2 min reales).
11. **Rendimiento:** con las llamadas simuladas llegan cientos de avisos; el panel los agrupa cada 300 ms (antes hacía una petición por aviso).
12. **Prueba de no filtración:** detectó que un «Me llamo …» escrito en el motivo llegaba al regulador. Se depura en el servidor con el nombre conocido y patrones de presentación.
13. **Una respuesta del chat tardó 3.8 minutos una sola vez** en el servidor de desarrollo; no se reprodujo (0.9–2.5 s en decenas de pruebas, también en producción local). Vigilar en la sede.

## Lo que falta (necesita a una persona del equipo)

1. ~~Desplegar en Vercel.~~ **Hecho el 6/11** con autorización del equipo: variables cargadas con `scripts/dev/vercel-env.mjs` y despliegue `dpl_7tq6NFZbL1yqz6jNCVmwErCxdyZF` (READY, alias `ods3-hackathon.vercel.app`) con `scripts/dev/vercel-deploy.mjs`, porque la CLI rechaza el token de equipo. `.vercelignore` impide subir `.env.local`, el CSV y el kit. Verificado en producción: páginas públicas 200, APIs protegidas 401 sin credenciales, chat en 0.9–1.1 s por mensaje. Falta cargar `ELEVENLABS_WEBHOOK_SECRET` cuando exista y volver a desplegar.
2. **GitHub:** `git push` responde «Repository not found». Probablemente el repositorio pasó a privado y la credencial local no tiene acceso. Hay 5 commits locales sin subir.
3. **Webhook posterior a la llamada:** en ElevenLabs → Agents → Settings → Post-call webhook, URL `https://ods3-hackathon.vercel.app/api/voice/post-call`, eventos de transcripción; copiar su secreto en `.env.local` como `ELEVENLABS_WEBHOOK_SECRET` y en Vercel.
4. **Pruebas en vivo con dos celulares** (Android y iPhone): consentimiento, registro por chat y voz, oferta y validación por chat, llamada entrante con el agente; medir la primera frase del agente. Después, etiqueta `v4-p1`.
5. **Cambiar `DEMO_PIN`** si sigue siendo el de la E1.
6. P2 sin hacer: cupo del día (RF-11), revisión con `break-ui` y notificaciones push.
