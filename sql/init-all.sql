-- ============================================
-- SCRIPT DE INICIALIZACIÓN COMPLETO
-- Ejecutar después de un deploy nuevo
-- Fecha: 2026-01-21
-- ============================================

-- ============================================
-- 1. TABLAS BASE DEL CLASSIFIER
-- ============================================
CREATE TABLE IF NOT EXISTS classifier_rules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  type ENUM('intent', 'urgency', 'lead_score', 'sentiment') NOT NULL,
  conditions JSON NOT NULL,
  result_value VARCHAR(50),
  score_modifier INT DEFAULT 0,
  priority INT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_type_active (type, active),
  INDEX idx_priority (priority DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_classifications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id VARCHAR(100),
  phone VARCHAR(50) NOT NULL,
  message_text TEXT NOT NULL,
  classification JSON NOT NULL,
  flow_triggered VARCHAR(100),
  was_correct BOOLEAN,
  corrected_intent VARCHAR(50),
  classified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session (session_id),
  INDEX idx_phone (phone),
  INDEX idx_date (classified_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_scores (
  id INT PRIMARY KEY AUTO_INCREMENT,
  phone VARCHAR(50) NOT NULL UNIQUE,
  current_score INT DEFAULT 0,
  score_breakdown JSON,
  score_history JSON,
  total_messages INT DEFAULT 0,
  total_sessions INT DEFAULT 0,
  total_purchases DECIMAL(10,2) DEFAULT 0,
  avg_response_time_seconds INT,
  status ENUM('new', 'engaged', 'qualified', 'customer', 'inactive') DEFAULT 'new',
  first_contact TIMESTAMP,
  last_interaction TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_score (current_score DESC),
  INDEX idx_status (status),
  INDEX idx_last_interaction (last_interaction)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS visual_flows (
  id INT PRIMARY KEY AUTO_INCREMENT,
  slug VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  trigger_config JSON NOT NULL,
  nodes JSON NOT NULL,
  connections JSON NOT NULL,
  variables JSON,
  is_active BOOLEAN DEFAULT FALSE,
  is_default BOOLEAN DEFAULT FALSE,
  version INT DEFAULT 1,
  published_at TIMESTAMP,
  times_triggered INT DEFAULT 0,
  times_completed INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_active (is_active),
  INDEX idx_default (is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 2. TABLAS DE MEMORIA PERSISTENTE
-- ============================================
CREATE TABLE IF NOT EXISTS contact_custom_fields (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_value TEXT,
  field_type ENUM('text','number','datetime','boolean','json') DEFAULT 'text',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_phone_field (phone, field_name),
  INDEX idx_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS flow_execution_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  flow_id INT,
  flow_name VARCHAR(100),
  flow_slug VARCHAR(100),
  phone VARCHAR(20) NOT NULL,
  session_id VARCHAR(100),
  status ENUM('running', 'completed', 'failed', 'transferred', 'abandoned') DEFAULT 'running',
  trigger_message TEXT,
  trigger_type VARCHAR(50),
  classification JSON,
  steps JSON,
  variables JSON,
  total_nodes_executed INT DEFAULT 0,
  total_duration_ms INT,
  final_node_id VARCHAR(100),
  final_node_type VARCHAR(50),
  was_transferred BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  error_node_id VARCHAR(100),
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  INDEX idx_flow (flow_id),
  INDEX idx_phone (phone),
  INDEX idx_status (status),
  INDEX idx_started (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 3. REGLAS DEL CLASSIFIER
-- ============================================
DELETE FROM classifier_rules WHERE type IN ('intent', 'urgency', 'lead_score');

-- INTENTS
INSERT INTO classifier_rules (name, type, conditions, result_value, priority, active) VALUES
('Intención: Saludo', 'intent',
 '{"keywords": ["hola", "ola", "buenos dias", "buenas tardes", "buenas noches", "hey", "que tal", "hi", "hello", "buen dia"], "patterns": ["^hola$", "^hey$", "^hi$", "^ola$", "^(buenos|buenas|buen) (dias|tardes|noches|dia)$"]}',
 'greeting', 200, TRUE),

('Intención: Ventas - Precios', 'intent',
 '{"keywords": ["precio", "precios", "costo", "cuesta", "vale", "cuanto", "cotizacion", "cotizar", "presupuesto", "tarifa"], "patterns": ["cuanto (vale|cuesta|sale)", "precio de", "me puedes cotizar", "cuanto me sale"]}',
 'sales', 100, TRUE),

('Intención: Ventas - Compra', 'intent',
 '{"keywords": ["comprar", "adquirir", "pedir", "ordenar", "quiero", "necesito", "me interesa", "contratar"], "patterns": ["quiero (comprar|pedir|ordenar)", "me interesa (el|la|un|una)", "necesito (el|la|un|una)"]}',
 'sales', 95, TRUE),

('Intención: Soporte - Problema', 'intent',
 '{"keywords": ["problema", "error", "falla", "no funciona", "ayuda", "no puedo", "no me deja", "no sirve", "no carga"], "patterns": ["no (funciona|sirve|carga)", "tengo (un|problemas)", "me ayudan"]}',
 'support', 90, TRUE),

('Intención: Reclamo', 'intent',
 '{"keywords": ["reclamo", "queja", "molesto", "enojado", "terrible", "pesimo", "malo", "decepcionado", "fraude", "estafa"], "patterns": ["quiero (reclamar|quejarme)", "esto es (terrible|pesimo)"]}',
 'complaint', 95, TRUE),

('Intención: Información', 'intent',
 '{"keywords": ["informacion", "info", "saber", "conocer", "detalles", "caracteristicas", "como funciona", "que es"], "patterns": ["(que|qué) es", "como funciona", "me puedes (explicar|contar)", "que (servicios|productos) tienen"]}',
 'info', 80, TRUE),

('Intención: Consulta Pedido', 'intent',
 '{"keywords": ["pedido", "orden", "envio", "despacho", "seguimiento", "tracking", "donde esta", "cuando llega"], "patterns": ["(estado|seguimiento) (de|del|mi) (pedido|orden)", "donde (esta|va) mi (pedido|orden)"]}',
 'order_status', 85, TRUE),

('Intención: Agendar', 'intent',
 '{"keywords": ["agendar", "cita", "reservar", "hora", "programar", "agenda"], "patterns": ["(agendar|reservar) (una|hora|cita)", "quiero (agendar|reservar)"]}',
 'schedule', 85, TRUE);

-- URGENCIA
INSERT INTO classifier_rules (name, type, conditions, result_value, priority, active) VALUES
('Urgencia: Alta - Palabras clave', 'urgency',
 '{"keywords": ["urgente", "urgentemente", "ahora", "ya", "inmediato", "asap", "lo antes posible", "cuanto antes", "emergencia"]}',
 'high', 100, TRUE),

('Urgencia: Alta - Contexto', 'urgency',
 '{"patterns": ["(necesito|requiero) (urgente|ahora|ya)", "es (muy )?urgente", "para (hoy|mañana)"]}',
 'high', 90, TRUE),

('Urgencia: Media', 'urgency',
 '{"keywords": ["pronto", "cuando puedas", "esta semana"], "patterns": ["(podrias|puedes) (ayudarme|responderme)"]}',
 'medium', 50, TRUE);

-- LEAD SCORING
INSERT INTO classifier_rules (name, type, conditions, result_value, score_modifier, priority, active) VALUES
('Lead: Pregunta precio (+15)', 'lead_score',
 '{"keywords": ["precio", "costo", "cuanto"]}',
 NULL, 15, 100, TRUE),

('Lead: Intención compra (+25)', 'lead_score',
 '{"keywords": ["comprar", "pedir", "ordenar", "quiero"]}',
 NULL, 25, 100, TRUE),

('Lead: Reclamo (-10)', 'lead_score',
 '{"keywords": ["reclamo", "queja", "terrible", "pesimo"]}',
 NULL, -10, 100, TRUE);

-- ============================================
-- 4. FLUJOS VISUALES BASE
-- ============================================
DELETE FROM visual_flows WHERE slug IN ('saludo-bienvenida', 'embudo-soporte', 'embudo-ventas');

-- Flujo: Saludo y Bienvenida
INSERT INTO visual_flows (slug, name, description, trigger_config, nodes, connections, variables, is_active) VALUES
('saludo-bienvenida', 'Saludo y Bienvenida', 'Flujo de onboarding para nuevos usuarios',
 '{"type": "intent", "intents": ["greeting"], "confidence_threshold": 0.6}',
 '[
   {"id": "trigger", "type": "trigger", "content": "Cuando intención = saludo"},
   {"id": "delay1", "type": "delay", "seconds": 2, "typing_indicator": true},
   {"id": "greeting", "type": "message", "content": "¡Hola! 👋 Bienvenido/a. Soy tu asistente virtual de Respaldos Chile."},
   {"id": "ask_name", "type": "question", "content": "¿Cómo te llamas?", "variable": "nombre"},
   {"id": "ask_interest", "type": "question", "content": "Mucho gusto {{nombre}}! ¿En qué puedo ayudarte hoy?", "variable": "interes", "options": [
     {"label": "Información de productos", "value": "productos"},
     {"label": "Soporte técnico", "value": "soporte"},
     {"label": "Hablar con un agente", "value": "agente"}
   ]},
   {"id": "save_contact", "type": "action", "action": "save_lead", "payload": {"name": "{{nombre}}", "interest": "{{interes}}"}},
   {"id": "ai_welcome", "type": "ai_response", "system_prompt": "Eres un asistente amable. Genera un mensaje corto (máximo 2 líneas) personalizado basado en el nombre e interés del cliente.", "user_prompt": "Nombre: {{nombre}}. Interés: {{interes}}. Genera un mensaje apropiado.", "model": "gpt-4o-mini", "temperature": 0.8, "max_tokens": 100},
   {"id": "end", "type": "end"}
 ]',
 '[
   {"from": "trigger", "to": "delay1"},
   {"from": "delay1", "to": "greeting"},
   {"from": "greeting", "to": "ask_name"},
   {"from": "ask_name", "to": "ask_interest"},
   {"from": "ask_interest", "to": "save_contact"},
   {"from": "save_contact", "to": "ai_welcome"},
   {"from": "ai_welcome", "to": "end"}
 ]',
 '{"nombre": "", "interes": ""}',
 TRUE);

-- Flujo: Embudo de Soporte
INSERT INTO visual_flows (slug, name, description, trigger_config, nodes, connections, variables, is_active) VALUES
('embudo-soporte', 'Embudo de Soporte', 'Flujo para reclamos y soporte técnico',
 '{"type": "intent", "intents": ["complaint", "support"], "confidence_threshold": 0.5}',
 '[
   {"id": "trigger", "type": "trigger", "content": "Cuando intención = soporte/reclamo"},
   {"id": "greeting", "type": "message", "content": "Lamento que tengas un problema. Estoy aquí para ayudarte."},
   {"id": "issue_type", "type": "question", "content": "¿Qué tipo de problema tienes?", "variable": "issue_type", "options": [
     {"label": "Producto defectuoso", "value": "defective"},
     {"label": "No llegó mi pedido", "value": "shipping"},
     {"label": "Facturación", "value": "billing"},
     {"label": "Otro", "value": "other"}
   ]},
   {"id": "details", "type": "question", "content": "Por favor, cuéntame más detalles sobre tu problema:", "variable": "issue_details"},
   {"id": "transfer", "type": "transfer", "content": "Entiendo tu situación. Te comunico con un agente que te ayudará a resolver esto."}
 ]',
 '[
   {"from": "trigger", "to": "greeting"},
   {"from": "greeting", "to": "issue_type"},
   {"from": "issue_type", "to": "details"},
   {"from": "details", "to": "transfer"}
 ]',
 '{"issue_type": "", "issue_details": ""}',
 TRUE);

-- Flujo: Embudo de Ventas (transfer rápido a agente humano)
INSERT INTO visual_flows (slug, name, description, trigger_config, nodes, connections, variables, is_active) VALUES
('embudo-ventas', 'Embudo de Ventas', 'Detecta intención de compra y transfiere a agente de ventas',
 '{"type": "intent", "intents": ["sales"], "confidence_threshold": 0.5}',
 '[
   {"id": "trigger", "type": "trigger", "content": "Cuando intención = ventas"},
   {"id": "welcome", "type": "message", "content": "¡Entendido! Te conecto con un asesor de ventas que te ayudará personalmente."},
   {"id": "transfer", "type": "transfer", "content": "Un momento, estoy transfiriendo tu consulta a nuestro equipo de ventas..."}
 ]',
 '[
   {"from": "trigger", "to": "welcome"},
   {"from": "welcome", "to": "transfer"}
 ]',
 '{}',
 TRUE);

-- ============================================
-- VERIFICAR RESULTADO
-- ============================================
SELECT 'Classifier Rules' as tabla, COUNT(*) as total FROM classifier_rules WHERE active = TRUE
UNION ALL
SELECT 'Visual Flows' as tabla, COUNT(*) as total FROM visual_flows WHERE is_active = TRUE;
