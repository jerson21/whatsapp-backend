/**
 * API Routes: Visual Flows
 * Endpoints para gestionar flujos de chatbot (diseñador visual)
 */

const express = require('express');
const router = express.Router();

module.exports = function(db, reloadFlowsFn = null) {

  // ============================================
  // CRUD DE FLUJOS
  // ============================================

  /**
   * GET /api/flows
   * Listar todos los flujos
   */
  router.get('/', async (req, res) => {
    try {
      const { active, include_nodes } = req.query;

      let query = `
        SELECT id, slug, name, description, trigger_config,
               is_active, is_default, version, times_triggered, times_completed,
               published_at, created_at, updated_at
      `;

      if (include_nodes === 'true') {
        query = 'SELECT *';
      }

      query += ' FROM visual_flows WHERE 1=1';
      const params = [];

      if (active !== undefined) {
        query += ' AND is_active = ?';
        params.push(active === 'true');
      }

      query += ' ORDER BY is_default DESC, is_active DESC, updated_at DESC';

      const [rows] = await db.query(query, params);

      const flows = rows.map(row => ({
        ...row,
        trigger_config: parseJSON(row.trigger_config),
        nodes: row.nodes ? parseJSON(row.nodes) : undefined,
        connections: row.connections ? parseJSON(row.connections) : undefined,
        variables: row.variables ? parseJSON(row.variables) : undefined
      }));

      res.json({
        success: true,
        count: flows.length,
        flows
      });
    } catch (err) {
      console.error('Error listing flows:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================
  // TEMPLATES (deben ir ANTES de /:id)
  // ============================================

  /**
   * GET /api/flows/templates/list
   * Obtener plantillas predefinidas
   */
  router.get('/templates/list', async (req, res) => {
    const templates = [
      {
        id: 'sales_funnel',
        name: 'Embudo de Ventas',
        description: 'Califica leads y los guía hacia la compra',
        category: 'sales',
        nodes_count: 8
      },
      {
        id: 'support_funnel',
        name: 'Embudo de Soporte',
        description: 'Resuelve dudas con FAQ y escala a humano',
        category: 'support',
        nodes_count: 6
      },
      {
        id: 'lead_capture',
        name: 'Captura de Leads',
        description: 'Recolecta información de contacto',
        category: 'sales',
        nodes_count: 5
      },
      {
        id: 'appointment_booking',
        name: 'Agendar Cita',
        description: 'Permite agendar una cita o llamada',
        category: 'service',
        nodes_count: 7
      },
      {
        id: 'ecommerce',
        name: 'E-Commerce',
        description: 'Consulta de stock y proceso de compra con webhook',
        category: 'sales',
        nodes_count: 9,
        features: ['webhook', 'condition']
      },
      {
        id: 'survey_nps',
        name: 'Encuesta NPS',
        description: 'Encuesta de satisfacción con lógica condicional',
        category: 'feedback',
        nodes_count: 8,
        features: ['condition', 'action']
      },
      {
        id: 'faq_ai',
        name: 'FAQ Inteligente',
        description: 'Responde preguntas usando IA y escala si es necesario',
        category: 'support',
        nodes_count: 7,
        features: ['ai_response', 'condition', 'transfer']
      },
      {
        id: 'onboarding',
        name: 'Onboarding',
        description: 'Bienvenida personalizada con IA para nuevos usuarios',
        category: 'engagement',
        nodes_count: 8,
        features: ['delay', 'ai_response', 'action']
      }
    ];

    res.json({ success: true, templates });
  });

  /**
   * POST /api/flows/templates/:templateId/create
   * Crear flujo desde plantilla
   */
  router.post('/templates/:templateId/create', async (req, res) => {
    const { templateId } = req.params;
    const { name } = req.body;

    // Obtener plantilla
    const template = getTemplate(templateId);

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    try {
      const flowName = name || template.name;
      const flowSlug = generateSlug(flowName);

      const [result] = await db.query(`
        INSERT INTO visual_flows
        (slug, name, description, trigger_config, nodes, connections, variables, is_active, is_default)
        VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, FALSE)
      `, [
        flowSlug,
        flowName,
        template.description,
        JSON.stringify(template.trigger_config),
        JSON.stringify(template.nodes),
        JSON.stringify(template.connections),
        JSON.stringify(template.variables || {})
      ]);

      res.status(201).json({
        success: true,
        message: 'Flow created from template',
        id: result.insertId,
        slug: flowSlug
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/flows/:id
   * Obtener un flujo completo
   */
  router.get('/:id', async (req, res) => {
    try {
      const identifier = req.params.id;

      // Buscar por ID numérico o slug
      const [rows] = await db.query(
        'SELECT * FROM visual_flows WHERE id = ? OR slug = ?',
        [identifier, identifier]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Flow not found' });
      }

      const flow = {
        ...rows[0],
        trigger_config: parseJSON(rows[0].trigger_config),
        nodes: parseJSON(rows[0].nodes),
        connections: parseJSON(rows[0].connections),
        variables: parseJSON(rows[0].variables)
      };

      res.json({ success: true, flow });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/flows
   * Crear nuevo flujo
   */
  router.post('/', async (req, res) => {
    try {
      const {
        name,
        description,
        slug,
        trigger_config,
        nodes,
        connections,
        variables,
        is_active,
        is_default
      } = req.body;

      // Validaciones
      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'Name is required'
        });
      }

      // Generar slug si no se proporciona
      const flowSlug = slug || generateSlug(name);

      // Verificar slug único
      const [existing] = await db.query(
        'SELECT id FROM visual_flows WHERE slug = ?',
        [flowSlug]
      );

      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Slug already exists'
        });
      }

      // Si es default, quitar default de otros
      if (is_default) {
        await db.query('UPDATE visual_flows SET is_default = FALSE');
      }

      const [result] = await db.query(`
        INSERT INTO visual_flows
        (slug, name, description, trigger_config, nodes, connections, variables, is_active, is_default)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        flowSlug,
        name,
        description || null,
        JSON.stringify(trigger_config || { type: 'manual' }),
        JSON.stringify(nodes || []),
        JSON.stringify(connections || []),
        JSON.stringify(variables || {}),
        is_active || false,
        is_default || false
      ]);

      res.status(201).json({
        success: true,
        message: 'Flow created',
        id: result.insertId,
        slug: flowSlug
      });
    } catch (err) {
      console.error('Error creating flow:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * PUT /api/flows/:id
   * Actualizar flujo existente
   */
  router.put('/:id', async (req, res) => {
    try {
      const identifier = req.params.id;

      // Verificar que existe
      const [existing] = await db.query(
        'SELECT id FROM visual_flows WHERE id = ? OR slug = ?',
        [identifier, identifier]
      );

      if (existing.length === 0) {
        return res.status(404).json({ success: false, error: 'Flow not found' });
      }

      const flowId = existing[0].id;
      const {
        name,
        description,
        trigger_config,
        nodes,
        connections,
        variables,
        is_active,
        is_default
      } = req.body;

      // Si es default, quitar default de otros
      if (is_default) {
        await db.query('UPDATE visual_flows SET is_default = FALSE WHERE id != ?', [flowId]);
      }

      // Construir update dinámico
      const updates = [];
      const params = [];

      if (name !== undefined) { updates.push('name = ?'); params.push(name); }
      if (description !== undefined) { updates.push('description = ?'); params.push(description); }
      if (trigger_config !== undefined) { updates.push('trigger_config = ?'); params.push(JSON.stringify(trigger_config)); }
      if (nodes !== undefined) { updates.push('nodes = ?'); params.push(JSON.stringify(nodes)); }
      if (connections !== undefined) { updates.push('connections = ?'); params.push(JSON.stringify(connections)); }
      if (variables !== undefined) { updates.push('variables = ?'); params.push(JSON.stringify(variables)); }
      if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }
      if (is_default !== undefined) { updates.push('is_default = ?'); params.push(is_default); }

      // Incrementar versión
      updates.push('version = version + 1');

      if (updates.length === 1) { // Solo tiene version
        return res.status(400).json({ success: false, error: 'No fields to update' });
      }

      params.push(flowId);

      await db.query(
        `UPDATE visual_flows SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      res.json({ success: true, message: 'Flow updated' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * DELETE /api/flows/:id
   * Eliminar flujo
   */
  router.delete('/:id', async (req, res) => {
    try {
      const identifier = req.params.id;

      const [result] = await db.query(
        'DELETE FROM visual_flows WHERE id = ? OR slug = ?',
        [identifier, identifier]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, error: 'Flow not found' });
      }

      res.json({ success: true, message: 'Flow deleted' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================
  // ACCIONES ESPECIALES
  // ============================================

  /**
   * POST /api/flows/:id/activate
   * Activar/desactivar flujo
   */
  router.post('/:id/activate', async (req, res) => {
    try {
      const identifier = req.params.id;
      const { active } = req.body;

      const [result] = await db.query(
        `UPDATE visual_flows SET is_active = ?, published_at = ${active ? 'NOW()' : 'NULL'}
         WHERE id = ? OR slug = ?`,
        [active !== false, identifier, identifier]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, error: 'Flow not found' });
      }

      // Recargar flujos en el motor si está disponible
      if (reloadFlowsFn) {
        await reloadFlowsFn().catch(e => console.error('Error reloading flows:', e));
      }

      res.json({
        success: true,
        message: active ? 'Flow activated' : 'Flow deactivated'
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/visual-flows/reload
   * Recargar flujos en memoria (después de cambios)
   */
  router.post('/reload', async (req, res) => {
    try {
      if (reloadFlowsFn) {
        await reloadFlowsFn();
        res.json({ success: true, message: 'Flows reloaded' });
      } else {
        res.json({ success: false, message: 'Reload function not available' });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/flows/:id/duplicate
   * Duplicar flujo
   */
  router.post('/:id/duplicate', async (req, res) => {
    try {
      const identifier = req.params.id;
      const { new_name } = req.body;

      // Obtener flujo original
      const [rows] = await db.query(
        'SELECT * FROM visual_flows WHERE id = ? OR slug = ?',
        [identifier, identifier]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Flow not found' });
      }

      const original = rows[0];
      const newName = new_name || `${original.name} (copia)`;
      const newSlug = generateSlug(newName);

      const [result] = await db.query(`
        INSERT INTO visual_flows
        (slug, name, description, trigger_config, nodes, connections, variables, is_active, is_default)
        VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, FALSE)
      `, [
        newSlug,
        newName,
        original.description,
        original.trigger_config,
        original.nodes,
        original.connections,
        original.variables
      ]);

      res.status(201).json({
        success: true,
        message: 'Flow duplicated',
        id: result.insertId,
        slug: newSlug
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/flows/simulate
   * Simular ejecución de flujo sin guardarlo (para el simulador del frontend)
   */
  router.post('/simulate', async (req, res) => {
    try {
      const { flow, message, sessionState } = req.body;

      if (!flow || !flow.nodes) {
        return res.status(400).json({
          success: false,
          error: 'Flow data with nodes is required'
        });
      }

      if (!message) {
        return res.status(400).json({
          success: false,
          error: 'Message is required'
        });
      }

      // Simular la ejecución del flujo
      const result = simulateFlowWithSession(flow, message, sessionState);

      res.json({
        success: true,
        result
      });
    } catch (err) {
      console.error('Error simulating flow:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/flows/:id/test
   * Probar flujo con mensaje simulado
   */
  router.post('/:id/test', async (req, res) => {
    try {
      const identifier = req.params.id;
      const { message, context } = req.body;

      if (!message) {
        return res.status(400).json({
          success: false,
          error: 'Message is required for testing'
        });
      }

      // Obtener flujo
      const [rows] = await db.query(
        'SELECT * FROM visual_flows WHERE id = ? OR slug = ?',
        [identifier, identifier]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Flow not found' });
      }

      const flow = {
        ...rows[0],
        nodes: parseJSON(rows[0].nodes),
        connections: parseJSON(rows[0].connections)
      };

      // Simular ejecución del primer nodo
      const testResult = simulateFlow(flow, message, context || {});

      res.json({
        success: true,
        flow_name: flow.name,
        test_result: testResult
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================
  // HELPERS
  // ============================================

  function parseJSON(data) {
    if (!data) return null;
    if (typeof data === 'object') return data;
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }

  function generateSlug(name) {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      + '-' + Date.now().toString(36);
  }

  function simulateFlow(flow, message, context) {
    const result = {
      nodes_executed: [],
      responses: [],
      variables: { ...context },
      final_state: 'completed'
    };

    // Encontrar nodo inicial (trigger o primer nodo)
    const startNode = flow.nodes.find(n => n.type === 'trigger') || flow.nodes[0];

    if (!startNode) {
      return { error: 'No start node found' };
    }

    result.nodes_executed.push({
      id: startNode.id,
      type: startNode.type,
      content: startNode.content
    });

    // Simular siguientes nodos basado en conexiones
    let currentNodeId = startNode.id;
    let iterations = 0;
    const maxIterations = 10;

    while (iterations < maxIterations) {
      const connection = flow.connections.find(c => c.from === currentNodeId);
      if (!connection) break;

      const nextNode = flow.nodes.find(n => n.id === connection.to);
      if (!nextNode) break;

      if (nextNode.type === 'message' || nextNode.type === 'question') {
        result.responses.push({
          type: nextNode.type,
          content: nextNode.content,
          options: nextNode.options
        });
      }

      result.nodes_executed.push({
        id: nextNode.id,
        type: nextNode.type,
        content: nextNode.content
      });

      currentNodeId = nextNode.id;
      iterations++;

      // Detenerse en nodos que esperan input
      if (nextNode.type === 'question' || nextNode.type === 'transfer' || nextNode.type === 'end') {
        break;
      }
    }

    return result;
  }

  function simulateFlowWithSession(flow, message, existingSession) {
    const result = {
      responses: [],
      sessionState: existingSession ? { ...existingSession } : {
        currentNodeId: null,
        variables: {},
        waitingForInput: false
      },
      completed: false
    };

    const nodes = flow.nodes || [];
    const connections = flow.connections || [];

    // Si hay sesión existente y estaba esperando input
    if (existingSession && existingSession.waitingForInput && existingSession.currentNodeId) {
      const currentNode = nodes.find(n => n.id === existingSession.currentNodeId);

      if (currentNode && currentNode.type === 'question') {
        // Guardar la respuesta del usuario
        if (currentNode.variable) {
          result.sessionState.variables[currentNode.variable] = message;
        }

        // Continuar al siguiente nodo
        const connection = connections.find(c => c.from === currentNode.id);
        if (connection) {
          const nextNode = nodes.find(n => n.id === connection.to);
          if (nextNode) {
            return executeNodeChain(nextNode, nodes, connections, result);
          }
        }
      }
    }

    // Buscar nodo inicial (trigger)
    const startNode = nodes.find(n => n.type === 'trigger') || nodes[0];
    if (!startNode) {
      return { error: 'No start node found', responses: [], completed: true };
    }

    // Encontrar el primer nodo después del trigger
    const firstConnection = connections.find(c => c.from === startNode.id);
    if (!firstConnection) {
      return { error: 'No connection from trigger', responses: [], completed: true };
    }

    const firstNode = nodes.find(n => n.id === firstConnection.to);
    if (!firstNode) {
      return { error: 'First node not found', responses: [], completed: true };
    }

    return executeNodeChain(firstNode, nodes, connections, result);
  }

  function executeNodeChain(startNode, nodes, connections, result) {
    let currentNode = startNode;
    let iterations = 0;
    const maxIterations = 20;

    while (currentNode && iterations < maxIterations) {
      iterations++;

      switch (currentNode.type) {
        case 'message':
          const messageContent = replaceVariables(currentNode.content || '', result.sessionState.variables);
          result.responses.push({
            type: 'bot',
            content: messageContent,
            nodeId: currentNode.id
          });
          break;

        case 'question':
          const questionContent = replaceVariables(currentNode.content || '', result.sessionState.variables);
          result.responses.push({
            type: 'bot',
            content: questionContent,
            nodeId: currentNode.id,
            options: currentNode.options
          });

          // Detener y esperar respuesta
          result.sessionState.currentNodeId = currentNode.id;
          result.sessionState.waitingForInput = true;
          return result;

        case 'condition':
          // Evaluar condiciones
          const conditions = currentNode.conditions || [];
          let nextNodeId = null;

          for (const cond of conditions) {
            if (cond.else) {
              nextNodeId = cond.goto;
              break;
            }
            if (evaluateCondition(cond.if, result.sessionState.variables)) {
              nextNodeId = cond.goto;
              break;
            }
          }

          if (nextNodeId) {
            currentNode = nodes.find(n => n.id === nextNodeId);
            continue;
          }
          break;

        case 'action':
          result.responses.push({
            type: 'system',
            content: `[Acción: ${currentNode.action}]`,
            nodeId: currentNode.id
          });
          break;

        case 'transfer':
          const transferContent = replaceVariables(currentNode.content || 'Transfiriendo a un agente...', result.sessionState.variables);
          result.responses.push({
            type: 'system',
            content: transferContent,
            nodeId: currentNode.id
          });
          result.completed = true;
          result.sessionState.waitingForInput = false;
          return result;

        case 'end':
          result.completed = true;
          result.sessionState.waitingForInput = false;
          return result;
      }

      // Buscar siguiente nodo
      const connection = connections.find(c => c.from === currentNode.id);
      if (!connection) {
        result.completed = true;
        break;
      }

      currentNode = nodes.find(n => n.id === connection.to);
    }

    return result;
  }

  function replaceVariables(text, variables) {
    if (!text) return text;
    return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return variables[varName] !== undefined ? variables[varName] : match;
    });
  }

  function evaluateCondition(condition, variables) {
    if (!condition) return false;

    const match = condition.match(/(\w+)\s*(==|!=|>|<|>=|<=)\s*["']?([^"']+)["']?/);
    if (!match) return false;

    const [, varName, operator, expectedValue] = match;
    const actualValue = variables[varName];

    switch (operator) {
      case '==': return String(actualValue) === String(expectedValue);
      case '!=': return String(actualValue) !== String(expectedValue);
      case '>': return Number(actualValue) > Number(expectedValue);
      case '<': return Number(actualValue) < Number(expectedValue);
      case '>=': return Number(actualValue) >= Number(expectedValue);
      case '<=': return Number(actualValue) <= Number(expectedValue);
      default: return false;
    }
  }

  function getTemplate(id) {
    const templates = {
      sales_funnel: {
        name: 'Embudo de Ventas',
        description: 'Flujo para calificar y convertir leads',
        trigger_config: {
          type: 'classification',
          conditions: { intent: ['sales'] }
        },
        nodes: [
          { id: 'trigger', type: 'trigger', content: 'Cuando intención = ventas', position: { x: 250, y: 50 } },
          { id: 'welcome', type: 'message', content: '¡Hola! Gracias por tu interés. ¿Sobre qué producto te gustaría saber más?', position: { x: 250, y: 150 } },
          { id: 'product', type: 'question', content: 'Selecciona una opción:', variable: 'product_interest', options: [
            { label: 'Producto A', value: 'product_a' },
            { label: 'Producto B', value: 'product_b' },
            { label: 'Otro', value: 'other' }
          ], position: { x: 250, y: 250 } },
          { id: 'budget', type: 'question', content: '¿Cuál es tu presupuesto aproximado?', variable: 'budget', options: [
            { label: 'Menos de $50.000', value: 'low' },
            { label: '$50.000 - $100.000', value: 'medium' },
            { label: 'Más de $100.000', value: 'high' }
          ], position: { x: 250, y: 350 } },
          { id: 'condition', type: 'condition', conditions: [
            { if: 'budget == "high"', goto: 'premium' },
            { else: true, goto: 'standard' }
          ], position: { x: 250, y: 450 } },
          { id: 'premium', type: 'action', action: 'notify_sales', payload: { priority: 'high' }, position: { x: 100, y: 550 } },
          { id: 'standard', type: 'message', content: 'Te envío nuestro catálogo. Un asesor te contactará pronto.', position: { x: 400, y: 550 } },
          { id: 'end', type: 'end', position: { x: 250, y: 650 } }
        ],
        connections: [
          { from: 'trigger', to: 'welcome' },
          { from: 'welcome', to: 'product' },
          { from: 'product', to: 'budget' },
          { from: 'budget', to: 'condition' },
          { from: 'condition', to: 'premium', label: 'budget=high' },
          { from: 'condition', to: 'standard', label: 'else' },
          { from: 'premium', to: 'end' },
          { from: 'standard', to: 'end' }
        ],
        variables: { product_interest: '', budget: '' }
      },

      support_funnel: {
        name: 'Embudo de Soporte',
        description: 'Flujo para resolver dudas y escalar problemas',
        trigger_config: {
          type: 'classification',
          conditions: { intent: ['support', 'complaint'] }
        },
        nodes: [
          { id: 'trigger', type: 'trigger', content: 'Cuando intención = soporte/queja', position: { x: 250, y: 50 } },
          { id: 'greeting', type: 'message', content: 'Lamento que tengas un problema. Estoy aquí para ayudarte.', position: { x: 250, y: 150 } },
          { id: 'issue_type', type: 'question', content: '¿Qué tipo de problema tienes?', variable: 'issue_type', options: [
            { label: 'Producto defectuoso', value: 'defective' },
            { label: 'No llegó mi pedido', value: 'shipping' },
            { label: 'Facturación', value: 'billing' },
            { label: 'Otro', value: 'other' }
          ], position: { x: 250, y: 250 } },
          { id: 'search_faq', type: 'action', action: 'search_faq', position: { x: 250, y: 350 } },
          { id: 'faq_found', type: 'condition', conditions: [
            { if: 'faq_answer != null', goto: 'show_answer' },
            { else: true, goto: 'transfer' }
          ], position: { x: 250, y: 450 } },
          { id: 'show_answer', type: 'message', content: '{{faq_answer}}', position: { x: 100, y: 550 } },
          { id: 'transfer', type: 'transfer', content: 'Te transfiero con un agente humano.', position: { x: 400, y: 550 } }
        ],
        connections: [
          { from: 'trigger', to: 'greeting' },
          { from: 'greeting', to: 'issue_type' },
          { from: 'issue_type', to: 'search_faq' },
          { from: 'search_faq', to: 'faq_found' },
          { from: 'faq_found', to: 'show_answer', label: 'FAQ encontrado' },
          { from: 'faq_found', to: 'transfer', label: 'No encontrado' }
        ]
      },

      lead_capture: {
        name: 'Captura de Leads',
        description: 'Recolecta información de contacto del usuario',
        trigger_config: { type: 'keyword', keywords: ['información', 'info', 'contacto'] },
        nodes: [
          { id: 'trigger', type: 'trigger', content: 'Cuando keyword = info/contacto', position: { x: 250, y: 50 } },
          { id: 'ask_name', type: 'question', content: '¿Cuál es tu nombre?', variable: 'name', position: { x: 250, y: 150 } },
          { id: 'ask_email', type: 'question', content: 'Gracias {{name}}. ¿Cuál es tu email?', variable: 'email', position: { x: 250, y: 250 } },
          { id: 'save_lead', type: 'action', action: 'save_lead', payload: { name: '{{name}}', email: '{{email}}' }, position: { x: 250, y: 350 } },
          { id: 'thanks', type: 'message', content: '¡Perfecto! Te contactaremos pronto a {{email}}.', position: { x: 250, y: 450 } }
        ],
        connections: [
          { from: 'trigger', to: 'ask_name' },
          { from: 'ask_name', to: 'ask_email' },
          { from: 'ask_email', to: 'save_lead' },
          { from: 'save_lead', to: 'thanks' }
        ]
      },

      appointment_booking: {
        name: 'Agendar Cita',
        description: 'Flujo para agendar una cita o llamada',
        trigger_config: { type: 'keyword', keywords: ['cita', 'agendar', 'reunión', 'llamada'] },
        nodes: [
          { id: 'trigger', type: 'trigger', content: 'Cuando keyword = cita/agendar', position: { x: 250, y: 50 } },
          { id: 'ask_day', type: 'question', content: '¿Qué día te acomoda?', variable: 'day', options: [
            { label: 'Hoy', value: 'today' },
            { label: 'Mañana', value: 'tomorrow' },
            { label: 'Esta semana', value: 'this_week' }
          ], position: { x: 250, y: 150 } },
          { id: 'ask_time', type: 'question', content: '¿En qué horario?', variable: 'time', options: [
            { label: 'Mañana (9-12)', value: 'morning' },
            { label: 'Tarde (14-18)', value: 'afternoon' }
          ], position: { x: 250, y: 250 } },
          { id: 'ask_phone', type: 'question', content: '¿A qué número te llamamos?', variable: 'callback_phone', position: { x: 250, y: 350 } },
          { id: 'confirm', type: 'message', content: 'Perfecto. Te llamaremos el {{day}} en horario {{time}} al {{callback_phone}}.', position: { x: 250, y: 450 } },
          { id: 'notify', type: 'action', action: 'create_appointment', position: { x: 250, y: 550 } },
          { id: 'end', type: 'end', position: { x: 250, y: 650 } }
        ],
        connections: [
          { from: 'trigger', to: 'ask_day' },
          { from: 'ask_day', to: 'ask_time' },
          { from: 'ask_time', to: 'ask_phone' },
          { from: 'ask_phone', to: 'confirm' },
          { from: 'confirm', to: 'notify' },
          { from: 'notify', to: 'end' }
        ]
      },

      // ========================================
      // NUEVOS TEMPLATES CON NODOS AVANZADOS
      // ========================================

      ecommerce: {
        name: 'E-Commerce',
        description: 'Flujo de compra con consulta de stock via webhook',
        trigger_config: { type: 'keyword', keywords: ['comprar', 'producto', 'precio', 'stock', 'disponible'] },
        nodes: [
          { id: 'trigger', type: 'trigger', content: 'Cuando keyword = comprar/producto', position: { x: 250, y: 50 } },
          { id: 'greeting', type: 'message', content: '¡Hola! Bienvenido a nuestra tienda. ¿Qué te gustaría comprar?', position: { x: 250, y: 130 } },
          { id: 'category', type: 'question', content: 'Selecciona una categoría:', variable: 'category', options: [
            { label: 'Electrónica', value: 'electronics' },
            { label: 'Ropa', value: 'clothing' },
            { label: 'Hogar', value: 'home' }
          ], position: { x: 250, y: 210 } },
          { id: 'product', type: 'question', content: '¿Qué producto específico buscas?', variable: 'product_name', position: { x: 250, y: 290 } },
          { id: 'check_stock', type: 'webhook', url: 'https://api.ejemplo.com/stock', method: 'POST',
            headers: '{"Content-Type": "application/json"}',
            body: '{"category": "{{category}}", "product": "{{product_name}}"}',
            variable: 'stock_result', timeout: 5000, position: { x: 250, y: 370 } },
          { id: 'stock_condition', type: 'condition', conditions: [
            { if: 'stock_result.available == true', goto: 'in_stock' },
            { else: true, goto: 'out_of_stock' }
          ], position: { x: 250, y: 450 } },
          { id: 'in_stock', type: 'message', content: '¡Excelente! Tenemos {{product_name}} disponible. Precio: ${{stock_result.price}}. ¿Deseas agregarlo al carrito?', position: { x: 100, y: 530 } },
          { id: 'out_of_stock', type: 'message', content: 'Lo siento, {{product_name}} no está disponible actualmente. ¿Te gustaría que te avisemos cuando llegue?', position: { x: 400, y: 530 } },
          { id: 'end', type: 'end', position: { x: 250, y: 630 } }
        ],
        connections: [
          { from: 'trigger', to: 'greeting' },
          { from: 'greeting', to: 'category' },
          { from: 'category', to: 'product' },
          { from: 'product', to: 'check_stock' },
          { from: 'check_stock', to: 'stock_condition' },
          { from: 'stock_condition', to: 'in_stock', label: 'disponible' },
          { from: 'stock_condition', to: 'out_of_stock', label: 'agotado' },
          { from: 'in_stock', to: 'end' },
          { from: 'out_of_stock', to: 'end' }
        ],
        variables: { category: '', product_name: '', stock_result: {} }
      },

      survey_nps: {
        name: 'Encuesta NPS',
        description: 'Encuesta de satisfacción con seguimiento según puntaje',
        trigger_config: { type: 'keyword', keywords: ['encuesta', 'opinión', 'feedback', 'calificar'] },
        nodes: [
          { id: 'trigger', type: 'trigger', content: 'Cuando keyword = encuesta/feedback', position: { x: 250, y: 50 } },
          { id: 'intro', type: 'message', content: '¡Hola! Tu opinión es muy importante para nosotros. ¿Podrías responder una breve encuesta?', position: { x: 250, y: 130 } },
          { id: 'nps_score', type: 'question', content: 'Del 1 al 10, ¿qué tan probable es que nos recomiendes a un amigo?', variable: 'nps', options: [
            { label: '1-3 (Poco probable)', value: '2' },
            { label: '4-6 (Neutral)', value: '5' },
            { label: '7-8 (Probable)', value: '7' },
            { label: '9-10 (Muy probable)', value: '9' }
          ], position: { x: 250, y: 210 } },
          { id: 'nps_condition', type: 'condition', conditions: [
            { if: 'nps >= 8', goto: 'promoter_path' },
            { if: 'nps <= 4', goto: 'detractor_path' },
            { else: true, goto: 'neutral_path' }
          ], position: { x: 250, y: 290 } },
          { id: 'promoter_path', type: 'question', content: '¡Genial! ¿Qué es lo que más te gusta de nosotros?', variable: 'feedback_positive', position: { x: 50, y: 370 } },
          { id: 'detractor_path', type: 'question', content: 'Lamentamos escuchar eso. ¿Qué podemos mejorar?', variable: 'feedback_negative', position: { x: 450, y: 370 } },
          { id: 'neutral_path', type: 'question', content: '¿Hay algo específico que te gustaría que mejoráramos?', variable: 'feedback_neutral', position: { x: 250, y: 370 } },
          { id: 'save_feedback', type: 'action', action: 'save_lead', payload: { nps: '{{nps}}', feedback: '{{feedback_positive}}{{feedback_negative}}{{feedback_neutral}}' }, position: { x: 250, y: 470 } },
          { id: 'thanks', type: 'message', content: '¡Muchas gracias por tu tiempo! Tu opinión nos ayuda a mejorar.', position: { x: 250, y: 550 } }
        ],
        connections: [
          { from: 'trigger', to: 'intro' },
          { from: 'intro', to: 'nps_score' },
          { from: 'nps_score', to: 'nps_condition' },
          { from: 'nps_condition', to: 'promoter_path', label: 'promotor (8+)' },
          { from: 'nps_condition', to: 'detractor_path', label: 'detractor (1-4)' },
          { from: 'nps_condition', to: 'neutral_path', label: 'neutral (5-7)' },
          { from: 'promoter_path', to: 'save_feedback' },
          { from: 'detractor_path', to: 'save_feedback' },
          { from: 'neutral_path', to: 'save_feedback' },
          { from: 'save_feedback', to: 'thanks' }
        ],
        variables: { nps: '', feedback_positive: '', feedback_negative: '', feedback_neutral: '' }
      },

      faq_ai: {
        name: 'FAQ Inteligente',
        description: 'Responde preguntas frecuentes usando IA y escala a humano si es necesario',
        trigger_config: { type: 'always' },
        nodes: [
          { id: 'trigger', type: 'trigger', content: 'Flujo por defecto (siempre activo)', position: { x: 250, y: 50 } },
          { id: 'ai_classify', type: 'ai_response',
            system_prompt: 'Eres un clasificador de intenciones. Analiza el mensaje del usuario y responde SOLO con una de estas categorías: PRECIO, ENVIO, HORARIO, DEVOLUCION, OTRO. Nada más.',
            user_prompt: 'Clasifica este mensaje: {{initial_message}}',
            model: 'gpt-4o-mini', temperature: 0.1, max_tokens: 20, variable: 'categoria',
            position: { x: 250, y: 130 } },
          { id: 'category_condition', type: 'condition', conditions: [
            { if: 'categoria == "PRECIO"', goto: 'resp_precio' },
            { if: 'categoria == "ENVIO"', goto: 'resp_envio' },
            { if: 'categoria == "HORARIO"', goto: 'resp_horario' },
            { if: 'categoria == "DEVOLUCION"', goto: 'resp_devolucion' },
            { else: true, goto: 'transfer_human' }
          ], position: { x: 250, y: 230 } },
          { id: 'resp_precio', type: 'message', content: 'Nuestros precios varían según el producto. Puedes ver nuestro catálogo completo en nuestra web. ¿Hay algún producto específico del que quieras saber el precio?', position: { x: 50, y: 330 } },
          { id: 'resp_envio', type: 'message', content: 'Hacemos envíos a todo Chile. El tiempo de entrega es de 3-5 días hábiles. El costo depende de tu ubicación.', position: { x: 200, y: 330 } },
          { id: 'resp_horario', type: 'message', content: 'Nuestro horario de atención es de Lunes a Viernes de 9:00 a 18:00 hrs.', position: { x: 350, y: 330 } },
          { id: 'resp_devolucion', type: 'message', content: 'Tienes 30 días para hacer devoluciones. El producto debe estar en su empaque original. Contáctanos para coordinar el retiro.', position: { x: 500, y: 330 } },
          { id: 'transfer_human', type: 'transfer', content: 'No tengo información sobre eso. Te comunico con un agente para ayudarte mejor.', position: { x: 250, y: 430 } }
        ],
        connections: [
          { from: 'trigger', to: 'ai_classify' },
          { from: 'ai_classify', to: 'category_condition' },
          { from: 'category_condition', to: 'resp_precio', label: 'precio' },
          { from: 'category_condition', to: 'resp_envio', label: 'envío' },
          { from: 'category_condition', to: 'resp_horario', label: 'horario' },
          { from: 'category_condition', to: 'resp_devolucion', label: 'devolución' },
          { from: 'category_condition', to: 'transfer_human', label: 'otro' }
        ],
        variables: { categoria: '' }
      },

      onboarding: {
        name: 'Onboarding',
        description: 'Bienvenida personalizada con delay natural y mensaje IA',
        trigger_config: { type: 'keyword', keywords: ['hola', 'buenas', 'hi', 'buenos días', 'buenas tardes'] },
        nodes: [
          { id: 'trigger', type: 'trigger', content: 'Cuando keyword = hola/saludo', position: { x: 250, y: 50 } },
          { id: 'delay1', type: 'delay', seconds: 2, typing_indicator: true, position: { x: 250, y: 120 } },
          { id: 'greeting', type: 'message', content: '¡Hola! Bienvenido/a a nuestra tienda. Soy tu asistente virtual.', position: { x: 250, y: 190 } },
          { id: 'ask_name', type: 'question', content: '¿Cómo te llamas?', variable: 'nombre', position: { x: 250, y: 270 } },
          { id: 'ask_interest', type: 'question', content: 'Mucho gusto {{nombre}}. ¿Qué te trae por aquí hoy?', variable: 'interes', options: [
            { label: 'Quiero comprar algo', value: 'comprar' },
            { label: 'Tengo una duda', value: 'duda' },
            { label: 'Solo estoy mirando', value: 'browsing' }
          ], position: { x: 250, y: 350 } },
          { id: 'save_contact', type: 'action', action: 'save_lead', payload: { name: '{{nombre}}', interest: '{{interes}}' }, position: { x: 250, y: 430 } },
          { id: 'ai_welcome', type: 'ai_response',
            system_prompt: 'Eres un asistente amable de una tienda. Genera un mensaje corto (máximo 2 líneas) y personalizado de bienvenida basado en el nombre e interés del cliente. Sé cálido pero profesional.',
            user_prompt: 'Nombre del cliente: {{nombre}}. Su interés es: {{interes}}. Genera un mensaje de bienvenida apropiado.',
            model: 'gpt-4o-mini', temperature: 0.8, max_tokens: 100, variable: 'mensaje_bienvenida',
            position: { x: 250, y: 510 } },
          { id: 'end', type: 'end', position: { x: 250, y: 590 } }
        ],
        connections: [
          { from: 'trigger', to: 'delay1' },
          { from: 'delay1', to: 'greeting' },
          { from: 'greeting', to: 'ask_name' },
          { from: 'ask_name', to: 'ask_interest' },
          { from: 'ask_interest', to: 'save_contact' },
          { from: 'save_contact', to: 'ai_welcome' },
          { from: 'ai_welcome', to: 'end' }
        ],
        variables: { nombre: '', interes: '', mensaje_bienvenida: '' }
      }
    };

    return templates[id] || null;
  }

  return router;
};
