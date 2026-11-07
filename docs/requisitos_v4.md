# AsistIA · Requisitos del prototipo, versión 4

> Fuente de verdad: `insumos/AsistIA_Propuesta_Final_Algorritmia_v4.pdf`. Este documento reemplaza a `AsistIA_Requerimientos_App.md` y a `docs/requisitos.md` en todo lo que los contradiga.
>
> Prioridades:
> - **P0:** sin esto, la demo no cumple lo que promete la propuesta.
> - **P1:** pruebas en vivo con chat web y voz.
> - **P2:** suma puntos, pero solo si P0 y P1 son estables.

---

## 1. Datos fijos de la demostración (P0)

Todo se siembra con semilla fija. "Reiniciar demo" deja todo exactamente así.

- **Hoy de la demo:** lunes 16/10/2023, 08:00, con reloj ×60 (ya existe).
- **Citas del día:** las 1,473 citas reales del jueves 19/10/2023. El riesgo sale de `predicciones_test_sin_sexo.csv`.

**Personajes:**

| Personaje | Datos | Papel |
|---|---|---|
| Rosa | Otorrinolaringología, riesgo alto | No responde y recibe la llamada del agente |
| Valeria | 1 año, Cirugía Pediátrica | Su madre confirma por ella |
| Carmen | Cardiología, jueves 19/10, 10:20 | Responde "No podré asistir": libera el cupo |
| Ana Gutiérrez | 64 años · Cardiología · P2 · primer intento hace 62 días · primera consulta · cita actual: jueves 09/11, 09:00 | Gana la oferta |
| Julio Gonzales | 59 años · Cardiología · P2 · hace 40 días · primera consulta · cita actual: jueves 23/11, 09:00 | Acepta primero, pero no gana |
| Luis Ramos | 52 años · Cardiología · P3 · hace 30 días · sin cita | Recibe el cupo liberado por efecto dominó |

**Candidatos simulados de Cardiología:**
- Zona cercana: dos pacientes P2 con índice menor que Julio. Uno declina y el otro no responde.
- Zona lejana: tres pacientes P3 o P4, con índice menor que Luis.

**Para la prueba en vivo del jurado** (sección 6):
- Dermatología y Oftalmología tienen 2 cupos libres cada una, en zona media (lunes 23/10) y en zona lejana (jueves 02/11).
- Sus listas de espera solo tienen pacientes P4.
- Así, una solicitud nueva clasificada como P2 o P3 recibe una oferta real en minutos.

**Índices esperados:**

| Paciente | Índice | Razón que se muestra |
|---|---|---|
| Ana | 0.77 | "P2 · 69 % de su plazo · primera consulta · adulta mayor" |
| Julio | 0.48 | "P2 · 44 % de su plazo · primera consulta" |
| Luis | 0.28 | "P3 · 17 % de su plazo · primera consulta" |

## 2. Modelo de datos (P0)

Hay que adaptar o crear las tablas siguientes con migraciones de Supabase, sin perder datos de las tablas que ya funcionan.

**Esquema `identity`.** El navegador no tiene acceso: ni el rol anónimo ni el autenticado.

| Tabla | Campos |
|---|---|
| `persons` | `id` (UUID opaco), `display_name` (ficticio), `birth_year`, `created_at` |
| `person_identifiers` | `person_id`, `type` (DNI, CE, pasaporte, otro, sin documento), `value_masked`, `verified` |
| `contact_points` | `person_id`, `channel` (webchat, voz_navegador, simulado), `chat_session_id`, `consent_at`, `expires_at`. **Sin números de teléfono** |
| `equity_attributes` | `person_id`, `insurance`, `district`, `origin_facility`, `sex` |

Este esquema solo se lee para auditar y para contactar.

**Esquema `public`** (operación):

