# Interacción en vivo del jurado (pista E, final)

Cada miembro del jurado recibe una cartilla impresa con un QR. El QR abre `/j/<token>`: un personaje ficticio, qué le pasa y qué puede probar. Lo que hace con su celular se ve en vivo en el proyector (`GET /api/staff/data?view=jurado`). Guion: `insumos/AsistIA_Guion_Pitch_v7.pdf`, diapositiva 5 y escena 1.

## Cartillas

| Token | Personaje | Canal | Qué le pasa | Qué prueba |
|---|---|---|---|---|
| `j-cmp73z` | Carmen | voz o chat | Cita de **Oncología Médica**, jueves 19/10 a las 9:00 | Avisa que no podrá ir. **Su cupo es el de la escena 1**: después de que el personal aprueba la oferta, llega a Tito (primero en la lista de oncología, sembrado por la pista C) |
| `j-geg8pd` | Jorge | voz | Medicina Interna, jueves 11:40; no usa WhatsApp | Pide la llamada y confirma hablando |
| `j-xrcnu6` | Lucía | voz | Le cuesta leer de cerca y no tiene cita | Pide una cita de Oftalmología hablando; acepta el cupo |
| `j-a34yvp` | Marco | voz | En lista de espera de Neurología (P1, 18 días); prefiere llamadas | Lo llaman con un cupo y lo acepta hablando |
| `j-g6ytk3` | Óscar | chat | Mancha en la piel que cambió de color | Pide una cita de Dermatología por chat; acepta el cupo |
| `j-5fsv23` | Teresa | chat | En lista de espera de Cirugía Torácica (P2, 50 días) | Le llega un cupo por mensaje; lo acepta y lo confirma |
| `j-8bv35u` | Raúl | chat | Gastroenterología, jueves 10:40; le llegó el recordatorio | Confirma respondiendo el mensaje |
| `j-uqpbrq` | Sofía | voz o chat | Ginecología, jueves 8:20 | Confirma por mensaje o pide la llamada (repuesto) |

Tres por voz (Jorge, Lucía, Marco), tres por chat (Óscar, Teresa, Raúl) y dos que aceptan ambos (Carmen y Sofía, de repuesto).

PDF para imprimir: `docs/cartillas/cartillas.pdf` (A6, cuatro por A4, con su QR) y `docs/cartillas/cartillas_reserva.pdf` (repuesto: una línea de instrucciones por cartilla). Los QR apuntan al alias `https://asistia-e5.vercel.app/j/<token>`. Para regenerarlos: servidor de desarrollo y `ml/.venv/Scripts/python tests/e2e/cartillas_pdf.py --base http://localhost:3180` (la página `/dev/cartillas` no existe en producción).

## Rutas

- `/j/<token>`: la cartilla. Al abrirla, `jury_open()` deja jugable al personaje (teléfono simulado, cita del jueves con el recordatorio ya enviado, o su solicitud en lista de espera) y registra la visita. Luego:
  - Carmen, Jorge, Raúl, Sofía: «Recibir la llamada del hospital» (si hay una línea de voz libre) o «Responder por mensaje». Ambos abren su teléfono simulado (`PhoneApp` con el mismo token).
  - Marco y Teresa: «Abrir mi teléfono». Las ofertas y la confirmación llegan ahí (a Marco, además, lo llama el agente de ofertas).
  - Lucía y Óscar: `/pedir-cita` ligado a la cartilla («Pedir la cita hablando» o «por chat»). La sesión del chat queda registrada en `jury_visits`, así que la solicitud, la oferta y la confirmación quedan bajo ese token.
- **QR del público (pantalla grande): `/pedir-cita?canal=chat`**. Entra solo por chat (sin la opción de voz) y abre la conversación directamente. `/pedir-cita` sin parámetro no cambia.
- `GET /api/jury?token=…` y `POST /api/jury {token, action: "call"}`: públicos y limitados al token, como `/api/patient`.

## Voz: capacidad

