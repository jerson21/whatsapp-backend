# 📝 Changelog - Sistema Multicanal

## Versión 2.0.0 - Sistema Multicanal (2026-01-23)

### 🎯 Objetivo

Convertir el sistema de WhatsApp Chat en un sistema multicanal que soporte:
- WhatsApp
- Instagram
- Facebook Messenger
- Tester (simulador interno)

Todos los canales usan el mismo motor de flujos visuales y lógica de negocio.

---

## 🆕 Nuevos Archivos Creados

### 1. `/channels/channel-detector.js`
**Propósito**: Detectar y normalizar mensajes de diferentes canales

**Funciones**:
- `detectChannel(body, headers)` - Detecta el canal según el webhook payload
- `normalizeMessage(rawMessage, channel)` - Convierte a formato estándar
- `normalizeWhatsApp()` - Normaliza mensajes de WhatsApp
- `normalizeInstagram()` - Normaliza mensajes de Instagram
- `normalizeMessenger()` - Normaliza mensajes de Messenger
- `normalizeTester()` - Normaliza mensajes del simulador

**Formato normalizado**:
```javascript
{
  userId: string,        // ID del usuario en el canal
  messageId: string,     // ID del mensaje
  text: string,          // Texto del mensaje
  mediaType: string,     // image|video|audio|document|null
  mediaId: string,       // ID para descargar media
  metadata: object,      // Metadata específica del canal
  channel: string,       // whatsapp|instagram|messenger|tester
  timestamp: number      // Unix timestamp
}
```

### 2. `/channels/channel-adapters.js`
**Propósito**: Enviar mensajes a cada canal con su formato específico

**Métodos**:
- `sendMessage(channel, userId, text, options)` - Envío universal
- `sendWhatsAppMessage()` - Envío a WhatsApp con botones/listas interactivas
- `sendInstagramMessage()` - Envío a Instagram con quick replies
- `sendMessengerMessage()` - Envío a Messenger con quick replies y button templates
- `sendTesterMessage()` - Simula envío en Tester

**Características**:
- Soporte para botones interactivos (adaptados a cada canal)
- Soporte para listas (WhatsApp)
- Manejo automático de credenciales por canal
- Fallback a simulación si no hay credenciales

### 3. `/scripts/auto-migrate.js`
**Propósito**: Ejecutar migraciones de BD automáticamente al iniciar Docker

**Características**:
- Lista de migraciones con nombres únicos
- Tracking en tabla `_migrations`
- Solo ejecuta migraciones pendientes
- Manejo graceful de errores (el servidor inicia aunque falle)
- Espera a que MySQL esté listo (30 reintentos)
- Logs detallados de progreso

**Migraciones incluidas**:
1. Agregar columna `channel` a `chat_sessions`
2. Agregar columna `channel_metadata` a `chat_sessions`
3. Agregar columna `channel` a `chat_messages`
4. Índice en `chat_sessions.channel`
5. Índice compuesto en `chat_sessions(phone, channel, status)`
6. Índice en `chat_messages.channel`

### 4. `/scripts/entrypoint.sh`
**Propósito**: Script de inicio del contenedor Docker

**Flujo**:
1. Ejecuta `/scripts/auto-migrate.js`
2. Si falla, muestra warning pero continúa
3. Inicia `app-cloud.js`

### 5. `migrate-multicanal.js`
**Propósito**: Script de migración manual (para ejecutar fuera de Docker)

**Uso**:
```bash
node migrate-multicanal.js
```

**Características**:
- Ejecuta todas las migraciones
- Muestra resumen completo con estadísticas
- Verificación de estructura
- Próximos pasos para deployment

### 6. `MIGRACION-MULTICANAL.md`
**Propósito**: Documentación técnica de las migraciones SQL

**Contenido**:
- Scripts SQL completos
- Explicación de cada cambio
- Opciones de deployment (MySQL directo, Docker, Node.js)
- Procedimientos de rollback
- Queries útiles
- Checklist de deployment

### 7. `README-MULTICANAL.md`
**Propósito**: Documentación completa del sistema multicanal

**Secciones**:
- Descripción general y arquitectura
- Configuración de variables de entorno
- Guías para obtener credenciales de Meta
- Instrucciones de deployment (Docker, PM2, manual)
- Testing con Chat Tester
- Configuración de webhooks
- Monitoreo y queries útiles
- Seguridad (validación de firmas)
- Troubleshooting
- Roadmap

