# Prueba en celulares: llamada de voz (preview e5)

- Fecha: 2026-11-07 (sábado). URL: https://asistia-e5.vercel.app
- Deployment: dpl_BaqFhtdohiB8a39D5kF7TNaAa4uc (preview de la rama e5)
- Ventana de observación: inicio 07/11/2026, 03:39:22 Lima (2026-11-07T08:39:22.000Z); fin 07/11/2026, 04:05:25 Lima (2026-11-07T09:05:25.957Z). Motivo de cierre del monitoreo: 15 minutos sin sesiones ni llamadas nuevas desde la última (03:50:15 Lima).
- Fuente: generado automáticamente desde `voice_sessions`, `voice_events` y `calls` (solo lectura, `select`) más los runtime logs de Vercel del deployment. Solo cuenta lo creado después del inicio. La base es compartida con producción: se marca "preview" solo si hay peticiones a /api/voice/* del preview en la ventana de la sesión.
- Runtime logs de Vercel: 12 peticiones relevantes capturadas (12 a /api/voice/*). User agent en los logs: no (los runtime logs no traen user agent; campos vistos: level,message,messageTruncated,rowId,source,timestampInMs,requestMethod,requestPath,domain,responseStatusCode). Estado del stream: 2026-11-07T09:00:34.719Z delimiter Exceeded query duration limit of 5 minutes ; 2026-11-07T09:00:34.720Z stream ended ; 2026-11-07T09:00:37.732Z connect.

## Sesiones de voz

### 03:49:22 Lima · call 4535 · sesión 758d1a73
- Dispositivo y navegador: no disponible (cruzar con las notas del equipo por hora)
- Tipo: teléfono simulado · propósito de la llamada: prueba · proveedor: elevenlabs · origen: preview
- Agente: asistia-confirmacion · conversation_id: sí
- Estados (servidor): reclamada → conectando → activa → fin → [estado actual: finalizada]
- Eventos del cliente/ElevenLabs: sdk.start_session, sdk.status×4, sdk.connect, sdk.first_agent_turn, sdk.disconnect, finish, effect.desmontaje, screen.unmount
- Tiempos: creada 03:49:22, conectada 03:49:28 (+6 s), fin 03:50:02, último latido 03:50:02
- Errores y desconexiones con código: 03:50:02 sdk.disconnect (code=1000, reason=agent)
- Motivo de cierre: sesión "el asistente terminó"; llamada finalizada / resultado "El asistente terminó la llamada"
- ¿Pasó al guion fijo?: no
- Duración: 34 s (conexión → fin) · calls.duration_s = 34
- Otro dispositivo: no · Fila (en_cola): no
- Logs del servidor (Vercel, 6 líneas):
  - 03:49:22 POST /api/voice/status: [voz -] servidor status call=4535 sonando -> en_curso
  - 03:49:22 POST /api/voice/session: [voz 4b2c02b8] servidor elevenlabs.signed_url agent=asistia-confirmacion http=200 ms=81
  - 03:49:22 POST /api/voice/session: [voz 4b2c02b8] servidor session call=4535 purpose=prueba -> 200 url_firmada sesion=758d1a73
  - 03:49:23 POST /api/voice/status: [voz -] servidor status call=4535 en_curso -> en_curso provider=elevenlabs
  - 03:49:28 POST /api/voice/status: [voz -] servidor status call=4535 en_curso -> en_curso primera_frase_ms=21
  - 03:50:02 POST /api/voice/status: [voz -] servidor status call=4535 en_curso -> finalizada

### 03:50:15 Lima · call 4536 · sesión 90f73fbf
- Dispositivo y navegador: no disponible (cruzar con las notas del equipo por hora)
- Tipo: teléfono simulado · propósito de la llamada: prueba · proveedor: elevenlabs · origen: preview
- Agente: asistia-confirmacion · conversation_id: sí
- Estados (servidor): reclamada → conectando → activa → fin → [estado actual: finalizada]
- Eventos del cliente/ElevenLabs: sdk.start_session, sdk.status×4, sdk.connect, sdk.first_agent_turn, finish, sdk.disconnect, screen.unmount, effect.desmontaje
- Tiempos: creada 03:50:15, conectada 03:50:20 (+5 s), fin 03:51:18, último latido 03:51:18
- Errores y desconexiones con código: 03:51:18 sdk.disconnect (reason=agent)
- Motivo de cierre: sesión "el asistente terminó"; llamada finalizada / resultado "El asistente terminó la llamada"
- ¿Pasó al guion fijo?: no
- Duración: 59 s (conexión → fin) · calls.duration_s = 59
- Otro dispositivo: no · Fila (en_cola): no
- Logs del servidor (Vercel, 6 líneas):
  - 03:50:14 POST /api/voice/status: [voz -] servidor status call=4536 sonando -> en_curso
  - 03:50:15 POST /api/voice/session: [voz 29233d4a] servidor elevenlabs.signed_url agent=asistia-confirmacion http=200 ms=121
  - 03:50:15 POST /api/voice/session: [voz 29233d4a] servidor session call=4536 purpose=prueba -> 200 url_firmada sesion=90f73fbf
  - 03:50:15 POST /api/voice/status: [voz -] servidor status call=4536 en_curso -> en_curso provider=elevenlabs
  - 03:50:20 POST /api/voice/status: [voz -] servidor status call=4536 en_curso -> en_curso primera_frase_ms=12
  - 03:51:18 POST /api/voice/status: [voz -] servidor status call=4536 en_curso -> finalizada

## Llamadas sin sesión de voz

Ninguna.

## Resumen

- Sesiones de voz: 2; conectadas (llegaron a activa): 2; sin conectar: 0.
- Por tipo: teléfono simulado 2, chat-registro 0. Estados finales: finalizada 2.
- Llamadas creadas en la ventana: 2 (sin sesión de voz: 0). Proveedores: elevenlabs 2. Propósitos: prueba 2.
- Fallos por causa: ninguno.
- Pasos al guion fijo: 0.
- Eventos registrados por tipo: cliente:sdk.status 8, servidor:sesion.reclamada 2, servidor:sesion.conectando 2, cliente:sdk.start_session 2, servidor:sesion.activa 2, cliente:sdk.connect 2, cliente:sdk.first_agent_turn 2, cliente:sdk.disconnect 2, servidor:sesion.fin 2, cliente:finish 2, cliente:effect.desmontaje 2, cliente:screen.unmount 2.
- Peticiones a /api/voice/* (Vercel): POST /api/voice/status -1 ×8; POST /api/voice/session -1 ×4.
- Anomalías: ninguna detectada.
- Notas: en el stream de Vercel `responseStatusCode` llega como -1 (Vercel no lo da en esas líneas), así que el código HTTP real sale del mensaje del propio servidor (`-> 200`). El stream se corta cada 5 minutos porque Vercel limita la consulta a 5 minutos, y se reconectó solo a los 3 s. Puede faltar alguna línea en esos cortes. Las dos sesiones se crearon en el preview, porque hay peticiones a /api/voice/* del preview en su ventana. Ninguna tuvo errores de `/api/voice/*` ni `url_firmada.error`, y no se activaron el aviso de otro dispositivo, la fila ni `voice_expire`.
