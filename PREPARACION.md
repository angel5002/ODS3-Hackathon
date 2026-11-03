# Preparación del entorno (ejecución 0)

Fecha: 2 de noviembre de 2026. Este archivo no contiene secretos.

## 1. Herramientas

| Herramienta | Versión |
|---|---|
| Node.js | v24.21.0 (LTS) |
| npm / npx | 10.3.0 |
| Python | 3.12.10 |
| pip | 26.2.1 |
| git | 2.55.0.windows.5 |
| Supabase CLI (`npx supabase`) | 3.0.0 |
| Vercel CLI (`npx vercel`) | 65.10.0 |

Sistema: Windows 10.

## 2. Python y verificación del análisis

- Entorno virtual en `ml/.venv` (fuera del repositorio).
- `ml/requirements.txt`: pandas 3.1.0, scikit-learn 1.9.1, openpyxl 3.1.5, numpy 2.5.4.
- `insumos/analisis_hma.py` se ejecutó desde una carpeta temporal (unos 24 s). Los resultados coinciden con la referencia:
  - Filas originales: 450,629; 19 especialidades excluidas.
  - Base limpia: **412,747 citas, 93,657 pacientes, 106,100 no atendidas (25.7 %)**, unas 347 por día de atención.
  - Modelo: entrenamiento 307,895 citas (enero–septiembre), prueba 104,852 (octubre–diciembre).
  - **AUC en prueba: 0.655.** Lista diaria del 10 % de mayor riesgo: 52 % no atendidas (promedio 27 %).
- Los CSV generados (`citas_limpias.csv`, `predicciones_test.csv`) se borraron.
- Aviso sin impacto: pandas 3.1 marca `Series.dt.dayofweek` como obsoleto (sugiere `dt.day_of_week`). Conviene cambiarlo al reutilizar la lógica en `ml/`.

## 3. Skills (nivel de proyecto, para Claude Code)

Instaladas con `npx skills@latest add … -a claude-code -y --copy` en **`.claude/skills/`**. Se copiaron los archivos (no son enlaces), así que llegan al equipo al clonar. Las versiones quedan fijadas en `skills-lock.json` (se restauran con `npx skills experimental_install`).

| Skill | Origen |
|---|---|
| emil-design-eng, mobile-native, break-ui, pick-ui-library, ask-sonner | emilkowalski/skills |
| web-design-guidelines, deploy-to-vercel | vercel-labs/agent-skills |
| **vercel-react-best-practices** | vercel-labs/agent-skills |
| supabase | supabase/agent-skills |
| frontend-design, webapp-testing | anthropics/skills |

Diferencia con lo planeado: en su repositorio, `react-best-practices` se llama `vercel-react-best-practices`. Se instaló con ese nombre y se actualizó `CLAUDE.md`.

## 4. Variables de entorno

- Las claves estaban en un archivo `.env` (no `.env.local`). Se **renombró a `.env.local`** para tener una sola fuente; está ignorado por git, igual que cualquier `.env*` salvo `.env.example`.
- Completas: `NEXT_PUBLIC_APP_NAME`, `DEMO_PIN`, `SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`, `SUPABASE_PROJECT_REF`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Vacías: `GEMINI_API_KEY` (opcional hasta la ejecución 2) y `SUPABASE_DB_PASSWORD` (ver pendientes).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` usan las claves nuevas de Supabase (`sb_publishable_…` y `sb_secret_…`), que reemplazan a las antiguas anon y service_role. Funcionan igual con `@supabase/supabase-js`. La clave secreta solo se usa en el servidor.

## 5. Supabase

- La cuenta ya tenía un proyecto **`ODS3-Hackathon`**, creado hoy a las 20:24 (hora de Lima). Se usó ese proyecto en lugar de crear un duplicado.
- Referencia: `iesxtmletcomxmdkoagu`. URL: `https://iesxtmletcomxmdkoagu.supabase.co`.
- Región: **us-east-1 (Virginia del Norte)**, no São Paulo como se había planeado. Desde Lima la latencia será algo mayor, pero no afecta la demostración. Si se prefiere São Paulo, hay que crear otro proyecto antes de cargar datos.
- Postgres 17.11. El esquema `public` está vacío (0 tablas).
- Se creó `supabase/` (`config.toml`) y la carpeta quedó enlazada (`npx supabase link`). El estado local de la CLI (`supabase/.temp/`) está ignorado.
- Prueba de conexión correcta:
  - Consulta SQL de solo lectura con `npx supabase db query --remote --read-only`.
  - API REST: las claves publicable y secreta son aceptadas (responden 404 a una tabla inexistente, no 401).
  - Servicio de autenticación: estado 200.
