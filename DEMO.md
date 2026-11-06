# Guion de demo v4 (5 minutos)

URL: **https://ods3-hackathon.vercel.app** (los demás dominios piden inicio de sesión de Vercel y los QR no abrirían).
Fuente: `docs/requisitos_v4.md` §6. Preparación detallada en `GUIA_DE_USO.md` §4.

## Quién hace qué

| Integrante | Dispositivo | Pantalla |
|---|---|---|
| 1 | Laptop al proyector | `/panel` (Admisión) y `/tablero` |
| 2 | Segunda laptop | `/demo` (operador) y `/regulador` |
| 3 | Celular A | Chat de `/pedir-cita` vinculado a **Julio** |
| 4 | Celular B | Teléfono simulado de **Rosa** (`/t/rosa`), con sonido activado |
| Jurado | Su celular | QR impreso de `/pedir-cita` |

## Antes (paso 0)

`/demo` → **Reiniciar demo**. Celular A abre `/pedir-cita`, **Activar sonido y llamadas**, **Chatear**, ACEPTO; en **En vivo** se vincula a Julio. Celular B abre `/t/rosa` y toca **Activar sonido y llamadas**. **Probar llamada** en ambos.
*Plan B:* teléfonos simulados en pestañas de la laptop 2.

## Guion

| Tiempo | Paso | Clic por clic | Lo que se ve | Qué decir | Plan B |
|---|---|---|---|---|---|
| 0:00–0:40 | 1 | Un jurado escanea el QR, abre el chat, ACEPTO y pide Dermatología con un nombre ficticio | En `/regulador` aparece S-04XX sin alias ni datos de contacto | «Quien no consigue cupo hoy no queda registrado en ningún sistema. Aquí sí, y el regulador decide sin ver quién es.» | **Formulario** de `/pedir-cita` |
| 0:40–1:00 | 2 | Regulador: **P3** | La solicitud entra a la Lista de espera, en su posición y con su razón | «El orden es público: categoría y plazo consumido. Nunca el seguro ni el sexo.» | — |
| 1:00–1:40 | 3 | Panel: **Enviar recordatorios (72 h)**. Carmen (simulada o celular) **No podré asistir** | Por reasignar: cupo 19/10 10:20 «Zona cercana · P1–P2», 54 % con 4 candidatos | «El mensaje llega a todos; quien no puede avisa con un toque y el cupo se recupera tres días antes.» | Botón de Carmen en su teléfono simulado |
| 1:40–2:30 | 4 | `/demo` → **2. Cerrar el plazo**. Celular B suena: contestar en altavoz | Llamada en curso en **En vivo**, con las acciones del agente | «Rosa no respondió y está en el 10 % de mayor riesgo: la llama el agente. Dice que es automático y no pide datos.» | La llamada sigue con el guion fijo; o `/t/rosa?voz=guion` |
| 2:30–3:30 | 5 | **Aprobar y enviar oferta a 4**. Julio (chat real) responde **1** primero; Ana (**Acepta**, simulada) después. **Cerrar oferta y asignar** | «Asignado a Ana G. (prioridad 0.77: P2, 69 % de su plazo) aunque Julio respondió primero (0.48)». Julio recibe en el chat «Usted queda primero» | «Responder rápido no da ventaja: gana quien más lo necesita según reglas públicas.» | Botones Acepta/No de cada candidato |
| 3:30–4:10 | 6 | Por validar → **Usar simulado: confirma** (Ana) | Cita confirmada; su cita del 09/11 se libera (efecto dominó) → **Aprobar y enviar oferta a 4** → Luis acepta solo (simulado) → **Cerrar oferta y asignar** → termina en **Luis** (solicitud sin cita) | «El espacio vacío se corre a una fecha lejana, donde hay más tiempo para organizarse.» | Teléfono de Ana `/t/ana` |
| 4:10–4:40 | 7 | Por reasignar: cupo de **Dermatología, lunes 23/10** (zona media) → aprobar | En el chat del jurado llega la oferta; «1», al cerrar «Sí, confirmo» → cita registrada | «La persona que pidió la cita hace 4 minutos ya tiene una, sin hacer cola.» | Usar simulado |
| 4:40–5:00 | 8 | `/tablero` | Cupos llenados, validaciones, equidad, carga del personal y escenario r ≈ 10 % → unas 10,600 citas al año | «Con los mismos médicos. Desde 5.3 % el hospital ya gana.» | — |

## Si algo falla

- Celular sin mensaje: recargar (los datos están en la base).
- Voz sin conectar: la llamada continúa con el guion fijo; el operador puede **Terminar (usar simulado)** en **En vivo**.
- Una oferta o validación no llega: botones **Usar simulado** en Por reasignar y Por validar.
- Todo se desordenó: `/demo` → **Reiniciar demo** (2 s) y volver a vincular el chat a Julio.