| Tabla | Campos y reglas |
|---|---|
| `requests` | `id`, `code` (S-0001…), `person_id`, `specialty`, `modality`, `first_attempt_at`, `referral` (sí/no), `reason_text` (sin datos que identifiquen), `age`, `pregnant`, `disability`, `preferred_channel`, `short_notice_ok`, `current_appointment_id`, `category` (P1–P4 o null), `deadline_days`, `due_date`, `state`, `priority_index`, `priority_reason` |
| `request_events` | `request_id`, `type`, `at`, `actor` (persona, rol o agente), `payload` |
| `slots` | `id`, `specialty`, `starts_at`, `state` (libre, retenido, ocupado), `appointment_id` |
| `appointments` | Las citas, con sus estados actuales más `reprogramacion_pendiente` y `validacion_pendiente` |
| `offers` | `id`, `slot_id`, `zone`, `k`, `fill_probability`, `candidate_ids[]`, `approved_by`, `approved_at`, `sent_at`, `closes_at`, `state` (borrador, enviada, cerrada, sin_aceptantes) |
| `offer_responses` | `offer_id`, `request_id`, `response` (acepta, declina, sin_respuesta), `channel`, `at` |
| `assignments` | `slot_id`, `request_id`, `offer_id`, `rule`, `origin` (liberado, dominó, cupo_del_dia), `validation_state` (pendiente, confirmada, fallida, vencida), `validated_by` (mensaje, agente, persona), `reverted`, `revert_reason` |
| `withdrawals` | `request_id`, `reason`, `user`, `at` |
| `staff_tasks` | Cola del call center. `type` (pide_persona, derivacion_clinica, validacion_fallida, p1_no_contactable, alarma), `request_id` o `appointment_id`, `state`, `outcome`, `handled_by`, tiempos |
| `chat_sessions`, `conversations` y `messages` | Chat web en vivo. La sesión es anónima (alias ficticio), con un token firmado en una cookie `httpOnly`. RLS: cada sesión solo lee sus propios mensajes, a través del servidor |
| `calls` | Llamadas: canal, agente, estado, duración, resumen y acciones del agente |
| `params` | Los parámetros de la sección 4.6 de la propuesta, más `fill_target` = 0.60, `k_max` = 8, `validation_timeout_min`, `regulation_due_hours` = 72, `s` = 0, `c` = 0.3333 y `f` = 0.30 |

**Estados de una solicitud:**
- `registrada`
- `pendiente_regulacion`
- `pendiente_informacion`
- `priorizada_sin_cupo`
- `con_oferta`
- `en_espera_prioritaria`
- `asignada_por_validar`
- `con_cita`
- `atendida`
- `derivada_emergencia`
- `cerrada_con_causal`

**Fechas que se guardan como eventos** (sección 7 de la propuesta):
1. indicación original;
2. recepción;
3. pedido de información;
4. regulación;
5. fecha límite;
6. primera oferta;
7. confirmación;
8. atención;
9. cierre.

**Vista del regulador:** una vista `regulator_queue` y una RPC que devuelven solo:
- `request_id`;
- `code`;
- `specialty`;
- `reason_text` ya depurado;
- `age`;
- `pregnant`, solo si aplica;
- `referral`;
- `first_attempt_at`;
- `state`;
- `category`.

Hay una prueba automática que falla si la respuesta del regulador contiene alguna de estas claves o valores: `display_name`, `phone`, `insurance`, `district`, `identifier`.

## 3. Pantallas y roles (P0)

El acceso se hace con `DEMO_PIN` y un selector de rol. Los roles son Admisión, Regulador y Call center. El rol se guarda en una cookie firmada.

- **`/panel` (Admisión)**
  - Pestañas: Citas, Lista de espera, Por reasignar, Por validar y Tablero.
  - *Por validar* reúne las reprogramaciones y las asignaciones pendientes de validación.
- **`/regulador`**
  - Cola de "Pendientes de regulación", con el tiempo que lleva cada una frente al plazo de 72 h.
  - Por cada solicitud: botones P1 a P4, "Pedir más información" (la fecha no cambia) y "Signos de alarma: derivar a emergencia".
  - Un recuadro fijo explica: "No ves nombre, documento, seguro ni distrito para que la prioridad dependa solo de la necesidad clínica."
