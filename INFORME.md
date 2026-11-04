# Informe de la ejecución 1 (núcleo del prototipo)

Fecha: 2 de noviembre de 2026. Demo pública: https://ods3-hackathon.vercel.app

## Resumen

El núcleo funciona de punta a punta, en local y en producción:

- recordatorios a las 1,473 citas de mañana;
- respuestas desde los teléfonos simulados y respuestas simuladas del resto;
- cupo liberado, oferta a la lista de espera decidida por una persona, aceptación o rechazo;
- llamada del asistente con guion fijo;
- tablero en vivo con "Ver qué pasó";
- reinicio de la demo en menos de 1 segundo.

Cada cambio llega a las demás pantallas en 0.8 a 1.6 s (medido con navegadores reales).

## Requisitos

### Funcionales

| ID | Estado | Notas |
|---|---|---|
| RF-01 | Hecho | 19 especialidades excluidas; base limpia de 412,747 citas |
| RF-02 | Hecho | Entrenamiento ene–sep, prueba oct–dic; historial solo con fechas anteriores; prueba automática |
| RF-03 | Hecho | Día de demo: jueves 19 de octubre de 2023 (1,473 citas). Umbrales editables en `/demo` |
| RF-04 | Hecho | 2–3 factores por cita, en lenguaje simple, con flecha de sube o baja |
| RF-05 | Hecho | Ficha en `/tablero`: AUC, lista del 10 % vs. promedio, desempeño por seguro, edad y modalidad |
| RF-06 | Hecho | 1,825 pacientes ficticios, teléfonos `+51 000 …`, cuidador para menores; 433 personas en lista de espera (5–30 por especialidad), semilla fija |
| RF-07 | Hecho | `npm run db:load` (5 s). El resultado real está en una tabla que el navegador no puede leer |
| RF-08 | Hecho | Orden por riesgo, filtros por especialidad, riesgo y estado, búsqueda, indicadores que filtran |
| RF-09 | Hecho | Pestaña "Lista de llamadas" (10 % configurable) |
| RF-10 | Hecho | Detalle con datos, riesgo explicado, bitácora en vivo, conversación y última llamada |
| RF-11 | Hecho | "Cambiar el estado a mano" |
| RF-12 | Hecho | Un botón; los mensajes solo llegan al simulador |
| RF-13 | Hecho | Confirmo · No podré asistir · Hablar con una persona |
| RF-14 | Hecho | Llega a panel, tablero y celulares en ~1.3 s |
| RF-15 | Hecho, con matiz | Plazo configurable en tiempo de demo (180 min); pasa a "Sin respuesta" y el panel propone llamar (pestaña y botón **Llamar**). La llamada no sale sola: la inicia una persona con un clic |
| RF-16 | Hecho | Chat genérico, sin marcas ni logos de terceros |
| RF-17 | Hecho | Respuestas simuladas con probabilidades según el riesgo (supuestos visibles en `/demo`) |
| RF-18 | Hecho | Botón **Llamar** y llamada entrante a pantalla completa en el celular |
| RF-19 | Hecho | Agente con guion fijo que habla con la voz del navegador; usa las mismas funciones que usará la IA |
| RF-20 a RF-27 | Pendiente (ejecución 2) | Ver la última sección. Las funciones del agente de RF-23 ya existen en `/api/agent` |
| RF-28 | Hecho | Candidatos de la misma especialidad, de mayor a menor espera |
| RF-29 | Hecho | Nada se reasigna sin el clic de una persona (verificado en `tests/flow.test.mjs`) |
| RF-30 | Hecho | Oferta con plazo (45 min de demo) y botones Acepto / No puedo |
| RF-31 | Hecho | Si rechaza o vence, el panel resalta a la siguiente persona; el envío sigue siendo manual |
| RF-32 | Hecho | Cupo "Reasignada", nueva cita registrada, avisos en todas las pantallas |
| RF-33 | Hecho | Supabase Realtime (difusión desde la base; ver decisiones) |
| RF-34 | Hecho | Avisos con Sonner, generados desde la bitácora |
| RF-35 | Hecho | Recordatorios, confirmadas, liberadas, sin respuesta, llamadas y reasignadas |
| RF-36 | Hecho | Tasas por especialidad (Obstetricia marcada como dato dudoso), edad, seguro y modalidad; ficha del modelo |
| RF-37 | Hecho | Revela el resultado real y la cobertura de la lista. Incluye un escenario con supuestos editables, rotulado como escenario |
| RF-38 | Hecho | 5 pacientes preparados con QR |
| RF-39 | Hecho | Reloj de demo (60× real), «Adelantar 30 min» y «Cerrar el plazo de respuesta» |
| RF-40 | Hecho | Reinicio en ~0.2 s en la base y ~0.4 s desde la pantalla |
| RF-41 | Hecho | PIN para `/panel`, `/tablero`, `/demo` y la API del personal |

