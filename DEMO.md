# Guion de demo (5 minutos) · versión E5 (propuesta v5.1)

**URL:**
- **https://asistia-e5.vercel.app** mientras `e5` no esté en `main`. Es la vista previa con la versión E5 y abre sin cuenta de Vercel.
- **https://ods3-hackathon.vercel.app** después del merge. Hoy esa dirección todavía muestra la E4.

**Final (pitch v7):** `/demo` tiene dos modos:
- **Presentar** (`/demo?modo=presentar`) es lo que se proyecta:
  - un momento por vista: 1 QR y cartillas, 2 Escena 1, 3 Jurado en vivo, 4 Escena 2 y 5 Etapas;
  - teclas: ← →, 1–5, F para pantalla completa y Espacio para adelantar una escena.
- **Operar** es el tablero de control.

Detalle y ranuras en `docs/demo_presentacion.md`.

**Pantallas nuevas de la E5:**
- todo en la paleta clara;
- la llamada con la onda de voz en el centro, el estado en dos o tres palabras («Hablando», «Te escucho», «Pensando») y los subtítulos de la última frase;
- tres controles: Silenciar, Colgar y Chat;
- `/demo` como **centro de control** en una sola pantalla (se proyecta): a la izquierda los pasos del guion con su número; arriba el recorrido del paciente en 6 etapas con su conteo y el último evento, y el QR del jurado; abajo **Llamadas en vivo**, **Cupos liberados** (con la **regla de asignación activa**, se cambia ahí mismo) y la **Lista de espera** en el orden v5.1;
- debajo, en **Preparación y herramientas del operador** (paso 0): En vivo, Voz en vivo, teléfonos simulados, ajustes y parámetros.

## Quién hace qué

| Integrante | Dispositivo | Pantalla |
|---|---|---|
| 1 | Laptop al proyector | `/panel` (Admisión) y `/tablero` |
| 2 | Segunda laptop | `/demo` (operador: centro de control; abajo, En vivo y Voz en vivo) y `/regulador` |
| 3 | Celular A | Chat de `/pedir-cita` vinculado a **Julio** |
| 4 | Celular B | Teléfono simulado de **Rosa** (`/t/rosa`) |
| Jurado | Su celular | QR impreso de `/pedir-cita` |

**Regla de oro de la voz:** un personaje se abre en **un solo** dispositivo. Si se abre en dos, el segundo muestra «Llamada abierta en otro dispositivo» y no conecta. Eso es correcto: evita dos conversaciones a la vez.

## Antes (paso 0, 5 minutos antes)

1. `/demo` → **Reiniciar demo** (abajo a la izquierda; pide confirmar en el mismo lugar: **Sí, reiniciar**). Ojo: borra las sesiones de chat, así que se hace antes de que el jurado escanee.
2. `/demo` → Cupos liberados → **Regla de asignación activa: Mayor prioridad al cierre**. Es la regla por defecto.
3. Celular A: abrir `/pedir-cita`, tocar **Activar sonido y llamadas**, **Chatear con el asistente** y escribir ACEPTO. En `/demo` → **Paso 0 · Preparar** (baja a **En vivo**), vincularlo a Julio.
4. Celular B: abrir `/t/rosa` y tocar **Activar sonido y llamadas**. El aviso «Sonido y micrófono listos» aparece abajo.
5. **Probar llamada** en ambos desde **En vivo**. El agente debe presentarse como asistente automatizado del Hospital Mirasur. En **Voz en vivo** se ve la sesión «En llamada» y, al colgar, «Terminada».

## Guion