- **`/callcenter`**
  - Tareas humanas por tipo, cada una con un guion breve.
  - Botones de resultado: confirmó, rechazó, no contestó, pidió otra fecha.
  - Contador de "Carga del personal hoy".
- **`/demo` (operador)**
  - Lo que ya existe.
  - Una sección nueva, **"En vivo"**:
    - sesiones de chat activas (alias y código) y teléfonos simulados abiertos en celulares reales;
    - "Vincular a personaje" (Carmen, Julio, Ana, Rosa) o "Participante libre". Una sesión vinculada a Julio recibe sus mensajes y ofertas; el teléfono simulado de Rosa, abierto en el celular de un integrante, recibe su llamada;
    - botón de prueba de mensaje;
    - botón de prueba de llamada.
- **`/t/[token]`:** los teléfonos simulados, que ya existen.
- **`/pedir-cita`:** página pública y móvil, con tres opciones:
  1. **"Chatear con el asistente":** el chat web, con el bot de registro. El QR impreso lleva directo aquí.
  2. **"Hablar con el asistente":** llamada de voz en el navegador con ElevenLabs.
  3. **"Formulario":** el mismo formulario de ventanilla, como respaldo.
  - Sin logos de terceros.

## 4. Requisitos funcionales

### RF-01 · Registro de toda la demanda (P0)
- Formulario de ventanilla en Lista de espera ("Registrar solicitud", en menos de 20 segundos). Los campos son los de `requests`; el tipo de documento incluye "sin documento".
- Toda solicitud nueva entra como `pendiente_regulacion`, con categoría provisional P3 para ordenarla, y genera un código S-XXXX.

### RF-02 · Regulación con vista ciega (P0)
- Asignar la categoría fija el plazo y la fecha límite, recalcula el índice y mueve la solicitud a `priorizada_sin_cupo`.
- "Pedir información" la mueve a `pendiente_informacion` y envía un mensaje al paciente por su canal. La fecha del primer intento no cambia.
- "Derivar a emergencia" la mueve a `derivada_emergencia`, crea una tarea `alarma` en el call center y envía al paciente las instrucciones de emergencia.
- La vista ciega se implementa según la sección 2, con su prueba de no filtración.

### RF-03 · Índice de prioridad y lista ordenada (P0)
- Fórmula y razón en una línea, como en la sección 1.
- Orden: primero la categoría, luego el índice de mayor a menor.
- Columnas: código, especialidad, categoría, días esperados, % del plazo, primera consulta, grupo preferente, índice, razón, estado y canal.
- **El nombre solo lo ve Admisión.**

### RF-04 · Confirmación escalonada (P0)
- **72 h:** "Recordatorio 72 h antes" a todas las citas con mensajería. Las simuladas no cambian; las sesiones de chat vinculadas lo reciben en el chat.
- **Al vencer el plazo** (3 h), la lista de llamadas es:
  - quienes no usan mensajería;
  - más quienes no respondieron y están en el 10 % de mayor riesgo.
  - Con los datos de la demo: 147 citas de mayor riesgo, 79 inasistencias reales entre ellas.
- **48 h:** llamada del agente.
- **24 h:** último recordatorio.
- Ninguna cita cambia de estado por no responder.

### RF-05 · Zonas, cupos protegidos y aprobación (P0)

**Zonas** (límites editables):

| Zona | Días hasta el cupo | Categorías |
|---|---|---|
| Cercana | 2–3 | P1 y P2, más quienes pueden asistir con poco aviso |
| Media | 4–14 | P2 y P3 |
| Lejana | más de 14 | P3 y P4 |

- **Cupos protegidos:** un % de los cupos de los próximos 3 días se reserva para P1 y P2. Se libera a todos 24 h antes.
- **Por reasignar:** cada cupo muestra:
  - la zona;
  - los candidatos propuestos, con su índice y su razón;
  - k;
  - la probabilidad estimada de llenado.
