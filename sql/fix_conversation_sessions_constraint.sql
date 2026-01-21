-- ============================================================================
-- CORRECCIÓN DEL CONSTRAINT PROBLEMÁTICO EN CONVERSATION_SESSIONS
-- ============================================================================
-- El constraint uk_active_session está causando errores de duplicate entry
-- Lo cambiamos para permitir múltiples estados por sesión/template
-- Fecha: 2025-08-19
-- ============================================================================

-- Remover el constraint problemático
ALTER TABLE conversation_sessions DROP INDEX uk_active_session;

-- Agregar un constraint más flexible que permita cambios de estado
-- Solo prevenir duplicados para sesiones activas del mismo template
ALTER TABLE conversation_sessions ADD CONSTRAINT uk_active_session_flexible 
UNIQUE (session_id, template_name, conversation_state, started_at);

-- Verificar que el cambio fue aplicado
SHOW INDEX FROM conversation_sessions WHERE Key_name = 'uk_active_session_flexible';