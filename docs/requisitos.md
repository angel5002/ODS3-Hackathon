# Requisitos del prototipo — v2 (2 de noviembre de 2026)

Prioridad: **Debe** (sin esto no hay demo) · **Debería** · **Podría**.
Ejecución: **E1** = núcleo (esta noche) · **E2** = agente de voz.

## Actores y pantallas

| Actor | Pantalla | Ruta sugerida | Dispositivo |
|---|---|---|---|
| Personal de admisión y citas | Panel de gestión | `/panel` | Laptop o proyector |
| Paciente con cita (ficticio) | Simulador de teléfono: mensajes y llamada | `/t/[token]` | Celular, vía QR |
| Paciente en lista de espera (ficticio) | El mismo simulador | `/t/[token]` | Otro celular |
| Jefatura | Tablero en vivo e histórico | `/tablero` | Laptop o proyector |
| Equipo (operador) | Controles de demo y códigos QR | `/demo` | Laptop |

## Estados de una cita

`pendiente` → `recordatorio_enviado` → `confirmada` | `liberada` | `sin_respuesta` → `en_llamada` → `confirmada` | `liberada` | `derivada_a_persona` ; `liberada` → `reasignada`

Toda transición queda en la bitácora (`eventos`): qué, cuándo (hora de demo y hora real), canal (`panel`, `mensaje`, `voz`, `sistema`) y actor.

## Requisitos funcionales

### M1. Datos y modelo (E1)

| ID | Requisito | Prior. |
|---|---|---|
| RF-01 | Cargar el dataset y excluir especialidades con ≥ 95 % de citas no atendidas | Debe |
| RF-02 | Entrenar el modelo con corte temporal (ene–sep / oct–dic 2023), historial solo con fechas anteriores; guardar métricas | Debe |
| RF-03 | Elegir un día real del periodo de prueba (volumen típico, 1,300–1,600 citas, no feriado) como "mañana"; calcular riesgo y nivel (Alto/Medio/Bajo, umbrales configurables) | Debe |
| RF-04 | Explicar cada riesgo en lenguaje simple con los 2–3 factores que más pesan | Debería |
| RF-05 | Ficha del modelo: AUC, precisión de la lista de llamadas vs. promedio, desempeño por grupo (seguro, edad, modalidad) | Debe |
| RF-06 | Pacientes ficticios (nombre, teléfono visiblemente falso, cuidador para menores) y lista de espera ficticia por especialidad (5–30 pacientes, días de espera según la distribución real), con semilla fija | Debe |
| RF-07 | Cargar en Supabase: citas del día de demo con riesgo y explicación, resultado real oculto, pacientes, lista de espera, métricas y estadísticas agregadas | Debe |

### M2. Panel de gestión (E1)

| ID | Requisito | Prior. |
|---|---|---|
| RF-08 | Lista de citas de mañana ordenada por riesgo, con filtros por especialidad, riesgo y estado, e indicadores arriba | Debe |
| RF-09 | "Lista de llamadas": 10 % de mayor riesgo (configurable) | Debe |
| RF-10 | Detalle de cita: datos, riesgo con explicación, bitácora en vivo, conversación de mensajes | Debe |
| RF-11 | Cambio manual de estado por el personal | Debe |

### M3. Mensajería simulada, sin API (E1)

| ID | Requisito | Prior. |
|---|---|---|
| RF-12 | Botón "Enviar recordatorios" a todas las citas de mañana; los mensajes llegan solo al simulador | Debe |
| RF-13 | Plantilla con botones: Confirmo · No podré asistir (libera el cupo) · Hablar con una persona | Debe |
| RF-14 | La respuesta en el simulador cambia el estado en todas las pantallas | Debe |
| RF-15 | Sin respuesta tras un plazo configurable en tiempo de demo → `sin_respuesta` y propuesta de llamada | Debería |
| RF-16 | Chat con aspecto de app de mensajería genérica, sin marca ni logo de WhatsApp | Debe |
| RF-17 | Simulación de respuestas del resto de pacientes (los que no tienen QR) con probabilidades basadas en su riesgo, para que el tablero se mueva de forma realista | Debería |

### M4. Agente de voz (E1 la estructura, E2 la IA)

| ID | Requisito | Prior. | Ejec. |
|---|---|---|---|
| RF-18 | Botón "Llamar" en el panel y escalamiento desde RF-15; el simulador muestra la llamada entrante | Debe | E1 |
| RF-19 | Agente simulado con guion fijo (sin IA) que permite completar el flujo: sirve de respaldo si falla internet | Debe | E1 |
| RF-20 | Conversación por voz en español con Gemini Live, conectada desde el navegador con token efímero | Debe | E2 |
| RF-21 | Al inicio, el agente dice que es un asistente automático del hospital y que puede pasar la llamada a una persona | Debe | E2 |
| RF-22 | Confirma que habla con el paciente o su cuidador antes de dar detalles; no pide DNI, pagos ni datos clínicos | Debe | E2 |
| RF-23 | Funciones del agente: `get_appointment`, `confirm_appointment`, `release_slot`, `request_reschedule`, `transfer_to_human`. Todas escriben por nuestra API | Debe | E2 |
| RF-24 | Ante preguntas clínicas, quejas o confusión, deriva a una persona | Debe | E2 |
| RF-25 | Transcripción y resumen de la llamada en la bitácora | Debería | E2 |
| RF-26 | Modo texto de respaldo con el mismo agente | Debe | E2 |
| RF-27 | Para citas pediátricas, el agente se dirige al cuidador | Podría | E2 |

