-- ============================================
-- Actualizar triggers de flujos para usar intents
-- Fecha: 2026-01-21
-- ============================================

-- Flujo de Soporte: detectar intent complaint o support
UPDATE visual_flows SET
  is_active = TRUE,
  trigger_config = JSON_OBJECT(
    'type', 'intent',
    'intents', JSON_ARRAY('complaint', 'support'),
    'confidence_threshold', 0.5
  )
WHERE name LIKE '%Soporte%' OR name LIKE '%soporte%';

-- Flujo de Ventas: detectar intent sales
UPDATE visual_flows SET
  is_active = TRUE,
  trigger_config = JSON_OBJECT(
    'type', 'intent',
    'intents', JSON_ARRAY('sales'),
    'confidence_threshold', 0.5
  )
WHERE name LIKE '%Ventas%' OR name LIKE '%ventas%';

-- Verificar resultado
SELECT id, name, is_active, trigger_config FROM visual_flows;