### No funcionales

| ID | Estado | Notas |
|---|---|---|
| RNF-01 | Parcial | Confirmar y liberar: 1 toque en el celular. Reasignar: 2 clics. **Falta probarlo con una persona ajena al equipo** |
| RNF-02 | Hecho | Riesgo siempre con texto (Alto, Medio, Bajo) y porcentaje; los estados también llevan texto |
| RNF-03 | Hecho | Ver cifras abajo. El panel con 1,473 filas usa `content-visibility` en lugar de virtualización y respondió fluido |
| RNF-04 | Ejecución 2 | — |
| RNF-05 | Hecho | El guion fijo no depende de Gemini; sí depende de internet (Supabase y Vercel) |
| RNF-06 | Hecho | HTTPS; clave secreta solo en el servidor; el navegador no puede escribir ni ejecutar funciones |
| RNF-07, RNF-08, RNF-09, RNF-10 | Hecho | El agente solo ve la cita de la llamada en curso (`/api/agent` valida token y llamada) |
| RNF-11 | Hecho | `npm run ml` con semilla fija y pruebas automáticas, incluida la de fuga de información futura |
| RNF-12 | Hecho | `MessagingChannel`, `VoiceChannel` y `VoiceAgent` |
| RNF-13 | Hecho | Costo cero |
| RNF-14 | Parcial | Probado en Chromium en tamaño de celular. **Falta probar en un iPhone (Safari) y un Android reales** |
| RNF-15 | Hecho | Atribución ODC-BY en el pie de todas las pantallas y en el README |

## Cifras obtenidas

| Cifra | Valor | Referencia |
|---|---|---|
| Filas originales | 450,629 | — |
| Base limpia | 412,747 citas, 93,657 pacientes | 412,747 / 93,657 |
| No atendidas | 106,100 (25.7 %), unas 347 por día (306 días de atención) | 25.7 % |
| AUC en prueba (oct–dic) | 0.655 | ≈ 0.655 |
| Lista diaria del 10 % | 52 % no atendidas frente a 27 % de promedio; cubre el 19 % de las inasistencias del día | ≈ 52 % / 27 % |
| Umbrales por defecto | Alto ≥ 41 % (10 % superior), Medio ≥ 27 % (35 % siguiente) | — |
| Día de demo, resultado real | 414 de 1,473 no atendidas (28.1 %); 80 de las 147 citas de la lista de llamadas no se atendieron (54 %) | — |

### Latencias medidas

En local, con Playwright y navegadores separados para el personal y los teléfonos:

| Acción | Latencia |
|---|---|
| Recordatorio visible en el celular (incluye escribir 1,473 citas) | 1.6 s |
| Confirmación visible en el panel | 1.3 s |
| Cupo liberado visible en el panel | 1.1 s |
| Oferta visible en el celular del candidato | 0.9 s |
| Reasignación visible en el panel | 0.8 s |
| Llamada entrante en el celular | 1.2 s |
| Reinicio | 0.4 s |

En producción (`tests/e2e/prod_check.py`):

| Acción | Latencia |
|---|---|
| Recordatorio en el celular | 1.3 s |
| Liberación registrada | 0.7 s |
| Oferta en el celular | 1.1 s |
| Reasignación registrada | 0.8 s |

## Día de demo y pacientes preparados

El día de demo es el **jueves 19 de octubre de 2023**. Se elige con una regla fija:

- día hábil de martes a viernes del periodo de prueba;
- sin feriados;
- entre 1,300 y 1,600 citas;
- tasa de inasistencia a no más de 3 puntos del promedio;
- el más cercano a la mediana de volumen.

El modelo que lo evalúa se entrenó con citas hasta el 30 de septiembre de 2023. El pipeline lo verifica y una prueba automática también.

Los QR están en `/demo` y cada uno lleva a `https://ods3-hackathon.vercel.app/t/<token>`. Cada paciente con cita tiene una sola cita ese día, para no confundir en el escenario.

