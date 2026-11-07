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

## Reglas de texto (en todas las pantallas)

- Un título, una línea de apoyo y las acciones. Lo demás aparece al tocar o no existe.
- Ningún texto se corta con «…»: las líneas largas se ajustan a varias líneas (`text-pretty`) o se acortan en la redacción.
- El aviso de demostración y la fuente de los datos van en **una línea discreta al pie**, nunca dentro de una llamada. El texto exacto lo fija `DISCLAIMER`.
- Sin jerga interna: «regulación ciega» → «Asignar prioridad sin ver la identidad»; «efecto dominó» → «en cadena»; el rol «Call center» → «Central de llamadas» (solo la etiqueta en `src/lib/auth.ts`; el identificador `callcenter` no cambia).

## Accesibilidad

- Todo control mide 44 × 44 px como mínimo; los campos tienen texto de 16 px y 44 px de alto (regla global).
- Contraste AA medido: texto 4.5:1, iconos, anillos, ondas y bordes de control 3:1. `node scripts/dev/contrast-check.mjs` falla si un par no llega.
- El riesgo y los estados nunca se indican solo con color.
- `prefers-reduced-motion`: todo queda estático, incluida la pantalla «Respira» (un dibujo fijo por cada cambio).

## Pantalla de llamada «Respira»

Basada en la pantalla «Breathe» de Stoic. `src/components/voice/CallView.tsx` (la vista) y `src/components/voice/Respira.tsx` (el lienzo).

- En pantalla solo hay:
  - una línea con «Hospital Mirasur · asistente automatizado» y la hora;
  - los círculos concéntricos alrededor de un disco oscuro, con el estado en una o dos palabras («Conectando», «Hablando», «Escuchando», «Pensando», «Silenciado»);
  - la **última frase** dicha, entera;
  - tres controles: Silenciar, Colgar y Chat.
- **Cuando habla la IA**, salen ondas horizontales a ambos lados del disco que siguen `levels.output()`, en el acento. **Cuando habla la persona**, los anillos laten con `levels.input()`, en grafito.
- **Las demás fases** (entrante, reconectar, ocupado, sin conexión, guion y finalizada) usan el mismo esqueleto: una o dos palabras en el disco, un título y una línea bajo los círculos, y sus acciones. Así, al conectar, al colgar y al pasar de una fase a otra solo cambian la palabra y el movimiento.
- **«Hablar con una persona» y «Ocultar subtítulos»** aparecen al tocar el disco y se cierran solos a los 8 s. La persona también puede pedirlo de viva voz: el asistente transfiere.
- **La línea de seguridad** («Nunca pedimos pagos…») sale de la llamada: la dice el asistente y aparece en la pantalla de inicio de voz.
- **Subtítulos:** `src/lib/voice/captions.ts`.
  - `tailCaption` muestra la última frase. Si no cabe, muestra su final desde una cláusula o una palabra entera, sin «…».
  - `tailSentences` es para el guion fijo: muestra las últimas frases completas que caben, para que la pregunta conserve su contexto.
  - Las pruebas están en `tests/captions.test.ts`.
- **Props opcionales nuevas** en `src/lib/voice/contract.ts`. Todas son opcionales y no cambian el comportamiento si no se pasan.
  - `pushToTalk?: boolean`: reemplaza Silenciar por «Mantener para hablar».
  - `actions.holdToTalk?: (pressed) => void`: se llama con `true` al presionar y con `false` al soltar, al salir el puntero o al perder el foco la ventana. La lógica la conecta otro frente.
  - `scene?: boolean`: oculta los controles y el menú, para reproducir una escena en el proyector.
- **Rendimiento:**
  - se dibuja en `<canvas>` con `requestAnimationFrame`;
  - no hay estado de React por cuadro ni asignaciones de memoria por cuadro (arreglos tipados, colores leídos una vez, transparencia con `globalAlpha`);
  - el DPR se limita a 2;
  - el bucle se detiene cuando nada se mueve, va a 30 fps en los modos lentos y se pausa con la pestaña oculta.
  - Las mediciones están en la sección «Rendimiento medido».
- **Respaldo:** la pantalla anterior, con la onda, queda en `CallViewClassic.tsx` y `VoiceWave.tsx`, según la regla de no borrar implementaciones que funcionan.

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
