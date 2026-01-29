-- Actualizar flujo de ventas: en lugar de capturar lead y terminar,
-- ahora transfiere directamente a un agente humano de ventas.
-- El mensaje inicial del cliente queda como {{initial_message}} en las variables del flujo.

UPDATE visual_flows SET
  description = 'Detecta intención de compra y transfiere a agente de ventas',
  nodes = '[
    {"id": "trigger", "type": "trigger", "content": "Cuando intención = ventas"},
    {"id": "welcome", "type": "message", "content": "¡Entendido! Te conecto con un asesor de ventas que te ayudará personalmente."},
    {"id": "transfer", "type": "transfer", "content": "Un momento, estoy transfiriendo tu consulta a nuestro equipo de ventas..."}
  ]',
  connections = '[
    {"from": "trigger", "to": "welcome"},
    {"from": "welcome", "to": "transfer"}
  ]',
  variables = '{}',
  updated_at = NOW()
WHERE slug = 'embudo-ventas';

-- Verificar
SELECT id, slug, name, description, is_active FROM visual_flows WHERE slug = 'embudo-ventas';