| Teléfono | Paciente (ficticio) | Papel | Cita o lista | Enlace |
|---|---|---|---|---|
| 1 | Rosa Díaz Ortiz, 46 años | Riesgo alto: no responde el mensaje y recibe la llamada | Otorrinolaringología, 07:00, riesgo 75 % | `/t/rosa` |
| 2 | Valeria Cáceres Espinoza, 1 año (responde su madre, Lucía) | Cita pediátrica: confirma | Cirugía Pediátrica, 10:20, riesgo 54 % | `/t/valeria` |
| 3 | Carmen Quispe Rodríguez, 34 años | Avisa que no irá y libera su cupo | Cardiología, 10:20, riesgo 15 % | `/t/carmen` |
| 4 | Julio Gonzales López, 59 años | Primero en la lista de espera de Cardiología: acepta | 40 días de espera | `/t/julio` |
| 5 | Ana Gutiérrez Silva, 64 años | Segunda en la lista: respaldo si Julio no puede | 39 días de espera | `/t/ana` |

## Decisiones tomadas por mi cuenta

1. **Tiempo real con avisos de difusión, no con cambios de tabla.** "Enviar recordatorios" modifica 1,473 citas a la vez. Con la suscripción a cambios de tabla, cada pantalla recibiría miles de mensajes y superaría el límite del plan gratuito. Por eso cada función de la base emite un solo aviso pequeño con `realtime.send` en el tema `demo`, y cada pantalla vuelve a leer lo que muestra. Sigue siendo Supabase Realtime y la base sigue siendo la única fuente de verdad. Un aviso falso enviado por alguien solo provoca una relectura.
2. **Escrituras como funciones de Postgres.** Las rutas del servidor llaman a funciones con la clave secreta, por ejemplo `send_reminders`, `patient_reply`, `make_offer`, `answer_offer`, `start_call`, `demo_tick` y `reset_demo`. Así cada transición es atómica y queda en la bitácora. El navegador no puede ejecutarlas (verificado).
3. **Next.js 16.4 con `cacheComponents` desactivado:** todas las pantallas son dinámicas y en vivo.
4. **Claves nuevas de Supabase.** Las variables `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` contienen las claves publicable y secreta (`sb_publishable_…`, `sb_secret_…`).
5. **Horas de las citas inventadas.** El dataset solo trae la fecha. Se asignaron turnos de 20 minutos por especialidad (07:00–18:40, con almuerzo de 13:00 a 14:00).
6. **Explicaciones por oclusión.** Se mide cuánto cambia el riesgo si un factor toma un valor típico. Los textos son hechos verificables ("Faltó a 3 de sus 15 citas anteriores") y la flecha indica si el factor sube o baja la estimación. El sexo se usa en el modelo de referencia, pero **nunca se muestra como explicación**.
7. **Reloj de la demo.** Avanza 60 veces más rápido que el real y arranca al enviar los recordatorios. Cualquier pantalla del personal abierta aplica cada 3 s lo que corresponde: respuestas simuladas, "sin respuesta" y ofertas vencidas.
8. **Llamadas a pacientes sin QR.** Si el personal llama a alguien que no tiene teléfono abierto, después de 15 s se simula su respuesta según el mismo supuesto de RF-17, para que la llamada no quede sonando para siempre.
9. **PIN.** Se guarda una cookie con un hash del PIN. Protege las pantallas y la API del personal, pero los datos ficticios se pueden leer con la clave publicable, que es pública por diseño. En un piloto real se usaría Supabase Auth con políticas por rol.
10. **Librerías de UI mínimas:** Sonner (avisos), lucide-react (íconos) y qrcode (QR generados en el servidor). La skill `pick-ui-library` solo la puede ejecutar una persona, así que no pude usarla.
11. **Pruebas con un PIN local de prueba.** El PIN real no lo vi ni lo usé. El servidor de desarrollo local corre con un PIN de prueba propio, definido en `.claude/launch.json` (excluido de git). Por eso **las pantallas del personal en producción no las probé con PIN**. `prod_check.py` cubre producción con los teléfonos reales y las acciones del personal hechas directo en la base.
12. **Proyectos existentes.** Se usaron los proyectos que ya existían en Supabase (`ODS3-Hackathon`, región us-east-1) y Vercel (`ods3-hackathon`). El dominio público es `ods3-hackathon.vercel.app`; los otros dominios del proyecto están protegidos por inicio de sesión de Vercel.
13. **`break-ui` sin interruptor.** No armé el interruptor de "datos extremos". Revisé el código con los límites conocidos de los datos generados y corregí los plurales ("1 día", "1 año", "1 cita").

