# Diagnóstico del agente de voz (E5, hito 1)

Fecha: 6–7 de noviembre de 2026. Rama `e5`, creada desde `e4-original` (`387a707`, tag `v4-p0`). Todavía no se corrige nada: este documento solo registra lo que se reprodujo, con su evidencia, y la corrección prevista para el hito 2.

## 1. Resumen

| # | Error | ¿Reproducido? | Dónde ocurre | Prioridad |
|---|---|---|---|---|
| E1 | Una misma llamada se contesta en dos lugares, se abren **dos sesiones de voz** y, cuando una cuelga, **la otra se corta** | Sí (escenario B) | Teléfono simulado en dos pestañas; también un chat vinculado al personaje (por código) | P0 |
| E2 | Al **cerrar la pestaña** en plena llamada, la llamada queda `en_curso` para siempre; al **reabrir** el teléfono la pantalla se queda en «Conectando…» sin conectar | Sí (escenario G) | `/t/[token]` y `/pedir-cita` | P0 |
| E3 | Si se toca «Empezar la llamada» antes de que exista la sesión de chat, falla con un **401** y el mensaje engañoso «Su sesión de chat venció. Recargue la página.» | Sí (escenario C0) | `/pedir-cita` → Hablar con el asistente | P0 |
| E4 | En **desarrollo** (`npm run dev`) la llamada se conecta y **se corta sola a los 0.5 s** por el doble montaje del modo estricto de React | Sí (escenario S, solo en desarrollo) | Todas las llamadas en `npm run dev`; **no** en producción | P1 (solo afecta las pruebas locales) |
| E5 | La pantalla de llamada no muestra el estado ni el audio: no hay visualización, ni silenciar, ni subtítulos que se puedan ocultar, ni estados de ocupado o error | Sí (código y capturas) | Todas las llamadas | P0 (hito 3) |
| E6 | En la llamada de prueba el agente dice «¿Hablo con **o** con su cuidador?»: llega vacío el nombre del paciente | Sí (captura) | `test_call` desde `/demo` | P1 |

**No se reprodujo** ninguna falla de concurrencia propiamente dicha:
- **4 llamadas simultáneas** en contextos distintos (escenario A): las 4 conectaron.
- **Voz y chat a la vez** (escenario C): funcionó.
- **Colgar y volver a llamar** (escenario D): funcionó.
- **Doble toque** (escenario E): sin falla.
- **Dos llamadas desde `/demo`** (escenario F): funcionó.

En ningún caso hubo URL firmadas compartidas, variables dinámicas cruzadas ni eventos de una sesión en otra. Los fallos reproducidos son de **ciclo de vida** de la sesión (E1, E2, E3, E4), no de capacidad.

## 2. Cómo está implementada la voz hoy

- **SDK instalado:** `@elevenlabs/react` 1.21.1 y `@elevenlabs/client` 1.35.0.
  - En esta versión `useConversation()` devuelve `startSession: (options) => void`, que no es una promesa (`node_modules/@elevenlabs/react/dist/conversation/useConversation.d.ts`). La documentación actual dice que devuelve una promesa: **la versión instalada no coincide con la documentación**.
  - Expone `endSession`, `setMuted`/`isMuted` (no existe `setMicMuted`), `getInputByteFrequencyData`, `getOutputByteFrequencyData`, `getInputVolume`, `getOutputVolume` y `getId`.
  - Exige `ConversationProvider`.
- **Componentes:**
  - `src/components/phone/ElevenLabsCall.tsx`: monta un `ConversationProvider` propio por llamada, nunca uno global en el layout, y no dibuja nada (`return null`).
  - `src/components/phone/CallScreen.tsx`: pantalla de llamada entrante. La usan el teléfono simulado `/t/[token]` y el chat de `/pedir-cita` cuando le llaman.
  - `VoiceRegister`, en `src/components/chat/PedirCita.tsx`: registro por voz que inicia la persona. Tiene su propia pantalla, distinta de `CallScreen`.
  - El panel no tiene pantalla de llamada.
- **Servidor:**
  - `POST /api/voice/session` emite una URL firmada nueva **por petición** (`get-signed-url`, `cache: "no-store"`), junto con las variables dinámicas de esa llamada y un token HMAC por llamada para las herramientas.
  - `POST /api/voice/status` cambia el estado con la función SQL `update_call`, que bloquea la fila con `for update`.
  - Las herramientas `/api/voice/tools/[tool]` validan el secreto y el token de la llamada.
- **Cadena de respaldo real:**
  1. ElevenLabs en el navegador.
  2. Guion fijo con `speechSynthesis` (`src/lib/voice/scripted.ts`).
  - **No existe Gemini Live** en el repositorio, como ya decía `INFORME_E4.md`.
- **Plan de ElevenLabs:**
  - La cuenta es **Creator**, con 10 conversaciones simultáneas según https://elevenlabs.io/pricing/agents. Al superar el límite se rechaza la conversación, salvo que estén activadas la cola o el *burst pricing* (ver el centro de ayuda de ElevenLabs).
  - La app no distingue ese rechazo: en el teléfono pasa al guion fijo y en el registro muestra «La llamada no está disponible».

## 3. Evidencia previa: lo que vio el equipo

La app no registraba errores de voz, así que la única huella del uso del equipo está en el historial de ElevenLabs. Lo leí por API con `scripts/dev/voice-plan.mjs` y una consulta de metadatos, sin transcripciones.

- Antes de estas pruebas había solo **6 conversaciones** en la cuenta: 2 del agente de prueba y 4 de `asistia-registro` el 6/11 entre las 19:07 y las 19:53 UTC.
  - **Ninguna se solapó con otra**: en la plataforma de ElevenLabs nunca hubo dos llamadas a la vez.
  - **Ninguna llamada del teléfono simulado** (confirmación, oferta, validación) llegó a ElevenLabs.
- Las 4 de registro terminaron por `Client disconnected`: dos con código **1000** (colgar) y dos con **1001**, que es lo que se ve cuando la página se cierra o se navega fuera.
  - **Ninguna llegó a ejecutar `register_request`**: ninguna terminó el registro.

Conclusión: las fallas que vio el equipo ocurrieron **antes de llegar a ElevenLabs** (E3, o el respaldo con guion fijo) o **por cierres de la página** (E2). No ocurrieron por exceder el límite de llamadas simultáneas.

> **Evidencia perdida.** Las filas de `calls` de esas pruebas se borraron el 7/11 a las 04:35 UTC, cuando corrí la regresión `tests/flow.test.mjs`, que reinicia la demo antes y después. Por eso no hay registro de base de datos de lo que vio el equipo: solo el historial de ElevenLabs.

