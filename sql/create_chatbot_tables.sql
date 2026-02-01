-- ============================================================================
-- CREACIÓN DE TABLAS PARA CONFIGURACIÓN DEL CHATBOT
-- ============================================================================
-- Script para crear las tablas necesarias para la configuración del chatbot
-- Fecha: 2025-01-14
-- ============================================================================

-- Crear tabla para configuración general del chatbot
CREATE TABLE IF NOT EXISTS chatbot_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bot_enabled BOOLEAN DEFAULT FALSE COMMENT 'Indica si el bot está habilitado globalmente',
    auto_mode BOOLEAN DEFAULT FALSE COMMENT 'Modo automático para nuevas conversaciones',
    ai_model VARCHAR(50) DEFAULT 'gpt-4o-mini' COMMENT 'Modelo de IA a utilizar',
    ai_temperature DECIMAL(3,2) DEFAULT 0.7 COMMENT 'Temperatura del modelo (0.0-1.0)',
    ai_max_tokens INT DEFAULT 150 COMMENT 'Máximo de tokens en respuesta',
    response_timeout INT DEFAULT 10000 COMMENT 'Timeout en milisegundos para respuestas',
    personality_settings JSON NULL COMMENT 'Configuración de personalidad del bot',
    welcome_message TEXT NULL COMMENT 'Mensaje de bienvenida personalizado',
    fallback_message TEXT NULL COMMENT 'Mensaje cuando no se detecta intención',
    custom_instructions TEXT NULL COMMENT 'Instrucciones personalizadas del admin para el prompt de IA',
    system_prompt TEXT NULL COMMENT 'System prompt editable — personalidad y reglas base de la IA',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de creación',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de última actualización',
    
    -- Índices para optimizar consultas
    INDEX idx_chatbot_enabled (bot_enabled),
    INDEX idx_chatbot_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Configuración general del chatbot';

-- Crear tabla para intenciones/categorías del chatbot
CREATE TABLE IF NOT EXISTS chatbot_intentions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT 'Nombre único de la intención',
    display_name VARCHAR(150) NULL COMMENT 'Nombre para mostrar en interfaz',
    description TEXT NULL COMMENT 'Descripción de la intención',
    keywords JSON NULL COMMENT 'Palabras clave para detección automática',
    examples JSON NULL COMMENT 'Ejemplos de mensajes que activan esta intención',
    priority INT DEFAULT 0 COMMENT 'Prioridad de la intención (mayor número = mayor prioridad)',
    response_template TEXT NULL COMMENT 'Plantilla de respuesta automática',
    requires_human BOOLEAN DEFAULT FALSE COMMENT 'Si requiere intervención humana',
    active BOOLEAN DEFAULT TRUE COMMENT 'Si la intención está activa',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de creación',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de última actualización',
    
    -- Índices para optimizar consultas
    UNIQUE INDEX idx_intention_name (name),
    INDEX idx_intention_active (active),
    INDEX idx_intention_priority (priority DESC),
    INDEX idx_intention_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Intenciones y categorías del chatbot';

-- Crear tabla para logs de detección de intenciones
CREATE TABLE IF NOT EXISTS chatbot_intention_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    phone_number VARCHAR(20) NOT NULL COMMENT 'Número de teléfono del cliente',
    message_text TEXT NOT NULL COMMENT 'Texto del mensaje recibido',
    detected_intention VARCHAR(100) NULL COMMENT 'Intención detectada',
    confidence_score DECIMAL(4,3) NULL COMMENT 'Puntuación de confianza (0.000-1.000)',
    response_sent TEXT NULL COMMENT 'Respuesta enviada automáticamente',
    processing_time_ms INT NULL COMMENT 'Tiempo de procesamiento en milisegundos',
    ai_model_used VARCHAR(50) NULL COMMENT 'Modelo de IA utilizado',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de procesamiento',
    
    -- Índices para optimizar consultas
    INDEX idx_log_phone (phone_number),
    INDEX idx_log_intention (detected_intention),
    INDEX idx_log_created (created_at),
    INDEX idx_log_confidence (confidence_score DESC),
    
    -- Clave foránea con chatbot_intentions
    FOREIGN KEY (detected_intention) REFERENCES chatbot_intentions(name) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Logs de detección de intenciones del chatbot';

