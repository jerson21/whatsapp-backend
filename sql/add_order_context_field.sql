-- Agregar campo para mantener contexto del pedido actual
-- Esto nos permite saber qué pedido específico está consultando el cliente

ALTER TABLE chat_sessions 
ADD COLUMN current_order_context VARCHAR(20) NULL COMMENT 'num_orden del pedido en contexto (extraído de codigo_seguimiento)',
ADD COLUMN order_context_expires TIMESTAMP NULL COMMENT 'Cuándo expira el contexto del pedido (24-48 horas)';

-- Índice para consultas rápidas por contexto
CREATE INDEX idx_chat_sessions_order_context ON chat_sessions(current_order_context);