---

## 🔧 Archivos Modificados

### 1. `Dockerfile`
**Cambios**:
```diff
+ # Hacer ejecutable el script de entrypoint
+ RUN chmod +x scripts/entrypoint.sh

- CMD ["node", "--dns-result-order=ipv4first", "app-cloud.js"]
+ # Usar entrypoint para ejecutar migraciones antes de iniciar
+ ENTRYPOINT ["/app/scripts/entrypoint.sh"]
```

**Impacto**: Las migraciones se ejecutan automáticamente en cada rebuild

### 2. `app-cloud.js`
**Cambios principales**:

#### Requires agregados:
```javascript
const ChannelDetector = require('./channels/channel-detector');
const ChannelAdapters = require('./channels/channel-adapters');
```

#### Instanciación de adapters:
```javascript
const channelAdapters = new ChannelAdapters({ logger, db });
```

#### Webhook POST - Detección de canal (línea ~1228):
```javascript
// 🌐 MULTICANAL: Detectar de qué canal viene el mensaje
const channel = ChannelDetector.detectChannel(body, req.headers);
logger.info({ channel, object: body.object }, '🌐 Canal detectado');
```

#### Webhook POST - Normalización de mensajes (línea ~1245):
```javascript
// 🌐 MULTICANAL: Normalizar mensaje según el canal
const normalized = ChannelDetector.normalizeMessage(m, channel);
const from = normalized.userId;
const waMsgId = normalized.messageId;
const textForDB = normalized.text;
```

#### Búsqueda/creación de sesiones (línea ~1267):
```diff
- WHERE phone=? AND status='OPEN'
- [from]
+ WHERE phone=? AND channel=? AND status='OPEN'
+ [from, channel]

- INSERT INTO chat_sessions (token, phone, name, status, chatbot_enabled, chatbot_mode)
- VALUES (?,?,?, 'OPEN', ?, ?)
+ INSERT INTO chat_sessions (token, phone, name, status, chatbot_enabled, chatbot_mode, channel, channel_metadata)
+ VALUES (?,?,?, 'OPEN', ?, ?, ?, ?)
```

#### Inserción de mensajes (línea ~1313):
```diff
- INSERT INTO chat_messages (session_id, direction, text, wa_jid, wa_msg_id, status, ...)
- VALUES (?,?,?,?,?,?,...)
+ INSERT INTO chat_messages (session_id, direction, text, wa_jid, wa_msg_id, status, channel, ...)
+ VALUES (?,?,?,?,?,?,?,...)
```

#### Chat Tester/Simulador (línea ~2168):
```javascript
// 🌐 Simulador usa canal 'tester'
const channel = 'tester';
```

---

## 🗄️ Cambios en Base de Datos

### Tabla `chat_sessions`

#### Columnas agregadas:
```sql
channel ENUM('whatsapp', 'instagram', 'messenger', 'tester') DEFAULT 'whatsapp'
channel_metadata JSON
```

#### Índices agregados:
```sql
CREATE INDEX idx_sessions_channel ON chat_sessions(channel);
CREATE INDEX idx_sessions_phone_channel ON chat_sessions(phone, channel, status);
```

#### Ejemplo de channel_metadata:
```json
// WhatsApp
{"wa_id": "5691234567890", "profile_name": "Juan Pérez"}

// Instagram
{"ig_user_id": "1234567890", "username": "juanperez"}

// Messenger
{"psid": "1234567890", "page_id": "9876543210"}
```

### Tabla `chat_messages`

#### Columnas agregadas:
```sql
channel ENUM('whatsapp', 'instagram', 'messenger', 'tester') DEFAULT 'whatsapp'
```

#### Índices agregados:
```sql
CREATE INDEX idx_messages_channel ON chat_messages(channel);
```

### Tabla `_migrations` (nueva)

Tracking de migraciones ejecutadas:
```sql
CREATE TABLE _migrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## ⚙️ Variables de Entorno Nuevas

Agregar al `.env`:

```env
# ============================================
# INSTAGRAM
# ============================================
INSTAGRAM_ACCESS_TOKEN=tu_instagram_access_token  # Opcional, usa META_ACCESS_TOKEN
INSTAGRAM_PAGE_ID=tu_instagram_page_id

