# Plan de merge de `e5` a `main` y despliegue a producción

> **Plan escrito, no ejecutado.** Lo ejecuta una persona del equipo, después de la final, en este orden. Cada paso tiene una verificación y, cuando corresponde, una reversión. Nunca se muestran claves: los scripts las cargan dentro del proceso.

## Estado de partida (7/11/2026)

- **`main` en GitHub:** `83173cf`. No tiene el código de la E4 ni el de la E5.
- **Producción:** el despliegue `dpl_HTUNbr1oZAnB9eAum3W7h1SfhebS` (6/11, 06:00 UTC). Es un redespliegue del código E4 hecho por CLI, no desde git, y está en `ods3-hackathon.vercel.app`.
- **`e5`** desciende de `83173cf`, así que el merge es un avance directo de `main`, sin conflictos.
- **Base compartida:** ya tiene aplicadas las migraciones de `e5`. Las cuatro son aditivas o solo cambian funciones `_v51`:
  - `20261107010000_e5_voice_sessions`;
  - `20261107020000_e5_v51_priority`;
  - `20261107030000_e5_v51_rule_text`;
  - `20261107040000_e5_v51_overdue_order`.
- **Pendientes para el merge**, porque cambian lo que ve producción:
  - `supabase/merge/20261107_v51_switch.sql`, que hace que las 7 funciones v4 deleguen en las `_v51`;
  - `supabase/data/20261107_breakeven_v51.sql`, que cambia `breakeven_r` de 0.053 a 0.052.
- **Integración con git:** el proyecto de Vercel está conectado al repositorio, y los despliegues de `main` aparecen con origen `git`. **Hacer merge en `main` dispara un despliegue de producción automático.**

## 0. Antes de empezar

1. Avisar al equipo: durante unos minutos `/demo` y la voz pueden cambiar de comportamiento.
2. Hacer un respaldo de los datos con el mismo método de la E5: exportar a JSON las tablas de `public` con la clave de servidor, en `..\respaldos-db\AAAAMMDD-HHMM\`.
3. En `e5`, correr las verificaciones y que todas pasen:
   ```bash
   npm run lint
   ```
   ```bash
   npm run build
   ```
   ```bash
   npm run test:unit
   ```
   ```bash
   node scripts/dev/check-secrets.mjs
   ```
4. Correr las pruebas contra la base. **Reinician la demo**, así que solo se corren con la demo libre:
   ```bash
   ALLOW_DB_WRITE=1 npm run test:race
   ```
   ```bash
   ALLOW_DB_WRITE=1 npm run test:priority
   ```
   ```bash
   ALLOW_DB_WRITE=1 npm run test:flow
   ```
   Después, B, G y H con `tests/e2e/voice_diag.py` sobre la compilación local (`web-start`).
5. Confirmar que no queda ninguna migración pendiente: `npx supabase migration list --remote` debe mostrar todo en `remote`.

## 1. Merge a `main`

1. Abrir un PR de `e5` a `main` en GitHub y revisar el diff. Es largo: E4 y E5 juntas.
2. Antes de aprobarlo, cargar en Vercel (Production) la variable opcional `VOICE_MAX_CONCURRENT=8`. Si no se carga, el código usa 8 por defecto. Las demás variables ya están: lo comprobó `scripts/dev/vercel-env-names.mjs`.
3. Hacer el merge. Vercel crea el despliegue de producción desde `main`; esperar a que esté READY.

**Verificación:**
- `https://ods3-hackathon.vercel.app` responde 200;
- `/pedir-cita` muestra la paleta clara;
- `/demo` muestra la tarjeta «Voz en vivo».

**Reversión:** en Vercel, *Instant Rollback* o *Promote* del despliegue anterior (`dpl_HTUN…`). El código de `main` se revierte con `git revert` del merge.

## 2. SQL del merge (justo después del despliegue)

Se aplican a mano, con la contraseña de la base en la terminal de la persona del equipo. También se pueden pegar en el SQL Editor de Supabase. En este orden:

