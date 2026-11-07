# Estilo visual de AsistIA (E5 estilo)

Objetivo: que AsistIA se vea como un servicio de salud pública real y sobrio, no como una plantilla. Referencias: el NHS Design System (service.nhs.uk) y el U.S. Web Design System (designsystem.digital.gov). Los tokens viven en `src/app/globals.css`; el contraste de cada par se mide con `node scripts/dev/contrast-check.mjs`.

## Tipografía

- **Una sola familia: Public Sans** (`next/font/google`, pesos 400, 500, 600 y 700). Se quitó Bricolage Grotesque de la app. La clase `font-display` sigue existiendo como alias de Public Sans, para que ninguna pantalla cambie de fuente sin querer.
- Escala: texto base de 16 px como mínimo en móvil (15 a 17 px en tarjetas y botones); títulos de pantalla de 26 a 28 px; título de la portada de 34 a 48 px. La jerarquía se marca con tamaño y peso (600 o 700), no con otra fuente ni con un tracking muy negativo.
- Números tabulares en toda la app (`font-feature-settings: "tnum"`, más `tabular-nums` en horas, cronómetro y contadores).
- Notas al pie (aviso de demostración, línea de seguridad de la llamada): de 12 a 14 px, con un contraste de 4.5:1 como mínimo.

## Forma

- Radios pequeños: 2 px en etiquetas (`rounded-xs` y `rounded-sm`), 4 px en botones, campos y controles (`rounded-md`, `rounded-lg` y `rounded-xl`), y 6 px como máximo en contenedores grandes (`rounded-2xl` y mayores). Se aplica desde los tokens `--radius-*`, así que toda clase existente ya respeta la regla.
- Superficies planas: fondo de página `#f3f5f5`, tarjetas blancas con un borde de 1 px. Sin degradados, sin brillos, sin manchas difuminadas.
- Sombras: `shadow-xs`, `shadow-sm` y `shadow-md` dibujan una línea de 1 px. `shadow-lg` y `shadow-xl` son una elevación sutil, solo para capas superpuestas (modales, panel de detalle en el móvil y avisos).
- Excepción: los botones redondos de la llamada (Contestar, Colgar, Silenciar, Chat) siguen siendo círculos, porque es la convención del teléfono que la gente reconoce. También son redondos los avatares y los puntos de estado.

## Color

- Familia clara. Texto e iconos en verde azulado profundo (`ink` y `--vc-text`, `#10302f`). Una marca para las acciones: `brand` y `--vc-primary`, `#0e5a57`, con el texto blanco encima. Un solo acento, el menta `#5fd0b4`, solo sobre los recuadros oscuros (`night`).
- La onda de voz distingue al asistente (verde azulado `#0b7a6c`) de la persona (naranja `#c2410c`), y la palabra de estado lo dice siempre con texto.
- Los estados nunca se indican solo con color: la etiqueta lleva la palabra y un icono (`StatusBadge`); el riesgo, la palabra, el porcentaje y una barra; la oferta, el rótulo «Oferta de cupo» y un icono.
- Contraste medido: texto de 4.5:1 como mínimo; iconos, bordes de controles y gráficos de 3:1 como mínimo. El script falla si un par no llega.

## Avisos de demostración

- **Una sola línea discreta al pie de cada página** con el texto exacto «Demostración. Pacientes ficticios. Citas y modelo basados en datos abiertos reales del Hospital María Auxiliadora (2023).». En la portada y en las pantallas del personal va en `SiteFooter`. En `/pedir-cita` y en el teléfono simulado (`/t/[token]`) es `DemoNotice`, al pie de la columna.
- Sin franjas apiladas ni etiquetas tipo píldora («Demostración»).
- La pantalla de llamada (`CallView`) no lleva aviso de demostración: solo la identificación «Asistente automatizado · Hospital Mirasur», la duración y la línea de seguridad. El nombre del establecimiento llega por prop. Tampoco hay aviso al pie mientras está abierta la vista de voz de `/pedir-cita`.
- «Activar sonido y llamadas» deja de ser una franja a todo el ancho. Ahora es un botón secundario compacto (44 px de alto, borde de 1 px) que aparece junto al contenido: bajo la introducción de `/pedir-cita`, arriba del hilo del chat y arriba del hilo del teléfono simulado. Desaparece cuando el sonido ya está activado. El aviso de sonido sale abajo, al centro.

## Tamaños táctiles

- Todo control mide 44 × 44 px como mínimo: botones, enlaces de la cabecera del personal (incluso los que solo muestran el icono), Volver y Borrar del chat, respuestas rápidas, enlaces del pie y el selector de subtítulos.
- Todo campo de texto y todo `select` tiene texto de 16 px y 44 px de alto como mínimo (regla global en `globals.css`; iOS amplía la página con campos menores de 16 px). Las casillas y los botones de opción miden 20 px y su etiqueta forma el área táctil.

## Movimiento

- Mínimo y funcional. Los cambios de estado son fundidos de 200 ms como máximo (la pantalla de llamada, la palabra de estado, el subtítulo, las burbujas y el panel de detalle). No hay escalones, subidas, rebotes, inclinaciones ni elevación al pasar el cursor.
- Lo que sigue animado tiene una función. El anillo de la llamada entrante (uno solo y lento) indica que suena. Los tres puntos de «escribiendo…» indican que el asistente escribe. El resaltado breve de una fila indica que cambió.
- Con `prefers-reduced-motion` todo queda estático, incluida la onda, que se dibuja una sola vez por cada cambio de estado.
- La figura de la portada (100 cupos) es estática.

## Onda de voz (`VoiceWave`)

- Es el elemento de identidad y se mantiene, con las mismas props públicas.
- Tiene dos capas planas: una cinta translúcida y una línea nítida de 2 px. No tiene halo, brillo ni degradados.
- En reposo respira despacio, con un ciclo de unos 10 s.
- Su costo por cuadro es menor que el anterior:
  - dibuja 2 trazados por cuadro en vez de 4;
  - usa colores planos en caché en vez de degradados;
  - limita el DPR a 2;
  - no reserva memoria por cuadro una vez caliente;
  - dibuja a 30 fps en reposo y se detiene con la pestaña oculta.