## 4. Instrumentación agregada (solo diagnóstico)

Cada evento lleva un identificador corto de sesión de voz (`[voz xxxxxxxx]`). No incluye nombres, transcripciones, URL firmadas ni claves.

- **`src/lib/voice/diag.ts`:** registra en la consola y envía al servidor con `sendBeacon` a `/api/voice/diag`, que solo escribe en el registro del servidor y nunca en la base.
- **En `ElevenLabsCall`:**
  - del efecto: `effect.run` (con `alreadyStarted`) y `effect.cleanup_end_session`;
  - del SDK: `sdk.start_session`, `sdk.status` (`onStatusChange`), `sdk.connect`, `sdk.error` (`onError`), `sdk.disconnect` (`onDisconnect`, con el motivo y el código de cierre) y `sdk.first_agent_turn`.
- **En `CallScreen`:** `screen.mount`/`unmount`, `ui.answer` (con el número de toques), `session.request`/`response`, `fallback`, `finish`, `ui.hangup`, `ui.reject` y `page.pagehide`.
- **En `VoiceRegister`:** `ui.start` (con el número de toques), `mic.unlock`, `session.response`/`error`, `fail` y `finish`.
- **En el servidor:**
  - `/api/voice/session` registra la decisión (404, 409, 200 con o sin URL firmada) y el **código HTTP y la latencia de ElevenLabs**, más el cuerpo del error si no es 2xx;
  - `/api/voice/status` registra cada transición pedida y el estado que encontró.

## 5. Reproducción (escenarios A–G)

- **Arnés:** `tests/e2e/voice_diag.py`, con Playwright y Chromium. Cada persona es un **contexto aislado**, con `--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream` y `--use-file-for-fake-audio-capture`, este último con un WAV en español generado con la voz del sistema.
- **Servidor:** compilación de producción local (`next start`) con el PIN de prueba local, contra la base de Supabase de la demo. El escenario S se corrió además con `npm run dev`.
- **Evidencia por escenario:** `docs/evidencia_voz/<escenario>.json`, con la línea de tiempo de la consola, las respuestas de `/api/voice/*` y la apertura y cierre del WebSocket de ElevenLabs (solo el host).

| Escenario | Qué se hizo | Resultado | Evidencia |
|---|---|---|---|
| A | 3 teléfonos (Rosa, Carmen, Julio) contestan a la vez + 1 registro por voz en `/pedir-cita` | **Sin falla.** 4 URL firmadas distintas (llamadas 3986–3989), 4 conexiones, primera frase en 122–194 ms, cuelgan y quedan `finalizada` | `A.json` |
| B | `/t/rosa` abierto en **dos pestañas**; ambas contestan la misma llamada | **Falla E1.** La llamada 3990 obtiene 2 URL firmadas y abre **2 sesiones de ElevenLabs** (las dos «habla el asistente»). La pestaña 1 cuelga a los 18 s: la pestaña 2 se desmonta 1 s después sin haber colgado (`screen.unmount ended:false`) | `B.json` |
| C0 | Tocar «Empezar la llamada» apenas carga `/pedir-cita` | **Falla E3.** `/api/voice/session` → **401**; pantalla: «Su sesión de chat venció. Recargue la página.». La sesión quedó lista 4 s después | `C0.json` |
| C | Misma sesión de `/pedir-cita`: una pestaña chatea, otra habla por voz | **Sin falla** (llamada 3997) | `C.json` |
| D | Contestar, colgar y volver a contestar (2 veces); empezar, colgar y volver a empezar el registro | **Sin falla** (3998–4001) | `D.json` |
| E | Doble toque en «Contestar» y en «Empezar la llamada» | **Sin falla.** El segundo toque no encuentra el botón, que ya cambió (`clicks: 1`) | `E.json` |
| F | `/demo` → «Probar llamada» a Rosa y Julio seguidas; ambas contestan | **Sin falla** (3994, 3995) | `F.json` |
| G | Cerrar la pestaña a los 10 s de llamada y volver a abrir `/t/rosa` | **Falla E2.** La llamada 3996 sigue `en_curso` 6 s y 27 s después; la página reabierta muestra «Conectando…» y nunca conecta. En ElevenLabs la conversación sí terminó | `G.json`, `capturas/e5/antes-reabierta-conectando.png` |
| S (dev) | Una sola llamada con `npm run dev` | **Falla E4.** `effect.run` → `start_session` → `effect.cleanup_end_session` → `effect.run alreadyStarted:true` → conectado y desconectado en el mismo instante; `finish: La persona colgó`. ElevenLabs registra una conversación de 1 s | `S-dev.json` |

Al terminar, la base quedó sin solicitudes ni tareas nuevas y sin llamadas abiertas. Los agentes no ejecutaron ninguna herramienta. Quedaron 19 filas de llamadas de prueba (finalizadas) y 9 sesiones de chat anónimas, que se borran con «Reiniciar demo».

## 6. Causa raíz de cada error

### E1. Una llamada, varias sesiones de voz

- **Causa demostrada:**
  - `POST /api/voice/session` entrega una URL firmada a **cualquier** petición del dueño mientras la llamada está `sonando` o `en_curso`. No existe la idea de «la sesión de voz de esta llamada».
  - `CallScreen` se monta en cada pestaña o dispositivo que muestra la llamada. Además, `ownsCall` acepta tanto el token del teléfono simulado como la cookie del chat vinculado al mismo personaje (`src/lib/voice/auth.ts`).
  - Cada lugar que toca «Contestar» abre su propia conversación con ElevenLabs. El primero que cuelga pasa la fila a `finalizada`, la otra pestaña recibe el aviso y desmonta su pantalla, y su sesión se corta sin explicación.
- **Por qué coincide con el síntoma:** «cuando dos o más personas usaron la voz, hubo fallas» y «una cortó a la otra». En la final, el teléfono de un personaje puede estar abierto en el proyector y en el celular de alguien del jurado a la vez.
- **Corrección prevista (hito 2):**
  - Tabla `voice_sessions` con `voice_session_id` creado en el servidor y **reclamo condicional**: una sola sesión activa por llamada, con índice único parcial y reclamo atómico.
  - El segundo dispositivo recibe «Esta llamada ya se atendió en otro dispositivo» y no obtiene URL firmada.
  - Transiciones condicionales, por ejemplo `en_curso` solo si estaba `sonando`.

### E2. Sesiones colgadas al cerrar la pestaña

