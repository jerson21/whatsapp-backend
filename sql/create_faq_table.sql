-- ============================================================================
-- CREACIÓN DE TABLA FAQ_ENTRIES
-- ============================================================================
-- Script para migrar el sistema de FAQ de archivo JSON a base de datos MySQL
-- Fecha: 2025-01-14
-- ============================================================================

-- Crear tabla para almacenar las preguntas frecuentes
CREATE TABLE IF NOT EXISTS faq_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NULL COMMENT 'Título opcional de la pregunta',
    question TEXT NOT NULL COMMENT 'Texto de la pregunta',
    answer TEXT NOT NULL COMMENT 'Respuesta a la pregunta',
    tags JSON NULL COMMENT 'Array de tags/categorías en formato JSON',
    active BOOLEAN DEFAULT TRUE COMMENT 'Indica si la FAQ está activa para sugerencias',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de creación',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de última actualización',
    
    -- Índices para optimizar consultas
    INDEX idx_faq_active (active),
    INDEX idx_faq_created (created_at),
    INDEX idx_faq_updated (updated_at),
    
    -- Índice para búsqueda en tags (MySQL 5.7+)
    INDEX idx_faq_tags ((CAST(tags AS CHAR(1000))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tabla para almacenar preguntas frecuentes del chatbot';

-- Verificar que la tabla se creó correctamente
SELECT 
    TABLE_NAME,
    TABLE_ROWS,
    DATA_LENGTH,
    INDEX_LENGTH,
    (DATA_LENGTH + INDEX_LENGTH) AS TOTAL_SIZE
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'faq_entries';