- Botones: "Aprobar y enviar oferta" y "Aprobar todas". **Sin aprobación no sale nada.** Se registra quién aprobó y cuándo.

### RF-06 · Oferta simultánea y cálculo de k (P0)
- `a_j` = 0.10, o 0.25 si el paciente declaró que puede asistir con poco aviso.
- k es el menor número que logra `1 − ∏(1 − a_j) ≥ fill_target` (0.60), con un tope de 8 o de los candidatos disponibles, lo que sea menor.
- Se muestra la probabilidad calculada; por ejemplo: "45 % con 4 candidatos, todos los de la zona".
- **Ventana:** se envía entre 18:00 y 20:00 y dura 2 h. En la demo es configurable y más corta.
- **La oferta se cierra** cuando:
  - vence la ventana;
  - responden todos;
  - o alguien pulsa "Cerrar oferta".
- **Textos:**
  - quitar "si el primero no puede";
  - los teléfonos dicen: "Recibes la oferta junto con otros pacientes de la lista";
  - declinar: "Conservas tu lugar en la lista".

### RF-07 · Asignación al de mayor índice (P0)
- Al cerrar la oferta, gana el de mayor índice entre quienes aceptaron. La asignación queda `asignada_por_validar` y los demás aceptantes pasan a `en_espera_prioritaria`.
- Mensaje en el panel: *"Asignado a Ana G. (prioridad 0.77: P2, 69 % de su plazo) aunque Julio respondió primero (0.48)."*
- **Si nadie acepta:** se abre una nueva ronda en la zona siguiente. A 24 h, pasa a cupo del día (RF-11).
- **"Revertir"** exige un motivo y devuelve todo a su estado anterior.

### RF-08 · Validación con el paciente (P0 en simulado, P1 en vivo)
- **Por mensajería:** en la misma conversación, "Te asignamos el cupo… Responde SÍ para confirmarlo e indica si eres el paciente o su cuidador".
- **Por voz:** llamada en el navegador del agente `asistia-validacion` a quien no usa mensajería o eligió llamada. Entra como llamada entrante en su teléfono simulado o en su chat.
- **Al confirmar:**
  - el cupo pasa a `ocupado`;
  - se crea o mueve la cita;
  - la solicitud pasa a `con_cita`;
  - se dispara el efecto dominó (RF-09).
- **Si falla:** dos intentos del agente sin éxito crean una tarea `validacion_fallida` en el call center.
- **Si vence `validation_timeout_min`:** el cupo pasa al siguiente aceptante, en orden de índice.

### RF-09 · Efecto dominó (P0)
- Si el ganador tenía una cita más lejana, al validar se libera con el origen "dominó" y entra al mismo ciclo: zona, aprobación, oferta, asignación y validación.
- Solo se mueve a alguien hacia una fecha más temprana, y como máximo una vez por semana.
- **Cadena en la actividad reciente:** "Cupo 19/10 10:20 → Ana · su cita del 09/11 se liberó → ofrecida a 4 (zona lejana) → asignada a Luis (solicitud sin cita)".

### RF-10 · Reprogramación validada (P0, verificar si ya existe)
- El paciente elige entre 3 fechas libres y la elección queda `reprogramacion_pendiente`.
- Admisión aprueba o rechaza. El paciente conserva su antigüedad.

### RF-11 · Cupo del día (P2)
- A menos de 24 h, el cupo libre se ofrece a la demanda presencial registrada ese día (sembrar 2 solicitudes).

### RF-12 · Retiro solo con motivo (P0)
- Motivos: atendido en otro establecimiento, ya no lo necesita, duplicado u otro (con texto). **No existe "no respondió".**
- KPI de "Retiros sin atención", con sus motivos.