- **Causa demostrada:**
  - Al cerrar o navegar no se avisa al servidor: no hay `pagehide` con `sendBeacon`, y el `fetch` normal de `finish()` no sale.
  - El navegador cierra el WebSocket (código 1001) y ElevenLabs termina su lado, pero la fila de `calls` queda `en_curso`, sin vencimiento.
  - Al reabrir, `CallScreen` arranca en la fase `connecting` porque el estado es `en_curso`, pero `connect()` solo se llama al contestar o en llamadas salientes, así que la pantalla queda «Conectando…» para siempre.
- **Por qué coincide con el síntoma:** los dos cierres 1001 del historial del equipo, y que ninguna llamada de registro llegara a completarse. En celulares, cambiar de app o bloquear la pantalla puede producir lo mismo; eso no se probó en un dispositivo real.
- **Corrección prevista (hito 2):**
  - `pagehide` y desmontaje envían el fin de la sesión con `sendBeacon`.
  - Cada sesión activa manda un latido; si pasan más de 30 s sin latido, la sesión se cierra como `abandonada` (en el reloj de la demo o al pedir una sesión nueva).
  - Una pantalla reabierta sobre una llamada sin sesión viva ofrece «Volver a conectar» o la da por terminada, en lugar de quedarse en «Conectando…».
  - Contador de sesiones activas en la base.

### E3. Inicio antes de que exista la sesión de chat

- **Causa demostrada:**
  - `PedirCita` crea la sesión anónima en un efecto (`POST /api/chat/session`), que tardó **1.0–2.0 s** en local.
  - Mientras tanto, «Hablar con el asistente» y «Empezar la llamada» ya están activos.
  - `/api/voice/session` con `mode: "registro"` no encuentra la cookie, responde 401, y el cliente lo traduce como «Su sesión de chat venció. Recargue la página.».
  - El registro del servidor no deja huella de ese 401 porque sale antes del primer registro: se agregará en el hito 2.
- **Por qué coincide con el síntoma:** al escanear el QR en un celular con red lenta, la ventana es mayor que en local. Además, esos intentos nunca llegan a ElevenLabs, lo que coincide con un historial casi vacío.
- **Corrección prevista (hito 2):**
  - El estado `solicitando` espera a que la sesión exista: el botón muestra «Preparando…» hasta entonces.
  - Un 401 al iniciar la voz reintenta una vez tras crear la sesión.
  - Mensaje claro si falla.

### E4. Doble montaje del modo estricto (solo desarrollo)

- **Causa demostrada:**
  - El efecto de `ElevenLabsCall` marca `started = true` y llama a `startSession`. El primer desmontaje simulado de React llama a `endSession`.
  - El segundo montaje ve `started` ya en `true` y no vuelve a iniciar.
  - El SDK cierra la sesión apenas conecta y entrega `onDisconnect(reason: "user")`, que la pantalla interpreta como «La persona colgó».
- **Alcance:** la producción no lo sufre, porque A–G corrieron en una compilación de producción, pero sí invalida cualquier prueba con `npm run dev`.
- **Corrección prevista (hito 2):** una máquina de estados del cliente (`idle → solicitando → conectando → activa → finalizando → finalizada`, más `ocupado` y `error`) cuyo inicio:
  - sea idempotente por `voice_session_id`;
  - tolere el ciclo montar → desmontar → montar: la limpieza cancela solo si la sesión no se volvió a reclamar;
  - y pruebas unitarias de ese ciclo.

### E5. Pantalla de llamada sin estado ni audio

- **Causa:** `ElevenLabsCall` devuelve `null`, y la línea de estado solo dice «Conectando…» o «0:05 · habla el asistente / le escucha». No hay:
  - visualización;
  - silenciar (el SDK expone `setMuted`);
  - subtítulos que se puedan ocultar (hoy la transcripción siempre está visible);
  - estado de ocupado ni de error con una acción;
  - ni la identificación de seguridad de la v5.1.
- **Evidencia:** `capturas/e5/antes-*.png`.
- **Corrección prevista (hito 3):**
  - onda de voz en `<canvas>` con `getInputByteFrequencyData` y `getOutputByteFrequencyData`, leída en `requestAnimationFrame`;
  - estados con texto, silenciar, subtítulos y «Continuar por chat»;
  - un solo componente de llamada para todas las rutas.

### E6. Nombre vacío en la llamada de prueba

- **Causa:** `callContext()` solo llena `patient_name` desde la cita o la solicitud. La llamada de prueba (`start_test_call`) tiene `patient_id`, pero no tiene ninguna de las dos.
- **Corrección prevista (hito 2):** usar el nombre de pila del personaje o una frase sin nombre.

## 7. Causas probables revisadas una por una

| Causa | Veredicto | Cómo se verificó |
|---|---|---|
| Estado compartido en el servidor | **Descartada.** Solo hay clientes perezosos (Supabase y Anthropic) sin estado de llamadas | Código: `src/lib/supabase/server.ts`, `src/lib/bot/interpret.ts`. Escenario A |
| URL firmada o token reutilizado o cacheado | **Descartada.** Una URL por petición, `no-store`; el token HMAC depende del `call_id` | Escenario A (4 llamadas, 4 URL y 4 `call_id` distintos) |
| Una única instancia de conversación en el cliente | **Descartada.** Un `ConversationProvider` por llamada, no en el layout | Código y escenarios A y B |
| Doble montaje del modo estricto | **Confirmada en desarrollo** (E4) | Escenario S en `npm run dev` |
| Falta de `endSession` o aviso al cerrar o navegar | **Confirmada** (E2). Al desmontar sí hay `endSession`; en `pagehide` no se avisa al servidor | Escenario G |
| Botones de inicio no idempotentes | **No reproducida.** `answer()` y `start()` no tienen candado, pero el botón desaparece al primer toque. Se agregará el candado igual | Escenario E |
| Canales de Realtime con el mismo nombre | **Sin cruce de datos.** Los teléfonos comparten el canal `demo`, pero los avisos no llevan contenido y cada pantalla vuelve a pedir lo suyo; el chat usa un tema por sesión. Para el hito 2 se pide un canal por sesión de voz | Código: `src/lib/realtime.ts`, `PedirCita.tsx` |
| Filas de llamadas sin clave por sesión | **Confirmada** (E1) | Escenario B |
| Carreras en la base (dos aceptaciones del mismo cupo) | **No reproducida, cubierta por bloqueos.** `respond_offer`, `close_offer` y `validate_assignment` bloquean la fila (`for update`); `offer_responses` es única por oferta y solicitud. Falta la prueba automática de dos aceptaciones simultáneas (hito 2) | Código: `supabase/migrations/20261106020000_v4_functions.sql` |
| Límite de concurrencia de ElevenLabs | **No alcanzado.** El plan Creator permite 10; el máximo probado fue 4 y el uso histórico máximo fue 1 a la vez. No hay manejo del rechazo (se agregará «Todas las líneas están ocupadas») | Página de precios y `scripts/dev/voice-plan.mjs` |
| `AudioContext` bloqueado o micrófono ocupado | **No reproducible aquí.** Los dispositivos simulados de Chromium permiten el micrófono en varias pestañas; falta probar en Safari de iOS con dos pestañas (lista manual del hito 6) | Escenario B (ambas pestañas obtuvieron micrófono) |
| Variables dinámicas mezcladas | **Descartada.** Cada sesión recibió el `call_id` de su llamada. Sí hay un defecto de contenido (E6) | Escenarios A y F, captura de E6 |

