# /demo para la final: modo Presentación y modo Operación

Rama `e5-presentacion` (pista D). Guion de referencia: `insumos/AsistIA_Guion_Pitch_v7.pdf`. Contrato entre pistas: `src/lib/demo/contract.ts`.

## Decisiones

1. **Dos modos en la misma página.** El problema de `/demo` era el exceso de texto y la información mal organizada, en una pantalla que se proyectaba y se operaba a la vez. Ahora se separan:
   - **Presentar**: la pantalla proyectada.
   - **Operar**: el tablero de control para el operador y para las preguntas.

   Ambos usan las mismas lecturas, así que el cambio es instantáneo. El modo queda en la URL (`/demo?modo=presentar&momento=qr`) para guardarlo como marcador en la laptop del proyector. En la parte superior siempre hay un botón visible: **Presentar** u **Operar**.

2. **Presentación: un momento del guion por vista**, en el orden de `PRESENTATION_ORDER`:

   | Tecla | Momento | Idea única |
   |---|---|---|
   | 1 | QR y cartillas | Un QR grande que abre el chat (`JURY_CHAT_PATH`), una línea y un contador discreto de cartillas abiertas |
   | 2 | Escena 1 | El cupo de Carmen pasa a Tito. El disparador visible es «El personal aprueba», nunca la IA. Franjas «Sin AsistIA» y «Con AsistIA» a los 9 s y a los 18 s, como en la diapositiva 6 |
   | 3 | Jurado en vivo | A la izquierda, las solicitudes nuevas en la lista de espera (por categoría y después por posición). A la derecha, «Ahora»: las cuatro últimas acciones. Al pie, el estado del cupo de Carmen |
   | 4 | Escena 2 | El chat avanza cada 2.4 s y el resumen del médico se llena al mismo ritmo. La ventana de llegada aparece al final (26.4 s), rotulada como estimación |
   | 5 | Etapas | Las 5 etapas como el rastreo de un envío, con pocas cifras grandes |

   **Teclado:**
   - ← y → para moverse (también AvPág y RePág, que es lo que envían los presentadores inalámbricos);
   - 1 a 5 para saltar a un momento (el número del momento actual lo reinicia);
   - F para pantalla completa;
   - Espacio adelanta la escena al siguiente paso, por si los actores van más rápido que el reloj.

   **Tipografía:**
   - `1em = clamp(20px, 2.75vmin, 44px)`, de modo que la misma vista entra a 1280×720 y a 1920×1080;
   - texto mínimo: 16 px a 720p y unos 24 px a 1080p;
   - títulos de 1.9 a 3 em.

   **Animaciones:**
   - entradas cortas (420 ms), el cupo que se desplaza (900 ms), las franjas, la línea de etapas que se dibuja y los datos que se actualizan con un fundido;
   - se desactivan con `prefers-reduced-motion`.

3. **No se inventan cifras.**
   - Cada vista que todavía usa datos de ejemplo lo dice con «Datos de ejemplo».
   - En la vista de etapas, «Llegada y triaje» y «Atención y alta» no tienen datos en el prototipo, por eso dicen «Se mide en el piloto».
   - Las demás etapas salen de `?view=overview`:
     - antes de la cita: confirmadas de 1,473 o, si nadie confirmó todavía, «citas por confirmar»;
     - espera: personas en la lista de espera;
     - cupos liberados: reasignados del total.

4. **Operación, con el mismo sistema visual y todas las capacidades:**
   - pasos 0 a 8;
   - reinicio con confirmación;
   - llamadas en vivo con «Terminar»;
   - regla de asignación;
   - En vivo: vincular, probar mensaje y probar llamada;
   - Voz en vivo, teléfonos simulados, ajustes, parámetros y supuestos.

   **Cambios:**
   - **Barra superior:** hora y fecha completas («08:00 lunes 16/10 reloj detenido», ya no se corta), «Último movimiento» en una sola línea, el interruptor **Sala ruidosa** y el botón **Presentar**.
   - **Llamadas:**
     - una fila por personaje («Valeria F. · 6 llamadas»);
     - las llamadas de prueba se ocultan con «Mostrar llamadas de prueba (N)»;
     - una llamada que está sonando o en curso siempre se muestra, para poder terminarla;
     - en Herramientas se aplica el mismo filtro.
   - **Listas:** no hay texto cortado con «…». El texto largo pasa a la línea siguiente y las listas largas se desplazan dentro de su panel.
     - Lista de espera: 60 filas y un aviso.
     - Sesiones de chat: 6, y luego «Mostrar todas».
   - **Recorrido:** 6 etapas con cifra, unidad y una línea. Se quitaron los recuadros «Último» de cada etapa: el último movimiento se muestra una sola vez, arriba.
   - **Pie:** una sola línea con el aviso y la fuente de los datos (ODC-BY). En `/demo` se oculta el pie del sitio, porque repetía el aviso (CSS en `DemoTheme`: `body:has(.cc-root) #contenido ~ footer`).
   - **Navegación:** «Call center» se llama ahora «Llamadas» (`StaffHeader`).

