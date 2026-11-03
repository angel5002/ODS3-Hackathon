# Guion de demo (5 minutos)

URL: **https://ods3-hackathon.vercel.app** (use siempre este dominio: los demás piden inicio de sesión de Vercel y los QR no abrirían).

## Quién hace qué

| Integrante | Dispositivo | Pantalla | Papel |
|---|---|---|---|
| 1 | Laptop conectada al proyector | `/panel`, luego `/tablero` | Presenta y maneja el panel |
| 2 | Segunda laptop o pestaña | `/demo` | Operador: reloj de la demo y reinicio |
| 3 | Celular A y celular B | Teléfono 2 (Valeria, responde su madre Lucía) y Teléfono 3 (Carmen) | Pacientes que responden por mensaje |
| 4 | Celular C y celular D | Teléfono 1 (Rosa) y Teléfono 4 (Julio) | Paciente que recibe la llamada y paciente de la lista de espera |

Si son tres, el integrante 2 también lleva el celular D (Julio). El Teléfono 5 (Ana) es de respaldo: si Julio toca "No puedo", el panel propone a Ana.

## Antes de empezar (5 minutos antes)

1. En `/demo`, tocar **Reiniciar demo** y confirmar.
2. Cada celular escanea su QR en `/demo` y deja abierta la página. Debe decir "Todavía no hay mensajes".
3. Celular C (Rosa): volumen alto (el asistente habla en voz alta) y pantalla sin bloqueo automático.
4. En la laptop 1, abrir `/panel` con el PIN y comprobar que la hora de la demo dice 09:00 «detenido».
5. Respaldo de internet: tener listos datos móviles compartidos.

## Guion

| Tiempo | Quién | Clic por clic | Qué decir |
|---|---|---|---|
| 0:00–0:40 | 1 | `/tablero`, bajar a "Histórico 2023" | "En 2023, en el María Auxiliadora, 1 de cada 4 citas no se atendió: 106,100 citas, unas 347 por día, mientras otros hacían cola desde las 5 a. m." |
| 0:40–1:30 | 1 | `/panel`. Señalar el riesgo de la primera fila. Pestaña **Lista de llamadas**. Buscar "Rosa" y abrirla | "Estas son las 1,473 citas reales de un jueves de octubre de 2023, con pacientes ficticios. El modelo ordena por riesgo y explica por qué. En la prueba con octubre a diciembre, el 10 % de mayor riesgo tuvo 52 % de inasistencias frente a 27 % de promedio. Riesgo alto significa más apoyo, nunca perder la cita." |
| 1:30–2:10 | 1, 3 | **Enviar recordatorios a 1,473 citas**. Celular A (Valeria): **Confirmo**. Celular B (Carmen): **No podré asistir** | "El mensaje llega a todos a la vez. Miren el panel: cada respuesta aparece al instante." (Se ven los avisos "Valeria C. confirmó por mensaje" y "Carmen Q. liberó su cupo".) |
| 2:10–3:00 | 1, 4 | Pestaña **Cupos por reasignar** → Carmen → **Ofrecer cupo** (Julio, 40 días de espera). Celular D (Julio): **Acepto** | "El sistema propone; la persona decide. Julio esperaba hace 40 días. Acepta desde su celular y el cupo queda reasignado." |
| 3:00–3:50 | 2, 1, 4 | En `/demo`: **2. Cerrar el plazo de respuesta**. En `/panel`, pestaña **Sin respuesta** → fila de Rosa → **Llamar**. Celular C (Rosa): **Contestar** → **Sí, soy yo** → **Sí, asistiré** | "Rosa no respondió el mensaje. Llama el asistente automático: dice que es automático y que puede pasar con una persona. Hoy usa un guion fijo, que también es el respaldo si falla internet." |
| 3:50–4:40 | 1 | `/tablero`: indicadores en vivo. **Ver qué pasó** | "Ese día, de verdad, 414 citas no se atendieron y 80 de ellas estaban en nuestra lista de llamadas. Con supuestos editables (30 % avisa, 70 % se reasigna) serían unas 87 citas recuperadas al día." |
| 4:40–5:00 | 1 | — | "Una persona decide todo cambio. Los mensajes y la llamada están detrás de una interfaz: en un piloto se conectan a WhatsApp Business o a telefonía real sin rehacer el sistema." |

## Si algo falla

- Un celular no muestra el mensaje: recargar la página del celular (los datos están en la base, no se pierden).
- Rosa rechazó la llamada por error: en el panel, volver a tocar **Llamar**.
- Julio tocó **No puedo**: en el panel aparece **Ofrecer a esta persona** junto a Ana (Teléfono 5).
- Todo se desordenó: `/demo` → **Reiniciar demo** (tarda menos de 1 segundo) y volver a abrir los QR.