**Pistas del código recuperado:**
1. **«`startSession` sin `await`: un rechazo no llega a `onFail`»: falsa en esta versión.**
   - `startSession` devuelve `void`, y el proveedor captura el rechazo y llama a `onError`, que sí llega a `onFail` (`ConversationProvider.js`).
   - Excepción: si antes se llamó a `endSession`, el error se descarta en silencio.
2. **Referencia `started` más `endSession` en la limpieza: confirmada** (E4, solo en desarrollo).
3. **El componente devuelve `null`: confirmada** (E5).
4. **`scripts/dev/` y `tests/` existen en `e4-original`: confirmada.**
   - `tests/flow.test.mjs` falla 5 de 5 porque prueba reglas de la E1 que la v4 cambió a propósito: el navegador ya no lee tablas, los recordatorios solo van a quien usa mensajería, y no responder ya no deja la cita en `sin_respuesta`.
   - Los scripts de solo lectura (`check-reads`, `check-seed`, `check-risk`, `check-locks`, `check-rosa`, `check-phones`) pasan.
   - No se corrieron los que escriben en la base de la demo: `flow-v4`, `rules-v4`, `chat-v4`, `voice-v4` y `reset3`.

## 8. Plan del hito 2 (sin cambios de código todavía)

1. **Sesiones de voz en la base:**
   - migración `voice_sessions`, con `id`, `call_id`, dueño (teléfono o chat), estado, `last_seen_at`, `ended_reason` y un índice único parcial de «una activa por llamada»;
   - tabla `voice_events` (sin datos personales), visible en `/demo`;
   - contador de activas y `VOICE_MAX_CONCURRENT` (por defecto 10, el plan Creator).
2. **`/api/voice/session`:**
   - reclama la sesión de forma atómica antes de pedir la URL firmada;
   - responde `ocupado` si la llamada ya tiene una sesión viva en otro lugar, o si se alcanzó la capacidad o ElevenLabs rechaza;
   - registra todos los códigos.
3. **`/api/voice/heartbeat` y `/api/voice/end`:** el segundo acepta `sendBeacon`. Las sesiones sin latido se vencen solas.
4. **Máquina de estados en el cliente:**
   - un solo componente de llamada con `idle → solicitando → conectando → activa → finalizando → finalizada`, más `ocupado` y `error`;
   - inicio idempotente, resistente al modo estricto;
   - limpieza en el desmontaje, `pagehide` y navegación.
5. **`/pedir-cita`:** no permitir iniciar la voz hasta que exista la sesión de chat (E3).
6. **E6:** nombre del personaje en las llamadas de prueba.
7. **Pruebas:**
   - Playwright con 4 contextos: todos conectan o reciben «ocupado», y no quedan sesiones activas al cerrar;
   - B, que ahora debe dar exactamente una sesión;
   - G, que ahora debe cerrar la llamada;
   - carrera de dos aceptaciones del mismo cupo;
   - pruebas unitarias de la máquina de estados.

## 9. Paridad con producción (7/11, antes del hito 2)

**Variables:** `scripts/dev/vercel-env-names.mjs` compara solo nombres.
- Production tiene todas las que la app usa en tiempo de ejecución: `ELEVENLABS_API_KEY`, `ELEVENLABS_TOOL_SECRET`, `ELEVENLABS_VOICE_NAME`, `ANTHROPIC_*`, `CHAT_SESSION_SECRET`, `DEMO_PIN`, `PUBLIC_BASE_URL`, `NEXT_PUBLIC_*`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_PROJECT_REF`.
- Faltan en Production:
  - `ELEVENLABS_WEBHOOK_SECRET`, que también está vacía en `.env.local`;
  - las herramientas locales (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `VERCEL_TOKEN`, `VERCEL_OIDC_TOKEN`, `GEMINI_API_KEY`, que no usa el código);
  - las de telefonía heredadas de la E4, vacías y fuera de la v5.1.
- Las variables de ElevenLabs se cargaron el 6/11 a las 17:49 UTC, y el despliegue de producción vigente (`dpl_7tq6…ErCxdyZF`) es de las **17:51 UTC**, así que las incluye.

**Voz del teléfono simulado contra el despliegue real:**
- `scripts/dev/prod-voice-check.mjs`, por API: una llamada de prueba a Rosa → `POST https://ods3-hackathon.vercel.app/api/voice/session` → **200 en 550 ms, con URL firmada** (`wss://`) del agente `asistia-confirmacion`. **No cae al guion fijo.**
  - Confirma E6 en producción: `patient_name`, `specialty`, `slot_text` y `deadline_text` llegan **vacías**.
- `tests/e2e/prod_phone_voice.py`, en el navegador: Chromium con micrófono simulado abre `/t/rosa` en producción, activa el sonido, contesta, **abre el WebSocket de ElevenLabs** y el agente habla («0:01 · habla el asistente»). Captura en `capturas/e5/produccion-telefono-llamada.png`.
- Ambas llamadas se cerraron como `finalizada`.

**¿Por qué ninguna llamada del teléfono llegó a ElevenLabs el 6/11?** No se puede determinar con evidencia.
- Hoy el camino funciona en producción desde un navegador de escritorio.
- Las filas de `calls` del equipo, que decían si cada llamada usó ElevenLabs o el guion y por qué, se borraron con el reinicio del 7/11 a las 04:35 UTC.
- La API de registros de Vercel solo transmite en vivo y no devolvió el historial.
- Hipótesis que siguen abiertas, sin reproducir:
  1. las llamadas del teléfono se contestaron en un celular (Safari de iOS o Chrome de Android) donde `startSession` falló antes de abrir el WebSocket, por ejemplo por el `AudioContext` o el micrófono, y la pantalla pasó sola al guion fijo, sin dejar rastro en ElevenLabs;
  2. no se contestaron con voz: se probaron las llamadas automáticas de 48 h, que a los pacientes sin teléfono abierto se simulan a los 15 s, o se usó `?voz=guion`.