# ============================================
# MESSENGER (Facebook Messenger)
# ============================================
MESSENGER_ACCESS_TOKEN=tu_messenger_access_token  # Opcional, usa META_ACCESS_TOKEN
MESSENGER_PAGE_ID=tu_messenger_page_id
```

**Nota**: Si `INSTAGRAM_ACCESS_TOKEN` o `MESSENGER_ACCESS_TOKEN` no están definidos, el sistema usa `META_ACCESS_TOKEN` por defecto.

---

## 🔄 Flujo de Mensajes Multicanal

### 1. Recepción
```
Webhook POST /webhook
  ↓
ChannelDetector.detectChannel(body, headers)
  ↓
Detecta: whatsapp | instagram | messenger | tester
```

### 2. Normalización
```
ChannelDetector.normalizeMessage(rawMessage, channel)
  ↓
Formato estándar:
{
  userId, messageId, text, mediaType, mediaId,
  metadata, channel, timestamp
}
```

### 3. Procesamiento
```
Buscar/crear sesión (phone + channel)
  ↓
Guardar mensaje en BD con campo channel
  ↓
Ejecutar Visual Flow Engine (mismo para todos los canales)
  ↓
Generar respuestas
```

### 4. Envío
```
ChannelAdapters.sendMessage(channel, userId, text, options)
  ↓
Adapta formato según canal:
  - WhatsApp: Botones interactivos, listas
  - Instagram: Quick replies
  - Messenger: Quick replies, button templates
  - Tester: Solo guarda en BD
  ↓
Envía via API correspondiente
```

---

## 🧪 Testing

### Chat Tester
URL: `http://localhost:3001/chat-tester`

**Cambios**:
- Ahora usa `channel='tester'`
- Sesiones aisladas por canal (no interfieren con WhatsApp real)
- Mismo motor de flujos que producción

### Webhooks Reales

**WhatsApp**:
```bash
curl -X POST https://tu-dominio.com/webhook \
  -H "x-hub-signature-256: sha256=..." \
  -d '{"object":"whatsapp_business_account", "entry":[...]}'
```

**Instagram**:
```bash
curl -X POST https://tu-dominio.com/webhook \
  -H "x-hub-signature-256: sha256=..." \
  -d '{"object":"instagram", "entry":[...]}'
```

**Messenger**:
```bash
curl -X POST https://tu-dominio.com/webhook \
  -H "x-hub-signature-256: sha256=..." \
  -d '{"object":"page", "entry":[...]}'
```

---

## 📊 Queries Útiles

### Ver distribución de canales
```sql
SELECT channel, COUNT(*) as total
FROM chat_sessions
GROUP BY channel;
```

### Mensajes por canal (últimas 24h)
```sql
SELECT channel, COUNT(*) as total
FROM chat_messages
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY channel;
```

### Sesiones activas por canal
```sql
SELECT channel, COUNT(*) as activas
FROM chat_sessions
WHERE status = 'OPEN'
GROUP BY channel;
```

### Ver metadata de sesiones
```sql
SELECT id, phone, channel, channel_metadata, created_at
FROM chat_sessions
ORDER BY created_at DESC
LIMIT 10;
```

---

## 🚀 Deployment

### Docker (Recomendado)
```bash
# 1. Pull del código actualizado
git pull

# 2. Rebuild (migraciones se ejecutan automáticamente)
docker-compose -f docker-compose.dev.yml up -d --build

# 3. Verificar logs de migración
docker logs whatsapp-backend | grep AUTO-MIGRATE

# 4. Verificar estructura
docker exec -it whatsapp-db mysql -uroot -p -e "DESCRIBE chat_sessions"
```

### PM2 (Servidor)
```bash
# 1. Pull del código
git pull

# 2. Ejecutar migraciones manualmente (primera vez)
node scripts/auto-migrate.js

# 3. Reiniciar
pm2 restart whatsapp-chat
```

---

## ⚠️ Breaking Changes

### 1. Sesiones Duplicadas
**Antes**: Una sesión por `phone`
**Ahora**: Una sesión por `phone + channel`

**Impacto**: Un usuario puede tener sesiones simultáneas en diferentes canales

