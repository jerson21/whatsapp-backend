-- Schema para sistema de respuestas automáticas de plantillas WhatsApp
-- Este archivo debe ejecutarse en el backend de whatsapp-chat

-- Crear tabla para respuestas automáticas contextuales de plantillas
CREATE TABLE IF NOT EXISTS template_responses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  template_name VARCHAR(100) NOT NULL COMMENT 'Nombre de la plantilla (ej: notificacion_entrega)',
  trigger_keywords JSON NOT NULL COMMENT 'Array de palabras clave que activarán la respuesta',
  response_message TEXT NOT NULL COMMENT 'Mensaje de respuesta automática',
  is_active BOOLEAN DEFAULT TRUE COMMENT 'Si esta configuración está activa',
  priority INT DEFAULT 1 COMMENT 'Prioridad de la regla (mayor número = mayor prioridad)',
  context_duration_hours INT DEFAULT 72 COMMENT 'Horas durante las cuales el contexto permanece válido',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_template_active (template_name, is_active),
  INDEX idx_priority (priority DESC),
  INDEX idx_template_context (template_name, is_active, context_duration_hours)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;