### RF-13 · Chat web en vivo (P1)
- **Interfaz:** `/pedir-cita` → "Chatear con el asistente". Es una pantalla de chat móvil, con burbujas, botones de respuesta rápida para las opciones numeradas y un indicador de "escribiendo…". Sin logos ni colores de terceros.
- **Sesión:**
  - al abrir el chat se crea una sesión anónima con un token firmado en una cookie `httpOnly`;
  - si se recarga la página, la conversación continúa;
  - no se pide teléfono ni correo.
- **Entrada:** `POST /api/chat/messages`. Valida la sesión, guarda el mensaje y lo pasa al enrutador.
- **Salida:** los mensajes del sistema (respuestas del bot, ofertas, validaciones y recordatorios) se insertan en `messages` y llegan al navegador por Realtime en menos de 2 s.
  - Si la pestaña está en segundo plano, se avisa con el título de la pestaña, un sonido corto y vibración, si el navegador lo permite.
  - Las notificaciones push (Web Push) son P2 y opcionales.
- **Consentimiento:** el primer mensaje del bot es el texto de `docs/conversaciones.md` §1. Hasta que la persona responda ACEPTO, solo se le contesta con ese texto.
- **Enrutador:** según el estado de la conversación, el mensaje va a una de cuatro rutas:
  1. el bot de registro (RF-14);
  2. la respuesta a una oferta (RF-06);
  3. la validación (RF-08);
  4. la confirmación de una cita vinculada a un personaje (RF-04).
- Palabras globales: "PERSONA", que crea una tarea `pide_persona`, y "SALIR", que borra la sesión y despide.
- **Límites contra abusos:** máximo 30 mensajes por sesión cada 10 minutos y 500 caracteres por mensaje. Hay un botón "Borrar mi conversación".

### RF-14 · Registro de una solicitud por chat con IA (P1)
- La máquina de estados es la de `docs/conversaciones.md` §2.
- **El modelo (Anthropic):**
  - solo convierte la respuesta libre al valor del paso actual (salida JSON validada con un esquema) y redacta la respuesta en 1 o 2 frases;
  - nunca decide el siguiente paso, la urgencia ni la especialidad sin confirmación del paciente.
- **Signos de alarma:** lista fija de preguntas sí/no. Además, si el motivo contiene palabras de alarma, se repregunta. Ante un "sí":
  - instrucciones de emergencia;
  - solicitud en estado `derivada_emergencia`;
  - tarea `alarma`.
- **Respaldo sin modelo:** si la API tarda más de 6 s o falla, el bot sigue con opciones numeradas y reconocimiento por palabras clave. La demo no puede depender del modelo.
- **Al terminar:**
  - crea la solicitud;
  - envía su código y el texto "No es una cita todavía: un profesional la revisará y te avisaremos por aquí";
  - la solicitud aparece en `/regulador` en menos de 2 s.

### RF-15 · Agentes de voz de ElevenLabs en el navegador (P1)
- **Cuatro agentes**, creados y actualizados por API con `npm run voice:sync`. Su configuración, sin secretos, se versiona en `voice/agents/*.json`. Los prompts están en `docs/conversaciones.md` §3.
  1. `asistia-confirmacion`
  2. `asistia-oferta`
  3. `asistia-validacion`
  4. `asistia-registro`
- **Herramientas del servidor:** `/api/voice/tools/[tool]`, con un secreto en el encabezado más un `callId` y un `token` que llegan como variables dinámicas. Cada agente solo puede usar las herramientas de su tarea. Cada respuesta tarda menos de 1 s y es un texto fácil de decir en voz alta.
- **"Llamada saliente" en el navegador:** cuando el sistema o el panel decide llamar a un paciente, crea una fila en `calls` con estado `sonando`. Por Realtime, el teléfono simulado o el chat de esa persona muestra la **pantalla de llamada entrante**:
  - pantalla completa, con nombre "Asistente de citas", tono de llamada y vibración (si el navegador lo permite), y botones **Contestar** y **Rechazar**;
  - al contestar, se pide el micrófono y se inicia la conversación con ElevenLabs (URL firmada y variables dinámicas de la llamada);
  - si nadie contesta en 30 s, queda como `no_contestó` y cuenta como un intento.
  - **Desbloqueo de audio:** los navegadores bloquean el sonido hasta que la persona toca la pantalla. El teléfono simulado y el chat muestran al abrirse un botón "Activar sonido y llamadas" que deja el audio y el micrófono listos.
  - Estados visibles en el panel: sonando, en curso, finalizada, no contestó, rechazada, falló.
