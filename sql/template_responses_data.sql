-- ============================================================================
-- SISTEMA VIEJO DESACTIVADO - USAR SOLO CONVERSATION_FLOWS
-- ============================================================================
-- Este archivo ya no carga datos automáticamente.
-- Todas las respuestas se configuran ahora via conversation-flows-simple.php
-- ============================================================================

-- Las siguientes respuestas estaban pre-cargadas anteriormente:
-- - notificacion_entrega (respuestas para "si", "no", "cuando", "direccion") 
-- - confirmacion_de_entrega (respuestas para "recibido", "problema")
-- - recordatorio_pago (respuestas para "si", "no puedo")
--
-- AHORA: Configurar manualmente usando el Configurador Simple
-- ============================================================================

-- Si necesitas la tabla por compatibilidad, la creamos vacía:
-- (Pero el sistema ya no la usará)
SELECT 'Sistema template_responses desactivado - usar conversation_flows' as status;