- Las líneas de voz se reservan para las cartillas. **Prefijo: `j-`** (con guion). Los tokens impresos son `j-` más 6 caracteres de `abcdefghjkmnpqrstuvwxyz23456789`; las cartillas temporales de la prueba automática son `j-test-…`. Ojo: hay tokens viejos de teléfonos que empiezan con `j` sin guion (`j2895s6a`, `julio`): no son cartillas.
- Llamadas de Carmen, Jorge, Sofía y Marco: el teléfono simulado envía `token` (= el token de la cartilla) a `/api/voice/session`, como siempre.
- Registro por voz de Lucía: `/api/voice/session` recibe además `jury: "<token>"` en el cuerpo (campo nuevo, opcional). La pista de voz puede usarlo para aplicar la reserva.
- Si no hay línea libre, la cartilla no muestra el botón de llamada y dice, sin error, que puede hacerlo por mensaje o por chat (`voiceAvailable()`: sesiones activas < `VOICE_MAX_CONCURRENT` y nadie en cola).

## Acciones del personal en `/demo` (un clic cada una)

`POST /api/staff` (PIN y rol Admisión):

| Acción | Cuerpo | Qué hace |
|---|---|---|
| `jury_prepare` | — | Deja jugables todas las cartillas impresas (después de un reinicio de la demo) |
| `jury_categorize` | `{code: "S-0712", category: "P2"}` (o `requestId`) | Llama a `regulate()`, la misma función del regulador. Solo acepta solicitudes de cartillas |
| `jury_offer` | `{token}` | `approve_offer_v51()`: Carmen, el cupo que liberó; Lucía, Óscar, Marco y Teresa, un cupo libre de agenda de su especialidad en la zona que su categoría puede tomar (P1–P2 cercana, P3 media, P4 lejana). Si la persona no queda entre los candidatos (hay otros antes en la lista), no se envía nada y se explica |
| `jury_close` | `{token}` | `close_offer_v51()`: cierra la ventana y asigna por la regla publicada |
| `jury_rearm` | `{token}` o `{all: true}` | Reinicia solo esas cartillas (ver abajo) |

El circuito de una solicitud nueva es: el jurado la registra → **Categorizar** → **Ofrecer** → el jurado acepta → **Cerrar** → el jurado confirma «Sí, soy el paciente».

En `/demo` (modo Operar) el panel **Cartillas del jurado**, encima de la lista de espera, muestra solo lo que hay que decidir y lo hace con un clic: P1, P2, P3 o P4 para categorizar; «Ofrecer un cupo» (o «Ofrecer su cupo», en el caso de Carmen); «Cerrar y asignar». Si no hay nada pendiente, ofrece «Preparar cartillas». El panel lee `GET /api/staff/data?view=jurado_ops`, que devuelve `{ops: [{token, character, kind, request, next, status}]}`, donde `next` puede ser `categorizar`, `ofrecer`, `cerrar` o `null`.

## Vista del proyector

`GET /api/staff/data?view=jurado` (solo personal, solo lectura) devuelve `JuryOverview` de `src/lib/demo/contract.ts`:

- `cards`: cada cartilla con `state` (`sin_abrir`, `abierta`, `en_curso`, `completo`), `lastAt` y `path` (`/j/<token>`).
- `activity`: frases cortas, de la más nueva a la más antigua (máximo 60). Por ejemplo: «Carmen avisó por mensaje que no podrá ir: su cupo no se pierde», «Óscar pidió una cita de dermatología por chat», «Un profesional revisó la solicitud de Óscar (P2)», «Óscar aceptó el cupo», «El cupo que liberó Carmen es ahora de Tito».
- `carmenSlot`: el cupo que liberó Carmen (`libre`, `ofrecido`, `asignado`) y el nombre de quien lo recibió.
- `newRequests`: las solicitudes que registró el jurado, con código, categoría, posición en la lista de espera y estado en palabras.

Con `&test=1` también aparecen las cartillas temporales de la prueba automática; sin él, nunca.

Cómo se arma: `jury_snapshot()` (SQL) junta los hechos de cada cartilla **por su token** y `src/lib/jury/overview.ts` (puro, con pruebas) los convierte en frases. Así una acción nunca aparece bajo otra cartilla. Solo se muestra lo ocurrido desde el último reinicio de la demo (`jury_epoch()`: la hora en que `seed_v4()` volvió a crear la lista de espera).

## Datos (migración aditiva)

