# Prompt — Ejecución 4: AsistIA completo, con chat web y voz en vivo

> Copia todo lo que está debajo de la línea y pégalo en Claude Code, abierto en la raíz del repositorio.
> Antes de pegarlo:
> - completa `PASOS_PREVIOS_E4.md`;
> - copia en el repositorio `CLAUDE.md` (reemplaza al anterior), `docs/requisitos_v4.md`, `docs/conversaciones.md` y la carpeta `insumos/` de este kit.

---

Vas a llevar el prototipo de AsistIA a la versión que describe la propuesta final. La presentación es el sábado. Trabaja de forma autónoma, por hitos, y haz un commit al cerrar cada uno.

## Lee primero, en este orden

1. `CLAUDE.md`: las reglas de producto, privacidad y datos. No son negociables.
2. `insumos/AsistIA_Propuesta_Final_Algorritmia_v4.pdf`, sobre todo las secciones 3, 4, 5, 7 y 13.
3. `docs/requisitos_v4.md`: qué construir, los datos fijos, el guion y las pruebas.
4. `docs/conversaciones.md`: los textos y prompts exactos del bot y de los agentes.
5. `INFORME.md`, `DEMO.md`, `INFORME_E3.md` (si existe) y el código actual: para saber qué ya funciona.

## Hito 0 · Auditoría y seguridad (antes de tocar nada)

- Revisa `git status` y la rama. Si hay cambios sin subir, haz commit y push.
- Escribe en `INFORME_E4.md` una tabla con cada requisito de `requisitos_v4.md` y su estado: hecho, parcial o falta, con evidencia (archivo o pantalla).
  - Revisa en particular lo que el equipo pudo haber avanzado de la especificación anterior (RF-01 a RF-07), de ElevenLabs y de la reprogramación.
- **No reescribas lo que funciona: adáptalo.** Las implementaciones de Gemini y del guion fijo se quedan como respaldo.
- **Verifica en la documentación oficial vigente, sin suponer nada**, y anota las URL en `INFORME_E4.md`:
  - ElevenLabs Agents: creación por API, herramientas de servidor, variables dinámicas, webhook posterior a la llamada con su firma, URL firmada y SDK de React para conversaciones en el navegador, y agentes privados con autenticación;
  - Anthropic Messages, con salidas estructuradas o herramientas;
  - la duración máxima de las funciones de Vercel en el plan del equipo.
- Comprueba que existen las variables de `.env.example` que necesitas. Si falta una de canales en vivo, construye igual con el canal simulado y anota qué falta. **Nunca inventes credenciales.**

## Hitos de construcción

Sigue este orden. No pases a una prioridad P1 si alguna P0 no está estable y probada.

| Hito | Contenido | Requisitos |
|---|---|---|
| 1 | Modelo de datos v4: esquema `identity` separado, solicitudes con estados y eventos, ofertas, asignaciones y validaciones, tareas, retiros, parámetros. Datos fijos de la sección 1 y "Reiniciar demo". Cargar `predicciones_test_sin_sexo.csv` (79 de 147) | §1, §2 |
| 2 | Lista de espera, registro en ventanilla, índice y razón, retiros con motivo | RF-01, RF-03, RF-12 |
| 3 | `/regulador` con vista ciega en el servidor, más la prueba de no filtración | RF-02 |
| 4 | Reasignación completa: zonas, cupos protegidos, aprobación, cálculo de k, oferta simultánea, asignación al de mayor índice, validación, efecto dominó y revertir | RF-05 a RF-09 |
| 5 | Confirmación escalonada (72, 48 y 24 h) y reprogramación validada | RF-04, RF-10 |
| 6 | `/callcenter`, carga del personal y tablero v4 con el escenario `r ≈ s + c·f` | RF-16, RF-17 |
| **Congelamiento P0** | Prueba de punta a punta del guion de la sección 6 con canales simulados, despliegue y etiqueta `v4-p0` | §7 |
| 7 | Capa de canales: `MessagingChannel` y `VoiceChannel` con su enrutador; `/demo` → "En vivo"; consentimiento; teléfonos cifrados | RF-13 |
| 8 | Chat web en vivo: sesiones anónimas, mensajes por Realtime, respuestas rápidas, ofertas y validación en el chat | RF-13, RF-06, RF-08 |
| 9 | Bot de registro en el chat: máquina de estados, modelo de Anthropic con respaldo sin modelo, signos de alarma | RF-14 |
| 10 | ElevenLabs en el navegador: cuatro agentes con `npm run voice:sync`, herramientas, pantalla de llamada entrante con tono y desbloqueo de audio, llamadas de confirmación, oferta y validación, registro por voz en `/pedir-cita` y respaldos | RF-15 |
| 11 | `/pedir-cita` pública y móvil | §3 |
| **Congelamiento P1** | Pruebas en vivo desde dos celulares reales (chat y llamadas en el navegador) y etiqueta `v4-p1` | §7 |
| 12 | Si sobra tiempo: exportación FHIR, cupo del día, nota de Obstetricia y revisión con `break-ui` | RF-18, RF-11, RF-19 |

