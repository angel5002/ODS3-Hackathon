# CLAUDE.md — Contexto permanente de AsistIA (versión 4)

> Reemplaza al `CLAUDE.md` anterior. La fuente de verdad del producto es `insumos/AsistIA_Propuesta_Final_Algorritmia_v4.pdf`. Los requisitos están en `docs/requisitos_v4.md` y los guiones de conversación en `docs/conversaciones.md`. Si algo del código actual contradice estos documentos, mandan los documentos.

## Qué es

AsistIA, del grupo Algorritmia, es el prototipo para CientíficaHack 2026 (Universidad Científica del Sur), Desafío 4 (ODS 3), pregunta 3: equilibrar la demanda de pacientes con los recursos.

En el Hospital María Auxiliadora (HMA), 1 de cada 4 citas se pierde (106,100 en 2023). Además, quien no consigue cupo no queda registrado en ningún sistema. AsistIA cubre todo el recorrido:

1. Registra toda la demanda, en ventanilla, por un chat web o por voz con un asistente con IA.
2. Un profesional regulador asigna la categoría P1–P4 sin ver la identidad del paciente.
3. Ordena la lista de espera con un índice de prioridad.
4. Confirma las citas de forma escalonada.
5. Reasigna los cupos liberados por zonas, con oferta simultánea, validación con el paciente y efecto dominó.
6. Audita la equidad.

**La final es el sábado.** El jurado evalúa:
- integridad (30 puntos): el prototipo hace lo que promete el documento;
- facilidad de uso (30 puntos);
- demostración (10 puntos).

Lo completo y estable vale más que lo ambicioso y frágil.

## Arquitectura (decidida)

- **Web:** Next.js (App Router), TypeScript y Tailwind, desplegada en Vercel desde GitHub.
- **Datos:** Supabase (Postgres y Realtime). Toda escritura pasa por el servidor (route handlers o server actions con la service role). El navegador solo lee lo que su rol puede ver y se suscribe a los cambios.
- **Modelo de riesgo:** Python, fuera de la app (`ml/`). Se carga en la base el archivo `insumos/predicciones_test_sin_sexo.csv`, del modelo sin la variable sexo, con AUC de 0.655.
- **Mensajería:** detrás de la interfaz `MessagingChannel`.
  - `SimulatedChannel`: los teléfonos de `/t/[token]` y las 1,473 citas del día.
  - `WebChatChannel`: un chat web en `/pedir-cita` que el jurado abre con un QR, sin instalar nada y sin dar su número. Funciona con una sesión anónima firmada y Supabase Realtime.
  - **No se integra WhatsApp en esta ejecución.** En un piloto se agregaría un `WhatsAppChannel` con la misma interfaz; basta con dejar la interfaz preparada.
- **Voz:** detrás de la interfaz `VoiceChannel`, con una cadena de respaldo:
  1. **ElevenLabs Agents en el navegador**, con el SDK oficial de React y una URL firmada que emite el servidor. **No hay telefonía en esta ejecución: ni Twilio ni números reales.** La "llamada" entra en la página del celular (teléfono simulado `/t/[token]` o chat de `/pedir-cita`) como una pantalla de llamada entrante, y al contestar habla el agente. En un piloto, el mismo agente se conectaría a la línea del hospital.
  2. ElevenLabs en el navegador.
  3. Gemini Live, lo que ya existe.
  4. Un guion fijo.
- **Lenguaje natural en el chat:** la API de Anthropic (`ANTHROPIC_MODEL`), solo para interpretar respuestas libres y redactar respuestas breves. **El flujo lo controla una máquina de estados en el servidor, no el modelo.**

## Reglas de producto (no negociables)

- **El sistema propone y una persona decide:**
  - el hospital aprueba las reglas;
  - el personal aprueba a los candidatos antes de cada oferta;
  - un regulador asigna la categoría clínica;
  - las reprogramaciones se validan en el panel;
  - toda asignación se puede revertir, con un motivo.
- La IA nunca asigna una categoría clínica, nunca sugiere un diagnóstico y nunca cancela ni cambia una cita por su cuenta.
- El riesgo de inasistencia solo genera más apoyo. Nunca libera un cupo ni baja la prioridad de nadie.
- **No responder nunca saca a nadie de la lista.** Solo una persona puede retirar una solicitud, y solo con uno de estos motivos: atendido en otro lugar, ya no lo necesita, duplicado u otro (con texto).
- El reloj de espera empieza en el primer intento y nunca se reinicia: ni al pedir información, ni al reprogramar, ni al trasladar.
- **Índice de prioridad:** `0.75·R + 0.15·N + 0.10·E`, con `R = min(días/plazo, 1)` y plazos de 30, 90, 180 y 360 días.
  - Nunca se usan el seguro, el sexo, el historial de faltas ni el hecho de tener o no una cita.
  - Se ordena primero por categoría y luego por índice.