## Problemas encontrados en los datos

- **Obstetricia:** 55 % de inasistencia y pacientes de 61 a 71 años encabezan la lista de riesgo del día de demo. Es casi seguro un problema de registro. Se mantiene, como dice `CLAUDE.md`, con una advertencia en el detalle de la cita y en el tablero histórico. El guion de demo no la usa.
- **Pacientes con varias citas el mismo día y la misma especialidad.** Por ejemplo, dos citas de Cardiología a las 07:40 y a las 10:20. Los pacientes preparados se eligieron con una sola cita.
- **Sin horas:** solo hay fecha (ver decisión 5).
- **`MONTO` no se usa.** Tampoco se muestran soles.
- **Diccionario:** se usaron los nombres del CSV (`DIA_SOLICITACITA`; `ATENDIDO` SI/NO).
- **Equidad (dato útil para el jurado de responsabilidad social).** La lista de llamadas concentra más apoyo en algunos grupos:

  | Grupo | Parte de las citas | Parte de la lista de llamadas |
  |---|---|---|
  | Sin seguro | 16 % | 34 % |
  | Niños de 0 a 11 años | 10 % | 19 % |
  | Mayores de 60 | 35 % | 11 % |

  El AUC por grupo va de 0.59 (niños) a 0.66. Como el riesgo solo sirve para dar más apoyo, esto es coherente, pero conviene decirlo.

## Qué conviene probar antes de la final

1. En un **iPhone con Safari y en un Android con Chrome reales**: escanear los QR, recibir la llamada y oír la voz (Safari solo habla después de tocar **Contestar**; la vibración solo existe en Android).
2. Ejecutar la prueba de punta a punta contra producción con el PIN real:
   `ml/.venv/Scripts/python tests/e2e/demo_flow.py --base https://ods3-hackathon.vercel.app --pin <PIN>`
3. Que una persona ajena al equipo use el panel sin explicación (RNF-01).
4. **Cambiar `DEMO_PIN`.** El actual coincide con un valor de ejemplo muy común. Hay que cambiarlo en `.env.local` y en Vercel.
5. ~~Definir el nombre del producto~~ Hecho: **AsistIA**, con el logo aprobado (`video/insumos/logo-asistia.svg`), en `.env.local` y en Vercel.
6. Probar el internet del local y tener datos móviles de respaldo.
7. Detalle menor: Playwright mostró una advertencia de hidratación al entrar a `/demo` justo después del PIN. No se reproduce en un navegador normal ni afecta el funcionamiento.

## Correcciones posteriores (3 de noviembre)

- **El PIN se quedaba en "Verificando…".** Al entrar a una pantalla protegida, Next.js guardaba en su caché la redirección a `/acceso`. Después de validar el PIN, la navegación interna reutilizaba esa redirección. Ahora se hace una navegación completa. Se reprodujo antes del arreglo y se verificó después. Quedó como paso 0 de `tests/e2e/demo_flow.py`.
- **Menos carga durante la demo.** Ante un aviso general (respuestas simuladas cada 3 s), el panel pedía otra vez las 1,473 citas. Ahora pide solo las que cambiaron (`updated_at`). "Reiniciar demo" emite un aviso `full` para recargar todo (migración `20261103043000_reset_notifies_full.sql`). Las recargas no se encadenan: hay como máximo una en curso y una pendiente.
- **Avisos más robustos.** Después de las acciones masivas (recordatorios, adelantar el reloj, reiniciar), el servidor también envía el aviso por la API de difusión de Realtime. El aviso que sale desde la base viaja con miles de filas y a veces llega tarde. Como red de seguridad, cada pantalla consulta cada 2 s un número de versión de la demo.
- **Latencia en la prueba automática.** Contra el servidor de desarrollo (`npm run dev`), el primer paso tardaba entre 8 y 10 s, porque React en modo desarrollo es mucho más lento al dibujar 1,473 filas. Contra una versión de producción local (`next build` + `next start`), que es lo que corre en Vercel, la prueba completa pasa con todos los pasos por debajo de 1.5 s. La prueba de punta a punta debe correrse contra producción.
- Se ocultó el indicador de desarrollo de Next.js para que las capturas en local se vean como en producción.

