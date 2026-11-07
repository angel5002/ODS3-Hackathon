# Escenas del pitch y preconsulta (pista C, E5 final)

Rama `e5-escenas`. Fuentes: `insumos/AsistIA_Guion_Pitch_v7.pdf` (secciones 3, 4 y 5) y
`insumos/AsistIA_Propuesta_Final_Algorritmia_v5.1.pdf` (§3.1, §4.1 y §4.2). Contrato: `src/lib/demo/contract.ts`.
Operación en el escenario: `DEMO.md` → «Hoja de operación de las escenas».

## 1. Audio de las escenas

- **Cómo se generó:** `node --env-file=<.env.local> scripts/scene-audio.mjs`.
  - El script lee la configuración TTS del agente `asistia-oferta` en vivo (`GET /v1/convai/agents/{id}`): voz
    `hsPqKgfWI5YayyFu0nuN`, modelo `eleven_v4_turbo`, estabilidad 0.5, similitud 0.75, velocidad 1.
  - Llama a `POST /v1/text-to-speech/{voice_id}` (https://elevenlabs.io/docs/api-reference/text-to-speech/convert) con
    el texto exacto del guion, `language_code: "es"`, `seed: 2026` y salida `mp3_44100_128`.
- **Sin ediciones:** no se aceleró, no se recortaron pausas y tampoco el silencio inicial o final, que medido con
  `silencedetect` (-45 dB) es menor a 0.25 s.
- **Archivos** en `public/escenas/`:

  | Archivo | Línea | Duración |
  |---|---|---|
  | `e1-oferta.mp3` | «Buenos días, Tito. Le habla el asistente automatizado del Hospital Mirasur. Se liberó un cupo de oncología para mañana a las 9:00. ¿Desea tomarlo?» | 8.8 s |
  | `e1-reservada.mp3` | «Listo. Su cita quedó reservada para mañana a las 9:00.» | 4.0 s |
  | `e2-motivo.mp3` | «Hola, Tito. Antes de su cita, ¿qué molestia quiere consultar?» | 3.7 s |
  | `e2-medicamentos.mp3` | «¿Tomó algún medicamento? ¿Tiene alergias?» | 2.7 s |
  | `e2-alarma.mp3` | «¿Tiene fiebre, o la rodilla está muy hinchada o caliente?» | 3.9 s |
  | `e2-cierre.mp3` | «Gracias, Tito. Su médico lo recibirá con este resumen. Su consultorio va con 20 min de atraso: llegue entre 10:20 y 10:35.» | 8.8 s |

## 2. Reproducción de las escenas

- **Datos:** `src/lib/demo/scenes.ts` define `Scene`/`SceneLine` del contrato, más `cue` (qué hace la pantalla) y
  `audioMs`.
- **Motor:** `useSceneController(id, { voice, logEvents })` y `useSceneKeyboard`, en `src/components/scenes`.
  - `next()` y `prev()` avanzan y retroceden; las líneas con `afterMs` avanzan solas.
  - Un solo `<audio>` por escena. Su `AnalyserNode` alimenta `levels.output` de `CallView`, así que las ondas siguen esa
    voz.
  - El chat de la escena 2 nunca pisa una voz: si la voz está activa, la burbuja siguiente espera al audio más 0.3 s.
- **Escena 1:** la línea de la IA suena dentro de `CallView` («Respira»):
  - con `phase` en «entrante», «activa» o «finalizada»;
  - con `agentSpeaking` tomado del audio;
  - con el texto de la línea como subtítulo;
  - con `scene: true`, que oculta los controles de la llamada.
- **Escena 2:** el resumen del médico **no es un guion**. Las respuestas de Tito pasan por la máquina real de la
  preconsulta, así que lo proyectado es lo que hace la función en vivo.
- **Decisión: confirmar el medicamento.** La propuesta exige confirmar los medicamentos uno por uno, y el guion no tiene
  esa línea. Se agregó solo en pantalla, sin voz: «Anoté: Ibuprofeno. ¿Es correcto?» y Tito toca «Sí» (1.2 s). Las
  líneas habladas de la IA son exactamente las del guion.
- **Decisión: escena 2 sin voz por defecto.** Así respeta el ritmo de 2.4 s del guion: el chat termina a los 18 s.
  Con voz, el chat dura unos 31 s y la escena unos 46 s. Se puede activar con `voice`.
- **Registro:** cada paso va a `POST /api/staff/scene-event` (solo personal) → `voice_events` con `source = 'cliente'` y
  `kind = 'escena.<id>.<paso>'`, sin sesión ni llamada.
  - `GET /api/staff/data?view=voice` descarta los `kind` que empiezan con `escena`, así que un ensayo nunca cuenta
    como llamada.
  - `voice_overview()` no se tocó: el filtro está en la ruta.
- **Modo ensayo en `/demo`:**
  - **E** lo activa y **R** reinicia la escena.
  - En ese modo no se registran pasos y no se leen los datos reales del cupo.
  - Indicador mínimo: «Ensayo · R».
- **Página de ensayo:** `/panel/escenas` (solo personal).

## 3. Escena 1 en la base

Dos migraciones aditivas, aplicadas por el líder:
- `20261108010000_e5_escena1_seed.sql`, con su reversa en `supabase/rollback/`;
- `20261108020000_e5_preconsulta.sql`, también con su reversa.

**`seed_escena1(p_specialty default 'Oncología Médica')`** es idempotente. Crea o restablece a «Tito Quispe Rojas»:
- 62 años;
- cita futura en `demo_today() + 35` (5 semanas), a las 9:00, que acepta adelantarse;
- primer intento hace 3 días;
- avisos con poca anticipación permitidos, canal «llamada» y `sim_offer_reply = 'acepta'`;
- categoría **P1 asignada con `regulate(…, 'P1', 'Profesional')`**: la IA nunca prioriza.

Si existiera otro P1 de la especialidad con más fracción de plazo, se adelanta el primer intento para que Tito quede
primero. Si Tito está a mitad de la escena (oferta o asignación abierta), no lo toca.

**`escena1_offer_to_tito(p_slot, p_actor, p_close)`:**
1. Comprueba que Tito sea el primer candidato de `propose_candidates_v51(p_slot)`; si no, rechaza.
2. Llama a `approve_offer_v51` (el personal aprueba).
3. Llama a `respond_offer(…, 'acepta', 'voz')` (el «¡Sí, sí lo quiero!» de la llamada).
4. Con `p_close`, llama además a `close_offer_v51`.

**Desde `/demo` (Operar → Cupos liberados → «Escena 1 · Tito»):**
- `POST /api/staff {action:"escena1_preparar"}` llama a `seed_escena1()`;
- `{action:"escena1_aprobar", slotId?}` llama a `escena1_offer_to_tito`. Sin `slotId`, usa el primer cupo libre de
  Oncología Médica donde Tito es el primero;
- `{action:"escena1_cerrar"}` llama a `close_offer_v51` sobre la oferta abierta de Oncología Médica.

**Coordinación con la pista E:**
- La tarjeta «Carmen» del jurado es una paciente nueva con cita de **Oncología Médica** el jueves 19/10 a las 9:00,
  presencial. Al cancelar, ese cupo queda en la zona «cercana» (3 días), donde solo entran P1, P2 o quien acepta poco
  aviso.
- Tito gana con la regla por defecto «mayor prioridad al cierre». Con «primero que acepta», no está garantizado.
- La Carmen antigua (P1126, Cardiología, flujo de Ana, Julio y Luis) no se tocó.

**Comprobado:** `scripts/dev/escena1-check.mjs` (con ALLOW_DB_WRITE=1) dejó a Tito como S-0428, P1 «Profesional»,
primero de Oncología Médica.

## 4. Preconsulta (función nueva, también en vivo)

- **Tablas:** `preconsulta_sessions`, `preconsulta_answers` (la conversación, para auditar el resumen) y
  `preconsulta_edits` (las correcciones del médico).
  - RLS activo; sin acceso para `anon` ni `authenticated`; solo `service_role`.
  - Caducan a las 24 h (`preconsulta_purge`).
- **Funciones:** `preconsulta_apply`, que aplica un paso de forma atómica: control por versión (un doble envío se
  aplica una sola vez), turnos y, como máximo, una tarea (`alarma` o `pide_persona`, vía `create_task`).
- **Máquina:** `src/lib/preconsulta/machine.ts`, pura y con pruebas.
  - **Campos obligatorios:** motivo, inicio, medicamentos, alergias y signos de alarma. Lo que falta se muestra como
    «No informado»; «no sé» y «prefiero decirlo en la consulta» se registran tal cual.
  - **Negaciones verificadas:** solo un «no» claro a una pregunta cerrada y directa. Un «sin fiebre» dentro de una
    respuesta libre queda «por verificar». Un «No» suelto a la pregunta doble se vuelve a preguntar.
  - **Medicamentos:** se confirman uno por uno; si el paciente dice «no», se pide el nombre correcto y la corrección
    queda en «Pendientes».
  - **Signos de alarma:** una sola pregunta por contexto, en segunda persona y con 2 o 3 ejemplos, nunca una lista
    larga:
    - si nombró una articulación o un miembro, se usa la pregunta del guion («¿Tiene fiebre, o la rodilla…?»);
    - si no, «¿Siente ahora algo que no puede esperar, como dolor fuerte en el pecho, falta de aire o desmayo?»;
    - solo si nombró un embarazo o un bebé, se agrega la pregunta de ese contexto.
  - **Si hay un signo:** con un «sí» sin detalle, se pregunta brevemente «¿Qué siente?» (para la tarea, nunca para
    diagnosticar), con el 106 ya en el mensaje, y luego se deriva. Si nombró un signo en cualquier paso (lista propia
    más `ALARM_WORDS` del bot), la entrevista se interrumpe: se indica acudir a emergencia o llamar al 106, se crea una
    tarea `alarma` y se ofrece **«Hablar con una persona ahora»** (tarea `pide_persona`).
  - **Signos no preguntados:** quedan «No evaluado». Nunca se escribe «sin signos de alarma».
  - **Todo cierre dice** qué se registró, quién lo revisa, cómo se avisará y qué hacer si empeora. La hora de llegada
    siempre se presenta como estimación.
  - **El modelo de lenguaje** (`interpret`) solo lee un sí o un no que las reglas no entendieron, en los pasos de
    confirmación. Nunca diagnostica ni sugiere exámenes.
- **Ventana de llegada:** `src/lib/preconsulta/arrival.ts`, con duraciones **simuladas** (18, 19, 17, 20 y 21 min,
  turnos de 15 desde las 9:00). Una cita a las 10:15 lleva 20 min de atraso y da «llegue entre 10:20 y 10:35».
  - La ventana termina en el inicio esperado: es conservadora.
  - Siempre lleva el rótulo de estimación.
  - No está en la propuesta v5.1 (guion §8.1).
- **Rutas:**
  - `POST /api/preconsulta`: inicio público con nombre ficticio, máximo 20 por minuto;
  - `GET/POST /api/preconsulta/[token]`: el token es la capacidad; acciones `consent`, `answer` y `persona`;
  - `GET/POST /api/staff/preconsulta`: lista, detalle, crear enlace y corregir.
- **Páginas:**
  - `/preconsulta` (inicio);
  - `/preconsulta/[token]` (chat del paciente, con «Leer en voz alta»: el audio pregenerado si la línea coincide, si no
    `speechSynthesis`);
  - `/panel/preconsulta` (vista del médico, que se actualiza cada 1.5 s).

## 5. Pruebas

- `npm run test:unit` incluye `tests/preconsulta.test.ts` y `tests/scenes.test.ts`.
- `tests/e2e/preconsulta.py` y `tests/e2e/escenas.py` exigen ALLOW_DB_WRITE=1 (sin eso salen con código 3).
- `tests/e2e/demo_panel.py` es de la pista D y se mantiene.
