// ============================================================================
// API ENDPOINTS PARA GESTIÓN DE FLUJOS CONVERSACIONALES
// ============================================================================
// Endpoints para configurar, consultar y analizar flujos conversacionales
// ============================================================================

const express = require('express');
const router = express.Router();
const P = require('pino');

// Crear logger básico para producción
const logger = P({
  level: process.env.LOG_LEVEL || 'info'
});

module.exports = function createConversationFlowsAPI(pool) {
  
  // ============================================================================
  // NUEVO: Testing de flujos conversacionales
  // ============================================================================
  router.post('/test', async (req, res) => {
    try {
      const { template_name, client_message, session_id } = req.body;
      
      if (!template_name || !client_message) {
        return res.status(400).json({
          success: false,
          error: 'template_name y client_message son requeridos'
        });
      }
      
      // Simular el flujo del ConversationEngine
      const testResult = await simulateConversationFlow(pool, template_name, client_message, session_id);
      
      res.json({
        success: true,
        ...testResult
      });
      
    } catch (error) {
      logger.error({ error: error.message }, 'Error en testing de conversación');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // NUEVO: Obtener árbol de flujos para visualización
  // ============================================================================
  router.get('/tree/:template', async (req, res) => {
    try {
      const { template } = req.params;
      
      // Obtener todos los pasos del template
      const [steps] = await pool.query(`
        SELECT * FROM conversation_flows 
        WHERE template_name = ? AND is_active = TRUE
        ORDER BY step_number ASC, trigger_priority DESC
      `, [template]);
      
      // Construir árbol jerárquico
      const tree = buildFlowTree(steps);
      
      res.json({
        success: true,
        template,
        tree,
        total_steps: steps.length
      });
      
    } catch (error) {
      logger.error({ error: error.message }, 'Error obteniendo árbol de flujos');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // ENDPOINTS DE CONSULTA
  // ============================================================================

  /**
   * GET /api/conversation-flows
   * Obtiene todos los flujos conversacionales configurados
   */
  router.get('/', async (req, res) => {
    try {
      const { template_name, active_only = 'false' } = req.query;
      
      let query = `
        SELECT cf.*, 
               CASE WHEN cf.parent_step_id IS NULL THEN 1 ELSE 0 END as is_root,
               (SELECT COUNT(*) FROM conversation_flows cf2 WHERE cf2.parent_step_id = cf.id) as children_count
        FROM conversation_flows cf
      `;
      
      const conditions = [];
      const params = [];
      
      if (template_name) {
        conditions.push('cf.template_name = ?');
        params.push(template_name);
      }
      
      if (active_only === 'true') {
        conditions.push('cf.is_active = TRUE');
      }
      
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      query += ' ORDER BY cf.template_name, cf.step_number, cf.trigger_priority DESC';
      
      const [flows] = await pool.query(query, params);
      
      res.json({
        success: true,
        count: flows.length,
        flows: flows
      });
      
    } catch (error) {
      logger.error({ error: error.message }, '❌ Error obteniendo flujos conversacionales');
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  });

  /**
   * GET /api/conversation-flows/tree/:template_name
   * Obtiene el árbol completo de flujo para un template específico
   */
  router.get('/tree/:template_name', async (req, res) => {
    try {
      const { template_name } = req.params;
      
      const [flows] = await pool.query(`
        SELECT * FROM conversation_flows 
        WHERE template_name = ? AND is_active = TRUE
        ORDER BY step_number, trigger_priority DESC
      `, [template_name]);
      
      // Construir árbol jerárquico
      const tree = buildFlowTree(flows);
      
      res.json({
        success: true,
        template_name,
        tree
      });
      
    } catch (error) {
      logger.error({ error: error.message, template_name: req.params.template_name }, '❌ Error obteniendo árbol de flujo');
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  });

  /**
   * GET /api/conversation-flows/:id
   * Obtiene un flujo específico por ID
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const [flows] = await pool.query(`
        SELECT cf.*,
               parent.step_name as parent_step_name,
               (SELECT COUNT(*) FROM conversation_flows cf2 WHERE cf2.parent_step_id = cf.id) as children_count
        FROM conversation_flows cf
        LEFT JOIN conversation_flows parent ON cf.parent_step_id = parent.id
        WHERE cf.id = ?
      `, [id]);
      
      if (flows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Flujo no encontrado'
        });
      }
      
      res.json({
        success: true,
        flow: flows[0]
      });
      
    } catch (error) {
      logger.error({ error: error.message, id: req.params.id }, '❌ Error obteniendo flujo específico');
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
   * POST /api/conversation-flows
   * Crea un nuevo flujo conversacional
   */
  router.post('/', async (req, res) => {
    try {
      const {
        template_name,
        step_number,
        parent_step_id,
        step_name,
        step_description,
        trigger_keywords,
        trigger_sentiment = 'any',
        trigger_exact_match = false,
        trigger_priority = 1,
        response_text,
        response_type = 'fixed',
        response_variables,
        next_steps,
        max_uses_per_conversation = 1,
        timeout_hours = 72,
        requires_human_fallback = false,
        ai_context_prompt,
        metadata,
        is_active = true
      } = req.body;

      // Validaciones básicas
      if (!template_name || !response_text) {
        return res.status(400).json({
          success: false,
          error: 'template_name y response_text son obligatorios'
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
        INSERT INTO conversation_flows (
          template_name, step_number, parent_step_id, step_name, step_description,
          trigger_keywords, trigger_sentiment, trigger_exact_match, trigger_priority,
          response_text, response_type, response_variables, next_steps,
          max_uses_per_conversation, timeout_hours, requires_human_fallback,
          ai_context_prompt, metadata, is_active, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        template_name, step_number, parent_step_id, step_name, step_description,
        keywordsJson, trigger_sentiment, trigger_exact_match, trigger_priority,
        response_text, response_type, 
        response_variables ? JSON.stringify(response_variables) : null,
        next_steps ? JSON.stringify(next_steps) : null,
        max_uses_per_conversation, timeout_hours, requires_human_fallback,
        ai_context_prompt, metadata ? JSON.stringify(metadata) : null,
        is_active, req.user?.username || 'admin'
      ]);

      logger.info({ 
        flowId: result.insertId, 
        template_name, 
        step_name 
      }, '✅ Nuevo flujo conversacional creado');

      res.status(201).json({
        success: true,
        flow_id: result.insertId,
        message: 'Flujo conversacional creado exitosamente'
      });

    } catch (error) {
      logger.error({ error: error.message }, '❌ Error creando flujo conversacional');
      
      if (error.code === 'ER_DUP_ENTRY') {
        res.status(400).json({
          success: false,
          error: 'Ya existe un flujo con esos parámetros'
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
   * PUT /api/conversation-flows/:id
   * Actualiza un flujo conversacional existente
   */
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updateFields = { ...req.body };
      delete updateFields.id; // No permitir cambiar el ID
      delete updateFields.created_at; // No permitir cambiar fecha de creación

      // Validar que el flujo existe
      const [existing] = await pool.query('SELECT id FROM conversation_flows WHERE id = ?', [id]);
      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Flujo no encontrado'
        });
      }

      // Procesar campos JSON
      const jsonFields = ['trigger_keywords', 'response_variables', 'next_steps', 'metadata'];
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
      values.push(id);

      await pool.query(`
        UPDATE conversation_flows 
        SET ${setClause}
        WHERE id = ?
      `, values);

      logger.info({ flowId: id, updatedFields: fields }, '✅ Flujo conversacional actualizado');

      res.json({
        success: true,
        message: 'Flujo actualizado exitosamente'
      });

    } catch (error) {
      logger.error({ error: error.message, id: req.params.id }, '❌ Error actualizando flujo conversacional');
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  });

  /**
   * DELETE /api/conversation-flows/:id
   * Elimina un flujo conversacional (soft delete)
   */
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { hard_delete = false } = req.query;

      if (hard_delete === 'true') {
        // Hard delete - eliminar completamente
        const [result] = await pool.query('DELETE FROM conversation_flows WHERE id = ?', [id]);
        
        if (result.affectedRows === 0) {
          return res.status(404).json({
            success: false,
            error: 'Flujo no encontrado'
          });
        }
      } else {
        // Soft delete - solo marcar como inactivo
        const [result] = await pool.query(`
          UPDATE conversation_flows 
          SET is_active = FALSE 
          WHERE id = ?
        `, [id]);
        
        if (result.affectedRows === 0) {
          return res.status(404).json({
            success: false,
            error: 'Flujo no encontrado'
          });
        }
      }

      logger.info({ flowId: id, hardDelete: hard_delete === 'true' }, '🗑️ Flujo conversacional eliminado');

      res.json({
        success: true,
        message: hard_delete === 'true' ? 'Flujo eliminado permanentemente' : 'Flujo desactivado'
      });

    } catch (error) {
      logger.error({ error: error.message, id: req.params.id }, '❌ Error eliminando flujo conversacional');
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  });

  // ============================================================================
  // ENDPOINTS DE ANALYTICS Y ESTADÍSTICAS
  // ============================================================================

  /**
   * GET /api/conversation-flows/analytics/:template_name
   * Obtiene analíticas de uso para un template
   */
  router.get('/analytics/:template_name', async (req, res) => {
    try {
      const { template_name } = req.params;
      const { days = 30 } = req.query;

      const [analytics] = await pool.query(`
        SELECT 
          ca.step_id,
          cf.step_name,
          ca.date_recorded,
          ca.times_triggered,
          ca.avg_response_time_ms,
          ca.success_rate,
          ca.led_to_resolution,
          ca.led_to_escalation,
          ca.client_abandoned
        FROM conversation_analytics ca
        JOIN conversation_flows cf ON ca.step_id = cf.id
        WHERE ca.template_name = ?
          AND ca.date_recorded >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        ORDER BY ca.date_recorded DESC, ca.times_triggered DESC
      `, [template_name, days]);

      // Estadísticas resumidas
      const [summary] = await pool.query(`
        SELECT 
          COUNT(DISTINCT cs.id) as total_conversations,
          AVG(cs.messages_in_flow) as avg_messages_per_conversation,
          COUNT(CASE WHEN cs.escalated_to_human THEN 1 END) as escalated_count,
          COUNT(CASE WHEN cs.conversation_state = 'completed' THEN 1 END) as completed_count,
          AVG(cs.total_response_time_ms) as avg_total_response_time
        FROM conversation_sessions cs
        WHERE cs.template_name = ?
          AND cs.started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      `, [template_name, days]);

      res.json({
        success: true,
        template_name,
        period_days: days,
        summary: summary[0],
        daily_analytics: analytics
      });

    } catch (error) {
      logger.error({ error: error.message, template_name: req.params.template_name }, '❌ Error obteniendo analytics');
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
   * Construye árbol jerárquico de flujos
   */
  function buildFlowTree(flows) {
    const flowMap = new Map();
    const rootNodes = [];

    // Crear mapa de flujos
    flows.forEach(flow => {
      flowMap.set(flow.id, { ...flow, children: [] });
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

  // ============================================================================
  // FUNCIÓN AUXILIAR PARA CONSTRUIR ÁRBOL DE FLUJOS
  // ============================================================================
  function buildFlowTree(steps) {
    // Crear mapa de pasos por ID para acceso rápido
    const stepsMap = new Map();
    steps.forEach(step => {
      stepsMap.set(step.id, { ...step, children: [] });
    });
    
    // Construir estructura jerárquica
    const rootNodes = [];
    
    steps.forEach(step => {
      const stepNode = stepsMap.get(step.id);
      
      if (!step.parent_step_id) {
        // Es un nodo raíz
        rootNodes.push(stepNode);
      } else {
        // Es un nodo hijo, agregarlo a su padre
        const parent = stepsMap.get(step.parent_step_id);
        if (parent) {
          parent.children.push(stepNode);
        }
      }
    });
    
    return rootNodes;
  }

  // ============================================================================
  // FUNCIÓN DE TESTING DE CONVERSACIONES (similar al PHP)
  // ============================================================================
  async function simulateConversationFlow(pool, templateName, clientMessage, sessionId) {
    try {
      // 1. Buscar o crear sesión de testing
      const session = await getOrCreateTestSession(pool, sessionId, templateName);
      
      // 2. Obtener posibles pasos siguientes
      const possibleSteps = await getPossibleNextSteps(pool, session);
      
      // 3. Encontrar mejor coincidencia
      const bestMatch = findBestStepMatch(possibleSteps, clientMessage);
      
      if (!bestMatch) {
        return {
          session_id: session.id,
          step_name: 'FALLBACK',
          step_id: null,
          match_score: 0,
          response_type: 'generic_ai',
          response_text: 'No se encontró un paso específico para esta consulta.',
          should_escalate: true,
          escalation_reason: 'No hay flujo configurado',
          debug_info: {
            possible_steps_count: possibleSteps.length,
            current_step_id: session.current_step_id,
            template_name: templateName
          }
        };
      }
      
      // 4. Generar respuesta
      const response = generateTestResponse(bestMatch);
      
      // 5. Actualizar sesión
      await updateTestSession(pool, session, bestMatch);
      
      return {
        session_id: session.id,
        step_name: bestMatch.step_name,
        step_id: bestMatch.id,
        match_score: bestMatch.match_score,
        response_type: bestMatch.response_type,
        response_text: response,
        should_escalate: !!bestMatch.requires_human_fallback,
        escalation_reason: bestMatch.requires_human_fallback ? `Escalamiento desde: ${bestMatch.step_name}` : null,
        debug_info: {
          possible_steps_count: possibleSteps.length,
          current_step_id: session.current_step_id,
          template_name: templateName,
          keywords_matched: JSON.parse(bestMatch.trigger_keywords || '[]')
        }
      };
      
    } catch (error) {
      throw new Error(`Error en simulación: ${error.message}`);
    }
  }
  
  async function getOrCreateTestSession(pool, sessionId, templateName) {
    if (sessionId) {
      const [existing] = await pool.query(
        'SELECT * FROM conversation_sessions WHERE id = ? AND template_name = ?',
        [sessionId, templateName]
      );
      if (existing.length > 0) return existing[0];
    }
    
    // Crear nueva sesión de testing
    const [result] = await pool.query(`
      INSERT INTO conversation_sessions (
        session_id, template_name, conversation_state, 
        step_history, messages_in_flow, expires_at
      ) VALUES (?, ?, 'active', JSON_ARRAY(), 0, DATE_ADD(NOW(), INTERVAL 1 HOUR))
    `, [999999, templateName]);
    
    const [newSession] = await pool.query(
      'SELECT * FROM conversation_sessions WHERE id = ?',
      [result.insertId]
    );
    
    return newSession[0];
  }
  
  async function getPossibleNextSteps(pool, session) {
    if (!session.current_step_id) {
      // Primera interacción: buscar paso inicial
      const [steps] = await pool.query(`
        SELECT * FROM conversation_flows 
        WHERE template_name = ? AND step_number = 1 AND is_active = TRUE
        ORDER BY trigger_priority DESC
      `, [session.template_name]);
      return steps;
    } else {
      // Interacciones posteriores: buscar pasos hijos
      const [steps] = await pool.query(`
        SELECT * FROM conversation_flows 
        WHERE parent_step_id = ? AND is_active = TRUE
        ORDER BY trigger_priority DESC
      `, [session.current_step_id]);
      return steps;
    }
  }
  
  function findBestStepMatch(possibleSteps, clientMessage) {
    const messageText = clientMessage.toLowerCase().trim();
    let bestMatch = null;
    let highestScore = 0;
    
    for (const step of possibleSteps) {
      const score = calculateStepMatchScore(step, messageText);
      
      if (score > highestScore) {
        highestScore = score;
        bestMatch = step;
        bestMatch.match_score = score;
      }
    }
    
    if (bestMatch && highestScore > 0) {
      return bestMatch;
    }
    
    // Fallback al primer paso
    if (possibleSteps.length > 0) {
      const fallback = possibleSteps[0];
      fallback.match_score = 0.1;
      return fallback;
    }
    
    return null;
  }
  
  function calculateStepMatchScore(step, messageText) {
    if (!step.trigger_keywords) return 0;
    
    let keywords;
    try {
      keywords = JSON.parse(step.trigger_keywords);
    } catch {
      return 0;
    }
    
    let totalScore = 0;
    let matchCount = 0;
    
    for (const keyword of keywords) {
      if (keyword === '*') return 0.1;
      
      const keywordLower = keyword.toLowerCase();
      
      if (step.trigger_exact_match) {
        if (messageText === keywordLower) {
          totalScore += 1.0;
          matchCount++;
        }
      } else {
        if (messageText.includes(keywordLower)) {
          const specificity = keywordLower.length / messageText.length;
          totalScore += Math.min(specificity * 2, 1.0);
          matchCount++;
        }
      }
    }
    
    if (matchCount === 0) return 0;
    
    const normalizedScore = totalScore / keywords.length;
    const priorityBonus = (step.trigger_priority || 1) * 0.01;
    
    return Math.min(normalizedScore + priorityBonus, 1.0);
  }
  
  function generateTestResponse(step) {
    switch (step.response_type) {
      case 'fixed':
        return step.response_text;
      case 'ai_assisted':
        return step.response_text + ' (AI-assisted simulado)';
      case 'escalate_human':
        return step.response_text;
      default:
        return step.response_text;
    }
  }
  
  async function updateTestSession(pool, session, step) {
    await pool.query(`
      UPDATE conversation_sessions 
      SET current_step_id = ?, messages_in_flow = messages_in_flow + 1, last_interaction_at = NOW()
      WHERE id = ?
    `, [step.id, session.id]);
  }

  // ============================================================================
  // DEBUG: Endpoint para ver exactamente qué flujos están guardados
  // ============================================================================
  router.get('/debug/:template', async (req, res) => {
    try {
      const { template } = req.params;
      
      // Obtener TODOS los flujos sin filtro
      const [allFlows] = await pool.query(`
        SELECT 
          id, 
          template_name,
          step_name,
          trigger_keywords,
          response_text,
          response_type,
          is_active,
          step_number,
          trigger_priority,
          created_at
        FROM conversation_flows 
        WHERE template_name = ?
        ORDER BY created_at DESC
      `, [template]);
      
      // Parsear keywords para mostrar claramente
      const debugFlows = allFlows.map(flow => {
        let parsedKeywords = [];
        try {
          parsedKeywords = JSON.parse(flow.trigger_keywords || '[]');
        } catch (e) {
          parsedKeywords = ['ERROR PARSING: ' + flow.trigger_keywords];
        }
        
        return {
          ...flow,
          trigger_keywords_parsed: parsedKeywords,
          trigger_keywords_raw: flow.trigger_keywords
        };
      });
      
      res.json({
        success: true,
        template,
        total_flows: allFlows.length,
        flows: debugFlows,
        debug_info: {
          active_flows: allFlows.filter(f => f.is_active).length,
          inactive_flows: allFlows.filter(f => !f.is_active).length
        }
      });
      
    } catch (error) {
      logger.error({ error: error.message }, 'Error en debug de flujos');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
};