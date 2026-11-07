# Pasos previos — Ejecución 4 (lo que solo ustedes pueden hacer)

Tiempo estimado: entre 60 y 90 minutos. Las partes marcadas con ⏱ se hacen **después** de que Claude Code despliegue, porque necesitan la URL final.

## 1. Repositorio y seguridad (10 min)

- [ ] **Repositorio privado:** *Settings > General > Danger Zone > Change visibility*. Ahora hay webhooks y prompts que no deben quedar expuestos.
- [ ] **Cambiar `DEMO_PIN`** por uno nuevo, en `.env.local` y en Vercel.
- [ ] Copiar en la raíz del repositorio:
  - `CLAUDE.md` (reemplaza al anterior);
  - `docs/requisitos_v4.md` y `docs/conversaciones.md`;
  - `insumos/AsistIA_Propuesta_Final_Algorritmia_v4.pdf`, `insumos/predicciones_test_sin_sexo.csv` e `insumos/reentrenar_sin_sexo.py`.
- [ ] Verificar que `.gitignore` excluye `.env.local` y el CSV original.

## 2. Twilio (20 min)

1. [ ] **Cuenta con saldo:** sin saldo, la cuenta queda en modo de prueba y antepone un aviso grabado a las llamadas. Con US$ 20 alcanza. Revisar en *Pricing* la tarifa por minuto de llamadas a celulares de Perú.
2. [ ] **Permisos geográficos de voz:** *Voice > Settings > Geo permissions* y habilitar **Perú**.
3. [ ] **Sandbox de WhatsApp:** *Messaging > Try it out > Send a WhatsApp message*.
   - Anotar el número del Sandbox y el **código de unión** (`join <dos-palabras>`).
   - Probar uniéndose desde un celular.
   - **Límites del Sandbox:**
     - cada persona debe unirse enviando el código;
     - la unión dura **3 días**;
     - solo se puede escribir libremente dentro de las **24 horas** siguientes a su último mensaje;
     - se envía como máximo **1 mensaje cada 3 segundos**.
4. [ ] **Número de voz:** comprar un número de Estados Unidos con capacidad de voz (*Phone Numbers > Buy a number*).
   - Si ya tienen un número peruano de Twilio, usar ese: además permite llamadas **entrantes**.
   - *Opcional:* registrar en *Verified Caller IDs* el chip peruano del equipo, para que las llamadas salientes muestren +51. Un número verificado solo sirve para llamadas salientes.
5. [ ] **Credenciales** (*Account*):
   - `Account SID` y `Auth Token`: el Auth Token valida la firma de los webhooks;
   - una **API key** (empieza con `SK`) y su secreto.

## 3. ElevenLabs (20 min)

1. [ ] **Plan Creator o superior.** Revisar los minutos de agente incluidos: el modelo de lenguaje y la telefonía se cobran aparte.
2. [ ] **Voz:** probar 4 o 5 voces en español latinoamericano con esta frase:
   > "Hola, le llama el asistente automático de citas, en una demostración. ¿Hablo con la señora Rosa Díaz?"

   Que voten dos personas. Copiar el **Voice ID** de la elegida.
3. [ ] **API key de ElevenLabs.** Claude Code crea los cuatro agentes con ella.
4. [ ] **Importar el número de Twilio:** *Agents > Phone Numbers*, con el SID y el secreto de la API key `SK`. Copiar el **ID del número importado**.
5. [ ] ⏱ **Webhook posterior a la llamada:** en la configuración de webhooks del espacio de trabajo, crear uno con la URL que indique Claude Code (`/api/voice/post-call`). Copiar su **secreto de firma**.

## 4. Anthropic (5 min)

- [ ] Crear una API key en console.anthropic.com y cargar saldo mínimo. La usa el bot de mensajería para entender respuestas libres.

## 5. Variables en `.env.local`

No se suben a GitHub. Luego se cargan en Vercel.

```
# Ya existentes: Supabase, Vercel, DEMO_PIN, GEMINI_API_KEY

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_API_KEY_SID=
TWILIO_API_KEY_SECRET=
TWILIO_WHATSAPP_FROM=whatsapp:+1XXXXXXXXXX     # número del Sandbox
TWILIO_SANDBOX_JOIN_CODE=join xxxx-xxxx
TWILIO_VOICE_NUMBER=                         # solo si tienen número con llamadas entrantes

# ElevenLabs
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_PHONE_NUMBER_ID=
ELEVENLABS_TOOL_SECRET=                      # cadena larga al azar
ELEVENLABS_WEBHOOK_SECRET=                   # ⏱ después del despliegue

# Anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-5-5

# Privacidad
PHONE_ENCRYPTION_KEY=                        # generar con: openssl rand -base64 32
DEMO_TEST_PHONE=+519XXXXXXXX                 # celular de un integrante que acepta pruebas
PUBLIC_BASE_URL=https://<dominio-en-vercel>
```

## 6. ⏱ Después del despliegue (10 min)

- [ ] **Consola del Sandbox de Twilio:**
  - *When a message comes in*: `https://<dominio>/api/channels/whatsapp/inbound` (POST);
  - *Status callback URL*: `https://<dominio>/api/channels/whatsapp/status`.
- [ ] **ElevenLabs:** pegar el secreto del webhook en `.env.local` y en Vercel, y volver a desplegar.
- [ ] **Prueba rápida:** desde el celular de `DEMO_TEST_PHONE`, enviar `join …`, luego "hola", responder ACEPTO y registrar una solicitud. Debe aparecer en `/regulador`.

## 7. Viernes en la sede

- [ ] Probar con la red de la sede y con el hotspot del equipo.
- [ ] **Una hora antes de la demo:** los celulares del equipo vinculados a personajes envían "hola" al Sandbox para abrir la ventana de 24 h. Si alguno se unió hace más de 3 días, debe volver a unirse.
- [ ] Llamada real a dos operadoras distintas: ¿se oye bien?, ¿qué número aparece?, ¿cuánto tarda en hablar el agente?
- [ ] Ensayar la demo completa dos veces, cronometrada, incluido el plan B de cada paso.
- [ ] Preparar el pedido de consentimiento en voz alta antes de que un jurado use su celular. Que siempre use un nombre ficticio.
- [ ] Imprimir el QR de `/pedir-cita` en una hoja, con los 3 pasos para unirse.