| Tiempo | Paso | Clic por clic | Lo que se ve | Qué decir | Plan B |
|---|---|---|---|---|---|
| 0:00–0:40 | 1 | Un jurado escanea el QR → **Chatear** → ACEPTO → pide Dermatología con un nombre ficticio | En `/regulador` aparece la solicitud S-04XX sin alias ni datos de contacto | «Quien no consigue cupo hoy no queda registrado en ningún sistema. Aquí sí, y el regulador decide sin ver quién es.» | **Formulario** de `/pedir-cita` |
| 0:40–1:00 | 2 | Regulador: **P3** | La solicitud entra a la lista de espera con su razón: «P3 · 0 % de su plazo» | «El orden es público: primero la categoría clínica, y dentro de ella, quién ya consumió más de su plazo. Un P3 nunca pasa a un P2. Sin bonos, y nunca el seguro ni el sexo.» | — |
| 1:00–1:40 | 3 | Panel: **Enviar recordatorios (72 h)**. Carmen toca **No podré asistir** | Por reasignar: cupo del 19/10 a las 10:20, zona cercana, con 4 candidatos | «El mensaje llega a todos; quien no puede avisa con un toque y el cupo se recupera tres días antes.» | Botón de Carmen en su teléfono simulado |
| 1:40–2:30 | 4 | `/demo` → **Paso 4 · Cerrar el plazo de respuesta**. Suena el Celular B (Rosa): **Contestar**, en altavoz | Pantalla de llamada: onda de voz, «Hablando» y «Te escucho», subtítulos. En `/demo` → Llamadas en vivo: «Rosa D. · En llamada» con el tiempo | «Rosa no respondió y está en el 10 % de mayor riesgo: la llama el asistente en el navegador. Se identifica como asistente automatizado, nunca pide pagos, claves, códigos ni el DNI completo, y ofrece hablar con una persona.» | Ver «Si falla la voz» |
| 2:30–3:30 | 5 | **Aprobar y enviar oferta a 4**. Julio (chat real) responde **1** primero; Ana (simulada) acepta después. **Cerrar oferta y asignar** | «Asignado a Ana G. (mayor prioridad: P2, 69 % de su plazo) aunque Julio respondió primero (P2, 44 % de su plazo).» Julio queda en espera prioritaria | «Responder rápido no da ventaja: al cerrar la ventana gana quien tiene mayor prioridad entre quienes aceptaron. La otra regla, "primero que acepta", está a un clic en los parámetros para compararlas en el piloto.» | Botones Acepta/No de cada candidato |
| 3:30–4:10 | 6 | Por validar → **Usar simulado: confirma** (Ana) | Cita confirmada; su cita del 09/11 se libera (efecto dominó) → aprobar → Luis acepta → cerrar → termina en **Luis** | «El espacio vacío se corre a una fecha lejana, donde hay más tiempo para organizarse.» | Teléfono de Ana `/t/ana` |
| 4:10–4:40 | 7 | Por reasignar: cupo de **Dermatología, lunes 23/10** → aprobar | En el chat del jurado llega la oferta; «1», y al cerrar, «Sí, confirmo»: cita registrada | «La persona que pidió la cita hace 4 minutos ya tiene una, sin hacer cola.» | Usar simulado |
| 4:40–5:00 | 8 | `/tablero` | Cupos llenados, validaciones, equidad y escenario r ≈ 10 %, unas 10,600 consultas netas al año | «Solo contamos consultas netas adicionales, no citas adelantadas: con el 10 % de las citas perdidas recuperadas, son unas 10,600 consultas más al año con los mismos médicos.» | — |

## Si falla la voz (plan B)

La pantalla **nunca** pasa sola al guion fijo: dice qué pasó y ofrece la salida.

1. **«No pudimos conectar la voz»:** tocar **Reintentar** una vez. Si vuelve a fallar, tocar **Seguir por chat**: la misma llamada sigue con opciones escritas, con voz del navegador, y se registra como respaldo en Voz en vivo. Qué decir: «Si la conexión falla, la persona no se queda sin respuesta: sigue por escrito».
2. **«Llamada abierta en otro dispositivo»:** cerrar esa pantalla. El personaje está abierto en otro celular o pestaña.
3. **«Todas las líneas están ocupadas»:** el plan admite 8 llamadas a la vez. La pantalla muestra el lugar en la fila y reintenta cada 10 s. Si no hay tiempo, **Seguir por chat**.
4. **Sin audio en un iPhone:** volver a tocar **Activar sonido y llamadas**, subir el volumen y quitar el modo silencio. Si sigue sin sonar, abrir el teléfono simulado en la laptop 2.
5. **Último recurso:** abrir `/t/rosa?voz=guion`, que fuerza el guion fijo desde el inicio, o terminar la llamada desde **Llamadas en vivo** → **Terminar** (o **En vivo** → **Terminar (usar simulado)**) y seguir el guion con los botones simulados.

## Si falla otra cosa

- **Un celular no recibe el mensaje:** recargar; los datos están en la base.
- **Una oferta o validación no llega:** usar los botones **Usar simulado** en Por reasignar y Por validar.
- **Todo se desordenó:** `/demo` → **Reiniciar demo** (2 s) y volver a vincular el chat a Julio.
- **La pantalla de llamada quedó abierta tras cerrar una pestaña:** no debería pasar: al cerrar la pestaña, la llamada se cierra en el acto. Si el navegador no alcanzó a avisar, la sesión se marca como cortada cuando llega la siguiente petición de voz, pasados 30 s sin señal. Ante cualquier duda, mirar **Voz en vivo** en `/demo` o usar **Terminar (usar simulado)**.
