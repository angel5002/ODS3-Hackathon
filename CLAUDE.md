# CLAUDE.md — Contexto permanente de AsistIA (versión 5.1)

> La fuente de verdad del producto es `insumos/AsistIA_Propuesta_Final_Algorritmia_v5.1.pdf`. Los requisitos del prototipo están en `docs/requisitos_v4.md` (actualizado a la v5.1) y los guiones de conversación en `docs/conversaciones.md`. Si algo del código actual contradice estos documentos, mandan los documentos.
>
> Describen versiones anteriores y no se usan como guía: `INFORME.md`, `INFORME_E4.md`, `PROMPT_EJECUCION_4.md`, `docs/requisitos.md` y la propuesta v4. Cualquier mención a telefonía real, mensajería de terceros, números de teléfono, la fórmula de prioridad con bonos o un botón de autoaviso del paciente está desactualizada: no se implementa.

## Qué es

AsistIA, del grupo Algorritmia, es el prototipo para CientíficaHack 2026 (Universidad Científica del Sur), Desafío 4 "IA para la experiencia del paciente" (ODS 3). Responde la pregunta 1: identificar y predecir los cuellos de botella del recorrido del paciente en consulta ambulatoria y emergencia. La recuperación de cupos aporta además a la pregunta 3.

En el Hospital María Auxiliadora (HMA), 1 de cada 4 citas de 2023 se registró como inasistencia (106,100, unas 347 por día de atención). El problema de fondo es que el recorrido no se mide por etapas. AsistIA primero mide dónde se forma la espera y luego pone a prueba cuatro mejoras, cada una como hipótesis con su métrica y su comparador:

1. **Antes de la atención:** confirmación escalonada de citas (72, 48 y 24 horas) y una preconsulta opcional, sin diagnóstico, como experimento.
2. **Llegada y triaje en emergencia:** AsistIA solo registra horas y la prioridad que asigna un profesional (I a IV, NTS 042). No clasifica.
3. **Espera vigilada por el personal:** alertas de reevaluación dirigidas a un responsable por turno, con escalamiento.
4. **Atención y alta:** el paciente sale con el control reservado. "Control reservado" no es "control realizado".
5. **Continuidad:** lista de espera que ofrece los cupos liberados con aviso, con aprobación del personal, oferta simultánea y validación con el paciente.

Todo escribe en un **tablero del recorrido** con eventos que guardan por separado la hora en que ocurrieron y la hora en que se registraron.

**Lo que demuestra el prototipo** (sección 3.7): el mecanismo, no la eficacia. Con pacientes ficticios, el agente confirma una cita por mensaje y por voz, hace una preconsulta breve y entrega el resumen; una paciente avisa que no podrá asistir y el cupo se ofrece a la lista; y el tablero de urgencias, con llegadas simuladas, muestra cómo se calcula la espera por etapa y cuándo se dispara una alerta. Los únicos resultados que salen de datos reales son la inasistencia del HMA (25.7 % y 31.9 %) y el desempeño del modelo de riesgo.

**La final es el sábado.** El jurado evalúa:
- integridad (30 puntos): el prototipo hace lo que promete el documento;
- facilidad de uso (30 puntos);
- demostración (10 puntos).

Lo completo y estable vale más que lo ambicioso y frágil.

## Arquitectura (decidida)

- **Web:** Next.js (App Router), TypeScript y Tailwind, desplegada en Vercel desde GitHub.
- **Datos:** Supabase (Postgres y Realtime). Toda escritura pasa por el servidor (route handlers o server actions con la service role). El navegador no lee directamente datos de personas ni conversaciones: todo pasa por el servidor, que aplica los permisos por rol.
- **Modelo de riesgo:** Python y scikit-learn, fuera de la app (`ml/`). Se carga en la base el archivo `insumos/predicciones_test_sin_sexo.csv`, del modelo sin la variable sexo, con AUC de 0.655.
- **Mensajería:** detrás de la interfaz `MessagingChannel`.
  - `SimulatedChannel`: los teléfonos simulados de `/t/[token]` y las 1,473 citas del día.
  - `WebChatChannel`: el chat web de `/pedir-cita`, que el jurado abre con un QR, sin instalar nada y sin dar ningún número. Funciona con una sesión anónima firmada y Supabase Realtime.
  - En un piloto, la mensajería saldría del número del propio establecimiento, con la misma interfaz. No se integra en el prototipo.
