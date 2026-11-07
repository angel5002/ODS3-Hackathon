# Qué deshacer después de la final

Lista de todo lo temporal que se creó durante la E5 para probar y presentar. Ninguno de estos pasos se ejecuta solo: los hace una persona del equipo, en este orden. Los comandos cargan las claves dentro del proceso (`--env-file` o dotenv) y no las muestran.

## 0. Producción ya corre la E5 (7/11, autorizado por el equipo)

- **URL final (la de los QR):** https://ods3-hackathon.vercel.app
- **Despliegue de producción vigente:** `dpl_HzEaCKPyK8hrpnqW6MFUhXwpRTiz`, construido por Vercel desde git (`main` = `e5` `c187c6f`). Antes hubo un despliegue directo con `--prod` (`dpl_2uXrhLuXpiBEYtTAXFPj1YYJZSkx`, e5 `3b38c77`) y un intento desde git que falló sin afectar producción (`dpl_7eatK5K5dvtDsbueQ2ZEGqHSeyeq`: `.vercelignore` excluía `src/video/`; corregido a `/video/`).
- **Para revertir:** volver al despliegue anterior, `dpl_HTUNbr1oZAnB9eAum3W7h1SfhebS` (código E4, 6/11 06:00 UTC). En Vercel: Deployments → ese despliegue → *Instant Rollback* (o *Promote*). Y `breakeven_r` de vuelta a 0.053: `update public.params set value = 0.053 where key = 'breakeven_r';`.
- **Lo que se aplicó del plan de merge:** solo `breakeven_r` = 0.052 (`supabase/data/20261107_breakeven_v51.sql`). **No** se aplicó `supabase/merge/20261107_v51_switch.sql`: reescribe 7 funciones existentes y la E5 ya llama a las `_v51` directamente. Queda para después de la final, con `test:priority`. Tampoco se cambió el texto «Hospital María Auxiliadora» de `send_reminders` (ver `docs/plan_merge.md` §2.3).
- **Variables:** Production tiene todas las que usa la E5. La única diferencia con Preview es `VERCEL_PREVIEW_FEEDBACK_ENABLED` (solo Preview).
- **`main` = `e5`** (fast-forward el 7/11).
- **Temporales que siguen activos y apuntan a despliegues de vista previa:** `asistia.vercel.app` y `asistia-e5.vercel.app`, ambos con excepción de protección y presentes en `allowed_hosts` de los agentes de voz. Se quitan como dicen las secciones 1 y 2.

## 1. Vista previa pública `asistia-e5.vercel.app` (Vercel)

1. **Quitar la excepción de protección del alias.** Hoy ese dominio abre sin iniciar sesión en Vercel; el resto del proyecto sigue protegido.
   ```bash
   node --env-file=.env.local scripts/dev/vercel-alias.mjs --reprotect asistia-e5.vercel.app
   ```
   Otra forma: en el panel de Vercel, Settings → Deployment Protection → Deployment Protection Exceptions → quitar `asistia-e5.vercel.app`.
   Para comprobarlo, abrir `https://asistia-e5.vercel.app` en una ventana privada: debe redirigir al inicio de sesión de Vercel.
   **Lo mismo para el alias corto `asistia.vercel.app`** (7/11, la URL de los QR impresos; apunta al mismo despliegue que `asistia-e5`): `node --env-file=.env.local scripts/dev/vercel-alias.mjs --reprotect asistia.vercel.app`, y quitar `asistia.vercel.app` de `allowed_hosts` en `voice/agents/common.json` (sección 2). Las cookies no fijan dominio: no hay nada que deshacer en ellas.
2. **Opcional: quitar el alias** `asistia-e5.vercel.app` (panel de Vercel → Domains del proyecto, o `DELETE /v2/aliases/{alias}` de la API).
3. **Opcional: borrar los despliegues de vista previa de la E5:**
   - `dpl_5Z7CcD4sRZ8vY3KgLuSp9z3Uyuug`;
   - `dpl_7Ky2CPvVjW1baKpBDGGkTrbcbQ6u`;
   - `dpl_BaqFhtdohiB8a39D5kF7TNaAa4uc`, más los que se agreguen después.

   No tocar el despliegue de producción.
4. **Barra de comentarios de Vercel en las vistas previas:** se desactivó con la variable `VERCEL_PREVIEW_FEEDBACK_ENABLED=0`, solo en el entorno *Preview*. Inyectaba un script de `vercel.live` en `/pedir-cita` (incidente del 7/11, 08:42 UTC). Se puede dejar; si se quiere la barra de vuelta, borrar esa variable de *Preview* en Settings → Environment Variables y redesplegar.

## 2. Dominios permitidos de los agentes de voz (ElevenLabs)

`voice/agents/common.json` → `allowed_hosts` tiene hoy `ods3-hackathon.vercel.app`, `localhost:3000` y `asistia-e5.vercel.app`.

1. Quitar **`asistia-e5.vercel.app`** y **`asistia.vercel.app`**. Conservar `ods3-hackathon.vercel.app`, porque producción lo usa.
2. Decidir si `localhost:3000` se queda. Sirve solo para pruebas locales y venía de la E4.
3. Publicar en ElevenLabs. Primero en seco, y comprobar que solo hay `PATCH` a las 14 herramientas y los 4 agentes existentes:
   ```bash
   node scripts/voice-sync.mjs --dry
   ```
   Después de verdad:
   ```bash
   node scripts/voice-sync.mjs
   ```
