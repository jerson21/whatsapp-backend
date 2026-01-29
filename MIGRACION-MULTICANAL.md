# 🔄 Migración a Sistema Multicanal

## 📋 Descripción

Este documento contiene todas las migraciones necesarias para convertir el sistema actual de WhatsApp en un sistema multicanal que soporte:

- ✅ WhatsApp
- ✅ Instagram
- ✅ Facebook Messenger
- ✅ Tester (simulador interno)

---

## 🗄️ Migraciones de Base de Datos

### **PASO 1: Agregar columna `channel` a tabla `chat_sessions`**

```sql
-- Agregar columna channel a chat_sessions
ALTER TABLE chat_sessions
ADD COLUMN channel ENUM('whatsapp', 'instagram', 'messenger', 'tester')
DEFAULT 'whatsapp'
AFTER phone;

-- Crear índice para búsquedas por canal
CREATE INDEX idx_sessions_channel ON chat_sessions(channel);

-- Crear índice compuesto para búsquedas frecuentes
CREATE INDEX idx_sessions_phone_channel ON chat_sessions(phone, channel, status);
```

**Objetivo:** Identificar de qué canal proviene cada sesión de chat.

---

### **PASO 2: Agregar columna `channel` a tabla `chat_messages`**

```sql
-- Agregar columna channel a chat_messages
ALTER TABLE chat_messages
ADD COLUMN channel ENUM('whatsapp', 'instagram', 'messenger', 'tester')
DEFAULT 'whatsapp'
AFTER session_id;

-- Crear índice para búsquedas por canal
CREATE INDEX idx_messages_channel ON chat_messages(channel);
```

**Objetivo:** Rastrear por qué canal se envió/recibió cada mensaje.

---

### **PASO 3: Agregar metadata de canal a sesiones**

```sql
-- Agregar columna para metadata específica del canal
ALTER TABLE chat_sessions
ADD COLUMN channel_metadata JSON
AFTER channel;

-- Ejemplos de metadata por canal:
-- WhatsApp: {"wa_id": "5691234567890", "profile_name": "Juan Pérez"}
-- Instagram: {"ig_user_id": "1234567890", "username": "juanperez"}
-- Messenger: {"psid": "1234567890", "page_id": "9876543210"}
```

**Objetivo:** Guardar información específica de cada canal (IDs de usuario, perfiles, etc.).

---

### **PASO 4: Actualizar sesiones existentes (opcional)**

```sql
-- Marcar todas las sesiones existentes como WhatsApp
-- (por defecto ya lo estarán, pero por si acaso)
UPDATE chat_sessions
SET channel = 'whatsapp'
WHERE channel IS NULL;

UPDATE chat_messages
SET channel = 'whatsapp'
WHERE channel IS NULL;
```

---

## 📊 Verificación de Migraciones

### **Verificar estructura de `chat_sessions`**

```sql
DESCRIBE chat_sessions;
```

**Resultado esperado:** Debe incluir columnas:
- `channel` ENUM('whatsapp', 'instagram', 'messenger', 'tester')
- `channel_metadata` JSON

### **Verificar estructura de `chat_messages`**

```sql
DESCRIBE chat_messages;
```

**Resultado esperado:** Debe incluir columna:
- `channel` ENUM('whatsapp', 'instagram', 'messenger', 'tester')

### **Verificar índices**

```sql
SHOW INDEX FROM chat_sessions;
SHOW INDEX FROM chat_messages;
```

**Resultado esperado:** Debe incluir:
- `idx_sessions_channel`
- `idx_sessions_phone_channel`
- `idx_messages_channel`

---

## 🔧 Variables de Entorno Adicionales

Agregar al archivo `.env`:

```env
# ============================================
# INSTAGRAM
# ============================================
INSTAGRAM_ACCESS_TOKEN=tu_instagram_access_token
INSTAGRAM_PAGE_ID=tu_instagram_page_id

# ============================================
# MESSENGER (Facebook Messenger)
# ============================================
MESSENGER_ACCESS_TOKEN=tu_messenger_access_token
MESSENGER_PAGE_ID=tu_messenger_page_id

# Nota: Si usas el mismo token de Meta para todo, puedes dejar
# INSTAGRAM_ACCESS_TOKEN y MESSENGER_ACCESS_TOKEN vacíos
# y usará META_ACCESS_TOKEN por defecto
```

---

## 📝 Script de Migración Completo

Puedes ejecutar todo de una vez con este script:

```sql
-- ===========================================
-- MIGRACIÓN MULTICANAL - COMPLETA
-- ===========================================

-- 1. Agregar columnas a chat_sessions
ALTER TABLE chat_sessions
ADD COLUMN channel ENUM('whatsapp', 'instagram', 'messenger', 'tester')
DEFAULT 'whatsapp'
AFTER phone;

ALTER TABLE chat_sessions
ADD COLUMN channel_metadata JSON
AFTER channel;

-- 2. Agregar columna a chat_messages
ALTER TABLE chat_messages
ADD COLUMN channel ENUM('whatsapp', 'instagram', 'messenger', 'tester')
DEFAULT 'whatsapp'
AFTER session_id;

-- 3. Crear índices
CREATE INDEX idx_sessions_channel ON chat_sessions(channel);
CREATE INDEX idx_sessions_phone_channel ON chat_sessions(phone, channel, status);
CREATE INDEX idx_messages_channel ON chat_messages(channel);

-- 4. Actualizar datos existentes
UPDATE chat_sessions SET channel = 'whatsapp' WHERE channel IS NULL;
UPDATE chat_messages SET channel = 'whatsapp' WHERE channel IS NULL;

-- 5. Verificación
SELECT 'chat_sessions columns:' as info;
DESCRIBE chat_sessions;

SELECT 'chat_messages columns:' as info;
DESCRIBE chat_messages;

SELECT 'Indexes created:' as info;
SHOW INDEX FROM chat_sessions WHERE Key_name LIKE 'idx%';
SHOW INDEX FROM chat_messages WHERE Key_name LIKE 'idx%';
```

---

## 🚀 Deployment en Servidor

### **Opción 1: Ejecutar directamente en MySQL**

```bash
# Conectar a MySQL
mysql -u usuario -p whatsapp_chat < sql/migrate-multicanal.sql
```

### **Opción 2: Ejecutar desde Docker**

```bash
# Si usas Docker
docker exec -i whatsapp-db mysql -uroot -proot123 whatsapp_chat < sql/migrate-multicanal.sql
```

### **Opción 3: Script Node.js (recomendado para rollback)**

Crear archivo `migrate-multicanal.js`:

```javascript
const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  });

  try {
    console.log('🔄 Iniciando migración multicanal...');

    // Agregar columnas
    await connection.query(`
      ALTER TABLE chat_sessions
      ADD COLUMN IF NOT EXISTS channel ENUM('whatsapp', 'instagram', 'messenger', 'tester')
      DEFAULT 'whatsapp'
      AFTER phone
    `);
    console.log('✅ Columna channel agregada a chat_sessions');

    await connection.query(`
      ALTER TABLE chat_sessions
      ADD COLUMN IF NOT EXISTS channel_metadata JSON
      AFTER channel
    `);
    console.log('✅ Columna channel_metadata agregada a chat_sessions');

    await connection.query(`
      ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS channel ENUM('whatsapp', 'instagram', 'messenger', 'tester')
      DEFAULT 'whatsapp'
      AFTER session_id
    `);
    console.log('✅ Columna channel agregada a chat_messages');

    // Crear índices
    try {
      await connection.query('CREATE INDEX idx_sessions_channel ON chat_sessions(channel)');
      console.log('✅ Índice idx_sessions_channel creado');
    } catch (e) {
      console.log('⚠️  Índice idx_sessions_channel ya existe');
    }

    try {
      await connection.query('CREATE INDEX idx_sessions_phone_channel ON chat_sessions(phone, channel, status)');
      console.log('✅ Índice idx_sessions_phone_channel creado');
    } catch (e) {
      console.log('⚠️  Índice idx_sessions_phone_channel ya existe');
    }

    try {
      await connection.query('CREATE INDEX idx_messages_channel ON chat_messages(channel)');
      console.log('✅ Índice idx_messages_channel creado');
    } catch (e) {
      console.log('⚠️  Índice idx_messages_channel ya existe');
    }

    console.log('✅ Migración completada exitosamente');

  } catch (error) {
    console.error('❌ Error en migración:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

migrate();
```

Ejecutar con:

```bash
node migrate-multicanal.js
```

---

## 🔙 Rollback (en caso de problemas)

Si necesitas revertir los cambios:

```sql
-- ROLLBACK: Eliminar cambios de migración multicanal
ALTER TABLE chat_sessions DROP COLUMN channel;
ALTER TABLE chat_sessions DROP COLUMN channel_metadata;
ALTER TABLE chat_messages DROP COLUMN channel;

DROP INDEX idx_sessions_channel ON chat_sessions;
DROP INDEX idx_sessions_phone_channel ON chat_sessions;
DROP INDEX idx_messages_channel ON chat_messages;
```

---

## 📊 Queries Útiles Post-Migración

### **Ver distribución de canales**

```sql
-- Sesiones por canal
SELECT channel, COUNT(*) as total
FROM chat_sessions
GROUP BY channel;

-- Mensajes por canal
SELECT channel, COUNT(*) as total
FROM chat_messages
GROUP BY channel;
```

### **Ver sesiones activas por canal**

```sql
SELECT channel, COUNT(*) as activas
FROM chat_sessions
WHERE status = 'OPEN'
GROUP BY channel;
```

### **Ver metadata de sesiones**

```sql
SELECT id, phone, channel, channel_metadata, created_at
FROM chat_sessions
ORDER BY created_at DESC
LIMIT 10;
```

---

## ✅ Checklist de Deployment

- [ ] Backup de base de datos
- [ ] Ejecutar migración en servidor de pruebas
- [ ] Verificar estructura de tablas
- [ ] Verificar índices creados
- [ ] Actualizar variables de entorno (.env)
- [ ] Reiniciar backend
- [ ] Probar con Chat Tester
- [ ] Ejecutar migración en producción
- [ ] Monitorear logs
- [ ] Verificar que mensajes antiguos sigan funcionando

---

**Fecha de creación:** 2026-01-24
**Versión:** 1.0.0
**Autor:** Sistema de Migración Automática