`supabase/migrations/20261107070000_e5_jury_cards.sql`. Solo crea objetos nuevos (`create table`, `create function` sin `or replace`) y no cambia filas existentes. Reverso: `supabase/rollback/20261107070000_e5_jury_cards.down.sql`.

- Tablas: `jury_cards` (las 8 cartillas), `jury_visits` (aperturas y sesión de chat de cada cartilla), `jury_slots` (cupos abiertos para una cartilla). RLS activado, sin acceso para `anon` ni `authenticated`, solo `service_role`.
- Funciones: `jury_ensure`, `jury_open`, `jury_prepare`, `jury_categorize`, `jury_offer`, `jury_close`, `jury_clear`, `jury_rearm`, `jury_drop_test`, `jury_snapshot`, `jury_card_requests`, `jury_epoch`. Solo llaman a funciones existentes (`regulate`, `approve_offer_v51`, `close_offer_v51`, `propose_candidates_v51`, `revert_assignment`, `future_appointment`, `seed_person`, `seed_request`).
- Los personajes se crean como filas nuevas: paciente `J…` con `patients.token` = token de la cartilla y `demo_role = 'jurado'` (así sus llamadas no se responden solas como las de pacientes simulados); citas `futura` del jueves 19/10 que no cuentan entre las 1,473 (`is_base = false`).

## Decisiones

1. **Carmen es una paciente nueva** (decisión del coordinador): su cita es de `Oncología Médica` el jueves 19/10 a las 9:00, para que su cupo sea el de la escena 1 y le llegue a Tito. No se reutiliza `carmen` (P1126, Cardiología), que mueve otro flujo. Hay otra cita base de Oncología Médica a las 9:00 ese día: quedan dos citas a la misma hora (se acepta: es otro consultorio).
2. **Recordatorio ya enviado**: al abrir la cartilla, las citas de Carmen, Jorge, Raúl y Sofía ya tienen su recordatorio de 72 horas en el teléfono. Así el jurado puede actuar en cualquier momento, sin esperar a que el operador envíe los recordatorios.
3. **Especialidades elegidas para que el circuito cierre**: Lucía (Oftalmología) y Óscar (Dermatología) piden en especialidades donde la lista sembrada solo tiene P4. Con P1, P2 o P3 quedan primeros, y nadie de la semilla acepta antes que ellos. Marco (Neurología, P1) y Teresa (Cirugía Torácica, P2, donde no hay otros P2) también quedan primeros. Si el operador elige una categoría con la que hay otros antes en la lista, `jury_offer` no envía nada y lo explica: la regla de prioridad no se salta.
4. **Cupos libres de agenda**: para las solicitudes del jurado se abre un cupo libre de agenda, como los de la sección 6 de los requisitos (`origin = 'agenda_libre'`). AsistIA no crea cupos en el producto. Esto es un supuesto de la demostración.
5. **Categorizar desde `/demo`** usa la misma `regulate()` del regulador, con el actor «Regulador». Solo se permite para solicitudes de cartillas. La IA no categoriza: lo hace la persona que hace clic.
6. **Reiniciar sin reiniciar la demo**: `jury_rearm` borra solo lo que produjo esa cartilla (sus sesiones de chat, las solicitudes que registró, su cita y el cupo que liberó, los cupos que se abrieron para ella, sus mensajes y llamadas). A quien no es del jurado y recibió algo, como Tito con el cupo de Carmen, primero se le revierte la asignación con `revert_assignment()`. Si esa reversión no se puede hacer (por ejemplo, porque hay un efecto dominó pendiente), no se borra nada y se muestra el error. Después de reiniciar a Carmen, conviene volver a correr la semilla de la escena 1 (pista C).
7. **Después de `reset_demo()`**: los pacientes `J…` sobreviven, pero se borran sus citas, solicitudes y mensajes. Se recrean al abrir cada cartilla o con `jury_prepare`.

## Prueba automática

`ALLOW_DB_WRITE=1 ml/.venv/Scripts/python tests/e2e/jurado_circuito.py --base http://localhost:3180 --env <ruta a .env.local>` (sale con 3 si falta `ALLOW_DB_WRITE=1`).

