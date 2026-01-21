-- ============================================
-- Schema: Message Classifier & Lead Scoring
-- Fecha: 2026-01-20
-- ============================================

-- Reglas de clasificación
-- Permite definir reglas basadas en keywords, patrones, etc.
CREATE TABLE IF NOT EXISTS classifier_rules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Tipo de clasificación
  type ENUM('intent', 'urgency', 'lead_score', 'sentiment') NOT NULL,

  -- Condiciones en JSON
  -- Ejemplo intent: {"keywords": ["precio", "costo"], "patterns": ["cuanto (vale|cuesta)"], "exclude": ["no me interesa"]}
  -- Ejemplo urgency: {"keywords": ["urgente", "ahora", "ya"], "time_based": {"outside_hours": true}}
  -- Ejemplo lead_score: {"has_previous_purchase": true, "message_count_min": 5}
  conditions JSON NOT NULL,

  -- Resultado
  result_value VARCHAR(50),        -- Para intent: 'sales', 'support'. Para urgency: 'high', 'low'
  score_modifier INT DEFAULT 0,    -- Para lead_score: +10, -5, etc.

  -- Prioridad (mayor = se evalúa primero)
  priority INT DEFAULT 0,

  -- Estado
  active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_type_active (type, active),
  INDEX idx_priority (priority DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Historial de clasificaciones
-- Guarda cada mensaje clasificado para análisis y mejora del sistema
CREATE TABLE IF NOT EXISTS message_classifications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,

  -- Identificación
  session_id VARCHAR(100),
  phone VARCHAR(50) NOT NULL,

  -- Mensaje original
  message_text TEXT NOT NULL,

  -- Resultado de clasificación (JSON completo)
  classification JSON NOT NULL,
  /*
  {
    "intent": {"type": "sales", "confidence": 0.85, "matched_rule": 5},
    "urgency": {"level": "medium", "signals": []},
    "lead_score": {"value": 65, "factors": {...}},
    "sentiment": "neutral"
  }
  */

  -- Flujo que se activó (si aplica)
  flow_triggered VARCHAR(100),

  -- Para feedback y mejora
  was_correct BOOLEAN,              -- NULL = no evaluado, TRUE/FALSE = feedback humano
  corrected_intent VARCHAR(50),     -- Si fue incorrecto, cuál era el correcto

  classified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_session (session_id),
  INDEX idx_phone (phone),
  INDEX idx_date (classified_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Lead Scoring
-- Mantiene score acumulativo por contacto
CREATE TABLE IF NOT EXISTS lead_scores (
  id INT PRIMARY KEY AUTO_INCREMENT,

  phone VARCHAR(50) NOT NULL UNIQUE,

  -- Score actual (0-100)
  current_score INT DEFAULT 0,

  -- Desglose del score
  score_breakdown JSON,
  /*
  {
    "engagement": 25,        -- Basado en interacciones
    "purchase_history": 30,  -- Compras previas
    "recency": 15,          -- Qué tan reciente fue contacto
    "intent_signals": 20,   -- Señales de intención de compra
    "profile_completion": 10 -- Datos que tenemos
  }
  */

  -- Historial de cambios de score
  score_history JSON,
  /*
  [
    {"date": "2026-01-15", "score": 45, "reason": "Primera compra"},
    {"date": "2026-01-18", "score": 65, "reason": "Pregunta por nuevo producto"}
  ]
  */

  -- Métricas de comportamiento
  total_messages INT DEFAULT 0,
  total_sessions INT DEFAULT 0,
  total_purchases DECIMAL(10,2) DEFAULT 0,
  avg_response_time_seconds INT,

  -- Estado del lead
  status ENUM('new', 'engaged', 'qualified', 'customer', 'inactive') DEFAULT 'new',

  -- Última actividad
  first_contact TIMESTAMP,
  last_interaction TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_score (current_score DESC),
  INDEX idx_status (status),
  INDEX idx_last_interaction (last_interaction)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Flujos visuales
-- Almacena los flujos creados en el editor visual
CREATE TABLE IF NOT EXISTS visual_flows (
  id INT PRIMARY KEY AUTO_INCREMENT,

  -- Identificación
  slug VARCHAR(100) NOT NULL UNIQUE,  -- URL-friendly identifier
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Trigger: cuándo se activa este flujo
  trigger_config JSON NOT NULL,
  /*
  {
    "type": "classification",  -- o "keyword", "event", "scheduled"
    "conditions": {
      "intent": ["sales", "info"],
      "urgency": "high",
      "lead_score_min": 50
    }
  }
  */

  -- Nodos del flujo (array de nodos)
  nodes JSON NOT NULL,

  -- Conexiones entre nodos
  connections JSON NOT NULL,

  -- Variables disponibles en el flujo
  variables JSON,

  -- Estado
  is_active BOOLEAN DEFAULT FALSE,
  is_default BOOLEAN DEFAULT FALSE,  -- Flujo por defecto si ninguno matchea

  -- Versionamiento
  version INT DEFAULT 1,
  published_at TIMESTAMP,

  -- Estadísticas
  times_triggered INT DEFAULT 0,
  times_completed INT DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_active (is_active),
  INDEX idx_default (is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================
-- DATOS INICIALES: Reglas de clasificación
-- ============================================

INSERT INTO classifier_rules (name, type, conditions, result_value, priority, active) VALUES

-- INTENCIONES
('Intención: Ventas - Precios', 'intent',
 '{"keywords": ["precio", "precios", "costo", "cuesta", "vale", "cuanto", "cotización", "cotizar", "presupuesto"], "patterns": ["cuanto (vale|cuesta|sale)", "precio de", "me puedes cotizar"]}',
 'sales', 100, TRUE),

('Intención: Ventas - Compra', 'intent',
 '{"keywords": ["comprar", "adquirir", "pedir", "ordenar", "quiero", "necesito", "me interesa"], "patterns": ["quiero (comprar|pedir|ordenar)", "me interesa (el|la|un|una)"]}',
 'sales', 95, TRUE),

('Intención: Soporte - Problema', 'intent',
 '{"keywords": ["problema", "error", "falla", "no funciona", "ayuda", "no puedo", "no me deja"], "patterns": ["no (funciona|sirve|carga)", "tengo (un|problemas)"]}',
 'support', 90, TRUE),

('Intención: Soporte - Reclamo', 'intent',
 '{"keywords": ["reclamo", "queja", "molesto", "enojado", "terrible", "pésimo", "malo", "decepcionado"], "patterns": ["quiero (reclamar|quejarme)", "esto es (terrible|pésimo)"]}',
 'complaint', 95, TRUE),

('Intención: Información', 'intent',
 '{"keywords": ["información", "info", "saber", "conocer", "detalles", "características", "cómo funciona"], "patterns": ["(qué|que) es", "cómo funciona", "me puedes (explicar|contar)"]}',
 'info', 80, TRUE),

('Intención: Saludo', 'intent',
 '{"keywords": ["hola", "buenos días", "buenas tardes", "buenas noches", "hey", "qué tal"], "patterns": ["^hola$", "^(buenos|buenas) (días|tardes|noches)$"]}',
 'greeting', 50, TRUE),

-- URGENCIA
('Urgencia: Alta - Palabras clave', 'urgency',
 '{"keywords": ["urgente", "urgentemente", "ahora", "ya", "inmediato", "asap", "lo antes posible", "cuanto antes"]}',
 'high', 100, TRUE),

('Urgencia: Alta - Contexto', 'urgency',
 '{"patterns": ["(necesito|requiero) (urgente|ahora|ya)", "es (muy )?urgente", "para (hoy|mañana)"]}',
 'high', 90, TRUE),

('Urgencia: Media', 'urgency',
 '{"keywords": ["pronto", "cuando puedas", "esta semana"], "patterns": ["(podrías|puedes) (ayudarme|responderme)"]}',
 'medium', 50, TRUE),

-- LEAD SCORING
('Lead: Pregunta precio (+15)', 'lead_score',
 '{"keywords": ["precio", "costo", "cuanto"]}',
 NULL, 100, TRUE),

('Lead: Intención compra (+25)', 'lead_score',
 '{"keywords": ["comprar", "pedir", "ordenar", "quiero"]}',
 NULL, 100, TRUE),

('Lead: Reclamo (-10)', 'lead_score',
 '{"keywords": ["reclamo", "queja", "terrible", "pésimo"]}',
 NULL, 100, TRUE);

-- Actualizar score_modifier después de insert
UPDATE classifier_rules SET score_modifier = 15 WHERE name = 'Lead: Pregunta precio (+15)';
UPDATE classifier_rules SET score_modifier = 25 WHERE name = 'Lead: Intención compra (+25)';
UPDATE classifier_rules SET score_modifier = -10 WHERE name = 'Lead: Reclamo (-10)';