4. Commit del cambio de `common.json`.
5. **Ajustes de la final en los agentes** (compartidos con producción; lista completa en `docs/diagnostico_voz.md` §13–14):
   - `client_events` sin `interruption` (la voz de la persona y el eco no cortan al agente). Para volver atrás: `"interruptions": true` en `common.json`;
   - `turn_timeout` de 7 a 10 s, `disable_first_message_interruptions`, `tts.expressive_mode: false`;
   - `localhost:3110` agregado a `allowed_hosts` (pruebas locales): quitarlo;
   - primeros mensajes de una frase, una sola pregunta de signos de alarma y cierres nuevos. Esos textos **no** son temporales: se quedan.
6. **Modo sala ruidosa** (`settings_v51.sala_ruidosa = 'on'`): es para el auditorio. Después de la final, apagarlo desde `/demo` (interruptor «Sala ruidosa») para que el teléfono vuelva a «Silenciar» en vez de «Mantener para hablar».

> `voice:sync` sube a ElevenLabs la configuración completa de los agentes desde la rama en la que se ejecute. Hay que ejecutarlo desde la rama que tenga los textos vigentes: `e5`, o `main` después del merge.

## 3. Base de datos compartida (Supabase)

- **Datos de prueba:**
  - las llamadas de prueba (ids desde el 3986 en adelante) y sus `voice_sessions` y `voice_events`;
  - las sesiones de chat anónimas;
  - las tareas creadas en las pruebas.

  Todo eso se borra con **Reiniciar demo** en `/demo`. Las `voice_sessions` se borran junto con sus llamadas (FK `on delete cascade`). `voice_events` sin sesión no se borra solo; si se quiere limpiar, se hace a mano y es opcional.
- **La llamada 4506** quedó anotada con el motivo de su 401, y no hace falta hacer nada más.
- **Objetos de la E5**, que no son temporales sino parte de `e5`:
  - las migraciones `20261107010000` a `20261107040000`;
  - la tabla `settings_v51`.

  Se quedan si `e5` se integra. Si se descarta `e5`, se revierten con `supabase/rollback/*.down.sql`, en orden inverso: 040000, 030000, 020000 y 010000.
- **Objetos de la final** (aditivos, aplicados el 7/11): `20261107050000_e5_sala_ruidosa`, `20261107070000_e5_jury_cards` (tablas `jury_cards`, `jury_visits`, `jury_slots` y 12 funciones `jury_*`), `20261108010000_e5_escena1_seed` (`seed_escena1`, `escena1_offer_to_tito`) y `20261108020000_e5_preconsulta` (3 tablas `preconsulta_*` y 3 funciones). Los de la preconsulta son parte del producto; los del jurado y la escena 1 son de la presentación. Si se quieren quitar, sus reversas están en `supabase/rollback/` (en orden inverso). Los pacientes del jurado (ids `J…`, `demo_role = 'jurado'`) sobreviven a «Reiniciar demo»; se borran con la reversa de `jury_cards` o a mano.
- **Tito Quispe Rojas** (escena 1) es una solicitud sembrada por `seed_escena1()`: «Reiniciar demo» la borra.
- **Audios de las escenas** en `public/escenas/*.mp3`: generados con la voz de los agentes; son de la presentación.
- **`breakeven_r`** sigue en 0.053. El cambio a 0.052 (`supabase/data/20261107_breakeven_v51.sql`) se aplica en el merge y no tiene nada que deshacer.

## 4. Archivos y carpetas locales (fuera de git o ignorados)

- **Respaldo de datos:** `..\respaldos-db\20261107-0052\`, con el JSON de las 22 tablas de la demo. Los pacientes son ficticios y no hay claves. Puede borrarse cuando ya no haga falta.
- **Worktrees de las pistas paralelas**, en `.claude\worktrees\agent-*` (ignorados por git). Se listan y se quitan así:
  ```bash
  git worktree list
  ```
  ```bash
  git worktree remove .claude/worktrees/<carpeta>
  ```
  Ramas locales que quedaron:
  - `worktree-agent-*`;
  - `e5-ui`, `e5-ui-v2`, `e5-ui-app`, `e5-v51`, `e5-db51`, `e5-preview`, `e5-demo`, `e5-qa`, `e5-estilo`, `e5-voz`, `e5-stoic`, `e5-escenas`, `e5-presentacion` y `e5-jurado`.

  Todas ya están integradas en `e5` y se pueden borrar con `git branch -D`. `e5`, `e4-original` y `recuperado-vercel` se quedan.
- **`.claude/launch.json`:** tiene la configuración `web-start` (producción local con el PIN de prueba). Es local e ignorada; se puede dejar.
- **Docker Desktop:** quedó instalado pero sin uso, porque la virtualización está desactivada en la BIOS. No hay nada que deshacer.

## 5. Lo que NO es temporal (no tocar)

- Los secretos en Vercel: `ELEVENLABS_WEBHOOK_SECRET` en Production y Preview.
- El webhook `asistia-post-call` en ElevenLabs.
- La instrumentación de voz:
  - la tabla `voice_events`;
  - la ruta `/api/voice/event`, con límite de 60 eventos por minuto;
  - la tarjeta «Voz en vivo» de `/demo`.
- Las guardas `ALLOW_DB_WRITE=1` de los scripts que escriben en la base.
- Las páginas `/dev/llamada` y `/dev/pantallas`: en producción responden 404.
