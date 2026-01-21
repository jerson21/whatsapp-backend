-- ============================================
-- Schema: Flow Execution Logs
-- Fecha: 2026-01-20
-- ============================================

-- Tabla de logs de ejecución de flujos
-- Registra cada ejecución de flujo para debugging y analytics
CREATE TABLE IF NOT EXISTS flow_execution_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,

  -- Flujo ejecutado
  flow_id INT NOT NULL,
  flow_name VARCHAR(100),
  flow_slug VARCHAR(100),

  -- Contacto
  phone VARCHAR(50) NOT NULL,
  contact_name VARCHAR(100),

  -- Sesión
  session_id VARCHAR(100),

  -- Estado de la ejecución
  status ENUM('running', 'completed', 'failed', 'transferred', 'timeout') NOT NULL DEFAULT 'running',

  -- Mensaje que disparó el flujo
  trigger_message TEXT,
  trigger_type VARCHAR(50),  -- 'keyword', 'classification', 'always'

  -- Nodos ejecutados (JSON array)
  steps JSON,
  /*
  [
    {
      "node_id": "welcome",
      "node_type": "message",
      "timestamp": "2026-01-20T14:30:00Z",
      "duration_ms": 150,
      "input": "hola",
      "output": "¡Bienvenido! ¿En qué puedo ayudarte?",
      "status": "success"
    },
    {
      "node_id": "question_1",
      "node_type": "question",
      "timestamp": "2026-01-20T14:30:01Z",
      "duration_ms": 2000,
      "waiting_for_response": true,
      "response_received": "opción A"
    }
  ]
  */

  -- Variables capturadas durante la ejecución
  variables JSON,
  /*
  {
    "name": "Juan",
    "product_interest": "Plan Pro",
    "budget": "high"
  }
  */

  -- Clasificación del mensaje (si aplica)
  classification JSON,
  /*
  {
    "intent": "sales",
    "confidence": 0.85,
    "urgency": "medium",
    "lead_score": 65
  }
  */

  -- Error si falló
  error_message TEXT,
  error_node_id VARCHAR(100),

  -- Métricas
  total_nodes_executed INT DEFAULT 0,
  total_duration_ms INT,

  -- Resultado final
  final_node_id VARCHAR(100),
  final_node_type VARCHAR(50),
  was_transferred BOOLEAN DEFAULT FALSE,

  -- Timestamps
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,

  -- Índices para búsqueda rápida
  INDEX idx_flow (flow_id),
  INDEX idx_phone (phone),
  INDEX idx_session (session_id),
  INDEX idx_status (status),
  INDEX idx_started (started_at),
  INDEX idx_flow_date (flow_id, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vista para estadísticas rápidas de flujos
CREATE OR REPLACE VIEW flow_execution_stats AS
SELECT
  flow_id,
  flow_name,
  COUNT(*) as total_executions,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
  SUM(CASE WHEN status = 'transferred' THEN 1 ELSE 0 END) as transferred,
  AVG(total_duration_ms) as avg_duration_ms,
  AVG(total_nodes_executed) as avg_nodes_executed,
  DATE(started_at) as execution_date
FROM flow_execution_logs
GROUP BY flow_id, flow_name, DATE(started_at);
