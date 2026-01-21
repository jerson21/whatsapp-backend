-- ============================================================================
-- DESACTIVAR SISTEMA VIEJO DE TEMPLATE_RESPONSES
-- ============================================================================
-- Este script limpia el sistema viejo para usar SOLO conversation_flows
-- ============================================================================

-- 1. Desactivar todas las respuestas del sistema viejo (por si acaso)
UPDATE template_responses SET is_active = FALSE WHERE is_active = TRUE;

-- 2. Mostrar qué se desactivó (para referencia)
SELECT 
    COUNT(*) as respuestas_desactivadas,
    GROUP_CONCAT(DISTINCT template_name) as plantillas_afectadas
FROM template_responses 
WHERE is_active = FALSE;

-- 3. Opcional: Mostrar datos del sistema viejo por si quieres migrar algo manualmente
SELECT 
    template_name,
    trigger_keywords,
    response_message,
    priority,
    created_at
FROM template_responses 
ORDER BY template_name, priority DESC;

-- 4. Verificar que el sistema nuevo esté funcionando
SELECT 
    template_name,
    COUNT(*) as flujos_configurados,
    GROUP_CONCAT(step_name SEPARATOR ' | ') as pasos
FROM conversation_flows 
WHERE is_active = TRUE
GROUP BY template_name
ORDER BY template_name;

-- ============================================================================
-- RESULTADO: Solo conversation_flows estará activo
-- ============================================================================