## Rediseño visual (3 de noviembre)

- **Landing nueva en `/`:** primero el problema (una agenda de 100 cupos animada donde 26 quedan vacíos y algunos se recuperan como escenario) y luego la propuesta en cuatro pasos, la evidencia del modelo, los principios y un cierre. Todas las cifras se leen de los datos.
- **Cabecera:** ya no queda fija ni muestra el reloj de la demo. Los avisos de pacientes ficticios y la atribución pasan a un pie oscuro, con enlaces y créditos.
- **Panel:** el detalle no ocupa espacio hasta que se elige una cita. Entra deslizándose desde la derecha (en celular, como hoja inferior) y la lista se encoge con suavidad; se cierra con la X, con Esc o tocando fuera en celular.
- **Indicadores:** fichas con ícono y color por estado, y números que se animan al cambiar.
- **Menos texto:** pestañas más cortas, sin párrafos explicativos. El reloj de la demo queda como un chip junto al título.
- **Estilo común:** el tablero, la demo y el acceso usan la misma tipografía de titulares (Bricolage Grotesque) y las mismas tarjetas.

## Scroll trabado (3 de noviembre)

Se midió con Playwright: tiempo de cada cuadro durante el scroll, con la CPU 6 veces más lenta para simular un celular de gama media.

| Pantalla | Cuadros de más de 50 ms (antes) | Cuadros de más de 50 ms (después) |
|---|---|---|
| Panel en escritorio | 59 | 2 |
| Panel en celular | 48 | 0 |
| Landing durante la animación | 10 | 4 |

Correcciones:
- **Panel:** muestra las primeras 80 citas por riesgo y agrega 80 más al llegar al final. Antes dibujaba las 1,473 de una vez y las recorría en cada actualización en vivo. Además, sin transición de color al pasar el mouse por las filas.
- **Landing, agenda animada:** anima 10 filas en lugar de 100 cuadritos y solo usa opacidad y escala, que resuelve la GPU sin redibujar.
- **Landing, brillo de la portada:** degradado radial en lugar de un `blur` de 64 px.
- **Enlaces a pantallas con PIN:** sin precarga (`prefetch={false}`). Antes, al aparecer en pantalla, descargaban rutas que solo redirigen al acceso, justo durante el scroll.

## Lo que necesita la ejecución 2 (voz con IA)

1. **Implementación nueva:** `GeminiLiveVoiceAgent implements VoiceAgent` en `src/lib/voice/`. El contrato ya existe en `src/lib/voice/agent.ts`: `start`, `choose`, `hangUp`, `transcript` y los callbacks `onTurn`, `onOptions`, `onEnd`.
2. **Enchufe:** en `src/components/phone/CallScreen.tsx` hoy se crea `new ScriptedVoiceAgent(...)`. Hay que cambiarlo por una fábrica que intente Gemini y vuelva al guion fijo si falla (RNF-05).
3. **Token efímero:** crear una ruta, por ejemplo `/api/voice/token`. Debe validar `token` y `callId` igual que `/api/agent`, emitir un token de vida corta limitado al modelo (`gemini-3.8-live`, respaldo `gemini-3.1-flash-live-preview`) y usar `GEMINI_API_KEY` solo en el servidor. Hay que cargar esa variable en Vercel.
4. **Funciones del agente (RF-23):** ya existen. Se llaman con `callTool(ctx, nombre)` y llegan a `/api/agent`: `get_appointment`, `confirm_appointment`, `release_slot`, `request_reschedule` y `transfer_to_human`. Solo actúan sobre la cita de la llamada en curso y quedan en la bitácora con canal "voz".
5. **Contexto para el prompt:** `get_appointment` ya devuelve el nombre del paciente, la edad y el cuidador (RF-22 y RF-27).
6. **Transcripción y resumen (RF-25):** `update_call` ya guarda `transcript` y `result`, y el panel ya los muestra en "Última llamada". Al terminar, la IA solo tiene que enviarlos.
7. **Modo texto (RF-26):** reutilizar la misma pantalla de llamada, con la conversación escrita y un campo de texto.
8. **Tipo de agente:** la tabla `calls` tiene la columna `agent` (hoy siempre `guion`). Conviene grabar `ia` para distinguir en el tablero.
