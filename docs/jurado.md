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

Pruebas unitarias en `npm run test:unit` (`tests/jury.test.ts`): formato y unicidad de los tokens (contra los tokens ya usados), el orden del feed, que cada actividad quede bajo su cartilla, los estados, `carmenSlot` y `newRequests`.