- **Vista ciega:** el regulador no recibe, por ninguna vía, el nombre, los documentos, el teléfono, el seguro, el distrito ni el establecimiento de origen. Se impone en el servidor, no en la pantalla.
- **Asistente de voz y bot:**
  - se identifican como asistentes automáticos del hospital, en una demostración;
  - no piden el número completo del documento, pagos ni datos clínicos detallados;
  - transfieren a una persona cuando se lo piden;
  - ante signos de alarma, indican acudir a emergencia o llamar al 106 (SAMU).
- Ninguna cifra en pantalla se inventa: sale de los datos o se rotula como supuesto editable. No se muestran pérdidas en soles.

## Privacidad y seguridad en las pruebas en vivo

- **No se pide ni se guarda ningún número de teléfono.** Cada participante es una sesión anónima con un alias ficticio, en una cookie firmada. Una sesión no puede leer los mensajes ni las llamadas de otra.
- Las sesiones en vivo y sus conversaciones se borran al reiniciar la demo y, en todo caso, a las 24 horas.
- La URL firmada de ElevenLabs se emite solo para una sesión válida y para la tarea de esa sesión. La clave de API nunca llega al navegador.
- Todos los participantes usan nombres ficticios. El bot lo pide expresamente y advierte que no se compartan datos reales de salud.
- **Autenticación de los webhooks:**
  - las herramientas de ElevenLabs, con un secreto en el encabezado;
  - el webhook posterior a la llamada de ElevenLabs, con su firma HMAC.
  - Todo lo demás se rechaza.
- No se graban llamadas.
- **Secretos:** solo en `.env.local` y en Vercel. Nunca se suben `.env.local`, claves ni el CSV original. Mantener `.env.example` al día.
- **Marcas:** nuestra interfaz no usa logos ni marcas de terceros. En pantalla se dice "Chat", "Mensaje" y "Llamada".
- **Aviso visible en todas las pantallas:** "Demostración. Pacientes ficticios. Citas y modelo basados en datos abiertos reales del Hospital María Auxiliadora (2023)."

## Reglas de datos

- Dataset: `DATOS HOSPITAL MARIA AUXILIADORA.csv` (separador `;`, UTF-8 con BOM). Se excluyen las especialidades con 95 % o más de inasistencia. `ATENDIDO = NO` es una inasistencia.
- El historial del paciente usa solo fechas anteriores. Hay una prueba que lo verifica y debe pasar siempre.
- **Día de demo:** las 1,473 citas del jueves 19 de octubre de 2023, presentadas como "en 3 días". El "hoy" de la demo es el lunes 16 de octubre de 2023.
- **Cifras que deben coincidir con la propuesta v4:**
  - lista de llamadas del 10 %: 147 citas, de las cuales 79 terminaron en inasistencia; ese día hubo 414 inasistencias;
  - modelo: AUC 0.655, 52 % frente a 27 % de inasistencia;
  - escenario: `r ≈ s + c·f` con s = 0, c = 1/3 y f = 0.30, que da 10 %, unas 10,600 citas al año (106,100 × r);
  - el hospital obtiene beneficio desde 5.3 %.

## Convenciones

- Interfaz 100 % en español y sin jerga. Código, variables y commits en inglés.
- El riesgo nunca se comunica solo con color: siempre con texto (Alto, Medio, Bajo).
- Un commit por hito, con un mensaje claro. **No borrar implementaciones que funcionan**: se dejan como respaldo.
- No asumir APIs de terceros. Verificar en la documentación actual de ElevenLabs y Anthropic, y anotar las URL consultadas en `INFORME_E4.md`.
- Si algo choca con la realidad (límites, cuentas, costos), decidir lo más prudente, seguir y anotarlo en `INFORME_E4.md`.

## Skills

- `supabase`: esquema, RLS, migraciones y Realtime.
- `frontend-design` y `emil-design-eng`: pantallas y transiciones de estado.
- `mobile-native`: simulador de teléfono y `/pedir-cita`.
- `ask-sonner`: avisos.
- `webapp-testing`: pruebas de punta a punta y capturas.
- `deploy-to-vercel`: despliegue.
- `break-ui`: datos extremos, al final.