-- Insertar configuración inicial
INSERT INTO chatbot_config (
    bot_enabled, 
    auto_mode, 
    ai_model, 
    ai_temperature, 
    ai_max_tokens,
    personality_settings,
    welcome_message,
    fallback_message
) VALUES (
    TRUE,
    TRUE,
    'gpt-4o-mini',
    0.7,
    150,
    JSON_OBJECT(
        'tone', 'professional',
        'style', 'helpful',
        'language', 'spanish',
        'company_name', 'Respaldos Chile',
        'business_type', 'logistics'
    ),
    '¡Hola! Soy el asistente virtual de Respaldos Chile. ¿En qué puedo ayudarte hoy?',
    'Gracias por tu mensaje. Un representante te atenderá pronto. Si tu consulta es urgente, puedes llamarnos directamente.'
) ON DUPLICATE KEY UPDATE id=id;

-- Insertar intenciones predeterminadas
INSERT INTO chatbot_intentions (name, display_name, description, keywords, examples, priority, response_template, requires_human, active) VALUES
('greeting', 'Saludo', 'Mensajes de saludo inicial', 
 JSON_ARRAY('hola', 'buenos días', 'buenas tardes', 'buenas noches', 'saludos', 'hey'),
 JSON_ARRAY('Hola, ¿cómo están?', 'Buenos días', 'Buenas tardes, necesito información'),
 10, '¡Hola! Bienvenido a Respaldos Chile. ¿En qué puedo ayudarte hoy?', FALSE, TRUE),

('pricing', 'Consulta de Precios', 'Preguntas sobre precios y tarifas',
 JSON_ARRAY('precio', 'costo', 'tarifa', 'cuánto cuesta', 'valor', 'cotización'),
 JSON_ARRAY('¿Cuánto cuesta enviar a Santiago?', 'Necesito una cotización', 'Precios para envío'),
 8, 'Con gusto te ayudo con información de precios. Para darte una cotización exacta, necesito algunos datos. Un momento por favor...', TRUE, TRUE),

('tracking', 'Seguimiento de Envío', 'Consultas sobre estado de envíos',
 JSON_ARRAY('rastrear', 'seguimiento', 'dónde está', 'estado', 'tracking', 'ubicación'),
 JSON_ARRAY('¿Dónde está mi paquete?', 'Quiero rastrear mi envío', 'Estado de mi pedido'),
 9, 'Te ayudo a rastrear tu envío. Por favor proporciona tu número de guía o código de seguimiento.', TRUE, TRUE),

('complaint', 'Reclamo o Problema', 'Reclamos y problemas con el servicio',
 JSON_ARRAY('reclamo', 'problema', 'queja', 'dañado', 'perdido', 'demora', 'retraso'),
 JSON_ARRAY('Tengo un reclamo', 'Mi paquete llegó dañado', 'Hay un problema con mi envío'),
 10, 'Lamento mucho los inconvenientes. Tu caso es importante para nosotros. Te conecto inmediatamente con un representante para resolverlo.', TRUE, TRUE),

('general_info', 'Información General', 'Consultas generales sobre servicios',
 JSON_ARRAY('información', 'servicios', 'horarios', 'sucursales', 'contacto'),
 JSON_ARRAY('¿Qué servicios ofrecen?', 'Horarios de atención', 'Dónde tienen oficinas'),
 5, 'Te proporciono información sobre nuestros servicios. Somos una empresa de logística con cobertura nacional. ¿Hay algo específico que te interese?', FALSE, TRUE)

ON DUPLICATE KEY UPDATE name=VALUES(name);

-- Verificar que las tablas se crearon correctamente
SELECT 
    TABLE_NAME,
    TABLE_ROWS,
    DATA_LENGTH,
    INDEX_LENGTH,
    (DATA_LENGTH + INDEX_LENGTH) AS TOTAL_SIZE
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME IN ('chatbot_config', 'chatbot_intentions', 'chatbot_intention_logs');