Crea 6 cartillas temporales (`j-test-…`, personajes que no se imprimen), las juega en paralelo y al final las borra con `jury_drop_test` (solo borra cartillas de prueba). Nunca reinicia la demo.

- **Voz.** Lo que se puede automatizar es la llamada: se pide, el teléfono suena y se rechaza (no se abre sesión con ElevenLabs). La conversación con el agente necesita un micrófono real, así que la respuesta sigue por mensaje. El registro «por voz» se hace por chat, como respaldo.
- **Comprobaciones.** Que cada acción llegue a la vista del jurado bajo su propio token, que todas las cartillas terminen en «completo», que las solicitudes nuevas muestren su código, P2 y «Con cita», y que la vista sin `test=1` no muestre las cartillas de prueba.

### Resultados (7/11, base compartida, `next build` + `next start` en el puerto 3180)

| Personaje (prueba) | Canal | Circuito | Duración | Llega al proyector (máx.) |
|---|---|---|---|---|
| Ciro | chat | cancela | 5.6 s | 1.7 s |
| Ítalo | voz | pide la llamada, la rechaza y confirma por mensaje | 9.4 s | 1.9 s |
| Bruno | chat | oferta → acepta → cierre → confirma | 10.1 s | 1.7 s |
| Nadia | voz | oferta (llamada rechazada) → acepta → cierre → validación (2 llamadas rechazadas) → confirma | 16.7 s | 1.6 s |
| Inés | chat | registro por chat (14 mensajes) → categorizar → ofrecer → acepta → cerrar → confirma | 43.4 s | 1.7 s |
| Pilar | voz (respaldo por chat) | igual que Inés | 44.0 s | 1.4 s |

Los 6, en paralelo, tardaron 45.2 s en total, sin errores en la consola y sin cruces entre cartillas. Una persona escribe más lento que la prueba, pero el circuito más largo (pedir una cita nueva y quedarse con ella) cabe en 1 a 2 minutos.

Con `next dev`, la primera compilación de cada página bajo seis navegadores a la vez hizo fallar los clics antes de que la página respondiera (dos de seis en la primera corrida, todos en la segunda). Por eso la prueba se corre contra un build.

Escena 1, comprobada con la cartilla impresa de Carmen y luego reiniciada:
1. «No podré asistir» → `carmenSlot` = Oncología Médica, jueves 19/10 a las 9:00, `libre`.
2. La propuesta de candidatos trae un solo nombre: **Tito Q. (P1)**.
3. `jury_offer` → `carmenSlot.state = "ofrecido"`.
4. `jury_rearm` → Tito vuelve a `con_cita`, con su cita, y Carmen queda lista y sin abrir.

Después de unir `e5` hubo dos corridas más, las dos en OK. Los 6 jurados en paralelo tardaron 42.0 s y 44.8 s; el circuito más largo, 41 a 44 s, y cada acción llegó al proyector en 1.7 s o menos.

`tests/e2e/demo_panel.py` (solo lectura) pasó con el panel nuevo: Presentar en 1920×1080 y 1280×720, y Operar en 1920×1080 y 360×800. Una corrida posterior falló solo en el botón «Sala ruidosa activada» de la barra superior (texto cortado), que es de las pistas D y voz. Falló porque alguien activó `sala_ruidosa = on` en la base a las 10:39 UTC; las cartillas no tienen relación con eso.

### Pendiente para la pista de voz

`isCardCall()` (`src/lib/voice/sessions.ts`) reconoce las llamadas de los teléfonos de las cartillas (`patients.token` empieza con `j-`). No reconoce el **registro por voz de Lucía**, porque esa llamada solo tiene `chat_session_id` y la sesión no está vinculada a un paciente.

Se arregla con una línea en esa función, que es de la pista de voz: si no hay paciente, buscar `jury_visits.chat_session_id = call.chat_session_id` y, si existe, tratarla como cartilla. El cuerpo de `/api/voice/session` también trae `jury: "<token>"` para ese caso.

Pruebas unitarias en `npm run test:unit` (`tests/jury.test.ts`): formato y unicidad de los tokens (contra los tokens ya usados), el orden del feed, que cada actividad quede bajo su cartilla, los estados, `carmenSlot` y `newRequests`.