- Nota: la CLI v3 pide confirmación explícita (`--yes`) para cualquier SQL que modifique la base remota. Las consultas de solo lectura usan `--read-only`.

## 6. Git y repositorio

- Remoto: `https://github.com/angel5002/ODS3-Hackathon` (rama `main`).
- `.gitignore` excluye `.env*` (salvo `.env.example`), `node_modules/`, `.next/`, `ml/.venv/`, `insumos/*.csv`, `__pycache__/`, `.vercel/` y `supabase/.temp/`.
- Se comprobó con `git check-ignore` que el CSV, `.env.local`, `ml/.venv` y `supabase/.temp` quedan fuera. También se buscó en los archivos del commit el valor exacto de cada clave: no apareció ninguna.
- Commit inicial `c0aae7c` subido a `main`: `CLAUDE.md`, `docs/`, `.env.example`, `.gitignore`, `insumos/` (sin el CSV), `ml/requirements.txt`, `supabase/config.toml`, `.claude/skills/` y `skills-lock.json`.
- Los prompts de las ejecuciones no estaban en la carpeta, así que no se subieron. Si se quieren en el repositorio, conviene guardarlos en `docs/prompts/`.

## 7. Vercel

- Ya existía un proyecto **`ods3-hackathon`** conectado por GitHub a `angel5002/ODS3-Hackathon`, rama de producción `main`. Cada push a `main` se despliega solo.
- El push del commit inicial ya generó un despliegue (estado READY). Como todavía no hay aplicación, está vacío.
- Se configuró el framework como Next.js.
- Variables cargadas en **production y preview**:
  - Cifradas: `NEXT_PUBLIC_APP_NAME`, `SUPABASE_PROJECT_REF`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - Sensibles (no se pueden volver a leer): `DEMO_PIN`, `SUPABASE_SERVICE_ROLE_KEY`.
  - No se cargaron: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` ni `VERCEL_TOKEN` (solo se usan en la laptop), y tampoco `GEMINI_API_KEY`, que está vacía.
- Enlace local: `.vercel/project.json` (ignorado por git).
- **Limitación:** el `VERCEL_TOKEN` (`vcp_…`) tiene alcance limitado. Sirve para la API de Vercel (todo lo anterior se hizo así), pero la CLI `npx vercel` falla con él: `whoami` responde "User not found" y `env ls` no puede leer el proyecto.

## Pendientes para una persona

1. **`SUPABASE_DB_PASSWORD`**: la contraseña la tiene quien creó el proyecto. Pueden escribirla en `.env.local` o restablecerla en Supabase (Project Settings > Database) y anotarla ahí. Solo hace falta para `supabase db push` o una conexión directa a Postgres. Las consultas por la CLI funcionan sin ella.
2. **`DEMO_PIN`**: el valor actual coincide con un valor de ejemplo que trae la configuración por defecto de Supabase, así que es muy fácil de adivinar. Cámbienlo en `.env.local` y en Vercel (production y preview).
3. **`GEMINI_API_KEY`**: completarla en `.env.local` antes de la ejecución 2 y cargarla en Vercel.
4. **Token de Vercel para la CLI** (opcional): si quieren usar `npx vercel` (por ejemplo `vercel env pull` o un despliegue manual), creen un token de cuenta clásico en vercel.com > Account Settings > Tokens, con alcance al equipo del proyecto. Los despliegues por GitHub no lo necesitan.
5. **Región de Supabase** (opcional): decidir si se quedan en us-east-1 o crean el proyecto en São Paulo antes de cargar datos.
