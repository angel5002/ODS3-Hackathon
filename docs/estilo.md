# Estilo visual de AsistIA: «Stoic, versión salud» (E5 stoic)

Objetivo: que en una demo de 4 minutos cada pantalla se entienda de un vistazo. La referencia es la app Stoic (`insumos/referencias/stoic_referencia.png`): minimalismo, fondo casi blanco, texto casi negro, mucho aire, tipografía limpia, iconos de línea monocromos, tarjetas con un borde sutil y una sola acción principal por pantalla. La diferencia de salud: un único acento, verde azulado clínico profundo, usado con moderación. Los tokens viven en `src/app/globals.css` y el contraste de cada par se mide con `node scripts/dev/contrast-check.mjs`.

Este documento reemplaza al estilo sobrio de E5 estilo (Public Sans y radios de 4 px). Los nombres de los tokens no cambian: solo cambian sus valores, así el código de los otros frentes se reestiliza solo.

## Decisiones

| # | Decisión | Por qué |
| --- | --- | --- |
| 1 | **DM Sans** para la interfaz y **DM Serif Display** para títulos grandes y cifras grandes. | Es el par de fuentes del pitch (guion v7, «instalar DM Serif Display y DM Sans»): la app y las diapositivas se ven como un solo producto. Se descartaron Public Sans sola (más institucional que serena) e Inter con Fraunces (sin relación con las diapositivas). |
| 2 | Las fuentes se cargan con `next/font/google`. | Se autoalojan al compilar: en tiempo de ejecución no sale ninguna petición a un CDN de fuentes. No hizo falta añadir paquetes (`@fontsource/dm-*` existe, pero habría cambiado `node_modules` compartido). |
| 3 | `font-display` siempre va con peso 400 y `font-synthesis: none`. | DM Serif Display tiene un solo peso. Las 19 clases `font-display font-bold` que ya existían pasan a la serif sin negrita falsa. |
| 4 | Fondo `paper` #f6f7f6, tarjetas blancas con borde de 1 px `line` #e2e5e4, texto `ink` #151a19. | El casi blanco y el casi negro de Stoic, con un matiz frío que se lee como «clínica» y no como «papel». |
| 5 | **La acción principal es casi negra** (`brand` = #151a19, píldora). | Como los botones de Stoic. Así el acento no compite con la acción. |
| 6 | **Un solo acento: verde azulado clínico #0c6b62** (`accent`, `--vc-accent`, `--vc-agent`). | Se usa para la voz del asistente en la llamada, la pestaña activa, el foco del teclado, el «IA» y el check de la marca, el rótulo «Oferta de cupo» y las celdas recuperables de la portada. En ningún otro lugar. |
| 7 | Radios generosos: 12 px en botones y campos, 18 a 22 px en tarjetas, píldoras (`rounded-full`) en las acciones de las pantallas públicas. | Stoic es suave. Las etiquetas de estado quedan en 4 a 6 px para que sigan leyéndose como etiquetas. |
| 8 | Sin degradados, sin brillos, sin lavados de menta. Las sombras pequeñas son una línea de 1 px; las grandes, una elevación suave solo para capas superpuestas. | Calma y nitidez. |
| 9 | Los colores de estado y de riesgo se mantienen (con tintes un poco más claros). | Son funcionales y siempre van con palabra e icono. |
| 10 | Los recuadros oscuros (`night`) pasan a casi negro #161b1a, con el acento claro `mint` #9fd8cc. | La tarjeta oscura de Stoic («sleep better»). |
| 11 | Las pulsaciones encogen a 0.98 durante 120 ms (`.press`). | Confirman el toque sin mover el diseño (Emil Kowalski: los botones deben sentirse escuchados). |
| 12 | Los iconos son de línea y monocromos. Excepción: los iconos de estado del panel conservan el tono de su estado, y siempre van con la palabra. | Los iconos de estado ayudan al personal a recorrer siete contadores de un vistazo. |
| 13 | **v2, tras la prueba en Android:** la llamada pierde los círculos concéntricos y el disco negro. Queda una sola onda horizontal, al estilo de Siri, centrada, con el estado en texto pequeño debajo. | El usuario pidió una onda que se mueva con el audio real y que no compita con el texto. La versión con círculos queda como respaldo en `RespiraCirculos.tsx`. |
| 14 | La voz de la persona se dibuja en grafito, no en naranja. | Así el único color de la pantalla es el de la IA. El estado siempre se dice además con una palabra. |
| 16 | **/pedir-cita v2:** el alias («Usted aparece como «Cóndor 246»») ya no se ve. Queda solo como texto para lectores de pantalla y para las pruebas de punta a punta que lo esperan. | Pedido del usuario. El alias sigue existiendo en el sistema. |
| 17 | «Para hablar con una persona, escriba PERSONA» pasa a ser un botón, «Hablar con una persona», que envía el comando PERSONA ya existente. | Un toque en vez de una instrucción. |
| 18 | Los botones que devuelve el bot se dibujan como respuestas rápidas: `buttons: string[]` del último mensaje sin responder. Al tocar uno se envía su texto. | Así funcionan «Hablar ahora con una persona» en la derivación por emergencia y cualquier otro cierre del bot, sin tocar la UI. Lo acordé con la pista de voz. |
| 15 | En `/demo` no se tocó nada (lo rediseña el frente D con estos tokens). | Reparto de frentes. |

## Reglas de texto (en todas las pantallas)

- Un título, una línea de apoyo y las acciones. Lo demás aparece al tocar o no existe.
- Ningún texto se corta con «…»: las líneas largas se ajustan a varias líneas (`text-pretty`) o se acortan en la redacción.
- El aviso de demostración y la fuente de los datos van en **una línea discreta al pie**, nunca dentro de una llamada. El texto exacto lo fija `DISCLAIMER`.
- Sin jerga interna:
  - «Regulación clínica» y «regulación ciega» → «Asignar prioridad», con una línea: «Sin nombre, documento, seguro ni distrito: solo cuenta la necesidad clínica.»
  - «Pendiente de regulación» → «Sin prioridad asignada».
  - «efecto dominó» → «en cadena».
  - El rol «Call center» → «Central de llamadas»: solo cambia la etiqueta en `src/lib/auth.ts`; el identificador `callcenter` no cambia. En la barra del personal se lee «Llamadas».
- **Los párrafos de explicación** de las pantallas del personal se redujeron a una línea. El detalle queda en el `title`, que se ve al pasar el cursor, o tras «Ver guion», que se abre al tocar.
- **El pie de página** es una sola línea: el aviso de demostración y la fuente de los datos (ODC-BY).
- **/pedir-cita:**
  - el título «¿Necesita una cita?» con una línea de apoyo;
  - una acción principal, «Chatear con el asistente», en una píldora casi negra;
  - dos alternativas en tarjetas pequeñas, «Hablar con el asistente» y «Formulario»;
  - una línea de emergencia (106, SAMU).
  - Los nombres accesibles que usan las pruebas de punta a punta no cambian: «Activar sonido y llamadas», «Teléfono simulado de…», «Hablar con el asistente» y «Chatear con el asistente».

## Accesibilidad

- Todo control mide 44 × 44 px como mínimo; los campos tienen texto de 16 px y 44 px de alto (regla global).
- Contraste AA medido: texto 4.5:1, iconos, anillos, ondas y bordes de control 3:1. `node scripts/dev/contrast-check.mjs` falla si un par no llega.
- El riesgo y los estados nunca se indican solo con color.
- `prefers-reduced-motion`: todo queda estático, incluida la pantalla «Respira» (un dibujo fijo por cada cambio).

## Pantalla de llamada «Respira»

La vista está en `src/components/voice/CallView.tsx` y el lienzo en `src/components/voice/Respira.tsx`. La versión 2 reemplaza los círculos y el disco de la versión 1 (respaldo en `RespiraCirculos.tsx`) por una sola onda.

- En pantalla solo hay:
  - una línea con «Hospital Mirasur · asistente automatizado» y la hora;
  - **una onda horizontal centrada**: varias líneas finas que oscilan en vertical con el audio real;
  - el estado en **texto pequeño** bajo la onda: «Conectando», «Escuchando», «Hablando», «Pensando», «Su turno», «Silenciado»;
  - la **última frase** dicha, entera;
  - tres controles: Silenciar, Colgar y Chat.
- **Cómo se mueve la onda:**
  - escucha: casi plana y respirando, en grafito; sube con la voz de la persona (`levels.input()`);
  - habla la IA: amplia, en el acento, siguiendo `levels.output()`;
  - piensa: una ondulación baja y lenta;
  - conecta: un pulso suave;
  - suena: dos latidos cada 1.5 s;
  - silencio y fin: una línea quieta.
- **Las demás fases** (entrante, reconectar, ocupado, sin conexión, guion y finalizada) usan el mismo esqueleto: la onda, el estado, un título y una línea, y sus acciones.
- **«Hablar con una persona» y «Ocultar subtítulos»** aparecen al tocar la onda y se cierran solos a los 8 s. La persona también puede pedirlo de viva voz: el asistente transfiere.
- **La línea de seguridad** («Nunca pedimos pagos…») sale de la llamada: la dice el asistente y aparece en la pantalla de inicio de voz.
- **Subtítulos:** `src/lib/voice/captions.ts`, un solo archivo compartido con la pista de voz.
  - `useRevealedCaption` (de la pista de voz) muestra las palabras del asistente al ritmo de su voz.
  - Luego, `tailCaption` muestra la última frase. Si no cabe, muestra su final desde una cláusula o una palabra entera, sin «…».
  - `tailSentences` es para el guion fijo: muestra las últimas frases completas que caben, para que la pregunta conserve su contexto.
  - Las pruebas están en `tests/captions.test.ts` y `tests/voice-captions.test.ts`.
- **Props opcionales** en `src/lib/voice/contract.ts`, unificadas con la pista de voz. Si no se pasan, no cambian nada.
  - `pushToTalk?: { talking, start, end }` (modo sala ruidosa, de la pista de voz): Respira reemplaza Silenciar por «Mantener para hablar».
    - Al presionar (puntero, Espacio o Enter) llama a `start()`.
    - Al soltar, al cancelarse el puntero, al perder la captura o al perder el foco la ventana, llama a `end()`.
    - Mientras no se presiona, bajo la onda se lee «Su turno».
    - Como el botón ya existe, `PUSH_TO_TALK_BUTTON_READY = true`: `CallScreen` y la llamada de registro de `/pedir-cita` (`VoiceRegister`) lo conectan con el push-to-talk de `LiveVoice`, según el `pushToTalk` que devuelve `/api/voice/session`.
  - `scene?: boolean`: oculta los controles y el menú, para reproducir una escena en el proyector.
- **Rendimiento:**
  - se dibuja en `<canvas>` con `requestAnimationFrame`;
  - no hay estado de React por cuadro ni asignaciones de memoria por cuadro (arreglos tipados, colores leídos una vez, transparencia con `globalAlpha`);
  - el DPR se limita a 1.5: con 2, el p95 se duplicaba en un Pixel 7 emulado;
  - el bucle se detiene cuando nada se mueve, va a 30 fps en los modos lentos y se pausa con la pestaña oculta.
  - Las mediciones están en la sección «Rendimiento medido».

### Rendimiento medido

- **Condiciones:**
  - Playwright con Chromium y el perfil Pixel 7 (412 × 839, DPR 2.625);
  - CPU 4 veces más lenta (`Emulation.setCPUThrottlingRate`);
  - `/dev/llamada?estado=activa-auto` con audio simulado: el asistente habla, la persona habla y el asistente piensa;
  - 12 s por corrida, tras 3 s de calentamiento.
- **Qué se midió:**
  - los intervalos entre cuadros (`requestAnimationFrame`);
  - las tareas largas (`longtask`);
  - `TaskDuration` y `ScriptDuration` de CDP, por segundo.

| Corrida | fps | p50 | p95 | máx. | Tareas largas | CPU total (ms/s) | Script (ms/s) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| v1 círculos, animado, DPR 2 | 55.7 | 16.7 ms | 33.3 ms | 66.6 ms | 0 | 834 | 133 |
| v1 círculos, animado, DPR 1.5 | 57.8 | 16.7 ms | 16.8 ms | 50.1 ms | 0 | 655 | 124 |
| **v2 onda, animado, DPR 1.5 (final)** | **58.2** | **16.7 ms** | **16.8 ms** | 50.0 ms | **0** | 659 | 148 |
| v2 onda, estático (`prefers-reduced-motion`) | 59.2 | 16.7 ms | 16.8 ms | 33.4 ms | 0 | 185 | 101 |

La primera corrida de la v2, justo después de editar, registró 2 tareas largas (276 ms) mientras el servidor de desarrollo compilaba; la repetición, ya compilado, no tuvo ninguna.

**Lectura:**
- El script de la onda cuesta unos 47 ms por segundo, contando el generador de audio simulado de la página de desarrollo; con la CPU cuatro veces más lenta, eso es menos de 0.8 ms por cuadro.
- El resto de la diferencia es rasterizar el lienzo. Chromium sin pantalla lo hace por software; en un teléfono real lo hace la GPU.
- No hubo ninguna tarea larga con animación, así que el hilo principal queda libre para el audio.
- **Respaldos**, según la regla de no borrar implementaciones que funcionan:
  - la pantalla anterior, con la onda sobria, en `CallViewClassic.tsx` y `VoiceWave.tsx`;
  - los círculos de la v1, en `RespiraCirculos.tsx`.

## Tokens

Nombres estables (otros frentes los usan). Valores nuevos:

| Token | Valor | Uso |
| --- | --- | --- |
| `--font-sans` | DM Sans | interfaz |
| `--font-display` | DM Serif Display | títulos y cifras grandes |
| `paper` / `surface` / `sunken` | #f6f7f6 / #ffffff / #f0f2f1 | página, tarjetas, superficies hundidas |
| `ink` / `muted` / `faint` | #151a19 / #4e5755 / #5b6462 | texto |
| `line` / `line-strong` | #e2e5e4 / #7c8583 | borde decorativo / borde de control |
| `brand` / `brand-hover` / `brand-soft` | #151a19 / #2e3634 / #eceeed | acción principal (casi negra) |
| `night` / `night-2` / `mint` | #161b1a / #262d2c / #9fd8cc | recuadros oscuros y su acento |
| `--vc-bg` / `--vc-bg-2` | #fcfcfb / #f4f5f4 | pantallas públicas y llamada |
| `--vc-primary` / `--vc-toggle` | #151a19 | acción principal, disco, burbuja propia |
| `--vc-agent` | #0c6b62 | voz del asistente (acento) |
| `--vc-person` | #3f4846 | voz de la persona (grafito) |
| `--vc-rest` | #7c8583 | anillos en reposo |

**Tokens semánticos nuevos** (para reutilizar en `/demo` y en los demás frentes):

| Token (CSS / Tailwind) | Valor | Uso |
| --- | --- | --- |
| `--color-accent` / `bg-accent`, `text-accent` | #0c6b62 | el único acento |
| `--color-accent-hover` | #0a5952 | acento con el puntero encima |
| `--color-accent-soft` / `bg-accent-soft` | #e4f1ee | tinte del acento |
| `--vc-accent` / `text-vc-accent`, `border-vc-accent` | #0c6b62 | acento en las pantallas públicas |
| `--vc-accent-soft` / `bg-vc-accent-soft` | #e4f1ee | tinte del acento en las pantallas públicas |
| `--vc-card` / `bg-vc-card` | #ffffff | tarjeta blanca sobre el fondo casi blanco |

## Movimiento

- Fundidos de 160 a 200 ms en los cambios de estado. La palabra del disco y el subtítulo se cruzan con un fundido.
- El disco cambia de tamaño con `--ease-out` en 300 ms (fase de guion).
- Lo único que se mueve solo es la llamada:
  - suena: dos ondas lentas;
  - conecta: los anillos respiran;
  - habla la IA: ondas laterales;
  - habla la persona: los anillos laten;
  - piensa: un arco gira;
  - cuelga: los anillos se pliegan.
- Con `prefers-reduced-motion`, nada se mueve.
