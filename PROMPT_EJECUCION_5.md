# Ejecución 5 · AsistIA v5.1: agente de voz web estable y con visualización de audio

Trabaja en este repositorio como ingeniero principal del equipo Algorritmia. La prioridad de esta ejecución es que **el agente de voz en el navegador funcione sin errores cuando varias personas lo usan al mismo tiempo** y que **se vea como una llamada con IA moderna, con una visualización de audio que reacciona en tiempo real**. Después, si hay tiempo, alinea el producto con la propuesta v5.1.

## 0. Fuente de verdad y reglas

- **La propuesta vigente es `insumos/AsistIA_Propuesta_Final_Algorritmia_v5.1.pdf`.** Si `CLAUDE.md`, `docs/requisitos_v4.md`, `docs/conversaciones.md`, `PROMPT_EJECUCION_4.md`, `PASOS_PREVIOS_E4.md` o `.env.example` mencionan Twilio, WhatsApp, números de teléfono, la fórmula de prioridad con bonos (0.75 / 0.15 / 0.10) o un botón de autoaviso del paciente, están **desactualizados**: no los implementes y corrígelos en el hito 4.
- **Secretos.** Nunca muestres, copies ni registres el contenido de `.env.local` ni de ninguna clave. Si necesitas saber qué variables existen, lista solo los nombres. Ninguna clave puede llegar al navegador ni a un commit.
- **Ramas y despliegue.** Trabaja en la rama `e5`, con commits pequeños y descriptivos. No hagas merge a `main` ni despliegues a producción: usa despliegues de vista previa de Vercel. El merge lo decide el equipo.
- **Datos.** Solo datos ficticios. Nada de registros reales de pacientes.
- **No adivines APIs.** Antes de escribir código de voz, revisa la versión instalada del SDK de ElevenLabs (`package.json` y los tipos en `node_modules`) y su documentación actual. La versión 1 de `@elevenlabs/react` exige `ConversationProvider` y expone, entre otros, `useConversation`, `getInputByteFrequencyData()` y `setMicMuted()`; confírmalo en la documentación oficial antes de usarlo.
- **Skills del repositorio.** Usa las de `.claude/skills` cuando correspondan: `frontend-design` y `emil-design-eng` (diseño y animación), `mobile-native` (celulares), `webapp-testing` (Playwright), `supabase` (base de datos, RLS y Realtime) y `break-ui` (casos extremos).
- **Si el tiempo es limitado, entrega completos los hitos 1 a 3 antes de tocar el 4.**

## 1. Diagnóstico (no cambies código todavía)

1. **Confirma que trabajas sobre el código más reciente.** La base es la rama `e4-original`, traída del repositorio de respaldo de la otra computadora: tiene el historial completo de la E4 (tag `v4-p0`), `scripts/dev/` y `tests/`. La rama `recuperado-vercel` es una copia del despliegue de Vercel y sirve solo como referencia para comparar: no la fusiones. `e5` parte de `e4-original` (o de `e4-pendientes`, si hubo cambios sin commit que rescatar).
2. Revisa `git log`, los `INFORME*.md` y las rutas existentes. Determina cómo está implementada hoy la voz: SDK de ElevenLabs, Gemini Live, guion fijo con `speechSynthesis` u otra cosa, y en qué componentes. Si la integración con ElevenLabs no existe en esta rama, dilo en el diagnóstico: entonces el hito 2 incluye implementarla desde cero.
3. **Reproduce los errores de uso en paralelo** con Playwright, usando contextos aislados y Chromium con `--use-fake-ui-for-media-stream` y `--use-fake-device-for-media-stream` (puedes pasar un audio de prueba con `--use-file-for-fake-audio-capture`). Escenarios mínimos:
   - A. De 2 a 4 llamadas de voz simultáneas en contextos distintos.
   - B. Dos pestañas del mismo navegador con la misma sesión.
   - C. Voz y chat al mismo tiempo en una misma sesión.
   - D. Iniciar, colgar y volver a iniciar rápidamente.
   - E. Doble toque en "Contestar" o "Hablar con el asistente".
   - F. El panel `/demo` disparando llamadas a dos personajes a la vez.
   - G. Cerrar la pestaña en medio de una llamada.
   Captura la consola del navegador, las peticiones de red, los registros del servidor, las respuestas de ElevenLabs (incluidos códigos 4xx y 429) y los eventos de error y desconexión del SDK.
