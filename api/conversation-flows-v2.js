// ============================================================================
// API V2 ENDPOINTS PARA FLUJOS CONVERSACIONALES MULTI-RAMIFICACIÓN
// ============================================================================
// APIs avanzadas para gestionar flujos con múltiples ramas por paso,
// condiciones complejas y configuración granular
// ============================================================================

const express = require('express');
const router = express.Router();
const P = require('pino');

// Crear logger básico
const logger = P({
  level: process.env.LOG_LEVEL || 'info'
});

module.exports = function createConversationFlowsV2API(pool) {
  
  // ============================================================================
  // ENDPOINTS DE CONSULTA - FLUJOS Y RAMAS
  // ============================================================================

  /**
   * GET /api/conversation-flows-v2
   * Obtiene flujos con sus ramas asociadas
   */
  router.get('/', async (req, res) => {
    try {
      const { template_name, include_branches = 'true', active_only = 'true' } = req.query;
      
      let query = `
        SELECT 
          f.*,
          COUNT(b.id) as branches_count,
          COUNT(child.id) as child_steps_count
        FROM conversation_flows_v2 f
        LEFT JOIN conversation_branches b ON f.id = b.flow_step_id AND b.is_active = TRUE
        LEFT JOIN conversation_flows_v2 child ON f.id = child.parent_step_id AND child.is_active = TRUE
      `;
      
      const conditions = [];
      const params = [];
      
      if (template_name) {
        conditions.push('f.template_name = ?');
        params.push(template_name);
      }
      
      if (active_only === 'true') {
        conditions.push('f.is_active = TRUE');
      }
      
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      query += ' GROUP BY f.id ORDER BY f.template_name, f.step_number';
      
      const [flows] = await pool.query(query, params);
      
      // Si se requieren las ramas, cargarlas
      if (include_branches === 'true' && flows.length > 0) {
        const flowIds = flows.map(f => f.id);
        const [branches] = await pool.query(`
          SELECT 
            b.*,
            next_f.step_name as next_step_name,
            next_f.bot_message as next_bot_message
          FROM conversation_branches b
          LEFT JOIN conversation_flows_v2 next_f ON b.next_step_id = next_f.id
          WHERE b.flow_step_id IN (${flowIds.map(() => '?').join(',')}) 
          AND b.is_active = TRUE
          ORDER BY b.flow_step_id, b.branch_order
        `, flowIds);
        
        // Agrupar ramas por flow
        const branchesByFlow = {};
        branches.forEach(branch => {
          if (!branchesByFlow[branch.flow_step_id]) {
            branchesByFlow[branch.flow_step_id] = [];
          }
          branchesByFlow[branch.flow_step_id].push(branch);
        });
        
        // Agregar ramas a cada flow
        flows.forEach(flow => {
          flow.branches = branchesByFlow[flow.id] || [];
        });
      }
      
      res.json({
        success: true,
        count: flows.length,
        flows: flows
      });
      
    } catch (error) {
      logger.error({ error: error.message }, '❌ Error obteniendo flujos V2');
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  });

  /**
   * GET /api/conversation-flows-v2/tree/:template_name
   * Obtiene árbol completo de flujo con estructura jerárquica y ramas
   */
  router.get('/tree/:template_name', async (req, res) => {
    try {
      const { template_name } = req.params;
      
      // Obtener todos los flujos del template
      const [flows] = await pool.query(`
        SELECT * FROM conversation_flows_v2 
        WHERE template_name = ? AND is_active = TRUE
        ORDER BY step_number, id
      `, [template_name]);
      
      if (flows.length === 0) {
        return res.json({
          success: true,
          template_name,
          tree: [],
          total_steps: 0,
          total_branches: 0
        });
      }
      
      // Obtener todas las ramas para estos flujos
      const flowIds = flows.map(f => f.id);
      const [branches] = await pool.query(`
        SELECT 
          b.*,
          next_f.step_name as next_step_name,
          next_f.bot_message as next_bot_message
        FROM conversation_branches b
        LEFT JOIN conversation_flows_v2 next_f ON b.next_step_id = next_f.id
        WHERE b.flow_step_id IN (${flowIds.map(() => '?').join(',')}) 
        AND b.is_active = TRUE
        ORDER BY b.flow_step_id, b.branch_order
      `, flowIds);
      
      // Agrupar ramas por flow
      const branchesByFlow = {};
      branches.forEach(branch => {
        if (!branchesByFlow[branch.flow_step_id]) {
          branchesByFlow[branch.flow_step_id] = [];
        }
        branchesByFlow[branch.flow_step_id].push(branch);
      });
      
      // Agregar ramas a flows y construir árbol jerárquico
      flows.forEach(flow => {
        flow.branches = branchesByFlow[flow.id] || [];
      });
      
      const tree = buildFlowTreeV2(flows);
      
      res.json({
        success: true,
        template_name,
        tree,
        total_steps: flows.length,
        total_branches: branches.length
      });
      
    } catch (error) {
      logger.error({ error: error.message, template_name: req.params.template_name }, '❌ Error obteniendo árbol V2');
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  });

  /**
   * GET /api/conversation-flows-v2/step/:step_id/branches
   * Obtiene todas las ramas disponibles para un paso específico
   */
  router.get('/step/:step_id/branches', async (req, res) => {
    try {
      const { step_id } = req.params;
      const { include_analytics = 'false' } = req.query;
      
      const [branches] = await pool.query(`
        SELECT 
          b.*,
          next_f.step_name as next_step_name,
          next_f.bot_message as next_bot_message,
          f.step_name as current_step_name
        FROM conversation_branches b
        LEFT JOIN conversation_flows_v2 next_f ON b.next_step_id = next_f.id
        LEFT JOIN conversation_flows_v2 f ON b.flow_step_id = f.id
        WHERE b.flow_step_id = ? AND b.is_active = TRUE
        ORDER BY b.trigger_priority DESC, b.branch_order ASC
      `, [step_id]);
      
      // Si se requieren analytics, cargarlas
      if (include_analytics === 'true' && branches.length > 0) {
        const branchIds = branches.map(b => b.id);
        const [analytics] = await pool.query(`
          SELECT 
            branch_id,
            SUM(times_triggered) as total_triggered,
            SUM(times_selected) as total_selected,
            AVG(avg_match_score) as avg_score,
            SUM(led_to_completion) as completions,
            SUM(led_to_escalation) as escalations
          FROM conversation_analytics_v2 
          WHERE branch_id IN (${branchIds.map(() => '?').join(',')})
          AND date_recorded >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          GROUP BY branch_id
        `, branchIds);
        
        // Agrupar analytics por rama
        const analyticsByBranch = {};
        analytics.forEach(a => {
          analyticsByBranch[a.branch_id] = a;
        });
        
        // Agregar analytics a cada rama
        branches.forEach(branch => {
          branch.analytics = analyticsByBranch[branch.id] || null;
        });
      }
      
      res.json({
        success: true,
        step_id: parseInt(step_id),
        branches: branches,
        count: branches.length
      });
      
    } catch (error) {
      logger.error({ error: error.message, step_id: req.params.step_id }, '❌ Error obteniendo ramas del paso');
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  });

  // ============================================================================
  // ENDPOINTS DE CREACIÓN Y MODIFICACIÓN
  // ============================================================================

  /**
   * POST /api/conversation-flows-v2/step
   * Crea un nuevo paso del flujo
   */
  router.post('/step', async (req, res) => {
    try {
      const {
        template_name,
        step_number,
        parent_step_id,
        step_name,
        step_description,
        bot_message,
        step_type = 'question',
        requires_human_fallback = false,
        max_uses_per_conversation = 1,
        timeout_minutes = 15,
        context_variables,
        ai_context_prompt,
        metadata,
        is_active = true
      } = req.body;

      // Validaciones básicas
      if (!template_name || !bot_message) {
        return res.status(400).json({
          success: false,
          error: 'template_name y bot_message son obligatorios'
        });
      }

      const [result] = await pool.query(`
        INSERT INTO conversation_flows_v2 (
          template_name, step_number, parent_step_id, step_name, step_description,
          bot_message, step_type, requires_human_fallback, max_uses_per_conversation,
          timeout_minutes, context_variables, ai_context_prompt, metadata, is_active, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        template_name, step_number, parent_step_id, step_name, step_description,
        bot_message, step_type, requires_human_fallback, max_uses_per_conversation,
        timeout_minutes, 
        context_variables ? JSON.stringify(context_variables) : null,
        ai_context_prompt,
        metadata ? JSON.stringify(metadata) : null,
        is_active,
        req.user?.username || 'admin'
      ]);

      logger.info({ 
        stepId: result.insertId, 
        template_name, 
        step_name 
      }, '✅ Nuevo paso V2 creado');

      res.status(201).json({
        success: true,
        step_id: result.insertId,
        message: 'Paso del flujo creado exitosamente'
      });

    } catch (error) {
      logger.error({ error: error.message }, '❌ Error creando paso del flujo');
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  });

  /**
   * POST /api/conversation-flows-v2/branch
   * Crea una nueva rama para un paso del flujo
   */
  router.post('/branch', async (req, res) => {
    try {
      const {
        flow_step_id,
        branch_name,
        branch_description,
        branch_order = 1,
        trigger_keywords,
        trigger_regex,
        trigger_sentiment = 'any',
        trigger_exact_match = false,
        trigger_priority = 1,
        context_conditions,
        time_conditions,
        user_history_conditions,
        response_text,
        response_type = 'fixed',
        response_variables,
        next_step_id,
        end_conversation = false,
        webhook_url,
        webhook_method = 'POST',
        webhook_headers,
        is_active = true
      } = req.body;

      // Validaciones básicas
      if (!flow_step_id || !response_text) {
        return res.status(400).json({
          success: false,
          error: 'flow_step_id y response_text son obligatorios'
        });
      }

      // Validar que el step existe
      const [existingSteps] = await pool.query(
        'SELECT id FROM conversation_flows_v2 WHERE id = ?', 
        [flow_step_id]
      );
      
      if (existingSteps.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'El paso del flujo especificado no existe'
        });
      }

      // Validar formato de keywords
      let keywordsJson = null;
      if (trigger_keywords) {
        try {
          keywordsJson = Array.isArray(trigger_keywords) 
            ? JSON.stringify(trigger_keywords)
            : JSON.stringify([trigger_keywords]);
        } catch (e) {
          return res.status(400).json({
            success: false,
            error: 'trigger_keywords debe ser un array o string válido'
          });
        }
      }

      const [result] = await pool.query(`
        INSERT INTO conversation_branches (
          flow_step_id, branch_name, branch_description, branch_order,
          trigger_keywords, trigger_regex, trigger_sentiment, trigger_exact_match, trigger_priority,
          context_conditions, time_conditions, user_history_conditions,
          response_text, response_type, response_variables,
          next_step_id, end_conversation,
          webhook_url, webhook_method, webhook_headers,
          is_active, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        flow_step_id, branch_name, branch_description, branch_order,
        keywordsJson, trigger_regex, trigger_sentiment, trigger_exact_match, trigger_priority,
        context_conditions ? JSON.stringify(context_conditions) : null,
        time_conditions ? JSON.stringify(time_conditions) : null,
        user_history_conditions ? JSON.stringify(user_history_conditions) : null,
        response_text, response_type,
        response_variables ? JSON.stringify(response_variables) : null,
        next_step_id, end_conversation,
        webhook_url, webhook_method,
        webhook_headers ? JSON.stringify(webhook_headers) : null,
        is_active, req.user?.username || 'admin'
      ]);

      logger.info({ 
        branchId: result.insertId, 
        flow_step_id, 
        branch_name 
      }, '✅ Nueva rama creada');

      res.status(201).json({
        success: true,
        branch_id: result.insertId,
        message: 'Rama creada exitosamente'
      });

    } catch (error) {
      logger.error({ error: error.message }, '❌ Error creando rama');
      
      if (error.code === 'ER_DUP_ENTRY') {
        res.status(400).json({
          success: false,
          error: 'Ya existe una rama con ese orden para este paso'
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Error interno del servidor'
        });
      }
    }
  });

  /**
   * PUT /api/conversation-flows-v2/step/:step_id
   * Actualiza un paso del flujo
   */
  router.put('/step/:step_id', async (req, res) => {
    try {
      const { step_id } = req.params;
      const updateFields = { ...req.body };
      delete updateFields.id;
      delete updateFields.created_at;

      // Validar que el step existe
      const [existing] = await pool.query(
        'SELECT id FROM conversation_flows_v2 WHERE id = ?', 
        [step_id]
      );
      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Paso no encontrado'
        });
      }

      // Procesar campos JSON
      const jsonFields = ['context_variables', 'metadata'];
      for (const field of jsonFields) {
        if (updateFields[field] && typeof updateFields[field] !== 'string') {
          updateFields[field] = JSON.stringify(updateFields[field]);
        }
      }

      // Construir query dinámicamente
      const fields = Object.keys(updateFields);
      if (fields.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No hay campos para actualizar'
        });
      }

      const setClause = fields.map(field => `${field} = ?`).join(', ');
      const values = fields.map(field => updateFields[field]);
      values.push(step_id);

      await pool.query(`
        UPDATE conversation_flows_v2 
        SET ${setClause}, updated_at = NOW()
        WHERE id = ?
      `, values);

      logger.info({ stepId: step_id, updatedFields: fields }, '✅ Paso V2 actualizado');

      res.json({
        success: true,
        message: 'Paso actualizado exitosamente'
      });

    } catch (error) {
      logger.error({ error: error.message, step_id: req.params.step_id }, '❌ Error actualizando paso');
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  });

  /**
   * PUT /api/conversation-flows-v2/branch/:branch_id
   * Actualiza una rama específica
   */
  router.put('/branch/:branch_id', async (req, res) => {
    try {
      const { branch_id } = req.params;
      const updateFields = { ...req.body };
      delete updateFields.id;
      delete updateFields.created_at;

      // Validar que la rama existe
      const [existing] = await pool.query(
        'SELECT id FROM conversation_branches WHERE id = ?', 
        [branch_id]
      );
      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Rama no encontrada'
        });
      }

      // Procesar campos JSON
      const jsonFields = [
        'trigger_keywords', 'context_conditions', 'time_conditions', 
        'user_history_conditions', 'response_variables', 'webhook_headers'
      ];
      for (const field of jsonFields) {
        if (updateFields[field] && typeof updateFields[field] !== 'string') {
          updateFields[field] = JSON.stringify(updateFields[field]);
        }
      }

      // Construir query dinámicamente
      const fields = Object.keys(updateFields);
      if (fields.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No hay campos para actualizar'
        });
      }

      const setClause = fields.map(field => `${field} = ?`).join(', ');
      const values = fields.map(field => updateFields[field]);
      values.push(branch_id);

      await pool.query(`
        UPDATE conversation_branches 
        SET ${setClause}, updated_at = NOW()
        WHERE id = ?
      `, values);

      logger.info({ branchId: branch_id, updatedFields: fields }, '✅ Rama actualizada');

      res.json({
        success: true,
        message: 'Rama actualizada exitosamente'
      });

    } catch (error) {
      logger.error({ error: error.message, branch_id: req.params.branch_id }, '❌ Error actualizando rama');
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  });

  // ============================================================================
  // ENDPOINTS DE TESTING Y SIMULACIÓN
  // ============================================================================

  /**
   * POST /api/conversation-flows-v2/test
   * Testa flujo conversacional con evaluación multi-rama
   */
  router.post('/test', async (req, res) => {
    try {
      const { template_name, client_message, session_id } = req.body;
      
      if (!template_name || !client_message) {
        return res.status(400).json({
          success: false,
          error: 'template_name y client_message son requeridos'
        });
      }
      
      // Simular usando el ConversationEngine V2
      const ConversationEngineV2 = require('../chatbot/conversation-engine-v2');
      const engine = new ConversationEngineV2(pool);
      
      // Crear ID de sesión único para testing
      const testSessionId = session_id || `test_${Date.now()}`;
      
      const result = await engine.processMessage(
        testSessionId,
        template_name,
        client_message,
        '56900000000' // Número de prueba
      );
      
      if (!result) {
        return res.json({
          success: false,
          error: 'No se pudo procesar el mensaje en el flujo'
        });
      }
      
      res.json({
        success: true,
        session_id: testSessionId,
        response_text: result.text,
        should_escalate: result.shouldEscalate,
        escalation_reason: result.escalationReason,
        processing_time: result.processingTime,
        branch_info: result.branchInfo,
        is_conversation_flow: result.isConversationFlow
      });
      
    } catch (error) {
      logger.error({ error: error.message }, '❌ Error en testing V2');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/conversation-flows-v2/analytics/:template_name
   * Analytics detalladas por template, pasos y ramas
   */
  router.get('/analytics/:template_name', async (req, res) => {
    try {
      const { template_name } = req.params;
      const { days = 30, include_branches = 'true' } = req.query;

      // Analytics por pasos
      const [stepAnalytics] = await pool.query(`
        SELECT 
          a.step_id,
          f.step_name,
          f.bot_message,
          SUM(a.times_triggered) as total_triggered,
          AVG(a.avg_response_time_ms) as avg_response_time,
          SUM(a.led_to_completion) as completions,
          SUM(a.led_to_escalation) as escalations,
          SUM(a.led_to_abandonment) as abandonments,
          COUNT(DISTINCT a.date_recorded) as active_days
        FROM conversation_analytics_v2 a
        JOIN conversation_flows_v2 f ON a.step_id = f.id
        WHERE a.template_name = ?
          AND a.date_recorded >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY a.step_id, f.step_name, f.bot_message
        ORDER BY total_triggered DESC
      `, [template_name, days]);

      // Analytics por ramas si se requiere
      let branchAnalytics = [];
      if (include_branches === 'true') {
        const [branches] = await pool.query(`
          SELECT 
            a.branch_id,
            b.branch_name,
            b.flow_step_id,
            f.step_name,
            SUM(a.times_triggered) as total_triggered,
            SUM(a.times_selected) as total_selected,
            AVG(a.avg_match_score) as avg_match_score,
            AVG(a.avg_response_time_ms) as avg_response_time,
            SUM(a.led_to_completion) as completions,
            SUM(a.led_to_escalation) as escalations
          FROM conversation_analytics_v2 a
          JOIN conversation_branches b ON a.branch_id = b.id
          JOIN conversation_flows_v2 f ON b.flow_step_id = f.id
          WHERE a.template_name = ?
            AND a.date_recorded >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            AND a.branch_id IS NOT NULL
          GROUP BY a.branch_id, b.branch_name, b.flow_step_id, f.step_name
          ORDER BY total_selected DESC
        `, [template_name, days]);
        
        branchAnalytics = branches;
      }

      // Resumen general
      const [summary] = await pool.query(`
        SELECT 
          COUNT(DISTINCT s.session_id) as total_conversations,
          AVG(s.messages_in_flow) as avg_messages_per_conversation,
          AVG(s.decision_points_passed) as avg_decision_points,
          COUNT(CASE WHEN s.escalated_to_human THEN 1 END) as escalated_count,
          COUNT(CASE WHEN s.conversation_state = 'completed' THEN 1 END) as completed_count,
          AVG(s.total_processing_time_ms) as avg_total_processing_time
        FROM conversation_sessions_v2 s
        WHERE s.template_name = ?
          AND s.started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      `, [template_name, days]);

      res.json({
        success: true,
        template_name,
        period_days: parseInt(days),
        summary: summary[0],
        step_analytics: stepAnalytics,
        branch_analytics: branchAnalytics
      });

    } catch (error) {
      logger.error({ 
        error: error.message, 
        template_name: req.params.template_name 
      }, '❌ Error obteniendo analytics V2');
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  });

  // ============================================================================
  // FUNCIONES AUXILIARES
  // ============================================================================

  /**
   * Construye árbol jerárquico de flujos V2 con ramas
   */
  function buildFlowTreeV2(flows) {
    const flowMap = new Map();
    const rootNodes = [];

    // Crear mapa de flujos con sus ramas
    flows.forEach(flow => {
      flowMap.set(flow.id, { 
        ...flow, 
        children: [],
        branches: flow.branches || []
      });
    });

    // Construir jerarquía
    flows.forEach(flow => {
      const flowNode = flowMap.get(flow.id);
      
      if (flow.parent_step_id) {
        const parent = flowMap.get(flow.parent_step_id);
        if (parent) {
          parent.children.push(flowNode);
        }
      } else {
        rootNodes.push(flowNode);
      }
    });

    return rootNodes;
  }

  return router;
};