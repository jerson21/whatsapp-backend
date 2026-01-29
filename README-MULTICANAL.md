# 🌐 Sistema Multicanal - WhatsApp Chat

## 📋 Descripción General

Sistema unificado de mensajería que permite recibir y responder mensajes desde múltiples canales de comunicación usando el mismo motor de flujos visuales y lógica de negocio.

### Canales Soportados

- ✅ **WhatsApp** - Via Meta Cloud API (Graph API)
- ✅ **Instagram** - Direct Messages via Meta Graph API
- ✅ **Facebook Messenger** - Via Meta Messenger Platform
- ✅ **Tester** - Simulador interno para pruebas sin credenciales

---

## 🏗️ Arquitectura del Sistema

### Componentes Principales

```
┌─────────────────┐
│  WhatsApp API   │─┐
└─────────────────┘ │
                    │
┌─────────────────┐ │    ┌──────────────────┐
│ Instagram API   │─┼───▶│ Channel Detector │
└─────────────────┘ │    └──────────────────┘
                    │             │
┌─────────────────┐ │             ▼
│ Messenger API   │─┤    ┌──────────────────┐
└─────────────────┘ │    │   Normalizador   │
                    │    └──────────────────┘
┌─────────────────┐ │             │
│  Chat Tester    │─┘             ▼
└─────────────────┘      ┌──────────────────┐
                         │  Visual Flows    │
                         │  Message Queue   │
                         │  Classifier      │
                         └──────────────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │ Channel Adapters │
                         └──────────────────┘
                                  │
                         ┌────────┴────────┐
                         ▼                 ▼
                   ┌──────────┐    ┌──────────┐
                   │ WhatsApp │    │Instagram │
                   └──────────┘    └──────────┘
                         ▼                 ▼
                   ┌──────────┐    ┌──────────┐
                   │Messenger │    │  Tester  │
                   └──────────┘    └──────────┘
```

### Flujo de Mensajes

1. **Recepción**: Webhook recibe mensaje de cualquier canal
2. **Detección**: `ChannelDetector` identifica el canal de origen
3. **Normalización**: Convierte el mensaje a formato estándar
4. **Procesamiento**: Visual Flow Engine procesa usando la misma lógica
5. **Adaptación**: `ChannelAdapters` formatea la respuesta para el canal específico
6. **Envío**: Se envía la respuesta usando la API correspondiente

---

## 🗄️ Base de Datos

### Migraciones Automáticas

El sistema ejecuta migraciones automáticamente al iniciar el contenedor Docker:

- **Script**: `/scripts/auto-migrate.js`
- **Tracking**: Tabla `_migrations` registra migraciones ejecutadas
- **Seguridad**: Si falla una migración, el servidor inicia de todos modos

### Cambios en Esquema

#### Tabla `chat_sessions`

```sql
-- Nuevas columnas
channel ENUM('whatsapp', 'instagram', 'messenger', 'tester') DEFAULT 'whatsapp'
channel_metadata JSON
```

**channel_metadata** - Ejemplos:
```json
// WhatsApp
{"wa_id": "5691234567890", "profile_name": "Juan Pérez"}

// Instagram
{"ig_user_id": "1234567890", "username": "juanperez"}

// Messenger
{"psid": "1234567890", "page_id": "9876543210"}
```

#### Tabla `chat_messages`

```sql
-- Nueva columna
channel ENUM('whatsapp', 'instagram', 'messenger', 'tester') DEFAULT 'whatsapp'
```

#### Índices Creados

```sql
idx_sessions_channel          -- Búsqueda por canal
idx_sessions_phone_channel    -- Búsqueda compuesta (phone, channel, status)
idx_messages_channel          -- Búsqueda de mensajes por canal
```

---

## 🔧 Configuración

### Variables de Entorno

Agregar al archivo `.env`:

```env
# ============================================
# META (Común para WhatsApp, Instagram, Messenger)
# ============================================
META_ACCESS_TOKEN=tu_token_de_meta
GRAPH_API_VERSION=v22.0

# ============================================
# WHATSAPP
# ============================================
WABA_PHONE_NUMBER_ID=tu_phone_number_id
WEBHOOK_VERIFY_TOKEN=tu_verify_token

# ============================================
# INSTAGRAM
# ============================================
INSTAGRAM_PAGE_ID=tu_instagram_page_id
# Si no se define INSTAGRAM_ACCESS_TOKEN, usa META_ACCESS_TOKEN

# ============================================
# MESSENGER
# ============================================
MESSENGER_PAGE_ID=tu_messenger_page_id
# Si no se define MESSENGER_ACCESS_TOKEN, usa META_ACCESS_TOKEN

# ============================================
# CHATBOT
# ============================================
CHATBOT_GLOBAL_ENABLED=true
```