5. **Sala ruidosa (pista F).**
   - El interruptor envía la acción `noisy_room {on}`. Muestra el valor del servidor si la vista `overview` trae `noisy_room` (el campo ya es opcional en `DemoOverview`); si no, muestra el último valor que se eligió.
   - Si la acción todavía no existe, el servidor responde con un error, el interruptor vuelve a su estado anterior y se desactiva con la explicación.

6. **Tokens.** No se editó `globals.css`.
   - La presentación usa los nombres globales (`--color-surface`, `ink`, `muted`, `line`, `sunken`, `brand`, `brand-soft`, `risk-alto` y `st-ok`), así que la pista A cambia sus valores sin tocar estos archivos. Los alias locales `--pr-*` están en `presentacion/theme.tsx`, con valores de respaldo en hexadecimal.
   - La operación conserva `DEMO_TOKENS` en hexadecimal, porque `contrast-check` los mide. Ahora tienen la dirección de Stoic: fondo casi blanco, texto y botones casi negros y un solo acento verde azulado (todos los pares pasan).
   - Los radios usan las clases globales (`rounded-md`, `rounded-lg`, `rounded-xl` y `rounded-2xl`).
   - Los títulos de la presentación usan `font-display`, que tomará DM Serif Display cuando la pista A lo active.

## Ranuras (dónde se conecta cada pista)

| Ranura | Archivo | Qué recibe | Qué poner |
|---|---|---|---|
| `JURY_CHAT_PATH` | `src/components/demo/presentacion/config.ts` | — | La ruta pública del chat que defina la pista E (hoy es `/pedir-cita?canal=chat`) |
| `useJuryOverview` | `src/components/demo/presentacion/hooks.ts` | `GET /api/staff/data?view=jurado` → `JuryOverview` | Nada: cuando la vista exista, responde 200 y deja de usar el ejemplo. Ante un 4xx usa `fixtures.ts` y no vuelve a consultar |
| `Scene1CallSlot` | `src/components/demo/presentacion/slots.tsx` | `{ elapsed, passed }`: reloj de la escena con marcas a los 9, 11, 15, 17 y 18 s | La reproducción de la escena 1 dentro de la llamada «Respira» de la pista C. Si su controlador tiene `next()`, `Scene1Moment` ya escribe `controllerRef.current = { next }` y Espacio lo llama: se puede reemplazar por el controlador de la pista C |
| `PreconsultaChatSlot` | ídem | `{ lines: SceneLine[] }`: las líneas ya dichas | El chat de preconsulta de la pista C |
| `DoctorSummarySlot` | ídem | `{ summary: PreconsultaSummary }` | El componente del resumen de `src/components/preconsulta/*` (es un componente puro) |
| Guiones de las escenas | `src/components/demo/presentacion/fixtures.ts` (`SCENE1`, `SCENE2`, `summaryAt`) | — | Reemplazarlos por los `Scene` de la pista C si incluyen audio |
| `noisy_room` | `ControlCenter.tsx` → `NoisyRoomToggle`; `src/lib/demo-overview.ts` | `overview.noisy_room?: boolean` | Que `overview.ts` lea el estado donde lo guarde la pista F |

## Pruebas

`tests/e2e/demo_panel.py` es de solo lectura: no pulsa acciones, no reinicia y no cambia la sala ruidosa.

- **Presentación (1920×1080 y 1280×720):**
  - cada momento con ← y →, con las teclas numéricas y con F;
  - sin desbordes;
  - sin texto cortado (`scrollWidth > clientWidth`) y sin «…»;
  - tamaño mínimo de letra;
  - aviso visible al pie.
- **Operación (1920×1080 y 360×800):**
  - los controles presentes, con la fecha completa;
  - las llamadas de prueba ocultas;
  - sin desborde horizontal y sin texto cortado;
  - el aviso una sola vez y al pie;
  - el cambio de modo en las dos direcciones.
- Sin errores de consola. Se acepta el 4xx de `?view=jurado` mientras falte la vista de la pista E.

Capturas en `capturas/e5/presentacion/`:
- `antes-1920.png` y `antes-360.png`;
- `despues-presentar-<momento>-<ancho>.png`;
- `despues-operar-1920.png` y `despues-operar-360.png`.