```bash
psql "<cadena de conexión>" -f supabase/merge/20261107_v51_switch.sql
```
```bash
psql "<cadena de conexión>" -f supabase/data/20261107_breakeven_v51.sql
```

1. **`supabase/merge/20261107_v51_switch.sql`:** reemplaza `staff_requests`, `staff_request_detail`, `staff_slots`, `propose_candidates`, `approve_offer`, `close_offer` y `assign_next` para que deleguen en las `_v51`.
   - Así, también los caminos que no llama la app usan el orden y la regla de la v5.1: `respond_offer` cuando todos responden, `validate_assignment` con `ok = false` y las herramientas de voz.
2. **`supabase/data/20261107_breakeven_v51.sql`:** cambia `breakeven_r` a 0.052.

**Verificación:**
```bash
ALLOW_DB_WRITE=1 npm run test:priority
```
Tiene que pasar entero, con la demo libre. Además, en `/tablero` la línea debe decir 5.2 %, y en `/panel` la lista debe mostrar «P2 · 69 % de su plazo».

**Reversión:**
- Para `breakeven_r`: `update public.params set value = 0.053 where key = 'breakeven_r';`.
- Para el switch: volver a aplicar los cuerpos de esas 7 funciones desde `supabase/migrations/20261106020000_v4_functions.sql` y `20261106030000_v4_reads.sql`.

## 3. Agentes de voz (ElevenLabs)

1. En `voice/agents/common.json`, dejar `allowed_hosts` como corresponda en producción: quitar `asistia-e5.vercel.app` (ver `POST_FINAL.md`).
2. Desde `main`, primero en seco, y comprobar que solo hay `PATCH` a las 14 herramientas y los 4 agentes:
   ```bash
   node scripts/voice-sync.mjs --dry
   ```
   Después de verdad:
   ```bash
   node scripts/voice-sync.mjs
   ```
   Las URL de las herramientas usan `PUBLIC_BASE_URL`, que ya es el dominio de producción.

**Verificación:** con `ALLOW_DB_WRITE=1`, `node scripts/dev/prod-voice-check.mjs` debe dar 200 con URL firmada. `tests/e2e/prod_phone_voice.py` debe mostrar que la llamada conecta y que el agente se presenta como «asistente automatizado del Hospital Mirasur».

**Reversión:** volver a correr `voice:sync` desde el commit anterior del JSON.

## 4. Alias y protección

1. Quitar la excepción de protección de `asistia-e5.vercel.app` (`scripts/dev/vercel-alias.mjs --reprotect`) y, si se quiere, el alias. Detalle en `POST_FINAL.md` §1.
2. No tocar el alias de producción. Vercel lo mueve solo al nuevo despliegue de `main`.

## 5. Verificación final en producción

1. **Webhook:** una llamada de prueba (`prod_phone_voice.py`) debe dejar en la fila de `calls` el `external_id` y el resumen. En ElevenLabs no debe aparecer ninguna falla nueva del webhook `asistia-post-call`.
2. **Voz:** abrir el mismo teléfono en dos pestañas. Una sola conecta y la otra muestra «Llamada abierta en otro dispositivo». Al cerrar la pestaña, la llamada queda `finalizada`.
3. **Tablero de voz:** en `/demo`, «Voz en vivo» debe mostrar 0 activas al terminar.
4. **Secretos:** `node scripts/dev/check-secrets.mjs` sobre `main` debe dar 0 coincidencias.
5. **Limpieza:** **Reiniciar demo** para dejarla en su estado inicial.

## Si algo sale mal

Orden de reversión, del más rápido al más profundo:
1. **Vercel:** *Instant Rollback* al despliegue anterior. Restituye el código E4 en producción en segundos.
2. **SQL del merge:** revertir `breakeven_r` y el switch (§2).
3. **Agentes:** `voice:sync` desde el JSON anterior.
4. **Solo si se abandona la E5 por completo:** `supabase/rollback/*.down.sql`, en orden 040000, 030000, 020000 y 010000. Cada archivo explica qué borra; ninguno toca objetos que use la E4.
