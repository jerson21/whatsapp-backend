/**
 * Visual Flow Engine
 * Ejecuta flujos creados en el Flow Builder cuando llegan mensajes
 */

const logger = require('pino')({ level: process.env.LOG_LEVEL || 'info' });
const OpenAI = require('openai');

class VisualFlowEngine {
  constructor(dbPool, classifier, sendMessage, emitFlowEvent = null) {
    this.db = dbPool;
    this.classifier = classifier;
    this.sendMessage = sendMessage; // Función para enviar mensajes a WhatsApp
    this.emitFlowEvent = emitFlowEvent; // Función para emitir eventos al monitor
    this.activeFlows = [];
    this.sessionStates = new Map(); // phone -> { flowId, currentNodeId, variables }

    // Initialize OpenAI client if API key is available
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      logger.info('OpenAI client initialized for Visual Flow Engine');
    } else {
      logger.warn('OPENAI_API_KEY not set - AI response nodes will not work');
    }
  }

  /**
   * Emitir evento al monitor en tiempo real
   */
  emit(event) {
    if (this.emitFlowEvent) {
      try {
        this.emitFlowEvent(event);
      } catch (err) {
        logger.debug({ err }, 'Error emitting flow event');
      }
    }
  }

  /**
   * Cargar flujos activos desde la base de datos
   */
  async loadActiveFlows() {
    try {
      const [rows] = await this.db.query(`
        SELECT * FROM visual_flows
        WHERE is_active = TRUE
        ORDER BY is_default DESC, id ASC
      `);

      this.activeFlows = rows.map(row => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        isDefault: row.is_default,
        triggerConfig: this.parseJSON(row.trigger_config),
        nodes: this.parseJSON(row.nodes),
        connections: this.parseJSON(row.connections),
        variables: this.parseJSON(row.variables)
      }));

      logger.info({ count: this.activeFlows.length }, 'Visual flows loaded');
      return this.activeFlows;
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE') {
        logger.error({ err }, 'Error loading visual flows');
      }
      return [];
    }
  }

  /**
   * Procesar mensaje entrante
   * @param {string} phone - Número de teléfono
   * @param {string} message - Texto del mensaje
   * @param {object} context - Contexto adicional (sessionId, etc.)
   * @returns {object|null} - Respuesta del flujo o null si no hay flujo activo
   */
  async processMessage(phone, message, context = {}) {
    // Verificar si hay una sesión activa para este teléfono
    let sessionState = this.sessionStates.get(phone);

    if (sessionState) {
      // Continuar flujo existente
      return this.continueFlow(phone, message, sessionState, context);
    }

    // No hay sesión activa, buscar flujo que coincida
    const matchedFlow = await this.matchFlow(message, context);

    if (!matchedFlow) {
      logger.debug({ phone }, 'No matching visual flow found');
      return null;
    }

    // Iniciar nuevo flujo
    return this.startFlow(phone, matchedFlow, message, context);
  }

  /**
   * Buscar flujo que coincida con el mensaje
   */
  async matchFlow(message, context) {
    if (this.activeFlows.length === 0) {
      await this.loadActiveFlows();
    }

    // Clasificar el mensaje
    let classification = null;
    if (this.classifier) {
      classification = await this.classifier.classify(message, context);
    }

    // Buscar flujo que coincida con el trigger
    for (const flow of this.activeFlows) {
      if (this.matchTrigger(flow.triggerConfig, message, classification)) {
        return flow;
      }
    }

    // Si no hay match, usar flujo por defecto si existe
    const defaultFlow = this.activeFlows.find(f => f.isDefault);
    return defaultFlow || null;
  }

  /**
   * Verificar si un trigger coincide
   */
  matchTrigger(triggerConfig, message, classification) {
    if (!triggerConfig || !triggerConfig.type) {
      return false;
    }

    const normalizedMessage = message.toLowerCase().trim();

    switch (triggerConfig.type) {
      case 'keyword':
        const keywords = triggerConfig.keywords || [];
        return keywords.some(kw => normalizedMessage.includes(kw.toLowerCase()));

      case 'classification':
        if (!classification) return false;
        const conditions = triggerConfig.conditions || {};

        // Verificar intent
        if (conditions.intent) {
          const intents = Array.isArray(conditions.intent) ? conditions.intent : [conditions.intent];
          if (!intents.includes(classification.intent?.type)) {
            return false;
          }
        }

        // Verificar urgency
        if (conditions.urgency && classification.urgency?.level !== conditions.urgency) {
          return false;
        }

        // Verificar lead score mínimo
        if (conditions.lead_score_min && classification.leadScore?.value < conditions.lead_score_min) {
          return false;
        }

        return true;

      case 'always':
        return true;

      default:
        return false;
    }
  }

  /**
   * Iniciar un nuevo flujo
   */
  async startFlow(phone, flow, initialMessage, context) {
    logger.info({ phone, flowId: flow.id, flowName: flow.name }, 'Starting visual flow');

    // Clasificar mensaje para logging
    let classification = null;
    if (this.classifier) {
      classification = await this.classifier.classify(initialMessage, context);
    }

    // Determinar tipo de trigger
    const triggerType = flow.triggerConfig?.type || 'unknown';

    // Crear log de ejecución
    const executionLogId = await this.createExecutionLog(
      phone,
      flow,
      initialMessage,
      triggerType,
      classification
    );

    // Crear estado de sesión
    const sessionState = {
      flowId: flow.id,
      flowSlug: flow.slug,
      currentNodeId: null,
      variables: {
        phone,
        initial_message: initialMessage,
        ...context
      },
      startedAt: new Date(),
      executionLogId  // Store log ID in session
    };

    // Encontrar nodo trigger
    const triggerNode = flow.nodes.find(n => n.type === 'trigger');

    if (!triggerNode) {
      logger.warn({ flowId: flow.id }, 'Flow has no trigger node');
      await this.failExecutionLog(executionLogId, 'Flow has no trigger node');
      return null;
    }

    // Guardar estado
    this.sessionStates.set(phone, sessionState);

    // Emitir evento: FLUJO INICIADO
    this.emit({
      type: 'flow_started',
      executionId: executionLogId,
      flowId: flow.id,
      flowName: flow.name,
      flowSlug: flow.slug,
      phone,
      triggerMessage: initialMessage,
      triggerType,
      timestamp: new Date().toISOString()
    });

    // Ejecutar desde el trigger
    return this.executeNode(phone, flow, triggerNode, sessionState);
  }

  /**
   * Continuar un flujo existente
   */
  async continueFlow(phone, message, sessionState, context) {
    const flow = this.activeFlows.find(f => f.id === sessionState.flowId);

    if (!flow) {
      logger.warn({ phone, flowId: sessionState.flowId }, 'Flow not found, clearing session');
      this.sessionStates.delete(phone);
      return null;
    }

    const currentNode = flow.nodes.find(n => n.id === sessionState.currentNodeId);

    if (!currentNode) {
      logger.warn({ phone, nodeId: sessionState.currentNodeId }, 'Current node not found');
      this.sessionStates.delete(phone);
      return null;
    }

    // Si estamos en un nodo de pregunta, guardar la respuesta
    if (currentNode.type === 'question' && currentNode.variable) {
      let valueToSave = message;

      // Si hay opciones, intentar matchear
      if (currentNode.options && currentNode.options.length > 0) {
        const matchedOption = currentNode.options.find(
          opt => opt.label.toLowerCase() === message.toLowerCase() ||
                 opt.value === message
        );
        if (matchedOption) {
          valueToSave = matchedOption.value;
        }
      }

      sessionState.variables[currentNode.variable] = valueToSave;
      logger.debug({ variable: currentNode.variable, value: valueToSave }, 'Variable saved');
    }

    // Encontrar siguiente nodo
    const nextNode = this.findNextNode(flow, currentNode.id, sessionState.variables);

    if (!nextNode) {
      // Fin del flujo
      this.sessionStates.delete(phone);
      return { type: 'flow_completed', flowId: flow.id };
    }

    return this.executeNode(phone, flow, nextNode, sessionState);
  }

  /**
   * Ejecutar un nodo
   */
  async executeNode(phone, flow, node, sessionState) {
    logger.debug({ phone, nodeId: node.id, nodeType: node.type }, 'Executing node');

    const startTime = Date.now();
    sessionState.currentNodeId = node.id;

    // Emitir evento: NODO INICIANDO
    this.emit({
      type: 'node_started',
      executionId: sessionState.executionLogId,
      flowId: flow.id,
      flowName: flow.name,
      phone,
      nodeId: node.id,
      nodeType: node.type,
      nodeName: (node.content || node.id || '').substring(0, 50),
      variables: { ...sessionState.variables },
      timestamp: new Date().toISOString()
    });

    // Log step start
    const logStep = async (output, status = 'success') => {
      await this.addExecutionStep(sessionState.executionLogId, {
        node_id: node.id,
        node_type: node.type,
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
        output: output?.substring?.(0, 500) || output,
        status
      });

      // Emitir evento: NODO COMPLETADO
      this.emit({
        type: 'node_completed',
        executionId: sessionState.executionLogId,
        flowId: flow.id,
        phone,
        nodeId: node.id,
        nodeType: node.type,
        durationMs: Date.now() - startTime,
        output: output?.substring?.(0, 200) || output,
        status,
        variables: { ...sessionState.variables },
        timestamp: new Date().toISOString()
      });
    };

    switch (node.type) {
      case 'trigger':
        await logStep('Trigger activated');
        // Pasar al siguiente nodo
        const afterTrigger = this.findNextNode(flow, node.id);
        if (afterTrigger) {
          return this.executeNode(phone, flow, afterTrigger, sessionState);
        }
        return null;

      case 'message':
        const messageText = this.replaceVariables(node.content || '', sessionState.variables);

        // Enviar mensaje
        if (this.sendMessage) {
          await this.sendMessage(phone, messageText);
        }
        await logStep(messageText);

        // Continuar al siguiente nodo
        const afterMessage = this.findNextNode(flow, node.id);
        if (afterMessage) {
          // Pequeño delay para no enviar mensajes muy rápido
          await this.delay(500);
          return this.executeNode(phone, flow, afterMessage, sessionState);
        }

        // Flow completed
        await this.updateLogVariables(sessionState.executionLogId, sessionState.variables);
        await this.completeExecutionLog(sessionState.executionLogId, 'completed', node.id, 'message');
        this.sessionStates.delete(phone);
        return { type: 'message_sent', text: messageText, flowCompleted: true };

      case 'question':
        const questionText = this.replaceVariables(node.content || '', sessionState.variables);

        // Enviar pregunta
        if (this.sendMessage) {
          await this.sendMessage(phone, questionText);

          // Si hay opciones, enviar como lista o botones
          if (node.options && node.options.length > 0) {
            const optionsText = node.options.map((opt, i) => `${i + 1}. ${opt.label}`).join('\n');
            await this.sendMessage(phone, optionsText);
          }
        }
        await logStep(`Question: ${questionText} (waiting for: ${node.variable})`);

        // Esperar respuesta (no continuar)
        return {
          type: 'waiting_for_response',
          text: questionText,
          options: node.options,
          variable: node.variable
        };

      case 'condition':
        const conditions = node.conditions || [];
        let nextNodeId = null;
        let matchedCondition = 'else';

        for (const cond of conditions) {
          if (cond.else) {
            nextNodeId = cond.goto;
            break;
          }

          if (this.evaluateCondition(cond.if, sessionState.variables)) {
            nextNodeId = cond.goto;
            matchedCondition = cond.if;
            break;
          }
        }

        await logStep(`Condition evaluated: ${matchedCondition} -> ${nextNodeId}`);

        if (nextNodeId) {
          const conditionNext = flow.nodes.find(n => n.id === nextNodeId);
          if (conditionNext) {
            return this.executeNode(phone, flow, conditionNext, sessionState);
          }
        }

        // Fallback: siguiente nodo por conexión
        const afterCondition = this.findNextNode(flow, node.id);
        if (afterCondition) {
          return this.executeNode(phone, flow, afterCondition, sessionState);
        }

        await this.updateLogVariables(sessionState.executionLogId, sessionState.variables);
        await this.completeExecutionLog(sessionState.executionLogId, 'completed', node.id, 'condition');
        this.sessionStates.delete(phone);
        return { type: 'flow_completed', reason: 'no_condition_match' };

      case 'action':
        const actionResult = await this.executeAction(node, sessionState);
        logger.info({ action: node.action, result: actionResult }, 'Action executed');
        await logStep(`Action: ${node.action} - ${actionResult.success ? 'success' : 'failed'}`);

        const afterAction = this.findNextNode(flow, node.id);
        if (afterAction) {
          return this.executeNode(phone, flow, afterAction, sessionState);
        }

        await this.updateLogVariables(sessionState.executionLogId, sessionState.variables);
        await this.completeExecutionLog(sessionState.executionLogId, 'completed', node.id, 'action');
        this.sessionStates.delete(phone);
        return { type: 'action_completed', action: node.action };

      case 'transfer':
        const transferText = this.replaceVariables(node.content || 'Transfiriendo...', sessionState.variables);

        if (this.sendMessage) {
          await this.sendMessage(phone, transferText);
        }
        await logStep(`Transferred to human: ${transferText}`);

        await this.updateLogVariables(sessionState.executionLogId, sessionState.variables);
        await this.completeExecutionLog(sessionState.executionLogId, 'transferred', node.id, 'transfer');
        this.sessionStates.delete(phone);
        return {
          type: 'transfer_to_human',
          text: transferText,
          variables: sessionState.variables
        };

      case 'end':
        await logStep('Flow ended');
        await this.updateLogVariables(sessionState.executionLogId, sessionState.variables);
        await this.completeExecutionLog(sessionState.executionLogId, 'completed', node.id, 'end');
        this.sessionStates.delete(phone);
        return { type: 'flow_completed' };

      case 'ai_response':
        // Generate AI response using OpenAI
        try {
          if (!this.openai) {
            throw new Error('OpenAI client not initialized - check OPENAI_API_KEY');
          }

          const systemPrompt = this.replaceVariables(node.system_prompt || 'Eres un asistente útil.', sessionState.variables);
          const userPrompt = this.replaceVariables(node.user_prompt || sessionState.variables.initial_message || '', sessionState.variables);

          logger.debug({ systemPrompt, userPrompt }, 'Generating AI response');

          const aiResponse = await this.openai.chat.completions.create({
            model: node.model || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: node.temperature || 0.7,
            max_tokens: node.max_tokens || 200
          });

          const aiText = aiResponse.choices[0]?.message?.content || 'No pude generar una respuesta.';

          // Save to variable if specified
          if (node.variable) {
            sessionState.variables[node.variable] = aiText;
          }

          // Send the AI response
          if (this.sendMessage) {
            await this.sendMessage(phone, aiText);
          }

          await logStep(`AI Response: ${aiText.substring(0, 100)}...`);

          // Continue to next node
          const afterAI = this.findNextNode(flow, node.id);
          if (afterAI) {
            await this.delay(500);
            return this.executeNode(phone, flow, afterAI, sessionState);
          }

          await this.updateLogVariables(sessionState.executionLogId, sessionState.variables);
          await this.completeExecutionLog(sessionState.executionLogId, 'completed', node.id, 'ai_response');
          this.sessionStates.delete(phone);
          return { type: 'ai_response_sent', text: aiText, flowCompleted: true };

        } catch (err) {
          logger.error({ err }, 'Error generating AI response');
          await logStep(`AI Error: ${err.message}`, 'error');

          // Send fallback message
          if (this.sendMessage) {
            await this.sendMessage(phone, 'Disculpa, hubo un problema. Un agente te atenderá pronto.');
          }

          await this.failExecutionLog(sessionState.executionLogId, err.message, node.id);
          this.sessionStates.delete(phone);
          return { type: 'ai_error', error: err.message };
        }

      case 'webhook':
        // Make HTTP request to external API
        try {
          const webhookUrl = this.replaceVariables(node.url || '', sessionState.variables);
          const method = node.method || 'POST';
          const timeout = node.timeout || 5000;

          // Parse headers
          let headers = { 'Content-Type': 'application/json' };
          if (node.headers) {
            try {
              const parsedHeaders = typeof node.headers === 'string' ? JSON.parse(node.headers) : node.headers;
              headers = { ...headers, ...this.replaceVariablesInObject(parsedHeaders, sessionState.variables) };
            } catch (e) {
              logger.warn('Invalid headers JSON, using defaults');
            }
          }

          // Parse body
          let body = null;
          if (method !== 'GET' && node.body) {
            try {
              const parsedBody = typeof node.body === 'string' ? JSON.parse(node.body) : node.body;
              body = JSON.stringify(this.replaceVariablesInObject(parsedBody, sessionState.variables));
            } catch (e) {
              // If not valid JSON, treat as string
              body = this.replaceVariables(node.body, sessionState.variables);
            }
          }

          logger.debug({ webhookUrl, method, timeout }, 'Calling webhook');

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          const response = await fetch(webhookUrl, {
            method,
            headers,
            body,
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          let responseData;
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            responseData = await response.json();
          } else {
            responseData = await response.text();
          }

          // Save response to variable if specified
          if (node.variable) {
            sessionState.variables[node.variable] = responseData;
          }

          await logStep(`Webhook ${method} ${webhookUrl}: ${response.status}`);

          // Continue to next node
          const afterWebhook = this.findNextNode(flow, node.id);
          if (afterWebhook) {
            return this.executeNode(phone, flow, afterWebhook, sessionState);
          }

          await this.updateLogVariables(sessionState.executionLogId, sessionState.variables);
          await this.completeExecutionLog(sessionState.executionLogId, 'completed', node.id, 'webhook');
          this.sessionStates.delete(phone);
          return { type: 'webhook_completed', status: response.status, data: responseData };

        } catch (err) {
          logger.error({ err }, 'Webhook error');
          await logStep(`Webhook Error: ${err.message}`, 'error');

          // Save error to variable
          if (node.variable) {
            sessionState.variables[node.variable] = { error: err.message };
          }

          // Continue anyway - webhook errors shouldn't break the flow
          const afterWebhookError = this.findNextNode(flow, node.id);
          if (afterWebhookError) {
            return this.executeNode(phone, flow, afterWebhookError, sessionState);
          }

          return { type: 'webhook_error', error: err.message };
        }

      case 'delay':
        // Wait for specified seconds
        const delaySeconds = node.seconds || 2;
        const showTyping = node.typing_indicator !== false;

        logger.debug({ delaySeconds, showTyping }, 'Executing delay node');

        // TODO: If typing indicator is supported by WhatsApp API, send it here
        if (showTyping && this.sendTypingIndicator) {
          await this.sendTypingIndicator(phone);
        }

        await logStep(`Delay: ${delaySeconds} seconds`);
        await this.delay(delaySeconds * 1000);

        // Continue to next node
        const afterDelay = this.findNextNode(flow, node.id);
        if (afterDelay) {
          return this.executeNode(phone, flow, afterDelay, sessionState);
        }

        await this.updateLogVariables(sessionState.executionLogId, sessionState.variables);
        await this.completeExecutionLog(sessionState.executionLogId, 'completed', node.id, 'delay');
        this.sessionStates.delete(phone);
        return { type: 'delay_completed' };

      default:
        logger.warn({ nodeType: node.type }, 'Unknown node type');
        await logStep(`Unknown node type: ${node.type}`, 'warning');
        const afterUnknown = this.findNextNode(flow, node.id);
        if (afterUnknown) {
          return this.executeNode(phone, flow, afterUnknown, sessionState);
        }
        return null;
    }
  }

  /**
   * Encontrar siguiente nodo basado en conexiones
   */
  findNextNode(flow, fromNodeId, variables = {}) {
    const connection = flow.connections.find(c => c.from === fromNodeId);
    if (!connection) return null;

    return flow.nodes.find(n => n.id === connection.to);
  }

  /**
   * Evaluar una condición simple
   */
  evaluateCondition(condition, variables) {
    if (!condition) return false;

    // Formato: variable == "value" o variable == value
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

  /**
   * Ejecutar una acción
   */
  async executeAction(node, sessionState) {
    const actionType = node.action;
    const payload = this.replaceVariablesInObject(node.payload || {}, sessionState.variables);

    switch (actionType) {
      case 'notify_sales':
        // Aquí podrías enviar notificación a un canal de Slack, email, etc.
        logger.info({ payload }, 'Notify sales team');
        return { success: true, action: 'notify_sales' };

      case 'create_ticket':
        // Crear ticket en sistema de soporte
        logger.info({ payload }, 'Create support ticket');
        return { success: true, action: 'create_ticket' };

      case 'save_lead':
        // Guardar lead en base de datos
        try {
          await this.db.query(`
            INSERT INTO lead_scores (phone, current_score, first_contact, last_interaction)
            VALUES (?, 50, NOW(), NOW())
            ON DUPLICATE KEY UPDATE last_interaction = NOW()
          `, [sessionState.variables.phone]);
          return { success: true, action: 'save_lead' };
        } catch (err) {
          logger.error({ err }, 'Error saving lead');
          return { success: false, action: 'save_lead', error: err.message };
        }

      case 'search_faq':
        // Buscar en FAQ
        return { success: true, action: 'search_faq', result: null };

      case 'webhook':
        // Llamar webhook externo
        if (payload.url) {
          try {
            const response = await fetch(payload.url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload.data || sessionState.variables)
            });
            return { success: response.ok, action: 'webhook' };
          } catch (err) {
            return { success: false, action: 'webhook', error: err.message };
          }
        }
        return { success: false, action: 'webhook', error: 'No URL provided' };

      default:
        logger.warn({ actionType }, 'Unknown action type');
        return { success: false, action: actionType, error: 'Unknown action' };
    }
  }

  /**
   * Reemplazar variables en texto
   */
  replaceVariables(text, variables) {
    if (!text) return text;
    return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return variables[varName] !== undefined ? variables[varName] : match;
    });
  }

  /**
   * Reemplazar variables en objeto
   */
  replaceVariablesInObject(obj, variables) {
    if (typeof obj === 'string') {
      return this.replaceVariables(obj, variables);
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.replaceVariablesInObject(item, variables));
    }
    if (typeof obj === 'object' && obj !== null) {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.replaceVariablesInObject(value, variables);
      }
      return result;
    }
    return obj;
  }

  /**
   * Helper: parse JSON safely
   */
  parseJSON(data) {
    if (!data) return null;
    if (typeof data === 'object') return data;
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }

  /**
   * Helper: delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Limpiar sesión de un teléfono
   */
  clearSession(phone) {
    this.sessionStates.delete(phone);
  }

  /**
   * Obtener estado de sesión
   */
  getSessionState(phone) {
    return this.sessionStates.get(phone);
  }

  /**
   * Actualizar estadísticas del flujo
   */
  async updateFlowStats(flowId, completed = false) {
    try {
      if (completed) {
        await this.db.query(
          'UPDATE visual_flows SET times_triggered = times_triggered + 1, times_completed = times_completed + 1 WHERE id = ?',
          [flowId]
        );
      } else {
        await this.db.query(
          'UPDATE visual_flows SET times_triggered = times_triggered + 1 WHERE id = ?',
          [flowId]
        );
      }
    } catch (err) {
      logger.error({ err, flowId }, 'Error updating flow stats');
    }
  }

  // ========================================
  // EXECUTION LOGGING SYSTEM
  // ========================================

  /**
   * Crear un nuevo log de ejecución
   */
  async createExecutionLog(phone, flow, triggerMessage, triggerType, classification = null) {
    try {
      const [result] = await this.db.query(`
        INSERT INTO flow_execution_logs
        (flow_id, flow_name, flow_slug, phone, session_id, status, trigger_message, trigger_type, classification, steps, variables)
        VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?, '[]', '{}')
      `, [
        flow.id,
        flow.name,
        flow.slug,
        phone,
        `${phone}-${Date.now()}`,
        triggerMessage,
        triggerType,
        JSON.stringify(classification)
      ]);

      return result.insertId;
    } catch (err) {
      // Table might not exist yet - fail silently
      if (err.code === 'ER_NO_SUCH_TABLE') {
        logger.debug('flow_execution_logs table does not exist');
        return null;
      }
      logger.error({ err }, 'Error creating execution log');
      return null;
    }
  }

  /**
   * Agregar un paso al log de ejecución
   */
  async addExecutionStep(logId, step) {
    if (!logId) return;

    try {
      await this.db.query(`
        UPDATE flow_execution_logs
        SET steps = JSON_ARRAY_APPEND(COALESCE(steps, '[]'), '$', ?),
            total_nodes_executed = total_nodes_executed + 1
        WHERE id = ?
      `, [JSON.stringify(step), logId]);
    } catch (err) {
      logger.error({ err, logId }, 'Error adding execution step');
    }
  }

  /**
   * Actualizar variables en el log
   */
  async updateLogVariables(logId, variables) {
    if (!logId) return;

    try {
      await this.db.query(`
        UPDATE flow_execution_logs
        SET variables = ?
        WHERE id = ?
      `, [JSON.stringify(variables), logId]);
    } catch (err) {
      logger.error({ err, logId }, 'Error updating log variables');
    }
  }

  /**
   * Completar un log de ejecución
   */
  async completeExecutionLog(logId, status, finalNodeId, finalNodeType, error = null) {
    if (!logId) return;

    try {
      await this.db.query(`
        UPDATE flow_execution_logs
        SET status = ?,
            final_node_id = ?,
            final_node_type = ?,
            error_message = ?,
            was_transferred = ?,
            completed_at = NOW(),
            total_duration_ms = TIMESTAMPDIFF(MICROSECOND, started_at, NOW()) / 1000
        WHERE id = ?
      `, [
        status,
        finalNodeId,
        finalNodeType,
        error,
        status === 'transferred',
        logId
      ]);
    } catch (err) {
      logger.error({ err, logId }, 'Error completing execution log');
    }
  }

  /**
   * Marcar log como fallido
   */
  async failExecutionLog(logId, errorMessage, errorNodeId = null) {
    if (!logId) return;

    try {
      await this.db.query(`
        UPDATE flow_execution_logs
        SET status = 'failed',
            error_message = ?,
            error_node_id = ?,
            completed_at = NOW(),
            total_duration_ms = TIMESTAMPDIFF(MICROSECOND, started_at, NOW()) / 1000
        WHERE id = ?
      `, [errorMessage, errorNodeId, logId]);
    } catch (err) {
      logger.error({ err, logId }, 'Error marking log as failed');
    }
  }
}

module.exports = VisualFlowEngine;
