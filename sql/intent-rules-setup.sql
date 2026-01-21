-- ============================================
-- Setup: Reglas de Intent para Visual Flows
-- Ejecutar en el servidor para que MessageClassifier funcione
-- Fecha: 2026-01-21
-- ============================================

-- Crear tabla si no existe
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

-- Limpiar reglas existentes para re-insertar
DELETE FROM classifier_rules WHERE type = 'intent';
DELETE FROM classifier_rules WHERE type = 'urgency';
DELETE FROM classifier_rules WHERE type = 'lead_score';

-- ============================================
-- REGLAS DE INTENT
-- ============================================

-- 🎯 SALUDO - Prioridad más alta para que matchee "hola"
INSERT INTO classifier_rules (name, type, conditions, result_value, priority, active) VALUES
('Intención: Saludo', 'intent',
 '{"keywords": ["hola", "ola", "buenos dias", "buenas tardes", "buenas noches", "hey", "que tal", "hi", "hello", "buen dia"], "patterns": ["^hola$", "^hey$", "^hi$", "^ola$", "^(buenos|buenas|buen) (dias|tardes|noches|dia)$"]}',
 'greeting', 200, TRUE);

-- 💰 VENTAS - Precios
INSERT INTO classifier_rules (name, type, conditions, result_value, priority, active) VALUES
('Intención: Ventas - Precios', 'intent',
 '{"keywords": ["precio", "precios", "costo", "cuesta", "vale", "cuanto", "cotizacion", "cotizar", "presupuesto", "tarifa"], "patterns": ["cuanto (vale|cuesta|sale)", "precio de", "me puedes cotizar", "cuanto me sale"]}',
 'sales', 100, TRUE);

-- 🛒 VENTAS - Compra
INSERT INTO classifier_rules (name, type, conditions, result_value, priority, active) VALUES
('Intención: Ventas - Compra', 'intent',
 '{"keywords": ["comprar", "adquirir", "pedir", "ordenar", "quiero", "necesito", "me interesa", "contratar"], "patterns": ["quiero (comprar|pedir|ordenar)", "me interesa (el|la|un|una)", "necesito (el|la|un|una)"]}',
 'sales', 95, TRUE);

-- 🆘 SOPORTE - Problema
INSERT INTO classifier_rules (name, type, conditions, result_value, priority, active) VALUES
('Intención: Soporte - Problema', 'intent',
 '{"keywords": ["problema", "error", "falla", "no funciona", "ayuda", "no puedo", "no me deja", "no sirve", "no carga"], "patterns": ["no (funciona|sirve|carga)", "tengo (un|problemas)", "me ayudan"]}',
 'support', 90, TRUE);

-- 😠 RECLAMO
INSERT INTO classifier_rules (name, type, conditions, result_value, priority, active) VALUES
('Intención: Reclamo', 'intent',
 '{"keywords": ["reclamo", "queja", "molesto", "enojado", "terrible", "pesimo", "malo", "decepcionado", "fraude", "estafa"], "patterns": ["quiero (reclamar|quejarme)", "esto es (terrible|pesimo)"]}',
 'complaint', 95, TRUE);

-- ℹ️ INFORMACIÓN
INSERT INTO classifier_rules (name, type, conditions, result_value, priority, active) VALUES
('Intención: Información', 'intent',
 '{"keywords": ["informacion", "info", "saber", "conocer", "detalles", "caracteristicas", "como funciona", "que es"], "patterns": ["(que|qué) es", "como funciona", "me puedes (explicar|contar)", "que (servicios|productos) tienen"]}',
 'info', 80, TRUE);

-- 📦 CONSULTA PEDIDO
INSERT INTO classifier_rules (name, type, conditions, result_value, priority, active) VALUES
('Intención: Consulta Pedido', 'intent',
 '{"keywords": ["pedido", "orden", "envio", "despacho", "seguimiento", "tracking", "donde esta", "cuando llega"], "patterns": ["(estado|seguimiento) (de|del|mi) (pedido|orden)", "donde (esta|va) mi (pedido|orden)"]}',
 'order_status', 85, TRUE);

-- 📅 AGENDAR
INSERT INTO classifier_rules (name, type, conditions, result_value, priority, active) VALUES
('Intención: Agendar', 'intent',
 '{"keywords": ["agendar", "cita", "reservar", "hora", "programar", "agenda"], "patterns": ["(agendar|reservar) (una|hora|cita)", "quiero (agendar|reservar)"]}',
 'schedule', 85, TRUE);

-- ============================================
-- REGLAS DE URGENCIA
-- ============================================

INSERT INTO classifier_rules (name, type, conditions, result_value, priority, active) VALUES
('Urgencia: Alta - Palabras clave', 'urgency',
 '{"keywords": ["urgente", "urgentemente", "ahora", "ya", "inmediato", "asap", "lo antes posible", "cuanto antes", "emergencia"]}',
 'high', 100, TRUE);

INSERT INTO classifier_rules (name, type, conditions, result_value, priority, active) VALUES
('Urgencia: Alta - Contexto', 'urgency',
 '{"patterns": ["(necesito|requiero) (urgente|ahora|ya)", "es (muy )?urgente", "para (hoy|mañana)"]}',
 'high', 90, TRUE);

INSERT INTO classifier_rules (name, type, conditions, result_value, priority, active) VALUES
('Urgencia: Media', 'urgency',
 '{"keywords": ["pronto", "cuando puedas", "esta semana"], "patterns": ["(podrias|puedes) (ayudarme|responderme)"]}',
 'medium', 50, TRUE);

-- ============================================
-- REGLAS DE LEAD SCORING
-- ============================================

INSERT INTO classifier_rules (name, type, conditions, result_value, score_modifier, priority, active) VALUES
('Lead: Pregunta precio (+15)', 'lead_score',
 '{"keywords": ["precio", "costo", "cuanto"]}',
 NULL, 15, 100, TRUE);

INSERT INTO classifier_rules (name, type, conditions, result_value, score_modifier, priority, active) VALUES
('Lead: Intención compra (+25)', 'lead_score',
 '{"keywords": ["comprar", "pedir", "ordenar", "quiero"]}',
 NULL, 25, 100, TRUE);

INSERT INTO classifier_rules (name, type, conditions, result_value, score_modifier, priority, active) VALUES
('Lead: Reclamo (-10)', 'lead_score',
 '{"keywords": ["reclamo", "queja", "terrible", "pesimo"]}',
 NULL, -10, 100, TRUE);

-- ============================================
-- Verificar reglas insertadas
-- ============================================
SELECT id, name, type, result_value, priority, active FROM classifier_rules ORDER BY type, priority DESC;