- **Voz:** detrás de la interfaz `VoiceChannel`, siempre en el navegador. No hay telefonía ni números reales. La "llamada" entra en la página del celular (teléfono simulado `/t/[token]` o chat de `/pedir-cita`) como una pantalla de llamada entrante, y al contestar habla el agente. Cadena de respaldo:
  1. ElevenLabs Agents en el navegador, con el SDK oficial de React y una URL firmada que el servidor emite por petición.
  2. Gemini Live, solo si existe y está probado.
  3. Un guion fijo.
- **Lenguaje natural en el chat:** la API de Anthropic (`ANTHROPIC_MODEL`), solo para interpretar respuestas libres y redactar respuestas breves. **El flujo lo controla una máquina de estados en el servidor, no el modelo.**

## Reglas de producto (no negociables)

- **El sistema propone y una persona decide:**
  - la institución aprueba las reglas;
  - el personal aprueba la lista de candidatos antes de cada oferta (las de una misma especialidad pueden aprobarse en bloque);
  - un profesional asigna la categoría clínica;
  - las reprogramaciones se validan en el panel;
  - toda asignación se puede revertir, con un motivo.
- La IA nunca asigna una categoría clínica ni una prioridad de triaje, nunca sugiere un diagnóstico y nunca cancela ni cambia una cita por su cuenta.
- El riesgo de inasistencia solo decide dónde poner las llamadas. Nunca cancela ni libera una cita, ni baja la prioridad de nadie.
- **Sin respuesta, la cita se mantiene.** Nadie pierde su cita ni su lugar en la lista por no responder. Solo una persona puede retirar una solicitud, y solo con uno de estos motivos: atendido en otro lugar, ya no lo necesita, duplicado u otro (con texto).
- El reloj de espera empieza en el primer intento y nunca se reinicia: ni al pedir información, ni al reprogramar, ni al trasladar.
- **Orden de la lista de espera:** primero la categoría clínica y, dentro de ella, la fracción del plazo máximo ya consumida desde el primer intento: `R = min(días/plazo, 1)`, con plazos de 30, 90, 180 y 360 días (puntos de partida que valida el panel clínico). **Sin bonos**: no suman la primera consulta ni la atención preferente.
  - Nunca se usan el seguro, el sexo, el historial de inasistencias ni el hecho de tener o no una cita.
  - Pendiente en el código: el esquema v4 todavía calcula `w_r·R + w_n·N + w_e·E`; con la v5.1, `w_r = 1`, `w_n = 0` y `w_e = 0`.
- **Dos reglas de asignación a comparar:** "primero que acepta" (como Mayo Clinic) y "mayor prioridad al cierre de la ventana" (la propuesta de AsistIA, sin validar). Oferta simultánea a un máximo de 8 pacientes.
- **Conteo honesto:** solo se cuentan como recuperadas las **consultas netas adicionales**; un adelanto de una cita que igual iba a ocurrir no se cuenta.
- **Vista ciega:** el profesional que asigna la categoría no recibe, por ninguna vía, el nombre, los documentos, el seguro, el distrito ni el establecimiento de origen. Se impone en el servidor, no en la pantalla. En la v5.1 es una propuesta para validar con el panel clínico (fase 2), pero el prototipo la mantiene.
- **Preconsulta:** opcional, con consentimiento explícito, preguntas breves y respuestas "no sé" o "prefiero decirlo en la consulta". El resumen usa la plantilla fija de la v5.1, marca "no evaluado" lo que no se preguntó, enlaza a las respuestas originales y el médico puede corregirlo (cada cambio queda registrado). **Nunca incluye un diagnóstico** y nunca dice "sin signos de alarma" si una pregunta no se completó.
- **Emergencia:** el triaje lo hace siempre un profesional. AsistIA no pregunta antes del triaje ni retrasa la atención. **No hay botón de autoaviso para el paciente.** Los datos del tablero de urgencias se rotulan "Datos simulados".
- **Asistente de voz y chat** (sección 4.3):
  - se presentan como "Asistente automatizado del Hospital Mirasur" (hospital ficticio; nunca como el Hospital María Auxiliadora), en una sola frase;
  - dicen durante la conversación que nunca piden pagos, claves, códigos ni el DNI completo, y no piden datos clínicos detallados;
  - ofrecen hablar con una persona y transfieren cuando se lo piden;
  - aclaran que el canal prepara la atención, no es una consulta médica y no atiende emergencias;
  - ante signos de alarma, interrumpen, indican acudir a emergencia o llamar al 106 (SAMU) y crean una tarea para el personal;
  - la voz es una opción, no un paso obligatorio: siempre hay chat y atención presencial;
  - como máximo dos intentos de llamada por tarea.