- **Desde el hito 2, cada intento queda en `voice_events`**, con su estado, motivo y código, y se ve en `/demo` → «Voz en vivo». La prueba manual con dos celulares lo dirá.

## 10. Hito 2: lo implementado y lo que falta

**Implementado en `e5`** (commit `3844114`):
- **Migración solo aditiva** `supabase/migrations/20261107010000_e5_voice_sessions.sql`:
  - tablas `voice_sessions` y `voice_events`, más funciones nuevas;
  - no modifica nada que use `main`: `update_call` y `reset_demo` solo se llaman;
  - la FK de `voice_sessions.call_id` es `on delete cascade`, así que el reinicio de la demo las limpia.
- **Una sesión por llamada:** índice único parcial más `voice_claim` con candado. El segundo dispositivo recibe «Esta llamada ya se está atendiendo en otro dispositivo» (E1).
- **Latido cada 10 s y vencimiento a los 30 s** (`voice_expire`). `pagehide` cierra la sesión **y la llamada** con `sendBeacon` (E2). La pantalla reabierta ofrece «Volver a conectar».
- **Máquina de estados en el cliente:** `src/lib/voice/machine.ts`, con 9 pruebas unitarias que pasan. `LiveVoice` resiste el doble montaje del modo estricto (E4). Contestar y Empezar son idempotentes.
- **`/pedir-cita` no deja empezar la voz hasta que exista la sesión de chat** («Preparando…»), y reintenta una vez si no estaba lista (E3).
- **Capacidad:** `VOICE_MAX_CONCURRENT`, por defecto 10. Si se supera, o si ElevenLabs responde 429, aparece «Todas las líneas están ocupadas» con la posición en la fila, reintento cada 10 s y la opción de seguir sin voz o por chat.
- **Variables dinámicas:** el servidor verifica las obligatorias de cada tarea y usa una frase neutra si falta alguna, registrándolo en `voice_events`. La llamada de prueba usa el nombre del personaje (E6).
- **`conversation_id` del SDK** (`getId()`): se guarda en `voice_sessions`. El webhook posterior a la llamada cierra la sesión por ese id.
- **Instrumentación:** pasó a `voice_events` mediante `/api/voice/event`, con límite de 60 eventos por sesión y minuto en Postgres. **`/api/voice/diag` se eliminó.**
- **Transiciones condicionales de la llamada** (`voice_call_status`): `en_curso` solo desde `sonando`, y una llamada terminada no se reabre.
- **Realtime:** no se agregó un canal por sesión. El estado de cada sesión viaja en la respuesta del latido, solo a su dueño, y no hay difusión con datos de personas.

**Pendiente:**
- **Aplicar la migración** a la base compartida: el clasificador de seguridad bloqueó `supabase db push` como despliegue a producción y requiere la autorización del equipo.
- Luego, correr:
  - `npm run test:race` (con `ALLOW_DB_WRITE=1`);
  - Playwright B, G y A;
  - la prueba de 4 contextos sin sesiones colgadas.
- **Webhook de fin de llamada:** el código está listo, pero falta crearlo en ElevenLabs (Agents → Settings → Post-call webhook, URL `https://ods3-hackathon.vercel.app/api/voice/post-call`, eventos de transcripción) y guardar su secreto como `ELEVENLABS_WEBHOOK_SECRET` en `.env.local` y en Vercel. No lo hice porque no puedo escribir en `.env.local`.
- **`.env.example`:** falta agregar `VOICE_MAX_CONCURRENT` (opcional, por defecto 10). No lo toqué por la regla de no modificarlo.

## 11. Resultados del hito 2 (7/11)

