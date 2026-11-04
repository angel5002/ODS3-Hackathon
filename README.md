# AsistIA — recuperar citas que se pierden

Prototipo del grupo Algorritmia para CientíficaHack 2026 (Universidad Científica del Sur), Desafío 4 "IA para la experiencia del paciente" (ODS 3).

En 2023, en el Hospital María Auxiliadora (MINSA, Lima), 1 de cada 4 citas de consulta externa programadas no se atendió: 106,100 citas, unas 347 por día de atención. Este prototipo:

1. Estima el riesgo de que cada cita de mañana no se atienda y lo explica en lenguaje simple.
2. Envía un recordatorio por mensaje a todas las citas (simulado: los mensajes solo llegan a un teléfono simulado en el navegador).
3. Llama con un asistente automático a quienes no responden (hoy con guion fijo; la voz con IA llega en la ejecución 2).
4. Cuando se libera un cupo, propone pacientes de la lista de espera; **una persona decide** a quién se le ofrece.
5. Muestra todo en vivo en el panel, el tablero y los celulares.

> Pacientes ficticios. Citas y modelo basados en datos abiertos reales del Hospital María Auxiliadora (2023).

**Demo pública:** https://ods3-hackathon.vercel.app (el panel, el tablero y `/demo` piden el PIN del equipo).

## Pantallas

| Ruta | Para quién | Qué hace |
|---|---|---|
| `/panel` | Personal de citas | Citas de mañana ordenadas por riesgo, filtros, lista de llamadas, detalle con explicación, bitácora, conversación, llamada y reasignación |
| `/t/[token]` | Paciente (ficticio) | Teléfono simulado: mensajes con botones, ofertas de cupo con plazo y llamada entrante |
| `/tablero` | Jefatura | Indicadores en vivo, actividad reciente, histórico 2023, ficha del modelo y "Ver qué pasó" |
| `/demo` | Equipo | Códigos QR de los 5 pacientes preparados, reloj de la demo, supuestos editables y "Reiniciar demo" |

## Arquitectura

- **Web:** Next.js 16 (App Router) + TypeScript + Tailwind 4, desplegado en Vercel desde `main`.
- **Datos y tiempo real:** Supabase (Postgres + Realtime). El navegador solo lee (clave publicable, RLS de solo lectura). Toda escritura pasa por las rutas `/api/*` del servidor, que llaman a funciones de Postgres con la clave secreta. Cada acción emite un aviso pequeño por Realtime (difusión en el tema `demo`) y cada pantalla vuelve a leer lo que muestra.
- **Modelo:** Python en `ml/`, fuera de la app. Se entrena una vez y sus resultados se cargan en Supabase.
- **Canales detrás de interfaces:** `MessagingChannel` y `VoiceChannel` en `src/lib/channels.ts`, y `VoiceAgent` en `src/lib/voice/agent.ts`. Hoy están simulados; en un piloto se reemplazan por WhatsApp Business o telefonía real.

```
ml/                 pipeline del modelo y datos (pipeline.py, features.py, fake.py) y salidas en ml/out/
supabase/migrations esquema, políticas RLS y funciones (reiniciar demo, recordatorios, ofertas, llamadas, reloj)
scripts/            carga de datos en Supabase
src/app/            pantallas y rutas /api (staff con PIN, patient por token, agent para el asistente)
src/components/     panel, teléfono, tablero, demo
tests/              pruebas de Python (ml), de integración (flow) y de punta a punta (e2e)
capturas/           capturas de cada pantalla en escritorio y celular
```

## Instalación

Requisitos: Node.js 22 o superior, Python 3.11 o superior, y acceso al proyecto de Supabase.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Complete `.env.local` (nunca lo suba: el repositorio es público):

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_APP_NAME` | Nombre del producto en todas las pantallas |
| `DEMO_PIN` | PIN del panel, el tablero y `/demo` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Lectura desde el navegador (clave publicable) |
| `SUPABASE_SERVICE_ROLE_KEY` | Escrituras desde el servidor (clave secreta). Solo servidor |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` | CLI de Supabase (solo en la laptop) |
| `VERCEL_TOKEN` | Despliegue (solo en la laptop) |
| `GEMINI_API_KEY` | Voz con IA (ejecución 2). Solo servidor |

```bash
npm run dev
```

## Regenerar los datos

El CSV original no está en el repositorio. Descárguelo de la Plataforma Nacional de Datos Abiertos y guárdelo como `insumos/DATOS HOSPITAL MARIA AUXILIADORA.csv`.

```bash
python -m venv ml/.venv
```

```bash
ml/.venv/Scripts/python -m pip install -r ml/requirements.txt
```

```bash
npm run ml
```

```bash
npm run test:ml
```

```bash
npx supabase db push --remote
```

```bash
npm run db:load
```

`npm run ml` reproduce el análisis de referencia (412,747 citas, 25.7 % no atendidas, AUC 0.655) y se detiene si no coincide. También elige el día de demo y genera pacientes y listas de espera ficticios con semilla fija. `npm run db:load` borra y vuelve a cargar todo en unos 5 segundos.

## Pruebas

| Comando | Qué prueba |
|---|---|
| `npm run test:ml` | Sin fuga de información futura, AUC entre 0.63 y 0.68, identidades ficticias, pacientes preparados |
| `npm run test:flow` | Contra Supabase: permisos del navegador, recordatorios, liberar, ofertar, rechazar, aceptar, vencimiento, llamada, reinicio y latencia en tiempo real |
| `npm run test:e2e -- --base http://localhost:3000 --pin <PIN>` | El guion de la demo en navegadores reales (Playwright), con capturas en `capturas/` |
| `ml/.venv/Scripts/python tests/e2e/prod_check.py` | La URL pública sin PIN: teléfonos reales y acciones del personal por la base |

Para Playwright: `ml/.venv/Scripts/python -m pip install -r tests/e2e/requirements.txt` y `ml/.venv/Scripts/python -m playwright install chromium`.

## Despliegue en Vercel

El proyecto `ods3-hackathon` está conectado a GitHub: cada push a `main` se despliega solo. Las variables públicas y de servidor están cargadas en production y preview. Si agrega una variable, cárguela también en Vercel. Use el dominio **ods3-hackathon.vercel.app**: los demás dominios del proyecto están protegidos por inicio de sesión de Vercel.

## Atribución del dataset

"Citas médicas en el Hospital de Apoyo María Auxiliadora - [HMA]", Hospital de Apoyo María Auxiliadora (Área de Informática), publicado en la Plataforma Nacional de Datos Abiertos del Perú bajo la licencia Open Data Commons Attribution (ODC-BY). Los nombres, teléfonos y listas de espera del prototipo son ficticios. Las citas, sus características y el modelo provienen de ese dataset.
