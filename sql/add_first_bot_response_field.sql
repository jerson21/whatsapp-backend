-- ============================================================================
-- AGREGAR CAMPO first_bot_response A TABLA chat_sessions
-- ============================================================================
-- Script para agregar campo de tracking de primera respuesta del bot
-- Fecha: 2025-08-21
-- ============================================================================

-- Agregar campo para tracking de primera respuesta del bot
ALTER TABLE chat_sessions 
ADD COLUMN IF NOT EXISTS first_bot_response BOOLEAN DEFAULT FALSE COMMENT 'Indica si el bot ya respondió por primera vez';

-- Crear índice para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_chat_sessions_first_bot_response ON chat_sessions(first_bot_response);

-- Verificar que se agregó correctamente
SELECT 
    COLUMN_NAME, 
    DATA_TYPE, 
    IS_NULLABLE, 
    COLUMN_DEFAULT,
    COLUMN_COMMENT 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'respaldos' 
AND TABLE_NAME = 'chat_sessions' 
AND COLUMN_NAME = 'first_bot_response';