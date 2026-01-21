-- ============================================================================
-- SCHEMA PARA SISTEMA DE FLUJOS CONVERSACIONALES INTELIGENTES
-- ============================================================================
-- Sistema que permite configurar conversaciones en árbol para templates WhatsApp
-- sin necesidad de tocar código, con soporte para IA contextual
-- Fecha: 2025-08-19
-- ============================================================================

-- Tabla principal: Definición de flujos conversacionales
CREATE TABLE IF NOT EXISTS conversation_flows (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_name VARCHAR(100) NOT NULL COMMENT 'Nombre de la plantilla WhatsApp asociada',
    step_number INT NOT NULL COMMENT 'Número del paso en el flujo (1=inicial)',
    parent_step_id INT NULL COMMENT 'ID del paso padre (NULL para paso inicial)',
    
    -- Identificación del paso
    step_name VARCHAR(150) NULL COMMENT 'Nombre descriptivo del paso para admin',
    step_description TEXT NULL COMMENT 'Descripción del propósito del paso',
    
    -- Condiciones de activación (triggers)
    trigger_keywords JSON NULL COMMENT 'Array de palabras clave que activan este paso',
    trigger_sentiment ENUM('positive', 'negative', 'neutral', 'any') DEFAULT 'any' COMMENT 'Sentiment requerido para activar',
    trigger_exact_match BOOLEAN DEFAULT FALSE COMMENT 'Si requiere coincidencia exacta vs parcial',
    trigger_priority INT DEFAULT 1 COMMENT 'Prioridad cuando múltiples steps coinciden',
    
    -- Configuración de respuesta
    response_text TEXT NOT NULL COMMENT 'Texto de respuesta a enviar al cliente',
    response_type ENUM('fixed', 'ai_assisted', 'escalate_human') DEFAULT 'fixed' COMMENT 'Tipo de respuesta',
    response_variables JSON NULL COMMENT 'Variables dinámicas para personalización',
    
    -- Configuración de flujo
    next_steps JSON NULL COMMENT 'Array de IDs de posibles siguientes pasos',
    max_uses_per_conversation INT DEFAULT 1 COMMENT 'Máximo usos por conversación (evitar loops)',
    timeout_hours INT DEFAULT 72 COMMENT 'Horas después de las cuales expira el contexto',
    
    -- Configuración avanzada
    requires_human_fallback BOOLEAN DEFAULT FALSE COMMENT 'Si debe derivar a humano tras este paso',
    ai_context_prompt TEXT NULL COMMENT 'Prompt específico para IA en respuestas ai_assisted',
    metadata JSON NULL COMMENT 'Metadata adicional configurable',
    
    -- Control y auditoría
    is_active BOOLEAN DEFAULT TRUE COMMENT 'Si el paso está activo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(50) NULL COMMENT 'Usuario que creó el paso',
    
    -- Índices para optimización
    INDEX idx_template_step (template_name, step_number),
    INDEX idx_parent_step (parent_step_id),
    INDEX idx_active (is_active),
    INDEX idx_priority (trigger_priority DESC),
    
    -- Clave foránea
    FOREIGN KEY (parent_step_id) REFERENCES conversation_flows(id) ON DELETE CASCADE,
    
    -- Constraint: Cada template puede tener solo un paso inicial (step_number=1)
    UNIQUE KEY uk_initial_step (template_name, step_number, parent_step_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='Definición de flujos conversacionales para templates WhatsApp';

-- Tabla de sesiones conversacionales activas
CREATE TABLE IF NOT EXISTS conversation_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL COMMENT 'ID de sesión de WhatsApp',
    template_name VARCHAR(100) NOT NULL COMMENT 'Template que inició la conversación',
    
    -- Estado actual de la conversación
    current_step_id INT NULL COMMENT 'Paso actual en el flujo',
    conversation_state ENUM('active', 'completed', 'escalated', 'expired') DEFAULT 'active',
    
    -- Historial y contexto
    step_history JSON NULL COMMENT 'Historial de pasos tomados con timestamps',
    messages_in_flow INT DEFAULT 0 COMMENT 'Número de mensajes intercambiados en este flujo',
    client_responses JSON NULL COMMENT 'Respuestas del cliente para contexto IA',
    
    -- Control temporal
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Cuándo inició la conversación',
    last_interaction_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL COMMENT 'Cuándo expira la conversación si no hay actividad',
    
    -- Métricas
    total_response_time_ms INT DEFAULT 0 COMMENT 'Tiempo total de procesamiento acumulado',
    escalated_to_human BOOLEAN DEFAULT FALSE COMMENT 'Si fue escalada a humano',
    escalation_reason VARCHAR(200) NULL COMMENT 'Razón de escalamiento',
    client_satisfaction ENUM('positive', 'negative', 'neutral') NULL COMMENT 'Feedback del cliente',
    
    -- Índices
    INDEX idx_session_template (session_id, template_name),
    INDEX idx_current_step (current_step_id),
    INDEX idx_state (conversation_state),
    INDEX idx_expires (expires_at),
    INDEX idx_last_interaction (last_interaction_at),
    
    -- Claves foráneas
    FOREIGN KEY (current_step_id) REFERENCES conversation_flows(id) ON DELETE SET NULL,
    
    -- Constraint: Una sesión solo puede tener una conversación por template por momento específico
    UNIQUE KEY uk_active_session (session_id, template_name, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='Sesiones de conversación activas por template';

-- Tabla de estadísticas y analytics
CREATE TABLE IF NOT EXISTS conversation_analytics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_name VARCHAR(100) NOT NULL,
    step_id INT NOT NULL,
    date_recorded DATE NOT NULL,
    
    -- Métricas de uso
    times_triggered INT DEFAULT 0 COMMENT 'Veces que se activó este paso',
    avg_response_time_ms INT DEFAULT 0 COMMENT 'Tiempo promedio de respuesta',
    success_rate DECIMAL(5,2) DEFAULT 0.00 COMMENT 'Porcentaje de éxito (0-100)',
    
    -- Métricas de efectividad
    led_to_resolution INT DEFAULT 0 COMMENT 'Veces que llevó a resolución sin escalamiento',
    led_to_escalation INT DEFAULT 0 COMMENT 'Veces que requirió escalamiento',
    client_abandoned INT DEFAULT 0 COMMENT 'Veces que cliente abandonó después de este paso',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Índices
    INDEX idx_template_analytics (template_name, date_recorded),
    INDEX idx_step_analytics (step_id, date_recorded),
    
    -- Clave foránea
    FOREIGN KEY (step_id) REFERENCES conversation_flows(id) ON DELETE CASCADE,
    
    -- Constraint: Una entrada por step por día
    UNIQUE KEY uk_daily_analytics (template_name, step_id, date_recorded)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='Analíticas y métricas de rendimiento de flujos conversacionales';

-- Verificar que las tablas se crearon correctamente
SELECT 
    TABLE_NAME,
    TABLE_ROWS,
    DATA_LENGTH,
    INDEX_LENGTH,
    (DATA_LENGTH + INDEX_LENGTH) AS TOTAL_SIZE
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME IN ('conversation_flows', 'conversation_sessions', 'conversation_analytics');