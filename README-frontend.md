# Integración Frontend — WhatsApp Chat Backend

Guía para que el frontend (chat 1:1 y panel) se comunique con el backend. Mantiene todos los endpoints existentes y añade nuevas capacidades (modo bot, intención, ruteo, acciones por botones de plantillas).

## Base

- Base URL del backend: `https://whatsapp.respaldoschile.cl:3001`
- CORS: agrega tu origen en la variable `ALLOWED_ORIGINS` del backend (por coma):
  - Ej.: `ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,https://app.tu-frontend.com`

## Ciclo de sesión

1) Crear/obtener sesión de chat para un teléfono CL (E.164 sin '+', p. ej. `569XXXXXXXX`)

POST `/api/chat/session`

Request JSON:
```json
{ "phone": "+56912345678", "name": "Cliente Test" }
```

Response JSON:
```json
{
  "ok": true,
  "sessionId": 123,
  "token": "<token-sesion>",
  "photoUrl": null,
  "isBusiness": false,
  "businessName": null
}
```

Guarda `sessionId` y `token`. Se usan en todas las llamadas.

## Enviar mensajes

Texto — POST `/api/chat/send`
```json
{ "sessionId": 123, "token": "...", "text": "Hola!" }
```

Media — POST `/api/chat/send-media`

Opciones de fuente (elige una):
- `mediaId`: ID de media subido a Meta
- `link`: URL pública (se guardará como `storage_url`)
- multipart `file`: subir archivo (campo `file`)
- `dataUrl`: `data:<mime>;base64,<...>`
- `bytesB64` (+ `filename`, `mime`)

Campos:
```json
{
  "sessionId": 123,
  "token": "...",
  "type": "image|video|audio|document|sticker",
  "mediaId": "...",
  "link": "https://...",
  "dataUrl": "data:image/jpeg;base64,...",
  "bytesB64": "...",
  "filename": "foto.jpg",
  "mime": "image/jpeg",
  "caption": "Opcional"
}
```

Plantilla (HSM) — POST `/api/chat/send-template`
```json
{
  "sessionId": 123,
  "token": "...",
  "templateName": "mi_template",
  "languageCode": "es",
  "components": [ { "type": "body", "parameters": [ { "type": "text", "text": "param1" } ] } ]
}
```
Atajo (si no envías `components`):
```json
{ "bodyParams": ["param1","param2"], "headerText": "Titulo opcional" }
```

## Stream en tiempo real (SSE)

Suscríbete para recibir eventos de la sesión (mensajes entrantes, recibos, sugerencias IA, alertas, etc.).

GET `/api/chat/stream?sessionId=123&token=...`

Ejemplo (browser):
```js
const es = new EventSource(`${API}/api/chat/stream?sessionId=${sessionId}&token=${token}`);
es.onmessage = (ev) => {
  const data = JSON.parse(ev.data);
  // tipos: 'message' | 'receipt' | 'status' | 'ai_suggestion' | 'mode_changed' | 'agent_required' | ...
};
```

Eventos relevantes:
- `message` (entrante/saliente)
```json
{
  "type":"message",
  "direction":"in|out",
  "text":"Hola",
  "media": { "type":"image|audio|video|document|sticker|location|contacts|interactive", "id":"<meta_media_id>", "mime":"...", "caption":"...", "size": 123, "extra": { } },
  "dbId": 456,
  "at": 1710000000000
}
```
- `receipt` (estados WhatsApp): `sent|delivered|read|played`
```json
{ "type":"receipt", "msgId":"wamid...", "status":"read", "timestamp":1710000000000 }
```
- `ai_suggestion` (modo asistido):
```json
{ "type":"ai_suggestion", "suggestion":"Texto sugerido", "canEdit": true }
```
- `mode_changed` (cuando cambias el modo del bot):
```json
{ "type":"mode_changed", "mode":"manual|assisted|automatic", "at":1710000000000 }
```
- `agent_required` (intención detectada con baja confianza o política):
```json
{ "type":"agent_required", "intent":"consulta_pedido", "confidence":0.52, "at":1710000000000 }
```

## Bot: modos y control

Cambiar modo por sesión — POST `/api/chat/bot-mode`
```json
{ "sessionId":123, "token":"...", "mode":"manual|assisted|automatic" }
```

Activar/Desactivar bot por sesión — POST `/api/chat/bot-toggle`
```json
{ "sessionId":123, "token":"...", "enabled": true }
```

Sugerencia IA (sin enviar) — POST `/api/chat/get-ai-suggestion`
```json
{ "sessionId":123, "token":"...", "text":"Mensaje del cliente" }
```
Enviar respuesta (manual o con sugerencia) — POST `/api/chat/send-reply`
```json
{ "sessionId":123, "token":"...", "text":"Respuesta", "useAISuggestion": true }
```

Notas:
- En modo `assisted`, recibirás `ai_suggestion` por SSE; puedes mostrarla, editar y enviar con `send-reply`.
- En modo `automatic`, el backend contesta solo y emite `message` de salida por SSE.

## Descarga de media

Para mostrar media recibido, usa el proxy del backend con autorización a Meta:

GET `/api/chat/media?sessionId=123&token=...&mediaId=<meta_media_id>`

O bien si tienes el `messageId` local:

GET `/api/chat/media?sessionId=123&token=...&messageId=<db_message_id>`

Esto devuelve el binario con cabeceras correctas (`Content-Type` y cache de 1 día).

## Respuestas de botones de plantillas

Cuando el usuario responde a un botón/lista de una plantilla, el backend ejecuta la acción mapeada (si existe) y tú verás el efecto por SSE:
- Puede cambiar el modo (`mode_changed`),
- Enviar un texto (`message` saliente),
- Disparar un flujo (si está habilitado),
- O registrar vía webhook externo (`call_http`).

No necesitas invocar nada extra desde el frontend; sólo reacciona a los SSE.

## Salud y panel admin

- Health: `GET /api/health` → `{ ok: true }`
- Admin (protegido con Basic Auth si se configuran `ADMIN_USER`/`ADMIN_PASS`):
  - `GET /api/admin/intent-routes` | `POST /api/admin/intent-routes` | `DELETE /api/admin/intent-routes/:id`
  - `GET /api/admin/template-button-actions` | `POST /api/admin/template-button-actions` | `DELETE /api/admin/template-button-actions/:id`

Estos endpoints de admin generalmente no los usa el frontend del operador de chat, salvo un panel de configuración.

## Errores

Formato típico:
```json
{ "ok": false, "error": "mensaje_de_error" }
```

## Buenas prácticas en el frontend

- Reintentar conexión SSE si se cae (EventSource se reconecta solo; maneja estado visualmente).
- No compartas el `token` de sesión fuera del navegador; sólo úsalo desde el cliente para esa conversación.
- Sanitiza y trunca previsualizaciones de texto y captions.
- Para CORS/SSE, usa exactamente el origen configurado en `ALLOWED_ORIGINS`.

## Resumen de endpoints clave

- Sesión: `POST /api/chat/session`
- Envíos: `POST /api/chat/send`, `POST /api/chat/send-media`, `POST /api/chat/send-template`
- Historial: `GET /api/chat/history?sessionId&token&limit&beforeId`
- Stream SSE: `GET /api/chat/stream?sessionId&token`
- Media: `GET /api/chat/media?sessionId&token&mediaId|messageId`
- Bot: `POST /api/chat/bot-mode`, `POST /api/chat/bot-toggle`, `POST /api/chat/get-ai-suggestion`, `POST /api/chat/send-reply`
- Health: `GET /api/health`


