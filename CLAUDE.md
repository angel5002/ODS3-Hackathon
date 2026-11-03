# CLAUDE.md — Contexto permanente del proyecto

## Qué es este proyecto

Prototipo para CientíficaHack 2026 (Universidad Científica del Sur, Lima), Desafío 4 "IA para la experiencia del paciente" (ODS 3), pregunta 3: equilibrar la demanda de pacientes con los recursos disponibles.

**Nuestra respuesta:** recuperar las citas de consulta externa que se pierden en hospitales públicos del MINSA. En 2023, en el Hospital María Auxiliadora (MINSA, III-1, Lima), 1 de cada 4 citas programadas no se atendió (106,100 citas, unas 347 por día de atención), mientras había pacientes haciendo cola desde las 5 a. m. sin conseguir cupo.

**El producto** (nombre por definir; se toma de `NEXT_PUBLIC_APP_NAME`):
1. Estima el riesgo de que cada cita de mañana no se atienda.
2. Envía un recordatorio por mensaje a todas las citas (simulado, sin API de WhatsApp).
3. Llama con un agente de voz con IA a quienes no responden (llamada dentro del navegador del celular, sin telefonía).
4. Cuando un cupo se libera, propone pacientes de la lista de espera; una persona decide la reasignación.
5. Muestra todo en vivo: cada cambio de estado aparece al instante en el panel, en el tablero y en los celulares.

## Cómo evalúa el jurado (manda sobre cualquier otra prioridad)

- Integridad (30 pts): el prototipo hace todo lo que promete. **Completo y simple vale más que ambicioso e incompleto.**
- Intuitivo (30 pts): se usa sin manual.
- Demostración (10 pts): convincente en 5 minutos.
- El jurado incluye a un profesional de una clínica, uno de HP, uno de tecnología y uno de responsabilidad social.

## Arquitectura (decidida; no cambiar sin avisar en INFORME.md)

- **Web:** Next.js (App Router) + TypeScript + Tailwind. Despliegue en Vercel desde GitHub. Nada de Streamlit.
- **Datos y tiempo real:** Supabase (Postgres + Realtime). Toda escritura pasa por el servidor (route handlers o server actions con la service role key). El navegador solo lee y se suscribe a cambios.
- **Modelo de riesgo:** Python, fuera de la app (`ml/`). Se entrena una vez y sus resultados (predicciones del día de demo, explicaciones, métricas, estadísticas agregadas) se cargan en Supabase. La app no ejecuta Python.
- **Voz (ejecución 2):** Gemini Live API (`gemini-3.8-live`; respaldo `gemini-3.1-flash-live-preview`) conectado desde el navegador con tokens efímeros emitidos por un route handler. El agente actúa solo mediante funciones que llaman a nuestra API.
- **Canales detrás de una interfaz común** (`MessagingChannel`, `VoiceChannel`): hoy simulados; en un piloto se reemplazan por WhatsApp Business o telefonía real sin rehacer el sistema.

## Reglas de datos (críticas)

- Dataset: `insumos/DATOS HOSPITAL MARIA AUXILIADORA.csv` (separador `;`, UTF-8 con BOM). La referencia validada es `insumos/analisis_hma.py`: reutiliza su lógica.
- Excluir especialidades con 95 % o más de citas no atendidas. Base limpia: 412,747 citas, 93,657 pacientes, 25.7 % no atendidas.
- **El historial del paciente usa solo citas de fechas anteriores.** Cualquier fuga de información futura invalida el modelo. Hay una prueba automática para esto y debe pasar siempre.
- Modelo de referencia: AUC ≈ 0.655 en prueba (octubre–diciembre 2023); la lista del 10 % de mayor riesgo tiene ≈ 52 % de citas no atendidas frente a ≈ 27 % de promedio.
- Diccionario oficial (`insumos/DiccionarioDatos_23.xlsx`): `ATENDIDO` = "Asistencia del paciente a su cita médica: VINO, NO VINO" (en el CSV viene como SI/NO). **`ATENDIDO = NO` es una inasistencia**; la interfaz puede usar "inasistencia" y "no asistió". `ID` = "ID de paciente anonimizado".
- `MONTO`: el diccionario lo define como "monto de pago total de la cita", pero solo tiene 4 valores fijos (7, 26, 30 y 33 soles; el de 33 coincide con todas las citas remotas), así que funciona como tarifa por tipo de cita. **No mostrar pérdidas en soles.**
- Inconsistencias conocidas del dataset: el diccionario llama `DIASOLICITA_CITA` a la columna que en el CSV es `DIA_SOLICITACITA`, y dice VINO/NO VINO donde el CSV dice SI/NO. Usar los nombres del CSV.
- No subir el CSV original al repositorio (está en `.gitignore`; además el repositorio es público). Sí se suben los resultados agregados que la app necesita.

## Repositorio

`https://github.com/angel5002/ODS3-Hackathon` (rama `main`; estaba vacío al iniciar). Es **público**: nunca subir `.env.local`, claves ni el CSV.

## Reglas de producto

- Una persona decide todo cambio que afecte el acceso a una cita. El sistema propone; nunca cancela ni reasigna solo.
- Un riesgo alto significa más apoyo para llegar a la cita, nunca perderla.
- El agente de voz dice que es un asistente automático, no pide DNI, pagos ni datos clínicos, deriva a una persona cuando se lo piden o ante dudas clínicas, y solo ve los datos de la cita en curso.
- Pacientes, nombres y teléfonos son ficticios. Ningún mensaje ni llamada sale a números reales.
- Aviso visible en todas las pantallas: "Pacientes ficticios. Citas y modelo basados en datos abiertos reales del Hospital María Auxiliadora (2023)."
- Sin logos ni marcas de terceros: el chat simulado no usa la marca ni el logo de WhatsApp (las bases descalifican por infringir marcas).
- Toda cifra en pantalla sale de los datos o está rotulada como supuesto editable.
- Atribución del dataset (licencia ODC-BY, Plataforma Nacional de Datos Abiertos, Hospital María Auxiliadora) en el pie del sitio y en el README.

## Convenciones

- Interfaz 100 % en español, sin jerga técnica. Código, nombres de variables y commits en inglés.
- El riesgo nunca se comunica solo con color: siempre con texto (Alto, Medio, Bajo).
- Commit de git al terminar cada hito, con mensaje claro.
- Secretos solo en `.env.local` (nunca en el repositorio). Mantener `.env.example` actualizado.
- Si algo de este archivo choca con la realidad (datos, APIs, límites), no lo ocultes: decide lo más prudente, sigue y anótalo en `INFORME.md`.

## Skills disponibles y cuándo usarlas

- `emil-design-eng`, `frontend-design`: al diseñar o pulir cualquier pantalla.
- `mobile-native`: en el simulador de teléfono.
- `ask-sonner`: avisos emergentes de cambios de estado.
- `pick-ui-library`: antes de agregar cualquier librería de UI.
- `web-design-guidelines`, `vercel-react-best-practices`: revisión antes de cerrar cada hito.
- `break-ui`: al final, probar con datos extremos.
- `supabase`: esquema, migraciones, Realtime y políticas.
- `webapp-testing`: pruebas de punta a punta y capturas de pantalla.
- `deploy-to-vercel`: despliegue.