- Ninguna cifra en pantalla se inventa: sale de los datos o se rotula como supuesto editable. No se muestran pérdidas en soles.

## Privacidad y seguridad en las pruebas en vivo

- **No se pide ni se guarda ningún número de teléfono.** Cada participante es una sesión anónima con un alias ficticio, en una cookie firmada. Una sesión no puede leer los mensajes ni las llamadas de otra.
- Las sesiones en vivo y sus conversaciones se borran al reiniciar la demo y, en todo caso, a las 24 horas.
- La URL firmada de ElevenLabs se emite por petición, solo para una sesión válida y para la tarea de esa sesión. Nunca se cachea ni se comparte. La clave de API nunca llega al navegador.
- Todos los participantes usan nombres ficticios. El asistente lo pide expresamente y advierte que no se compartan datos reales de salud.
- **Autenticación de los webhooks:**
  - las herramientas de ElevenLabs, con un secreto en el encabezado;
  - el webhook posterior a la llamada de ElevenLabs, con su firma HMAC.
  - Todo lo demás se rechaza.
- No se graban llamadas.
- **Secretos:** solo en `.env.local` y en Vercel. Nunca se suben `.env.local`, claves ni el CSV original. Mantener `.env.example` al día.
- **Marcas:** nuestra interfaz no usa logos ni marcas de terceros. En pantalla se dice "Chat", "Mensaje" y "Llamada".
- **Aviso visible en todas las pantallas:** "Demostración. Pacientes ficticios. Citas y modelo basados en datos abiertos reales del Hospital María Auxiliadora (2023)."

## Reglas de datos

- Dataset: `DATOS HOSPITAL MARIA AUXILIADORA.csv` (separador `;`, UTF-8 con BOM). Se excluyen las 19 especialidades con 95 % o más de inasistencia. `ATENDIDO = NO` es una inasistencia.
- El historial del paciente usa solo fechas anteriores. Hay una prueba que lo verifica y debe pasar siempre.
- **Día de demo:** las 1,473 citas del jueves 19 de octubre de 2023, presentadas como "en 3 días". El "hoy" de la demo es el lunes 16 de octubre de 2023.
- **Cifras que deben coincidir con la propuesta v5.1:**
  - inasistencia del HMA: 25.7 % (106,100 de 412,747 citas); 31.9 % con todas las especialidades;
  - modelo: AUC 0.655; 52 % de inasistencia en la lista diaria del 10 % de mayor riesgo frente a 27 % de promedio; esa lista contiene el 19 % de las inasistencias del día;
  - día de demo: lista de llamadas de 147 citas, de las cuales 79 terminaron en inasistencia; ese día hubo 414 inasistencias;
  - equidad del día de demo (citas del día frente a lista de llamadas): sin seguro 19 % y 40 %; niños de 0 a 11 años 8 % y 17 %; 60 años o más 36 % y 12 %;
  - escenarios: si el 10 % de las citas perdidas se convierte en consultas netas adicionales, unas 10,600 consultas más al año; con 4 %, unas 4,200;
  - el HMA cubre el costo de AsistIA con unas 461 consultas netas al mes (5.2 % de sus citas perdidas).
  - El escenario `r ≈ s + c·f` del tablero viene de la v4: se rotula como supuesto editable. Su línea de referencia debe pasar de 5.3 % a 5.2 % (parámetro `breakeven_r`).

## Convenciones

- Interfaz 100 % en español y sin jerga. Código, variables y commits en inglés.
- El riesgo nunca se comunica solo con color: siempre con texto (Alto, Medio, Bajo).
- Un commit por hito, con un mensaje claro. **No borrar implementaciones que funcionan**: se dejan como respaldo.
- No asumir APIs de terceros. Verificar en la documentación actual de ElevenLabs y Anthropic, y anotar las URL consultadas en `INFORME_E5.md`.
- Si algo choca con la realidad (límites, cuentas, costos), decidir lo más prudente, seguir y anotarlo en `INFORME_E5.md`.

## Skills

- `supabase`: esquema, RLS, migraciones y Realtime.
- `frontend-design` y `emil-design-eng`: pantallas y transiciones de estado.
- `mobile-native`: simulador de teléfono y `/pedir-cita`.
- `ask-sonner`: avisos.
- `webapp-testing`: pruebas de punta a punta y capturas.
- `deploy-to-vercel`: despliegue.
- `break-ui`: datos extremos, al final.