**Migración aplicada:** solo `20261107010000_e5_voice_sessions.sql`, con `supabase db push --remote` y autorización del equipo.
- La revisión previa no encontró `create or replace` sobre funciones existentes (las 8 funciones son `create function`), ni `alter`, `drop`, triggers o cambios de permisos de objetos existentes.
- La única dependencia de algo existente es la FK de `voice_sessions.call_id` hacia `calls`.
- Respaldo en JSON de las 22 tablas de `public`, en `..\respaldos-db\20261107-0052\`, fuera de git. Las tablas de `identity` no están expuestas a la API y las vuelve a sembrar `reset_demo`.
- La reversión, sin aplicar, está en `supabase/rollback/`.
- El navegador no puede leer `voice_sessions` ni `voice_events`.

**`npm run test:race`:** 8 de 8.
- 2 aceptaciones simultáneas registran 2 respuestas, y la repetida no duplica.
- 2 cierres simultáneos de la misma oferta dejan **1 asignación**.
- 2 reclamos simultáneos de la misma llamada: **uno gana**.
- Las transiciones son condicionales.
- Con capacidad 1, la segunda llamada queda en la fila; cuando la primera se cierra, la segunda obtiene la línea.
- Al cerrar la pestaña, la llamada queda `finalizada`.
- No quedan sesiones activas.

**Playwright** sobre la compilación de `e5` contra la base compartida (evidencia en `docs/evidencia_voz/hito2/`):

| Escenario | Antes (hito 1) | Ahora |
|---|---|---|
| B: dos pestañas contestan la misma llamada | 2 sesiones de ElevenLabs; al colgar una, la otra se cortaba | **1 sesión.** La pestaña 2 recibe `busy: otro_dispositivo` y muestra «Esta llamada ya se está atendiendo en otro dispositivo». La pestaña 1 habla hasta colgar. Al final: 0 sesiones activas |
| G: cerrar la pestaña en plena llamada | La llamada quedaba `en_curso` y la pantalla reabierta, en «Conectando…» | `pagehide` envía el fin con `sendBeacon`; **6 s después la llamada ya está `finalizada`**, con la sesión cerrada por «pestaña cerrada». La pantalla reabierta no muestra ninguna llamada colgada |
| A: 3 teléfonos y 1 registro a la vez | 4 conectaban (sin falla) | 4 conectan; **0 errores de consola**; al colgar, **0 sesiones activas** y las 4 llamadas `finalizada` |

**Webhook de fin de llamada (producción):**
- Llamada de prueba 4506 al teléfono simulado de producción: conectó con ElevenLabs.
- ElevenLabs tiene configurado el webhook `asistia-post-call` (HMAC, solo transcripción, sin audio, para todo el espacio de trabajo). Su último intento, a las 05:54:46 UTC, registra una **falla 401**.
- La causa **no es la firma ni el formato del encabezado `ElevenLabs-Signature`**: el despliegue de producción no tiene `ELEVENLABS_WEBHOOK_SECRET`.
  - La API de Vercel no la lista en el proyecto `ods3-hackathon`, que es el único del equipo.
  - El último despliegue de producción sigue siendo el del 6/11 a las 17:51 UTC.
  - Sin secreto, la verificación rechaza todo.
- La fila de la llamada no recibió `external_id` ni resumen, lo que confirma que el webhook no se procesó.
- Cuando el secreto esté en Vercel y se vuelva a desplegar, hay que repetir la prueba.
- Que el webhook **cierre** la sesión requiere el código de `e5`; `main` solo guarda el resumen.

## 12. Archivos de este diagnóstico

- **Instrumentación:**
  - `src/lib/voice/diag.ts` y `src/app/api/voice/diag/route.ts`;
  - cambios en `ElevenLabsCall.tsx`, `CallScreen.tsx`, `PedirCita.tsx`, `src/lib/voice/server.ts`, `src/app/api/voice/session/route.ts` y `src/app/api/voice/status/route.ts`.
- **Arnés y capturas:** `tests/e2e/voice_diag.py` (escenarios A–G, C0 y S) y `tests/e2e/voice_capturas.py`.
- **Evidencia:** `docs/evidencia_voz/*.json` y `capturas/e5/antes-*.png`.
- **Consulta del plan y del historial de ElevenLabs:** `scripts/dev/voice-plan.mjs`, de solo lectura y sin mostrar claves.
- **Documentación consultada:**
  - https://elevenlabs.io/pricing/agents
  - https://elevenlabs.io/docs/help-center/product/eleven-agents/how-many-eleven-agents-requests-can-i-make-and-can-i-increase-it
  - https://elevenlabs.io/docs/eleven-agents/libraries/react
  - los tipos y el código de `@elevenlabs/react` 1.21.1 en `node_modules`.

## 13. Calidad de la voz en un teléfono real (rama `e5-voz`, 7/11)

**Lo que vio el equipo** (Android, Chrome, datos móviles; llamadas 4535 y 4536, 08:49–08:51 UTC): la voz se trababa y cortaba frases, el agente dijo cosas incoherentes («Fui yo quien le preguntó…»), los subtítulos se cortaban con «…» y la transferencia a una persona tardó mucho.

### Causas, con evidencia

| Síntoma | Causa | Evidencia |
|---|---|---|
| Incoherencias y frases cortadas | **Eco**: el micrófono captaba la voz del agente por el parlante y la transcripción la tomaba como si hablara la persona; cada eco **interrumpía** al agente | Transcripción de ElevenLabs de 4536 (59 s): 4 turnos «de la persona» que repiten frases del agente («…problema técnico al intentar obtener…», «Gracias por su llamada.»); 4 turnos del agente con `interrupted=true`. El agente respondió a su propio eco: «Fui yo quien le preguntó…» |
| Voz que se traba | En modo WebSocket el audio llega por el hilo principal y se reproduce **sin búfer de red**: con red móvil el búfer se vacía en mitad de una frase | Llamada larga local con 4G lenta simulada: **5–7 vaciados** del búfer por llamada con o sin la onda y con o sin CPU lenta; **0** sin limitar la red. La onda **no** los causa |
| «Problema técnico» en la llamada de prueba | La llamada de prueba usa el agente de confirmación, que pide `get_appointment`; el servidor responde 403 porque no hay cita | 4536: `get_appointment → HTTP 403`; el agente improvisó un error técnico |
| Transferencia lenta | El agente anunciaba la transferencia, **esperaba respuesta**, se despedía y su `end_call` era **cancelado por el eco** («Tool execution was abandoned due to user input») | 4536: 14 s entre `transfer_to_human` y el fin; en local, 15–20 s desde «Quiero hablar con una persona» |
| Subtítulos cortados | La respuesta completa llega como texto al empezar a hablar; se mostraba **el principio** recortado a dos líneas | Código de `CallView` (`line-clamp-2` sobre la primera parte) |
| Apertura larga | Saludo + lista de seguridad + presentación: 13–22 s hasta la primera pregunta | Tabla de aperturas, abajo |

### Qué se cambió

- **Transporte WebRTC** (`src/components/voice/LiveVoice.tsx`, `src/app/api/voice/session/route.ts`, `src/lib/voice/server.ts`, `src/lib/voice/transport.ts`): el servidor emite por sesión, sin caché, un **token de conversación** (`GET /v1/convai/conversation/token`) y, en paralelo, la URL firmada como respaldo. El audio del agente llega como pista WebRTC: el navegador aplica su **cancelación de eco** (sabe qué suena por el parlante), supresión de ruido y un **búfer de red**, y la reproducción no depende del hilo principal. Si WebRTC no conecta, `LiveVoice` vuelve a empezar una vez por WebSocket. Plan B manual: `?transporte=websocket` o `VOICE_TRANSPORT=websocket`. Se mantienen el reclamo, el latido y `pagehide`.
  - El SDK 1.35.0 ya pide el micrófono con `echoCancellation`, `noiseSuppression`, `autoGainControl` y `voiceIsolation` en ambos modos (`platform/web/input.js`, LiveKit en WebRTC); lo que faltaba era que el audio del agente pasara por WebRTC.
- **Agentes sin interrupciones por voz**, primer mensaje no interrumpible, `end_call` y `transfer_to_human` protegidos (ver «Cambios en los agentes»).
- **Cierre rápido al transferir** (`src/lib/voice/transfer.ts`): cuando `transfer_to_human` responde bien, el cliente cuelga apenas el agente termina su frase (mínimo 2.5 s, máximo 9 s).
- **Llamada de prueba**: las herramientas de una tarea real responden «Esta es una llamada de prueba: no hay una cita real y no se registró ningún cambio» (`src/lib/voice/tools.ts`). **Requiere desplegar este código en producción**, porque ElevenLabs llama las herramientas en `PUBLIC_BASE_URL` (producción): mientras tanto, la vista previa sigue recibiendo el 403 de producción, y el agente ahora lo maneja sin hablar de errores técnicos.
- **Subtítulos** (`src/lib/voice/captions.ts`, para la pista que rehace la pantalla de llamada; `CallView` no se tocó): `useRevealedCaption(último, agentSpeaking)` revela las palabras del agente al ritmo de la voz (16 caracteres por segundo, medido en este agente) y `captionTail(texto)` deja **la cola**: lo último dicho, desde una palabra entera; en una caja de dos líneas anclada abajo siempre se ven las palabras más nuevas. `stripAudioTags` quita las etiquetas entre corchetes. Probado en la pantalla actual antes de revertir el cambio de `CallView` (capturas de la llamada 4549).
- **Diagnóstico** (`voice_events`): transporte, interrupciones, herramientas, fallo de WebRTC, cierre por transferencia y un resumen cada 30 s (cambios de modo, interrupciones, vaciados del búfer, tareas largas): 2 eventos por minuto, bajo el límite de 60.
- **Nombre del hospital en un solo lugar**: `voice/hospital.json` («Hospital Mirasur»). Lo usan las pantallas de llamada (`src/lib/voice/hospital.ts` → `ESTABLISHMENT`), el guion fijo, el consentimiento del chat y los 4 agentes (`%HOSPITAL%`, reemplazado por `npm run voice:sync`).

### Mediciones (antes → después)

Llamada larga (`tests/e2e/voice_long_call.py`): Chromium con Pixel 7, micrófono simulado con 6 frases en español y pausas (voz «Microsoft Sabina Desktop»), que termina con «Quiero hablar con una persona». Compilación de producción local.

| Configuración | Transporte | Fotogramas p95 | Tareas largas (ms/min) | Vaciados del búfer | Interrupciones | Transferencia |
|---|---|---|---|---|---|---|
| Antes · onda · CPU ×4 · 4G lenta | WebSocket | 33.4 ms | 514–844 | 5–6 | 4 en 4536 (teléfono real) | 15.5 s |
| Antes · sin onda · CPU ×4 · 4G lenta | WebSocket | 16.8 ms | 159 | 5 | — | 20.4 s |
| Antes · onda · CPU ×1 · 4G lenta | WebSocket | 16.7 ms | 28 | 7 | — | 16.2 s |
| Antes · onda · CPU ×1 · sin límite | WebSocket | 16.7 ms | 67 | 0 | — | 15.3 s |
| **Después** · onda · CPU ×4 · 4G lenta | WebRTC | 33.4 ms | 496–1082 | **0** | **0** | **8.5–8.9 s** |
| Después · sin onda · CPU ×4 · 4G lenta | WebRTC | 16.7 ms | 438 | 0 | 0 | 7.9 s |
| Después · onda · CPU ×1 · sin límite | WebRTC | 16.7 ms | 0 | 0 | 0 | 6.5 s |
| Después · plan B · CPU ×4 · 4G lenta | WebSocket | 33.4 ms | 369 | 3 | 0 | 6.0 s |

- La onda cuesta ~16 ms en el p95 con CPU ×4 (de 60 a 30 fps), pero **no** causa vaciados del búfer: con y sin onda hay los mismos. No se modificó `VoiceWave`.
- Límite de la prueba: la limitación de red de Chrome se aplica a HTTP y WebSocket, **no al UDP de WebRTC**. Las estadísticas WebRTC (ocultamiento < 15 ms en toda la llamada, búfer de 30–51 ms) muestran que el audio llega entero, pero el beneficio en una red móvil real y la cancelación de eco en un parlante real **solo se pueden confirmar en un teléfono**.

**Apertura** (`scripts/dev/voice-opening.mjs`, una conversación por agente, tiempos de la alineación del audio):

| Agente | Primera palabra | Antes: fin de la primera pregunta | Después: inicio / fin de la primera pregunta |
|---|---|---|---|
| Confirmación | 0.29–0.31 s | 13.9 s | 5.1 / 7.5 s |
| Oferta | 0.29–0.31 s | 12.7 s | 6.3 / 7.4 s |
| Registro | 0.29–0.30 s | 21.9 s | 5.9 / 8.2 s |
| Validación | 0.31–0.32 s | 14.2 s | 5.0 / 7.4 s |

La «primera palabra» se mide desde que se abre la conexión con ElevenLabs; en el teléfono del equipo, preparar el micrófono y conectar tomó además ~5 s desde «Contestar» (`sdk.start_session` → `sdk.connect`).

### Cambios en los agentes de ElevenLabs

Aplicados con `npm run voice:sync` (antes, `--dry`: solo `PATCH` de las 14 herramientas y los 4 agentes existentes; ningún `POST`). Afectan también a producción, que comparte los agentes.

1. **Primer mensaje de una frase** + la pregunta, sin la lista de seguridad (está en pantalla):
   - Confirmación: «Hola, le llama el asistente automatizado del Hospital Mirasur para confirmar su cita. ¿Hablo con {{patient_name}} o con su cuidador?»
   - Oferta: «Hola, le llama el asistente automatizado del Hospital Mirasur porque se liberó un cupo de {{specialty}}. ¿Hablo con {{patient_name}}?»
   - Validación: «Hola, le llama el asistente automatizado del Hospital Mirasur para validar su cupo. ¿Hablo con {{patient_name}} o con su cuidador?»
   - Registro: «Hola, le habla el asistente automatizado del Hospital Mirasur para registrar su solicitud de cita. ¿Es para usted o para otra persona?»
2. **Prompt común**: Hospital Mirasur; frases cortas, una idea y una pregunta por turno; no repetir la presentación; la seguridad solo si la persona pregunta o antes de pedir un dato; para confirmar identidad basta un «sí» y **nunca** se pide nombre completo, DNI ni número de documento (en una llamada de prueba previa el agente pidió el DNI); transferencia: «Claro, le paso con el equipo de citas», `transfer_to_human` en el mismo turno y `end_call` enseguida; si una herramienta falla, no hablar de errores técnicos; el eco del parlante se ignora; no terminar la llamada solo por un silencio, y `end_call` solo cuando la tarea esté resuelta y la persona no tenga más preguntas o se despida; sin etiquetas entre corchetes.
3. **Tareas**: registro pide el nombre ficticio al preguntar el nombre y recuerda no compartir datos reales de salud antes del motivo (antes iba en el saludo); confirmación no inventa la especialidad ni la fecha si no las tiene.
4. `conversation.client_events`: **sin `interruption`** (la voz de la persona o el eco ya no cortan al agente; lo que se dice mientras habla no se transcribe). Para volver atrás: `"interruptions": true` en `voice/agents/common.json`.
5. `agent.disable_first_message_interruptions: true`.
6. `turn.turn_timeout`: 7 → **10 s** (menos «¿Sigue ahí?» mientras la persona piensa).
7. `tts.expressive_mode`: **false** (el modelo escribía etiquetas como «[Entendido]» que se colaban en los subtítulos y cambian la entonación).
8. `end_call` y la herramienta `transfer_to_human`: `interruption_mode: "disable_during_tool_and_turn"`; descripción de `transfer_to_human`: «Úsala en cuanto la persona lo pida y después termina la llamada con end_call».
9. `platform_settings.auth.allowlist`: se agrega `localhost:3110` (pruebas locales).

Evaluado y **no** activado: `vad.background_voice_detection` (filtra voces de fondo, pero podría descartar a la persona si sostiene el teléfono lejos; sin prueba en un teléfono real no conviene), `turn.noisy_environment_detection` (solo Enterprise y su mensaje está en inglés), `soft_timeout` (relleno en inglés) y `turn_eagerness` (sigue en `normal`).

### Día de la final: modo sala ruidosa y líneas reservadas para las tarjetas

**Modo sala ruidosa** («mantener para hablar»):
- **Ajuste:** `settings_v51` con la clave `sala_ruidosa` = `on` | `off`. Si la clave no existe, cuenta como **`on`**. Migración solo aditiva `supabase/migrations/20261107050000_e5_sala_ruidosa.sql` (inserta la clave; ya aplicada por el equipo; la acción de abajo la crea igual con `upsert`).
- **Cambiarlo desde /demo:** `POST /api/staff` con `{ "action": "noisy_room", "on": true | false }` → `{ "noisyRoom": boolean }`. **Leerlo:** `GET /api/staff/data?view=voice` agrega `salaRuidosa` y `lineasReservadasTarjetas`.
- **Llega al teléfono** en cada respuesta de `POST /api/voice/session`: `pushToTalk: boolean`.
- **Para la pista de la pantalla de llamada** (contrato en `src/lib/voice/contract.ts`):
  - `CallViewProps.pushToTalk?: { talking, start, end }` (opcional): si viene, dibujar «Mantener para hablar»; `onPointerDown → start()`, `onPointerUp / onPointerCancel / onPointerLeave → end()`.
  - `PUSH_TO_TALK_BUTTON_READY`: la pista de la pantalla «Respira» lo puso en `true` al dibujar el botón (e5 `21fb14a`). Mientras sea `false`, `CallScreen` no silencia el micrófono (un micrófono silenciado sin botón dejaría a la persona sin poder hablar).
  - Por debajo, `LiveVoice` tiene la prop `pushToTalk` y en `controlRef.current`: `setPushToTalk(on)`, `isPushToTalk()`, `talkStart()`, `talkEnd()` (el micrófono sigue abierto 300 ms después de soltar). Usa `setMuted` del SDK.
- **Agentes:** las interrupciones por voz ya están desactivadas para todos (punto 4 de los cambios), que es la sensibilidad mínima posible; con el botón, el turno termina al soltar.

**Líneas reservadas para las tarjetas del jurado:**
- Las últimas `VOICE_RESERVED_FOR_CARDS` líneas (por defecto **3**, nunca todas) de `VOICE_MAX_CONCURRENT` (8) quedan para llamadas de pacientes cuyo token empieza exactamente con `j-` (tarjetas impresas `j-` + 6 caracteres y de prueba `j-test-…`; tokens antiguos como `julio` o `j2895s6a` **no** cuentan), directamente o por la sesión de chat vinculada.
- Si no tiene tarjeta y solo quedan las reservadas, `POST /api/voice/session` responde `{ session: null, busy: "capacidad", chatInstead: true }`, sin fila de espera. El teléfono simulado pasa solo a las opciones escritas, sin pantalla de error (`voice_events`: `sesion.reservada_tarjetas`). `/pedir-cita` (fuera de esta rama) todavía muestra «Todas las líneas están ocupadas» con «Seguir por chat»: puede mapear `chatInstead` a `onDone()`.
- Verificado en local con `VOICE_MAX_CONCURRENT=2` y `VOICE_RESERVED_FOR_CARDS=1`: Valeria habló por voz (llamada 4551) y Luis, al contestar, pasó directo a las opciones escritas (4552, proveedor `guion`).

**Variables de entorno opcionales de la voz** (no están en `.env.example`): `VOICE_TRANSPORT` = `webrtc` (por defecto) | `websocket` (plan B para todos); `VOICE_RESERVED_FOR_CARDS` = líneas reservadas para las tarjetas (por defecto 3); `VOICE_MAX_CONCURRENT` (por defecto 8).

### Prueba en el alias desplegado (https://asistia-e5.vercel.app, `dpl_CuVpyuJGtj78XtFeJ5tpkEovJcYd`, e5 `21fb14a`)

`tests/e2e/voice_long_call.py --rpc` (llamada de prueba por `start_test_call`, cerrada al final), Pixel 7, CPU ×4, 4G lenta, Valeria:

| Modo | Llamada | Transporte | Fotogramas p95 | Tareas largas | Vaciados | Interrupciones | Transferencia | Resultado |
|---|---|---|---|---|---|---|---|---|
| Sala ruidosa **activada** (botón sostenido desde los 31 s) | 4559 | WebRTC | 33.3 ms | 813 ms/min | 0 | 0 | 7.2 s | OK |
| Sala ruidosa desactivada | 4566 | WebRTC | 33.3 ms | 738 ms/min | 0 | 0 | 8.3 s | OK |

- Con la sala ruidosa activada, la primera frase del micrófono («Sí, soy yo»), dicha **sin** sostener el botón, no llegó al agente: preguntó «¿Sigue ahí?». Al sostenerlo, la conversación siguió normal.
- Para desactivarla y volver a activarla se usó la acción `noisy_room` (servidor local contra la misma base). Quedó **activada**.
- Un intento previo (4560, desactivada) terminó a los 43 s: en la llamada de prueba `get_appointment` todavía responde 403 en producción y el agente cerró la llamada aunque la persona seguía preguntando. Se agregó al prompt común: «Usa end_call solo cuando la tarea esté resuelta y la persona no tenga más preguntas, o cuando ella se despida». La repetición (4566) llegó hasta la transferencia.
- Antes del cambio de alias (4558, despliegue de las 09:51 sin esta rama): WebSocket y 2 vaciados del búfer con la misma configuración.

### Documentación consultada

- https://elevenlabs.io/docs/eleven-agents/libraries/java-script (WebRTC con `conversationToken`)
- https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow (turnos, interrupciones por eventos del cliente, `turn_eagerness`, `soft_timeout_config`)
- https://elevenlabs.io/docs/eleven-agents/customization/tools/tool-configuration/tool-interruptions (`interruption_mode`)
- Código de `@elevenlabs/client` 1.35.0: `utils/ConnectionFactory.js` (la URL firmada solo admite WebSocket; el token, WebRTC), `utils/WebRTCConnection.js`, `platform/web/input.js` (restricciones del micrófono), `platform/web/output.js` y el procesador `audioConcatProcessor` (sin búfer de red en WebSocket).