- **Webhook posterior a la llamada:** valida la firma HMAC y guarda el resumen y las acciones en `calls`. La transcripción completa no se guarda.
- **Registro por voz en el navegador:** desde `/pedir-cita`, con una URL firmada que emite el servidor. La clave nunca llega al navegador.
- **Sin telefonía:** no se integra Twilio ni ningún proveedor telefónico. La interfaz `VoiceChannel` queda preparada para un `PhoneVoiceChannel` en el piloto.
- **Respaldo:**
  - si falla ElevenLabs (cuota, red o error), se usa Gemini Live en la misma pantalla de llamada;
  - si también falla Gemini, se usa el guion fijo.

### RF-16 · Call center y carga del personal (P0)
- Las tareas humanas se crean solo en estos casos:
  - el paciente pide una persona;
  - el agente deriva una duda clínica;
  - falla una validación;
  - un paciente P1 no es contactable;
  - hay una alarma.
- El tablero muestra las llamadas humanas del día y las derivaciones del agente.

### RF-17 · Tablero (P0)
- **Tarjetas de la propuesta (sección 13):**
  - personas registradas sin cupo;
  - % de solicitudes con atención;
  - mediana y percentil 90 de la espera;
  - % fuera de plazo;
  - cupos liberados que se llenan;
  - ofertas: enviadas, aceptadas y declinadas;
  - validaciones;
  - retiros sin atención;
  - carga del personal;
  - inasistencia.
- **Equidad:** participación de cada grupo en las ofertas y asignaciones frente a la lista, siempre dentro de la misma categoría. Los grupos son 60+, menores de 12 y sin seguro, y se leen de `equity_attributes` en el servidor. Si un grupo tiene menos de 5 personas, se muestra "Grupo pequeño".
- **Escenario `r ≈ s + c·f`:**
  - valores por defecto: s = 0, c = 1/3 y f = 0.30, que dan "r ≈ 10 % → unas 10,600 citas al año";
  - el anual se calcula como 106,100 × r;
  - línea de referencia: "El hospital obtiene beneficio desde 5.3 %".
  - **Eliminar el 26,604.**

### RF-18 · Exportación FHIR (P2)
- `GET /api/fhir/requests/[id]` devuelve un `Bundle` con:
  - `Patient` seudonimizado, con `meta.profile` del perfil PacientePe. La URL canónica se toma de https://dyaku.minsa.gob.pe/guides/;
  - `ServiceRequest`;
  - `Task` (regulación);
  - `Appointment`, si existe.
- Botón "Ver como FHIR" en el detalle de la solicitud.
- La pantalla y el informe dicen "FHIR R4 base; perfil peruano solo para Patient": la guía del MINSA no tiene perfiles de citas.

### RF-19 · Obstetricia (P2)
- En la tabla de citas, un ícono de información junto a Obstetricia: "Especialidad con 55.5 % de citas no atendidas en 2023; en verificación con el hospital."

## 5. Requisitos no funcionales

- Cada acción se refleja en el panel en menos de 2 s.
- El bot responde en menos de 5 s.
- El agente dice su primera frase en menos de 3 s.
- "Reiniciar demo":
  - deja todo como en la sección 1;
  - borra los teléfonos y conversaciones en vivo;
  - termina en menos de 10 s;
  - funciona 3 veces seguidas.