### Obtener Credenciales de Meta

#### WhatsApp Cloud API

1. Ir a [Meta for Developers](https://developers.facebook.com/)
2. Crear una app tipo "Business"
3. Agregar producto "WhatsApp"
4. Configurar webhook:
   - URL: `https://tu-dominio.com/webhook`
   - Verify Token: (el que pongas en `.env`)
   - Suscribirse a: `messages`
5. Obtener:
   - `META_ACCESS_TOKEN`: Token de acceso permanente
   - `WABA_PHONE_NUMBER_ID`: ID del número de prueba o producción

#### Instagram Messaging

1. Vincular página de Instagram a tu Facebook Business
2. En Meta for Developers, agregar producto "Instagram"
3. Configurar webhook (misma URL que WhatsApp):
   - Suscribirse a: `messages`, `messaging_postbacks`
4. Obtener:
   - `INSTAGRAM_PAGE_ID`: ID de tu página de Instagram

#### Messenger

1. En Meta for Developers, agregar producto "Messenger"
2. Configurar webhook:
   - Suscribirse a: `messages`, `messaging_postbacks`
3. Obtener:
   - `MESSENGER_PAGE_ID`: ID de tu página de Facebook

---

## 🚀 Deployment

### Opción 1: Docker (Recomendado)

```bash
# 1. Clonar repositorio
git clone <repo-url>
cd whatsapp-chat

# 2. Configurar .env
cp .env.example .env
nano .env  # Configurar credenciales

# 3. Iniciar contenedores
docker-compose -f docker-compose.dev.yml up -d --build

# 4. Ver logs
docker-compose -f docker-compose.dev.yml logs -f backend

# 5. Verificar migraciones
docker logs whatsapp-backend | grep AUTO-MIGRATE
```

**Las migraciones se ejecutan automáticamente** gracias al entrypoint script.

### Opción 2: Servidor (PM2)

```bash
# 1. Instalar dependencias
npm install

# 2. Ejecutar migraciones manualmente (primera vez)
node scripts/auto-migrate.js

# 3. Iniciar con PM2
pm2 start ecosystem.config.js

# 4. Ver logs
pm2 logs whatsapp-chat
```

### Opción 3: Migraciones Manuales

Si prefieres ejecutar migraciones manualmente:

```bash
# Opción A: Script Node.js
node migrate-multicanal.js

# Opción B: Conectar a MySQL directamente
mysql -u usuario -p whatsapp_chat

# Luego ejecutar comandos del archivo MIGRACION-MULTICANAL.md
```

---

## 🧪 Testing con Chat Tester

### Acceso

```
http://localhost:3001/chat-tester
```

### Características

- ✅ Simula mensajes entrantes de todos los canales
- ✅ No requiere credenciales de Meta
- ✅ Ejecuta los mismos flujos que producción
- ✅ Muestra respuestas en tiempo real
- ✅ Soporta múltiples sesiones simultáneas

### Uso

1. Ingresa un número de teléfono (cualquier formato)
2. Escribe un mensaje
3. El sistema:
   - Crea/busca sesión con `channel='tester'`
   - Ejecuta Visual Flow Engine
   - Muestra respuestas del bot

### Probar Diferentes Canales

```bash
# Simular WhatsApp
curl -X POST http://localhost:3001/api/chat/simulate \
  -H "Content-Type: application/json" \
  -d '{"phone": "56912345678", "message": "Hola"}'

# El simulador siempre usa channel='tester'
# Para probar canales reales, usa webhooks de Meta
```

---

## 🔌 Webhooks

### Endpoint Universal

```
POST https://tu-dominio.com/webhook
```

El mismo endpoint recibe webhooks de todos los canales.

### Detección Automática

`ChannelDetector` identifica el canal por:

```javascript
// WhatsApp
body.object === 'whatsapp_business_account'

// Instagram
body.object === 'instagram'

// Messenger
body.object === 'page'

// Tester
headers['x-simulator'] === 'true' || body._simulator === true
```

### Configurar Webhooks en Meta

1. **URL del Webhook**: `https://tu-dominio.com/webhook`
2. **Verify Token**: El valor de `WEBHOOK_VERIFY_TOKEN` en `.env`
3. **Eventos suscritos**:
   - WhatsApp: `messages`
   - Instagram: `messages`, `messaging_postbacks`
   - Messenger: `messages`, `messaging_postbacks`, `message_reads`

### Verificación de Webhook

```bash
# Meta enviará:
GET https://tu-dominio.com/webhook?hub.mode=subscribe&hub.verify_token=TU_TOKEN&hub.challenge=123456

# Tu servidor debe responder:
200 OK
123456
```

---

## 📊 Monitoreo

### Ver Distribución de Canales

```sql
-- Sesiones por canal
SELECT channel, COUNT(*) as total
FROM chat_sessions
GROUP BY channel;

-- Mensajes por canal (últimas 24h)
SELECT channel, COUNT(*) as total
FROM chat_messages
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY channel;
```

### Logs Útiles

```bash
# Logs del backend
docker logs whatsapp-backend --tail=100 -f

# Filtrar por canal
docker logs whatsapp-backend 2>&1 | grep "channel.*instagram"

# Ver migraciones ejecutadas
docker exec -it whatsapp-db mysql -uroot -p${DB_ROOT_PASSWORD} \
  -D whatsapp_chat -e "SELECT * FROM _migrations"
```

### Endpoints de Debug

```bash
# Ver sesiones activas
GET http://localhost:3001/api/chat/sessions?status=OPEN

# Ver mensajes de una sesión
GET http://localhost:3001/api/chat/sessions/:sessionId/messages

# Estadísticas por canal (implementar si es necesario)
GET http://localhost:3001/api/stats/by-channel
```

---

## 🔒 Seguridad

### Validación de Webhooks

El sistema valida firmas de Meta usando `x-hub-signature-256`:

```javascript
// app-cloud.js - línea ~600
const signature = req.headers['x-hub-signature-256'];
const payload = JSON.stringify(req.body);
const expectedSignature = crypto
  .createHmac('sha256', process.env.META_APP_SECRET)
  .update(payload)
  .digest('hex');

if (`sha256=${expectedSignature}` !== signature) {
  return res.status(401).send('Invalid signature');
}
```

**Importante**: Agregar `META_APP_SECRET` al `.env`

### Rate Limiting

```javascript
// Límites por endpoint
/webhook          - 100 req/min
/api/chat/simulate - 10 req/min (tester)
/api/*            - 50 req/min (general)
```

---

## 🐛 Troubleshooting

### Problema: Migraciones no se ejecutan

**Síntomas**: Errores de columna no existe

**Solución**:
```bash
# 1. Verificar logs de migración
docker logs whatsapp-backend | grep AUTO-MIGRATE

# 2. Ejecutar manualmente
docker exec -it whatsapp-backend node scripts/auto-migrate.js

# 3. Si persiste, ejecutar script completo
docker exec -it whatsapp-backend node migrate-multicanal.js
```

### Problema: Mensajes no se reciben de Instagram

**Síntomas**: Webhook OK pero no llegan mensajes

**Checklist**:
1. ✅ Página de Instagram vinculada a Facebook Business
2. ✅ App de Meta tiene acceso a Instagram
3. ✅ Webhook suscrito a `messages` y `messaging_postbacks`
4. ✅ `INSTAGRAM_PAGE_ID` correcto en `.env`
5. ✅ Conversación iniciada por el usuario (Instagram requiere opt-in de 24h)

### Problema: Bot no responde en Tester

**Síntomas**: `responseCount: 0`

**Solución**:
```bash
# 1. Verificar que chatbot esté habilitado
grep CHATBOT_GLOBAL_ENABLED .env
# Debe ser: CHATBOT_GLOBAL_ENABLED=true

# 2. Verificar flujos activos
curl http://localhost:3001/api/flows

# 3. Ver logs del chatbot
docker logs whatsapp-backend 2>&1 | grep -i "chatbot\|flow"
```

### Problema: Error de credenciales de Meta

**Síntomas**: `WhatsApp API error: Invalid access token`

**Solución**:
```bash
# 1. Verificar token en .env
echo $META_ACCESS_TOKEN

# 2. Probar token manualmente
curl -X GET "https://graph.facebook.com/v22.0/me?access_token=$META_ACCESS_TOKEN"

# 3. Regenerar token si expiró
# Ir a Meta for Developers > Tools > Access Token Tool
# Copiar nuevo token permanente a .env
# Reiniciar: docker-compose restart backend
```

### Problema: Índices duplicados

**Síntomas**: `ER_DUP_KEYNAME: Duplicate key name 'idx_sessions_channel'`

**Solución**:
```sql
-- Verificar índices existentes
SHOW INDEX FROM chat_sessions;

-- Eliminar duplicados
DROP INDEX idx_sessions_channel ON chat_sessions;

-- Re-ejecutar migraciones
node scripts/auto-migrate.js
```

---

## 📚 Archivos Clave

| Archivo | Propósito |
|---------|-----------|
| `/channels/channel-detector.js` | Detecta canal y normaliza mensajes |
| `/channels/channel-adapters.js` | Envía mensajes a cada canal |
| `/scripts/auto-migrate.js` | Migraciones automáticas en startup |
| `/scripts/entrypoint.sh` | Script de inicio del contenedor |
| `/migrate-multicanal.js` | Migración manual completa |
| `MIGRACION-MULTICANAL.md` | Documentación de migraciones SQL |
| `README-MULTICANAL.md` | Este archivo |

---

## 🔄 Rollback

Si necesitas revertir los cambios multicanal:

```sql
-- ADVERTENCIA: Esto eliminará las columnas y sus datos
ALTER TABLE chat_sessions DROP COLUMN channel;
ALTER TABLE chat_sessions DROP COLUMN channel_metadata;
ALTER TABLE chat_messages DROP COLUMN channel;

DROP INDEX idx_sessions_channel ON chat_sessions;
DROP INDEX idx_sessions_phone_channel ON chat_sessions;
DROP INDEX idx_messages_channel ON chat_messages;

-- Eliminar tracking de migraciones
DROP TABLE _migrations;
```

**Recomendación**: Hacer backup antes de rollback

```bash
docker exec whatsapp-db mysqldump -uroot -p${DB_ROOT_PASSWORD} whatsapp_chat > backup_$(date +%Y%m%d_%H%M%S).sql
```

---

## ✅ Checklist de Deployment

### Desarrollo

- [ ] Clonar repositorio
- [ ] Configurar `.env` con credenciales de desarrollo
- [ ] Ejecutar `docker-compose up -d --build`
- [ ] Verificar migraciones ejecutadas
- [ ] Probar Chat Tester en `http://localhost:3001/chat-tester`
- [ ] Crear flujos de prueba en dashboard
- [ ] Probar webhook local con ngrok/serveo

### Producción

- [ ] Backup de base de datos actual
- [ ] Actualizar código en servidor (`git pull`)
- [ ] Verificar `.env` con credenciales de producción
- [ ] Ejecutar `docker-compose up -d --build` o reiniciar PM2
- [ ] Verificar logs de migraciones
- [ ] Verificar estructura de tablas (`DESCRIBE chat_sessions`)
- [ ] Configurar webhooks en Meta for Developers
- [ ] Probar mensajes reales desde WhatsApp/Instagram/Messenger
- [ ] Monitorear logs durante 1 hora
- [ ] Verificar que mensajes antiguos funcionen correctamente

---

## 📞 Soporte

### Logs de Debug

```bash
# Nivel verbose
docker-compose -f docker-compose.dev.yml logs -f backend | grep -i "channel\|migrate"

# Solo errores
docker logs whatsapp-backend 2>&1 | grep -i error

# Seguir logs en vivo
tail -f logs/app.log
```

### Queries Útiles

```sql
-- Ver últimas 10 sesiones con metadata
SELECT id, phone, channel, channel_metadata, status, created_at
FROM chat_sessions
ORDER BY created_at DESC
LIMIT 10;

-- Contar mensajes por canal hoy
SELECT channel, COUNT(*) as total
FROM chat_messages
WHERE DATE(created_at) = CURDATE()
GROUP BY channel;

-- Ver sesiones activas por canal
SELECT channel, COUNT(*) as activas
FROM chat_sessions
WHERE status = 'OPEN'
GROUP BY channel;
```

---

## 🎯 Roadmap

### Completado ✅

- [x] Sistema multicanal base
- [x] Detección automática de canal
- [x] Normalización de mensajes
- [x] Adaptadores para WhatsApp, Instagram, Messenger
- [x] Chat Tester integrado
- [x] Migraciones automáticas
- [x] Documentación completa

### Por Implementar 🚧

- [ ] Soporte para multimedia en Instagram/Messenger
- [ ] Templates de WhatsApp Business
- [ ] Métricas por canal en dashboard
- [ ] Exportación de conversaciones por canal
- [ ] Integración con Telegram
- [ ] Integración con Web Chat embebido
- [ ] Multi-agente (varios operadores)

---

**Versión**: 1.0.0
**Última actualización**: 2026-01-23
**Autor**: Sistema de Chat Multicanal - Respaldos Chile