## Decisiones de diseño que debes respetar

- **El bot y los agentes no deciden el flujo.**
  - Una máquina de estados en el servidor controla los pasos.
  - El modelo solo interpreta la respuesta del paso actual y redacta.
  - Las herramientas de voz validan todo en el servidor y reutilizan las mismas funciones que el panel. No dupliques reglas.
- **Toda transición importante es una función de Postgres atómica**, con su evento y su aviso por Realtime: aprobar oferta, cerrar oferta, asignar, validar, dominó, revertir, regular y retirar. Así el panel, los teléfonos simulados y los canales reales ven lo mismo.
- **Las 1,473 citas se simulan siempre.** Los canales reales solo atienden a participantes con consentimiento vinculados a un personaje o a una solicitud propia.
- **Respaldo instantáneo:** cada acción en vivo tiene en el panel un botón "Usar simulado" que continúa el mismo flujo sin el canal real.
- **Idempotencia:** los webhooks pueden repetirse. Una respuesta a una oferta o una validación repetida no duplica nada.

## Lo que no debes hacer

- Escribir o llamar a números sin consentimiento, o guardar o mostrar números completos.
- Que la IA asigne una categoría, sugiera un diagnóstico o deduzca la especialidad a partir de síntomas.
- Que algo cambie una cita sin la respuesta del paciente, o una asignación sin la aprobación de los candidatos.
- Que el regulador pueda obtener la identidad por cualquier vía: API, Realtime, descargas o mensajes de error.
- Integrar WhatsApp, Twilio u otro servicio de mensajería o telefonía, o pedir números de teléfono.
- Usar logos o marcas de terceros en la interfaz.
- Subir secretos, el CSV original o `.env.local`.
- Romper el flujo anterior: al final, `tests/e2e/demo_flow.py` debe pasar.

## Entregables finales

1. **Despliegue en Vercel** con todas las variables de servidor cargadas.
   - Los webhooks de voz quedan en `https://<dominio>/api/voice/tools/[tool]` y `/api/voice/post-call`.
   - Dile al equipo exactamente qué pegar en ElevenLabs (URL del webhook posterior a la llamada).
2. **`INFORME_E4.md`**, con:
   - la tabla de requisitos con su estado final;
   - las URL de la documentación consultada;
   - las latencias medidas;
   - el costo estimado por minuto y por mensaje;
   - los problemas y decisiones;
   - lo que falta.
3. **`GUIA_DE_USO.md`**, para alguien que nunca vio el sistema, con capturas:
   - cada pantalla y rol;
   - cómo preparar la demo (reiniciar, abrir los teléfonos simulados en celulares reales, activar sonido, vincular sesiones);
   - cómo hacer cada prueba en vivo;
   - qué hacer si falla cada canal;
   - cómo cambiar un prompt o una voz y volver a sincronizar.
4. **`DEMO.md`** actualizado con el guion de 5 minutos de `requisitos_v4.md` §6, con el plan B de cada paso.
5. **`.env.example`** actualizado, sin valores.