### M5. Reasignación (E1)

| ID | Requisito | Prior. |
|---|---|---|
| RF-28 | Al liberarse un cupo, mostrar candidatos de la lista de espera de esa especialidad, ordenados por días de espera | Debe |
| RF-29 | El personal elige al candidato; nunca hay reasignación automática | Debe |
| RF-30 | La oferta llega al simulador del candidato con plazo y botones Acepto / No puedo | Debe |
| RF-31 | Si rechaza o vence el plazo, se propone al siguiente | Debería |
| RF-32 | Si acepta: cupo `reasignada`, nueva cita registrada y avisos en todas las pantallas | Debe |

### M6. Tiempo real y tablero (E1)

| ID | Requisito | Prior. |
|---|---|---|
| RF-33 | Todo cambio se refleja en todas las pantallas sin recargar (Supabase Realtime) | Debe |
| RF-34 | Avisos emergentes de cambios ("Rosa M. confirmó por mensaje") | Debería |
| RF-35 | Tablero en vivo: recordatorios, confirmadas, liberadas, sin respuesta, llamadas, reasignadas | Debe |
| RF-36 | Tablero histórico 2023: tasa por especialidad, edad, seguro y modalidad; ficha del modelo | Debería |
| RF-37 | "Ver qué pasó": revela el resultado real del día y cuántas no atendidas estaban en la lista de llamadas; escenario con supuestos editables, rotulado como escenario | Debería |

### M7. Control de demo (E1)

| ID | Requisito | Prior. |
|---|---|---|
| RF-38 | Página `/demo` con códigos QR de 4–6 pacientes preparados (con cita de alto riesgo, pediátrica con cuidador, en lista de espera) | Debe |
| RF-39 | Reloj de demo y botón para avanzar etapas | Debería |
| RF-40 | "Reiniciar demo" restaura el estado inicial en segundos | Debe |
| RF-41 | Acceso al panel, tablero y demo protegido con un PIN simple (la URL es pública) | Debe |

## Requisitos no funcionales

| ID | Categoría | Requisito |
|---|---|---|
| RNF-01 | Usabilidad | Español, sin jerga. Confirmar, liberar y reasignar en ≤ 3 clics. Probado con una persona ajena al equipo |
| RNF-02 | Usabilidad | Riesgo comunicado con texto además del color |
| RNF-03 | Rendimiento | Cambio visible en otras pantallas en ≤ 2 s; pantallas cargan en ≤ 3 s; panel fluido con 1,600 citas |
| RNF-04 | Rendimiento | Agente de voz: respuesta en ≤ 3 s por turno (E2) |
| RNF-05 | Conectividad | Requiere internet (Vercel, Supabase, Gemini). Respaldo: datos móviles compartidos y agente con guion fijo (RF-19) |
| RNF-06 | Seguridad | HTTPS (Vercel). Claves solo en el servidor. Token efímero de Gemini con vida corta y limitado al modelo y configuración. Escrituras solo desde el servidor |
| RNF-07 | Privacidad | Ningún dato personal real ni número real. Aviso visible de pacientes ficticios. Plan gratuito de Gemini aceptable solo porque los datos son ficticios; un piloto real exige plan de pago y acuerdo de tratamiento de datos |
| RNF-08 | Privacidad | El agente solo accede a la cita en curso (Ley 29733, datos de salud sensibles) |
| RNF-09 | Ética y normativa | Persona decide; agente se identifica como IA; derivación humana siempre disponible; riesgo alto = más apoyo. Alineado con Ley 31814 y DS 115-2025-PCM (texto oficial por verificar) |
| RNF-10 | Veracidad | Cifras de los datos o rotuladas como supuesto. Sin pérdidas en soles |
| RNF-11 | Reproducibilidad | `ml/` reproducible con un comando y semilla fija; app instalable con un comando; pruebas automáticas, incluida la prueba contra fuga de información futura |
| RNF-12 | Extensibilidad | Canales detrás de interfaces (`MessagingChannel`, `VoiceChannel`) |
| RNF-13 | Costo | Cero gasto en mensajería. Voz con plan gratuito de Gemini; si se agota, plan de pago con tope bajo (≈ US$ 0.023 por minuto de conversación) |
| RNF-14 | Portabilidad | Simulador funcional en Chrome (Android) y Safari (iPhone) |
| RNF-15 | Propiedad intelectual | Atribución ODC-BY del dataset; sin marcas de terceros |

## Fuera de alcance

Telefonía real y API de WhatsApp (fase 2 del proyecto) · integración con sistemas del hospital · reprogramación automática (solo se registra la solicitud) · quechua · modelos de voz locales (no hay GPU NVIDIA; NVIDIA PersonaPlex solo maneja inglés).

## Notas de datos

- **Resuelto:** según el diccionario oficial, `ATENDIDO` = "Asistencia del paciente a su cita médica: VINO, NO VINO". `ATENDIDO = NO` es una **inasistencia**. El `ID` es un identificador de paciente anonimizado.
- Las 19 especialidades excluidas (≥ 95 % de inasistencia) siguen considerándose un artefacto de registro: el diccionario no lo explica.
- Obstetricia (55.5 % de inasistencia) es sospechosa: se mantiene, pero se marca en el tablero histórico.