- Funciona con el hotspot del equipo. Cada canal en vivo tiene un respaldo simulado que se activa con un clic.
- Todas las cifras coinciden con la propuesta v4 (CLAUDE.md, "Reglas de datos").
- Se puede usar sin manual: cada estado tiene un texto claro y cada botón dice qué va a pasar antes de ejecutarlo.

## 6. Guion de la demostración en vivo (unos 5 minutos)

| Paso | Acción | Lo que se ve | Plan B |
|---|---|---|---|
| 0 | Antes de empezar: un integrante abre el chat web en su celular y en `/demo` se vincula su sesión a Julio. Otro integrante abre en su celular el teléfono simulado de Rosa y toca "Activar sonido y llamadas" | En vivo: una sesión de chat y el teléfono de Rosa listo | Teléfonos simulados |
| 1 | Un jurado escanea el QR de `/pedir-cita`, abre el chat, responde ACEPTO y pide una cita de Dermatología con un nombre ficticio | En `/regulador` aparece la solicitud S-00XX, sin alias ni datos de contacto | Formulario de `/pedir-cita` |
| 2 | El regulador la clasifica como P3 | La solicitud aparece en la Lista de espera, en su posición, con su razón | — |
| 3 | "Enviar recordatorios (72 h)". Carmen toca "No podré asistir" | Cupo libre en Por reasignar: "Zona cercana · P1–P2" | — |
| 4 | Cerrar el plazo. El celular de Rosa suena con la pantalla de llamada entrante; el integrante contesta en altavoz y conversa con el agente | Llamada en curso en el panel, con las acciones del agente en vivo | Gemini o el guion fijo |
| 5 | "Aprobar y enviar oferta". Julio (chat real en el celular de un integrante) acepta primero; Ana (simulada) acepta después. "Cerrar oferta" | Asignado a Ana, con el mensaje de prioridad. Julio queda en espera prioritaria y recibe el aviso en el chat | — |
| 6 | Validación de Ana en su teléfono simulado | Cita confirmada. Su cita del 09/11 se libera por efecto dominó, se aprueba y termina en Luis | — |
| 7 | En Dermatología hay un cupo libre en zona media; se aprueba la oferta | Al chat del jurado llega la oferta; toca "Acepto", luego "Sí, confirmo", y queda con cita | Simulado |
| 8 | Tablero | Cupos llenados, validaciones, equidad, carga del personal y escenario de r ≈ 10 % | — |

## 7. Pruebas obligatorias antes de congelar

**Automáticas:**
- [ ] Índice y orden (Ana 0.77 > Julio 0.48 aunque Julio responda primero).
- [ ] Zonas.
- [ ] Cálculo de k con probabilidad objetivo y tope.
- [ ] Asignación al de mayor índice.
- [ ] Validación vencida: pasa al siguiente aceptante.
- [ ] Efecto dominó: solo hacia adelante y una vez por semana.
- [ ] Retiro sin motivo: rechazado.
- [ ] Ninguna cita cambia por no responder.
- [ ] La vista del regulador no filtra identidad (sección 2).
- [ ] Una sesión de chat no puede leer ni escribir en otra (cookie ajena o alterada: 401).
- [ ] Herramienta de ElevenLabs sin secreto, con otro `callId` o con una llamada terminada: rechazada.
- [ ] Ningún número completo aparece en los registros: buscar con un patrón `+51\d{9}`.

**Punta a punta** con `webapp-testing`, contra producción: la tabla de la sección 6 con los canales simulados, y capturas de cada paso.

**En vivo**, desde dos celulares reales (Android y iPhone, si hay):
- [ ] Consentimiento en el chat.
- [ ] Registro completo por chat.
- [ ] Oferta y validación por chat.
- [ ] Llamada entrante en el navegador (confirmación, oferta y validación): suena, se contesta y el agente usa sus herramientas.
- [ ] Registro por voz en el navegador.
- [ ] Medir y anotar las latencias.

**Reinicio:** 3 veces seguidas. Luego, `tests/e2e/demo_flow.py`, el flujo anterior.