4. **Errores que vio el equipo.** No hay mensajes de consola ni capturas: la aplicación no registra errores de voz, así que solo conocemos los síntomas.
   - **Uso en paralelo:** cuando dos o más personas usaron la voz a la vez, hubo fallas. No sabemos si la segunda llamada no conectó, si una cortó a la otra, si se cruzaron datos entre pacientes ni qué mensaje apareció.
   - **Interfaz:** la pantalla de llamada se ve pobre y no comunica en qué estado está.
   Como no hay registro, **antes de reproducir agrega instrumentación mínima, solo para diagnosticar**: registra en consola y en el servidor cada transición de estado de la sesión de voz, los eventos `onError`, `onDisconnect` y `onStatusChange` del SDK, los rechazos de `startSession` y los códigos HTTP de `/api/voice/session` y de ElevenLabs, siempre con un identificador de sesión y sin datos personales ni claves. Luego reproduce los escenarios A–G y, en `docs/diagnostico_voz.md`, indica cuál o cuáles coinciden con los síntomas. No inventes un error que no hayas reproducido.
5. Verifica una por una estas causas probables:
   - estado compartido entre peticiones en el servidor (variables a nivel de módulo, singletons, cachés);
   - URL firmada o token de conversación reutilizado o cacheado entre sesiones;
   - una única instancia de conversación en el cliente (por ejemplo, un proveedor montado en el layout global);
   - el doble montaje de React en modo estricto que abre dos sesiones;
   - falta de `endSession` al desmontar, al cerrar la pestaña (`pagehide`) o al navegar;
   - botones de inicio que no son idempotentes;
   - canales de Supabase Realtime con el mismo nombre para distintas sesiones, o eventos que llegan a la sesión equivocada;
   - filas de llamadas sin clave por sesión, que cruzan estados;
   - condiciones de carrera en la base de datos (por ejemplo, dos aceptaciones del mismo cupo);
   - **límite de conversaciones simultáneas del plan de ElevenLabs** (revisa la cuenta y https://elevenlabs.io/pricing/agents) y la falta de manejo cuando se supera;
   - `AudioContext` bloqueado por el navegador, o el micrófono ocupado por otra pestaña;
   - variables dinámicas de una llamada mezcladas con las de otra.
   **Pistas ya observadas en el código recuperado** (verifícalas, no las des por ciertas):
   - en `src/components/phone/ElevenLabsCall.tsx`, `startSession` se llama sin `await` dentro de un `try/catch`: un rechazo de la promesa (por ejemplo, por límite de concurrencia o micrófono ocupado) no llega a `onFail`;
   - el mismo componente usa una referencia `started` y además llama a `endSession` en la limpieza del efecto: con el doble montaje del modo estricto de React, la sesión puede cerrarse y no volver a abrirse;
   - el componente devuelve `null`: hoy no hay ninguna visualización de audio;
   - `scripts/dev/*.mjs` (por ejemplo, `voice-v4.mjs`, `flow-v4.mjs`, `check-locks.mjs`) y `tests/` (`flow.test.mjs`, `e2e/demo_flow.py`) existen en `e4-original`: úsalos como prueba de regresión antes y después de cada hito, y no ejecutes contra producción los que escriben datos.
6. Escribe `docs/diagnostico_voz.md` con cada error, su causa raíz demostrada, la evidencia (registro, captura o prueba) y la corrección prevista. Luego continúa.

## 2. Corregir la concurrencia (P0)

- **Una sesión de voz = un identificador propio** (`voice_session_id`) creado en el servidor. La URL firmada o el token se emiten **por petición**, nunca se cachean ni se comparten, y quedan ligados a la sesión del participante y a su tarea.
- **Máquina de estados explícita en el cliente**: `idle → solicitando → conectando → activa → finalizando → finalizada`, más `ocupado` y `error`. El inicio es idempotente (se bloquea mientras conecta), resiste el doble montaje de React y limpia la sesión al desmontar, en `pagehide` y al navegar.
- **Servidor sin estado compartido.** Todo el estado vive en la base de datos con claves por sesión. Los cambios de estado de una llamada son condicionales (por ejemplo, solo pasar a `en_curso` si estaba `sonando`) para evitar carreras.
- **Cupos.** La reserva de un cupo es atómica (función SQL con bloqueo de fila o restricción única): si dos personas aceptan a la vez, una gana y la otra recibe un aviso claro.
- **Realtime por sesión**: un canal por `voice_session_id`, autorizado; nada de difusión global con datos de personas.
- **Capacidad.** Lleva un contador de sesiones de voz activas en la base de datos. Si se supera `VOICE_MAX_CONCURRENT` (configurable; por defecto, el límite del plan contratado) o ElevenLabs rechaza la conexión, muestra el estado "Todas las líneas están ocupadas" con dos opciones: esperar con su posición en una cola simple o continuar por chat. El respaldo con Gemini Live solo se usa si existe y está probado; si no, el guion fijo.
- **Registro de eventos de voz** en una tabla `voice_events` (inicio, conexión, error con código, fin, motivo), sin datos personales, visible en `/demo`.
- **Pruebas automatizadas**:
  - prueba de Playwright con 4 contextos en paralelo: todas las sesiones conectan o reciben "ocupado", sin errores cruzados ni eventos de otra sesión;
  - después de cerrar las pestañas no quedan sesiones activas colgadas;
  - carrera de dos aceptaciones del mismo cupo: exactamente una reserva;
  - pruebas unitarias de la máquina de estados.

## 3. Nueva experiencia visual del agente de voz (P0)

Objetivo: que la llamada se vea como las páginas de agentes de voz con IA, con una visualización de audio en el centro que reacciona a la voz real.

- **Visualización de audio**: el equipo eligió **una onda de voz** (no un orbe ni barras sueltas): una línea ondulada continua que reacciona en tiempo real a la frecuencia o el volumen reales, con un color para el micrófono del usuario y otro para la voz del agente. Lee los datos del SDK (por ejemplo, `getInputByteFrequencyData()` y su equivalente de salida, o el volumen) dentro de `requestAnimationFrame` y dibuja en `<canvas>`: **no re-renderices React en cada cuadro**.
  - Evalúa los componentes de ElevenLabs UI (https://ui.elevenlabs.io: Bar Visualizer, Live Waveform), que se basan en shadcn/ui. Este proyecto usa Tailwind 4 sin shadcn: adóptalos solo si su instalación es limpia; si no, implementa un componente propio liviano.
- **Estados con texto visible**: "Conectando…", "Te escucho", "El asistente está hablando", "Pensando…", "Llamada finalizada", "Todas las líneas están ocupadas" y errores con una acción para resolverlos. Indicador de micrófono silenciado y duración de la llamada.
- **Subtítulos en vivo** de lo que dicen el usuario y el agente, que se pueden ocultar. Sirven para accesibilidad y para la sala ruidosa de la final.
- **Controles grandes**: silenciar, colgar y "Continuar por chat".
- **Llamada entrante** (teléfono simulado y chat): pantalla completa con tono, vibración cuando el navegador lo permita, y botones Contestar y Rechazar. Antes, un botón "Activar sonido y llamadas" desbloquea el audio y el micrófono.
- **Identificación y seguridad** (propuesta v5.1, sección 4.3): el agente se presenta como "Asistente automatizado de [establecimiento de demostración]"; en pantalla se lee que nunca pide pagos, claves ni el DNI completo, y hay una opción para hablar con una persona.
- **Accesibilidad**: con `prefers-reduced-motion`, la visualización se vuelve estática (solo el nivel); contraste AA; estados anunciados con `aria-live`; áreas táctiles de al menos 44 px.
- **Celulares**: prueba con anchos de 360 a 430 px, en Safari de iOS y Chrome de Android. Usa Wake Lock durante la llamada si está disponible, respeta las zonas seguras y evita el zoom en campos de texto.
- **Rendimiento**: animación fluida en un celular de gama media; la animación se detiene si la pestaña no está visible.
- **Un solo componente** de llamada para todas las rutas que la usan (pedir cita, teléfono simulado y vista del panel).
- Guarda capturas de antes y después en `capturas/e5/`.

## 4. Alinear el producto con la propuesta v5.1 (P1)

Solo después de cerrar los hitos 1 a 3.

- **Quitar** toda referencia a Twilio, WhatsApp y números de teléfono en el código y los documentos. Actualiza `CLAUDE.md`, `docs/` y `.env.example` según la v5.1.
- **Preconsulta** (sección 3.1): opcional, con consentimiento explícito, preguntas breves y adaptativas, y respuestas "no sé" o "prefiero decirlo en la consulta". Una lista fija de signos de alarma interrumpe la entrevista, da una instrucción de seguridad y crea una tarea para el personal. El resumen usa la plantilla fija de la v5.1, con campos críticos, "no evaluado" cuando falta una respuesta y enlace a las respuestas originales. El médico puede editarlo y cada cambio queda registrado. **Nunca incluye un diagnóstico.**
- **Lista de espera** (sección 3.5): el orden es la categoría clínica y, dentro de ella, la fracción del plazo consumida. Elimina los bonos si existen. En `/demo`, un selector compara dos reglas de asignación: "primero que acepta" y "mayor prioridad al cierre de la ventana". Las métricas separan las **consultas netas adicionales** de los simples adelantos.
- **Emergencia** (secciones 3.2, 3.3 y 3.6): tablero del recorrido con eventos que guardan por separado `ocurrido_en` y `registrado_en`; mediana y percentil 90 por tramo y por prioridad I a IV (NTS 042); completitud **por recorrido**; alertas de reevaluación dirigidas a un responsable por turno, con escalamiento. **Sin botón de autoaviso del paciente.** Etiqueta visible "Datos simulados".
- **Alta**: separa "control reservado" de "control realizado".
- **Datos reales en la demo**: una tarjeta con la inasistencia del HMA (25.7 %, y 31.9 % con todas las especialidades) y el desempeño del modelo (52 % de inasistencia en la lista diaria de mayor riesgo frente a 27 % de promedio).

## 5. Seguridad (P0 si sigue pendiente)

- **RLS**: la clave anónima no debe poder leer tablas con datos de personas, tokens ni conversaciones (por ejemplo, `patients.token`). Esas lecturas pasan por rutas del servidor. Agrega una prueba que use la clave anónima directamente y confirme que no ve esos datos.
- **Cookie del PIN** firmada con HMAC y un secreto del servidor, con límite de intentos.
- Revisa que ninguna clave aparezca en los archivos estáticos generados por la compilación.

## 6. Verificación y entrega

- `npm run lint`, verificación de tipos y todas las pruebas en verde, incluida la de concurrencia.
- Despliegue de vista previa en Vercel y lista de prueba manual con dos celulares reales.
- `INFORME_E5.md` con:
  - qué causaba cada error en paralelo y cómo se corrigió, con su evidencia;
  - capturas de la nueva pantalla de llamada;
  - el límite real de llamadas simultáneas con el plan actual de ElevenLabs y qué ve el usuario cuando se alcanza;
  - lo que quedó pendiente y por qué.
- No hagas merge a `main` sin la confirmación del equipo.
