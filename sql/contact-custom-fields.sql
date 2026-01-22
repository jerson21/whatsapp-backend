-- ============================================
-- Schema: Contact Custom Fields
-- Persistir variables del usuario entre sesiones
-- Fecha: 2026-01-21
-- ============================================

-- Tabla para guardar variables personalizadas por contacto
CREATE TABLE IF NOT EXISTS contact_custom_fields (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  field_name VARCHAR(100) NOT NULL COMMENT 'Nombre de la variable (ej: nombre, email)',
  field_value TEXT COMMENT 'Valor actual de la variable',
  field_type ENUM('text','number','datetime','boolean','json') DEFAULT 'text',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY unique_phone_field (phone, field_name),
  INDEX idx_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla para registrar flujos completados por usuario
CREATE TABLE IF NOT EXISTS contact_completed_flows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  flow_id INT NOT NULL,
  flow_slug VARCHAR(100),
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY unique_phone_flow (phone, flow_id),
  INDEX idx_phone (phone),
  INDEX idx_flow (flow_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