**Ejemplo**:
```sql
-- Antes: Solo 1 sesión
phone: 56912345678, status: OPEN

-- Ahora: Múltiples sesiones
phone: 56912345678, channel: whatsapp,  status: OPEN
phone: 56912345678, channel: instagram, status: OPEN
phone: 56912345678, channel: tester,    status: OPEN
```

### 2. Queries Antiguas
**Queries que deben actualizarse**:
```diff
- SELECT * FROM chat_sessions WHERE phone=? AND status='OPEN'
+ SELECT * FROM chat_sessions WHERE phone=? AND channel=? AND status='OPEN'

- INSERT INTO chat_messages (session_id, direction, text, ...)
+ INSERT INTO chat_messages (session_id, direction, text, channel, ...)
```

---

## 🔙 Rollback

Si necesitas revertir todos los cambios:

```bash
# 1. Backup de BD
docker exec whatsapp-db mysqldump -uroot -p whatsapp_chat > backup.sql

# 2. Ejecutar rollback SQL
mysql -u root -p whatsapp_chat <<EOF
ALTER TABLE chat_sessions DROP COLUMN channel;
ALTER TABLE chat_sessions DROP COLUMN channel_metadata;
ALTER TABLE chat_messages DROP COLUMN channel;
DROP INDEX idx_sessions_channel ON chat_sessions;
DROP INDEX idx_sessions_phone_channel ON chat_sessions;
DROP INDEX idx_messages_channel ON chat_messages;
DROP TABLE _migrations;
EOF

# 3. Revertir código
git checkout <commit-anterior>

# 4. Rebuild
docker-compose up -d --build
```

---

## ✅ Checklist de Verificación

Post-deployment, verificar:

- [ ] Migraciones ejecutadas correctamente
- [ ] Tabla `_migrations` tiene 6 registros
- [ ] Columna `channel` existe en `chat_sessions`
- [ ] Columna `channel_metadata` existe en `chat_sessions`
- [ ] Columna `channel` existe en `chat_messages`
- [ ] 3 índices creados correctamente
- [ ] Chat Tester funciona en `http://localhost:3001/chat-tester`
- [ ] Mensajes de Tester usan `channel='tester'`
- [ ] Webhook acepta mensajes de WhatsApp
- [ ] Logs muestran "🌐 Canal detectado: whatsapp"
- [ ] No hay errores SQL en logs
- [ ] Sesiones antiguas funcionan correctamente

---

## 🎓 Conceptos Clave

### Channel Detection
Identifica el canal basándose en:
- `body.object === 'whatsapp_business_account'` → WhatsApp
- `body.object === 'instagram'` → Instagram
- `body.object === 'page'` → Messenger
- `headers['x-simulator'] === 'true'` → Tester

### Message Normalization
Convierte mensajes de diferentes formatos a uno estándar:
- WhatsApp: `message.from`, `message.text.body`
- Instagram: `message.sender.id`, `message.message.text`
- Messenger: `message.sender.id`, `message.message.text`
- Tester: `message.phone`, `message.message`

### Channel Adapters
Convierte respuestas estándar al formato de cada canal:
- WhatsApp: Interactive buttons/lists via Graph API
- Instagram: Quick replies via Graph API
- Messenger: Quick replies + button templates via Send API
- Tester: Solo guarda en BD (no envía)

---

## 📞 Soporte

### Logs de Debug
```bash
# Ver detección de canal
docker logs whatsapp-backend 2>&1 | grep "Canal detectado"

# Ver errores de migración
docker logs whatsapp-backend 2>&1 | grep "AUTO-MIGRATE.*Error"

# Seguir logs en vivo
docker logs -f whatsapp-backend
```

### Problemas Comunes

**Error: Column 'channel' not found**
→ Ejecutar: `node scripts/auto-migrate.js`

**Error: Duplicate key 'idx_sessions_channel'**
→ Ya existe, ignorar o ejecutar: `DROP INDEX idx_sessions_channel ON chat_sessions`

**Chat Tester no responde**
→ Verificar: `CHATBOT_GLOBAL_ENABLED=true` en `.env`

---

**Fecha**: 2026-01-23
**Versión**: 2.0.0 - Sistema Multicanal
**Responsable**: Sistema de Chat Multicanal - Respaldos Chile
