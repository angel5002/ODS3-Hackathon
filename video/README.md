# Animaciones del video de AsistIA

Cuatro clips para el video de postulación (CientíficaHack 2026, grupo Algorritmia). No llevan narración: la voz se monta aparte en el editor. Solo el cierre lleva un efecto de sonido.

| Clip | Archivo | Duración | Va en el video |
|---|---|---|---|
| Escena 1 · Predecir | `salida/escena1.mp4` | 14.0 s | 1:14–1:28 |
| Escena 2 · Confirmar | `salida/escena2.mp4` | 14.0 s | 1:28–1:42 |
| Escena 3 · Reasignar | `salida/escena3.mp4` | 12.0 s | 1:42–1:54 |
| Cierre · Logo | `salida/cierre.mp4` (con clic) y `salida/cierre-sin-sonido.mp4` | 6.0 s | final |
| Todo junto | `salida/asistia-animaciones-completo.mp4` | 46.0 s | — |
| Efecto de sonido | `salida/clic.wav` | 0.03 s | en 2.05 s del cierre |

Formato de todos los clips: 1920×1080, 30 fps, H.264 (`-crf 18 -preset veryfast`), `yuv420p` de rango de video, BT.709. El audio es AAC a 48 kHz.

## Cómo volver a renderizar

Requisitos: Node.js, `npm install` en la raíz del repositorio (instala Playwright 1.64.1 y las fuentes) y `ffmpeg` en el PATH.

```bash
npm run video
```

```bash
npm run video -- escena2
```

```bash
npm run video -- --join
```

```bash
npm run video:storyboard
```

- `npm run video`: renderiza las 4 escenas y arma el video completo, en algo más de un minuto.
- `npm run video -- escena2`: renderiza solo esa escena. Los nombres válidos son `escena1`, `escena2`, `escena3` y `cierre`. Después hay que correr `--join` para actualizar el video completo.
- `npm run video -- --join`: vuelve a unir los clips existentes sin renderizar.
- `npm run video:storyboard`: guarda 3 capturas por escena en `storyboard/`.

Cada `.mp4` se escribe primero como `*.parcial.mp4` y solo se renombra si ffmpeg termina sin error.

## Cómo funciona

- Cada escena es una página HTML en `escenas/`, con estilos de la aplicación (`base.css`: mismos colores, tipografías Public Sans y Bricolage Grotesque, radios y componentes del panel y del teléfono).
- `escenas/timeline.js` crea todas las animaciones con la Web Animations API, **pausadas**. `seek(segundos)` deja la escena exactamente en ese instante. Nada depende del reloj real.
- `render.mjs` abre cada escena en Chromium a 1920×1080, llama a `seek(i/30)` en cada cuadro, toma una captura JPEG (calidad 92) y se la pasa a ffmpeg.
- El video completo une los clips con el concat demuxer y `-c copy`. Después se le agrega la pista con el clic en su lugar (42.05 s), sin volver a codificar el video.

## Cómo cambiar textos y tiempos

- **Textos:** están en el HTML de cada escena (`escenas/escena1.html`, etc.). Los nombres de pacientes de la escena 1 están en el arreglo `PEOPLE`.
- **Tiempos:** cada animación lleva `at` (segundo de inicio) y `dur` (duración) dentro de `TL.build(...)`.
- **Duración de una escena:** `window.DURATION` al final de su HTML.
- **Capturas del storyboard:** `window.STORYBOARD`.
- **Momento del clic:** el cierre lo calcula a partir del último llenado y lo publica en `window.SOUND_AT`. El renderizador lo usa para colocar el sonido.
- **Logo:** `node video/make-logo.mjs` regenera `insumos/logo-asistia.svg` (fondo claro) y `insumos/logo-asistia-claro.svg` (fondo oscuro). Las letras son trazos vectoriales, así que el SVG no necesita la fuente instalada.

## Fuentes de las cifras

- **52 % y 27 %:** inasistencia en la lista del 10 % de mayor riesgo frente al promedio. Prueba del modelo con datos abiertos del Hospital María Auxiliadora, octubre a diciembre de 2023 (`ml/out/model_card.json`).
- **−29 %:** reducción de la inasistencia con recordatorios automatizados. Hasvold y Wootton, 2011.

Pacientes, nombres y mensajes son ficticios. El chat es una app de mensajería genérica: no usa colores, logos ni formas de burbuja de marcas de terceros.
