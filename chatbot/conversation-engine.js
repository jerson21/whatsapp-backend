// ============================================================================
// MOTOR DE CONVERSACIÓN INTELIGENTE PARA TEMPLATES WHATSAPP
// ============================================================================
// Sistema que maneja flujos conversacionales configurables sin tocar código
// Integra respuestas fijas, IA-assisted y escalamiento automático
// ============================================================================

const { fetch } = require('undici');
const P = require('pino');

// Crear logger básico para producción
const logger = P({
  level: process.env.LOG_LEVEL || 'info'
});

class ConversationEngine {
  constructor(pool) {
    this.pool = pool;
    this.OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
    
    // URLs del sistema principal para consultas
    this.MAIN_API_BASE = process.env.MAIN_API_BASE || 'https://respaldoschile.cl/online/api';
    this.CHATBOT_ENDPOINTS = {
      schedules: `${this.MAIN_API_BASE}/chatbot-whatsapp/schedules.php`,
      orderStatus: `${this.MAIN_API_BASE}/chatbot-whatsapp/order-status.php`,
      zones: `${this.MAIN_API_BASE}/chatbot-whatsapp/zones.php`,
      clientInfo: `${this.MAIN_API_BASE}/chatbot-whatsapp/client-info.php`
    };
    
    // Configuración de contextos por plantilla
    this.TEMPLATE_CONTEXTS = {
      'notificacion_entrega': {
        allowedTopics: ['entrega', 'horario', 'direccion', 'pago', 'pagar', 'cuanto', 'debo', 'dinero', 'recibir', 'pedido', 'orden', 'cuando', 'donde', 'hora', 'estado', 'confirmo', 'puedo', 'disponible', 'transferencia', 'datos', 'link', 'confirmacion', 'banco', 'cuenta', 'rut'],
        friendlyEscalation: "Dame un momento, Enviaré esto a un agente para que te ayude. Apenas esté disponible te contactará 👨‍💼",
        contextualPrompt: `
          Eres un asistente informativo de entregas de Respaldos Chile.
          
          CONTEXTO: Debes considerar SIEMPRE el historial de la conversación para entender las respuestas del cliente.
          
          SOLO PROPORCIONA INFORMACIÓN sobre:
          - Estado de pedidos  
          - Horarios de entrega
          - Direcciones programadas
          - Fechas de entrega
          
          ESTILO:
          - Directo e informativo
          - Amigable pero sin conversación adicional
          - Solo emojis simples (📦 🚛 📍 📅)
          - NO hagas preguntas al cliente SALVO impedimentos de entrega
          - NO ofrezcas opciones SALVO alternativas de entrega
          - Máximo 2 frases
          - Ordena el mensaje no todo junto.
          
          RESPUESTAS CONTEXTUALES:
          - Si el cliente dice "Si" después de una pregunta tuya, es una confirmación
          - Si preguntaste por vecinos y dice "Si", confirma que coordine con ellos
          - Si dice "No" después de una pregunta, busca otras alternativas
          - MANTÉN COHERENCIA con el flujo de conversación
          
          Si NO tienes información específica → deriva a agente amablemente
        `
      },
      'confirmacion_pago': {
        allowedTopics: ['pago', 'pagar', 'tarjeta', 'transferencia', 'dinero', 'total', 'monto'],
        friendlyEscalation: "Derivaré tu consulta a un agente que te ayudará mejor. Te contactará pronto 👨‍💼",
        contextualPrompt: `
          Eres un asistente informativo de pagos de Respaldos Chile.
          Solo proporciona información sobre estados de pago, montos y métodos de pago.
          Sé directo, amigable y no hagas preguntas adicionales.
          Responde solo lo especico que te preguntan.
        `
      }
    };
  }

  /**
   * Procesa un mensaje dentro del contexto de una conversación de template
   * @param {number} sessionId - ID de la sesión WhatsApp
   * @param {string} templateName - Nombre del template que inició la conversación
   * @param {string} clientMessage - Mensaje del cliente
   * @param {string} phoneNumber - Número de teléfono del cliente
   * @returns {Object} - Respuesta procesada para enviar
   */
  async processMessage(sessionId, templateName, clientMessage, phoneNumber) {
    try {
      logger.info({ sessionId, templateName, text: clientMessage }, '🎯 ConversationEngine: Procesando mensaje');
      
      // 🚫 VERIFICAR ESTADO DE ESCALAMIENTO PRIMERO
      const isEscalated = await this.isSessionEscalated(sessionId);
      if (isEscalated) {
        logger.info({ sessionId }, '🚫 Sesión escalada - silenciando IA automática');
        return {
          text: null, // No responder automáticamente
          isConversationFlow: false,
          shouldEscalate: false,
          escalationReason: null,
          silenced: true // Indicador de que fue silenciado
        };
      }
      
      // 💬 RECUPERAR HISTORIAL DE CONVERSACIÓN
      const conversationHistory = await this.getConversationHistory(sessionId);
      logger.info({ 
        sessionId,
        historyLength: conversationHistory ? conversationHistory.length : 0 
      }, '💬 Historial de conversación recuperado');

      // ✅ CONFIRMACIÓN AUTOMÁTICA DE ENTREGA PARA TEMPLATE notificacion_entrega
      if (templateName === 'notificacion_entrega') {
        const confirmationResult = await this.handleDeliveryConfirmation(sessionId, clientMessage, phoneNumber);
        if (confirmationResult.wasConfirmed) {
          logger.info({ sessionId, phoneNumber }, '✅ Entrega confirmada automáticamente en sistema');
        }
      }

      // 1. Obtener o crear sesión conversacional  
      const session = await this.getOrCreateConversationSession(sessionId, templateName, phoneNumber);
      
      // 2. Determinar siguiente paso basado en mensaje del cliente
      const nextStep = await this.determineNextStep(session, clientMessage);
      
      if (!nextStep) {
        logger.info({ sessionId, templateName }, '🎯 No se encontró paso específico, usando fallback');
        return await this.handleFallback(session, clientMessage, conversationHistory);
      }

      // 3. Generar respuesta según tipo de paso
      const response = await this.generateResponse(nextStep, session, clientMessage);
      
      // 4. Actualizar estado de la sesión
      await this.updateConversationSession(session, nextStep, clientMessage, response);
      
      // 5. Registrar analíticas
      await this.recordAnalytics(templateName, nextStep.id, response.processingTime);

      logger.info({ 
        sessionId, 
        templateName, 
        stepName: nextStep.step_name,
        responseType: nextStep.response_type 
      }, '🎯 ✅ Respuesta generada exitosamente');

      return {
        text: response.text,
        isConversationFlow: true,
        shouldEscalate: nextStep.requires_human_fallback || response.shouldEscalate,
        escalationReason: response.escalationReason,
        processingTime: response.processingTime
      };

    } catch (error) {
      logger.error({ error: error.message, sessionId, templateName }, '🎯 ❌ Error en ConversationEngine');
      return null;
    }
  }

  /**
   * Obtiene sesión conversacional existente o crea una nueva
   */
  async getOrCreateConversationSession(sessionId, templateName, phoneNumber = null) {
    try {
      // Buscar sesión activa existente
      const [existingSessions] = await this.pool.query(`
        SELECT * FROM conversation_sessions 
        WHERE session_id = ? AND template_name = ? 
          AND conversation_state = 'active' 
          AND (expires_at IS NULL OR expires_at > NOW())
      `, [sessionId, templateName]);

      if (existingSessions.length > 0) {
        // Agregar teléfono si no lo tiene
        const session = existingSessions[0];
        session.phone_number = phoneNumber || this.extractPhoneFromSession(session);
        return session;
      }

      // Crear nueva sesión
      const [insertResult] = await this.pool.query(`
        INSERT INTO conversation_sessions (
          session_id, template_name, conversation_state, 
          step_history, messages_in_flow, expires_at
        ) VALUES (?, ?, 'active', JSON_ARRAY(), 0, DATE_ADD(NOW(), INTERVAL 72 HOUR))
      `, [sessionId, templateName]);

      const [newSession] = await this.pool.query(`
        SELECT * FROM conversation_sessions WHERE id = ?
      `, [insertResult.insertId]);

      logger.info({ sessionId, templateName, sessionDbId: insertResult.insertId }, '🎯 Nueva sesión conversacional creada');
      
      // Agregar teléfono a la nueva sesión
      const session = newSession[0];
      session.phone_number = phoneNumber || sessionId;
      return session;
    } catch (error) {
      logger.error({ error: error.message, sessionId, templateName }, '🎯 Error obteniendo/creando sesión');
      throw error;
    }
  }

  /**
   * 🆕 Verifica si es la primera respuesta del bot para esta sesión
   */
  async isFirstBotResponse(sessionId) {
    try {
      // Primero verificar si el campo existe (programación defensiva)
      const [[columnCheck]] = await this.pool.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'chat_sessions' 
        AND COLUMN_NAME = 'first_bot_response'
        LIMIT 1
      `);
      
      // Si el campo no existe aún, retornar true solo para la PRIMERA vez
      if (!columnCheck) {
        logger.debug({ sessionId }, '⚠️ Campo first_bot_response no existe aún - verificando si es realmente primera vez');
        
        // Verificar si ya hay mensajes del bot para esta sesión
        const [[botMessages]] = await this.pool.query(`
          SELECT COUNT(*) as count 
          FROM chat_messages 
          WHERE session_id = ? AND direction = 'out' 
          LIMIT 1
        `, [sessionId]);
        
        return botMessages.count === 0; // Solo es primera vez si no hay mensajes de salida
      }
      
      // Si el campo existe, consultar normalmente
      const [[session]] = await this.pool.query(
        `SELECT first_bot_response FROM chat_sessions WHERE id = ? LIMIT 1`,
        [sessionId]
      );
      
      // Si first_bot_response es false o null, es la primera vez
      return !session?.first_bot_response;
    } catch (error) {
      logger.warn({ error: error.message, sessionId }, '⚠️ Error verificando primera respuesta del bot');
      return false; // Si hay error, asumir que no es primera vez para evitar spam
    }
  }

  /**
   * 🆕 Marca que el bot ya respondió por primera vez
   */
  async markFirstBotResponseSent(sessionId) {
    try {
      // Verificar si el campo existe antes de actualizar (programación defensiva)
      const [[columnCheck]] = await this.pool.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'chat_sessions' 
        AND COLUMN_NAME = 'first_bot_response'
        LIMIT 1
      `);
      
      if (!columnCheck) {
        logger.debug({ sessionId }, '⚠️ Campo first_bot_response no existe aún - saltando marcado');
        return;
      }
      
      await this.pool.query(
        `UPDATE chat_sessions SET first_bot_response = TRUE WHERE id = ?`,
        [sessionId]
      );
      
      logger.info({ sessionId }, '🤖 Marcada primera respuesta del bot');
    } catch (error) {
      logger.warn({ error: error.message, sessionId }, '⚠️ Error marcando primera respuesta del bot');
    }
  }

  /**
   * Determina el siguiente paso del flujo basado en el mensaje del cliente
   */
  async determineNextStep(session, clientMessage) {
    try {
      const possibleNextSteps = await this.getPossibleNextSteps(session);
      
      if (possibleNextSteps.length === 0) {
        return null;
      }

      // Analizar mensaje para encontrar mejor coincidencia
      const bestMatch = await this.findBestStepMatch(possibleNextSteps, clientMessage);
      
      return bestMatch;
    } catch (error) {
      logger.error({ error: error.message, sessionId: session.session_id }, '🎯 Error determinando siguiente paso');
      return null;
    }
  }

  /**
   * Obtiene los posibles pasos siguientes según el estado actual
   * MODIFICADO: Buscar TODOS los flujos activos para matching como producción
   */
  async getPossibleNextSteps(session) {
    try {
      // NUEVA LÓGICA: Buscar TODOS los flujos activos del template
      // igual que handleConversationFlow() de producción
      const query = `
        SELECT * FROM conversation_flows 
        WHERE template_name = ? AND is_active = TRUE
        ORDER BY step_number, trigger_priority DESC
      `;
      const params = [session.template_name];
      
      logger.info({ 
        sessionId: session.session_id, 
        templateName: session.template_name,
        currentStepId: session.current_step_id
      }, '🎯 Buscando TODOS los flujos activos para matching');

      const [steps] = await this.pool.query(query, params);
      
      logger.info({ 
        sessionId: session.session_id, 
        stepsFound: steps.length,
        templateName: session.template_name
      }, '🎯 Pasos encontrados para matching');

      return steps;
      
    } catch (error) {
      logger.error({ 
        error: error.message, 
        sessionId: session.session_id,
        currentStepId: session.current_step_id,
        templateName: session.template_name
      }, '🎯 ❌ Error obteniendo posibles pasos');
      return [];
    }
  }

  /**
   * Encuentra la mejor coincidencia entre pasos disponibles y mensaje del cliente
   */
  async findBestStepMatch(possibleSteps, clientMessage) {
    const messageText = clientMessage.toLowerCase().trim();
    let bestMatch = null;
    let highestScore = 0;

    logger.info({ 
      possibleStepsCount: possibleSteps.length,
      messageText 
    }, '🎯 Evaluando posibles pasos');

    for (const step of possibleSteps) {
      const score = this.calculateStepMatchScore(step, messageText);
      
      logger.info({ 
        stepName: step.step_name, 
        stepId: step.id,
        parentStepId: step.parent_step_id,
        score, 
        keywords: step.trigger_keywords 
      }, '🎯 Evaluando coincidencia de paso');

      if (score > highestScore) {
        highestScore = score;
        bestMatch = step;
      }
    }

    // Solo retornar coincidencia si supera umbral mínimo (como producción)
    if (bestMatch && highestScore > 0) {
      logger.info({ 
        stepName: bestMatch.step_name, 
        stepId: bestMatch.id,
        score: highestScore 
      }, '🎯 ✅ MATCH encontrado con score ' + highestScore);
      return bestMatch;
    }

    // Si no hay coincidencia, NO usar fallback (como producción)
    logger.info({ 
      possibleStepsCount: possibleSteps.length,
      messageText 
    }, '🎯 ❌ No hay coincidencias válidas');
    return null;
  }

  /**
   * Calcula score de coincidencia entre un paso y el mensaje del cliente
   * USAR MISMA LÓGICA QUE PRODUCCIÓN (app-cloud.js)
   */
  calculateStepMatchScore(step, messageText) {
    if (!step.trigger_keywords) return 0;

    try {
      // Manejar keywords corruptos (doble escape)
      let keywordsStr = step.trigger_keywords || '[]';
      
      // Si está doblemente escaped, parsearlo dos veces
      if (keywordsStr.startsWith('"[') && keywordsStr.endsWith(']"')) {
        keywordsStr = JSON.parse(keywordsStr);
      }
      
      const keywords = JSON.parse(keywordsStr);
      const messageLower = messageText.toLowerCase();
      
      let matchScore = 0;
      let hasMatch = false;
      
      for (const keyword of keywords) {
        if (keyword === messageText) {
          // Coincidencia exacta por ID del botón = máxima prioridad
          matchScore = 100;
          hasMatch = true;
          break;
        } else if (keyword.toLowerCase() === messageLower) {
          // Coincidencia exacta del texto = alta prioridad
          matchScore = 90;
          hasMatch = true;
        } else if (messageLower.includes(keyword.toLowerCase()) && keyword.length > 3) {
          // Coincidencia parcial con keyword largo = media prioridad
          matchScore = Math.max(matchScore, 70);
          hasMatch = true;
        } else if (keyword === '*') {
          // Wildcard = baja prioridad (solo si no hay otros matches)
          matchScore = Math.max(matchScore, 10);
          hasMatch = true;
        }
      }
      
      return hasMatch ? matchScore : 0;
      
    } catch (e) {
      logger.error({ error: e.message, stepId: step.id }, '🎯 Error parsing trigger_keywords');
      return 0;
    }
  }

  /**
   * Genera respuesta según el tipo de paso
   */
  async generateResponse(step, session, clientMessage) {
    const startTime = Date.now();
    
    try {
      let responseText;
      let shouldEscalate = false;
      let escalationReason = null;

      switch (step.response_type) {
        case 'fixed':
          responseText = step.response_text;
          break;

        case 'ai_assisted':
          responseText = await this.generateAIAssistedResponse(step, session, clientMessage);
          break;

        case 'escalate_human':
          responseText = step.response_text;
          shouldEscalate = true;
          escalationReason = `Escalamiento automático desde paso: ${step.step_name}`;
          break;

        default:
          responseText = step.response_text;
      }

      // Aplicar variables dinámicas si existen
      if (step.response_variables) {
        responseText = await this.applyResponseVariables(responseText, step.response_variables, session);
      }

      const processingTime = Date.now() - startTime;

      return {
        text: responseText,
        shouldEscalate,
        escalationReason,
        processingTime
      };

    } catch (error) {
      logger.error({ error: error.message, stepId: step.id }, '🎯 Error generando respuesta');
      return {
        text: step.response_text, // Fallback a texto fijo
        shouldEscalate: false,
        escalationReason: null,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Genera respuesta asistida por IA
   */
  async generateAIAssistedResponse(step, session, clientMessage) {
    try {
      // Construir contexto conversacional
      const conversationHistory = await this.buildConversationHistory(session);
      
      const systemPrompt = step.ai_context_prompt || 
        'Eres un asistente de WhatsApp de logística. Responde MÁXIMO 2 frases, directo y útil. ' +
        'No uses saludos ni explicaciones largas. Ve directo al punto.';

      const userPrompt = `
        Contexto: El cliente recibió una notificación de entrega y está en una conversación de soporte.
        
        Plantilla de respuesta sugerida: "${step.response_text}"
        
        Mensaje del cliente: "${clientMessage}"
        
        Historial de conversación:
        ${conversationHistory}
        
        Instrucciones:
        1. Máximo 2 frases cortas
        2. Usa la plantilla como base pero personaliza
        3. No agregues saludos ni despedidas
        4. Ve directo al problema del cliente
      `;

      // Usar fetch API como en el chatbot actual
      if (!this.OPENAI_API_KEY || this.OPENAI_API_KEY === 'sk-your-openai-api-key-here') {
        logger.warn({ stepId: step.id }, '🎯 OpenAI API key no configurada, usando template fijo');
        return step.response_text;
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: process.env.CHATBOT_AI_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: parseFloat(process.env.CHATBOT_AI_TEMPERATURE) || 0.2,
          max_tokens: parseInt(process.env.CHATBOT_AI_MAX_TOKENS) || 60
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const completion = await response.json();
      const aiResponse = completion.choices[0]?.message?.content?.trim();
      
      if (!aiResponse) {
        logger.warn({ stepId: step.id }, '🎯 IA no generó respuesta, usando template fijo');
        return step.response_text;
      }

      logger.info({ stepId: step.id, originalTemplate: step.response_text }, '🎯 Respuesta IA-assisted generada');
      return aiResponse;

    } catch (error) {
      logger.error({ error: error.message, stepId: step.id }, '🎯 Error generando respuesta IA-assisted');
      return step.response_text; // Fallback a template fijo
    }
  }

  /**
   * Construye historial de conversación para contexto IA
   */
  async buildConversationHistory(session) {
    try {
      if (!session.client_responses) {
        return 'No hay historial previo.';
      }

      const responses = JSON.parse(session.client_responses);
      return responses.map((response, index) => 
        `${index + 1}. Cliente: "${response.message}" (${response.timestamp})`
      ).join('\n');

    } catch (error) {
      return 'Error construyendo historial.';
    }
  }

  /**
   * Aplica variables dinámicas a la respuesta
   */
  async applyResponseVariables(responseText, variables, session) {
    try {
      let processedText = responseText;
      const varsObj = JSON.parse(variables);

      // Variables predefinidas del sistema
      const systemVars = {
        '[horario]': '9:00 AM - 6:00 PM',
        '[empresa]': 'Respaldos Chile',
        '[telefono]': '+56 2 2345 6789'
      };

      // Aplicar variables del sistema
      for (const [placeholder, value] of Object.entries(systemVars)) {
        processedText = processedText.replace(new RegExp(placeholder, 'g'), value);
      }

      // Aplicar variables configuradas
      for (const [placeholder, value] of Object.entries(varsObj)) {
        processedText = processedText.replace(new RegExp(`\\[${placeholder}\\]`, 'g'), value);
      }

      return processedText;
    } catch (error) {
      logger.error({ error: error.message }, '🎯 Error aplicando variables de respuesta');
      return responseText;
    }
  }

  /**
   * Actualiza estado de la sesión conversacional
   */
  async updateConversationSession(session, step, clientMessage, response) {
    try {
      // Actualizar historial de pasos
      const stepHistory = session.step_history ? JSON.parse(session.step_history) : [];
      stepHistory.push({
        step_id: step.id,
        step_name: step.step_name,
        client_message: clientMessage,
        bot_response: response.text,
        timestamp: new Date().toISOString(),
        processing_time_ms: response.processingTime
      });

      // Actualizar respuestas del cliente para contexto IA
      const clientResponses = session.client_responses ? JSON.parse(session.client_responses) : [];
      clientResponses.push({
        message: clientMessage,
        timestamp: new Date().toISOString(),
        step_context: step.step_name
      });

      // Mantener solo últimas 10 respuestas para evitar crecimiento excesivo
      if (clientResponses.length > 10) {
        clientResponses.splice(0, clientResponses.length - 10);
      }

      const newState = step.requires_human_fallback ? 'escalated' : 'active';
      
      await this.pool.query(`
        UPDATE conversation_sessions 
        SET current_step_id = ?, 
            conversation_state = ?,
            step_history = ?,
            client_responses = ?,
            messages_in_flow = messages_in_flow + 1,
            total_response_time_ms = total_response_time_ms + ?,
            escalated_to_human = ?,
            escalation_reason = ?
        WHERE id = ?
      `, [
        step.id, newState, JSON.stringify(stepHistory), JSON.stringify(clientResponses),
        response.processingTime, step.requires_human_fallback, 
        response.escalationReason, session.id
      ]);

    } catch (error) {
      logger.error({ error: error.message, sessionId: session.id }, '🎯 Error actualizando sesión');
    }
  }

  /**
   * Maneja casos donde no se encuentra paso específico
   */
  async handleFallback(session, clientMessage, conversationHistory = []) {
    const templateConfig = this.TEMPLATE_CONTEXTS[session.template_name];
    
    if (!templateConfig) {
      return await this.generateGenericEscalation();
    }
    
    // FLUJO CORRECTO: Primero intentar sistema actual, luego IA fallback
    try {
      // Detectar qué tipo de consultas necesita hacer
      const queryNeeds = this.detectQueryNeeds(clientMessage);
      
      // 💬 VERIFICAR SI HAY CONTEXTO CONVERSACIONAL IMPORTANTE PRIMERO
      const hasImportantContext = conversationHistory && conversationHistory.length > 2;
      const isSimpleConfirmation = queryNeeds.includes('confirmation') && clientMessage.toLowerCase().length <= 10;
      
      // Si hay contexto importante y es una confirmación simple → USAR IA ESTRICTA (mantiene contexto)
      if (hasImportantContext && isSimpleConfirmation) {
        logger.info({ clientMessage, historyLength: conversationHistory.length }, '🧠 Confirmación simple CON contexto - usando IA estricta');
        
        // Extraer teléfono y consultar endpoint
        const phone = this.extractPhoneFromSession(session);
        const contextData = await this.gatherContextData(phone, ['orderStatus'], session.session_id);
        
        // 💬 Agregar historial al contexto
        contextData.conversationHistory = conversationHistory;
        
        // Usar IA estricta para análisis con datos reales
        return await this.generateStrictAIFallback(clientMessage, contextData, templateConfig, conversationHistory);
      }
      
      // Si DETECTA intenciones específicas → Usar sistema actual (funciona bien)
      if (queryNeeds.length > 0) {
        logger.info({ queryNeeds, clientMessage }, '🎯 Intenciones detectadas - usando sistema actual');
        return await this.generateIntelligentResponse(session, clientMessage, templateConfig, conversationHistory);
      }
      
      // Si NO detecta intenciones → Usar IA estricta como fallback
      logger.info({ clientMessage }, '🧠 Sin intenciones detectadas - usando IA fallback');
      
      // Extraer teléfono y consultar endpoint
      const phone = this.extractPhoneFromSession(session);
      const contextData = await this.gatherContextData(phone, ['orderStatus'], session.session_id);
      
      // 💬 Agregar historial al contexto
      contextData.conversationHistory = conversationHistory;
      
      // Usar IA estricta para análisis con datos reales
      return await this.generateStrictAIFallback(clientMessage, contextData, templateConfig, conversationHistory);
      
    } catch (error) {
      logger.error({ error: error.message, sessionId: session.session_id }, 'Error en handleFallback híbrido');
      return await this.generateGenericEscalation();
    }
  }

  /**
   * Verifica si el mensaje está en contexto permitido
   */
  isMessageInContext(message, allowedTopics) {
    const messageLower = message.toLowerCase();
    const messageWords = messageLower.split(/\s+/);
    
    // Si alguna palabra del mensaje está en temas permitidos
    return messageWords.some(word => 
      allowedTopics.some(topic => 
        word.includes(topic) || topic.includes(word)
      )
    );
  }

  /**
   * Genera respuesta inteligente consultando datos reales
   */
  async generateIntelligentResponse(session, clientMessage, config, conversationHistory = []) {
    try {
      // Extraer teléfono real del sessionId o contexto
      const phone = this.extractPhoneFromSession(session);
      
      // Detectar qué información necesita consultar
      const queryNeeds = this.detectQueryNeeds(clientMessage);
      
      // Consultar datos reales del sistema principal
      const contextData = await this.gatherContextData(phone, queryNeeds, session.session_id);
      
      // 💬 Agregar historial al contexto
      contextData.conversationHistory = conversationHistory;
      
      // Generar respuesta con IA usando datos reales
      return await this.generateAIResponseWithRealData(clientMessage, contextData, config);
      
    } catch (error) {
      logger.error({ error: error.message, sessionId: session.session_id }, 'Error en generateIntelligentResponse');
      return await this.generateGenericEscalation();
    }
  }

  /**
   * Detecta qué tipo de consultas necesita hacer
   */
  detectQueryNeeds(message) {
    const needs = [];
    const msgLower = message.toLowerCase();
    
    // 🕐 Consultas de horarios/hora EXACTA y orden de entrega (NUEVA CATEGORÍA ESPECÍFICA)
    if (msgLower.includes('qué hora') || msgLower.includes('que hora') || msgLower.includes('hora exacta') ||
        msgLower.includes('exactamente') || msgLower.includes('aproximadamente') || msgLower.includes('primero') ||
        msgLower.includes('orden') || msgLower.includes('demoran') || msgLower.includes('cuánto tardan') ||
        msgLower.includes('cuanto tardan') || msgLower.includes('mediodía') || msgLower.includes('mediodia') ||
        msgLower.includes('tarde') || msgLower.includes('mañana') && msgLower.includes('hora')) {
      needs.push('orderStatus'); // Usar orderStatus para acceder a orden_ruta
    }
    
    // 📅 Consultas de horarios generales/schedules
    if (msgLower.includes('horario') || msgLower.includes('cuando') && !msgLower.includes('hora')) {
      needs.push('schedules');
    }
    
    // 📦 Consultas de pedidos/entregas/estado (AMPLIADO)
    if (msgLower.includes('pedido') || msgLower.includes('orden') || msgLower.includes('estado') ||
        msgLower.includes('llega') || msgLower.includes('entrega') || msgLower.includes('delivery') ||
        msgLower.includes('envio') || msgLower.includes('seguimiento') || msgLower.includes('tracking') ||
        msgLower.includes('listo') || msgLower.includes('preparado') || msgLower.includes('fabricado') ||
        msgLower.includes('terminado') || msgLower.includes('completo') || msgLower.includes('retirar') ||
        msgLower.includes('falta') || msgLower.includes('cuándo llega') || msgLower.includes('cuando llega') ||
        msgLower.includes('qué día') || msgLower.includes('que dia') || msgLower.includes('esta semana') ||
        msgLower.includes('mañana') && !msgLower.includes('hora') || msgLower.includes('hoy')) {
      needs.push('orderStatus');
    }
    
    // ✅ Confirmaciones de disponibilidad para entrega (NUEVA CATEGORÍA)
    if (msgLower.includes('puedo recibir') || msgLower.includes('si puedo') || msgLower.includes('sí puedo') ||
        msgLower.includes('si, puedo') || msgLower.includes('sí, puedo') || msgLower.includes('disponible') ||
        msgLower.includes('estaré') || msgLower.includes('estare') || msgLower.includes('confirmado') ||
        msgLower.includes('confirmo') || msgLower.includes('acepto') || msgLower.includes('ok para') ||
        msgLower.includes('listo para') || msgLower.includes('pueden venir') || msgLower.includes('pueden entregar') ||
        (msgLower.includes('si') && msgLower.length < 10) || (msgLower.includes('sí') && msgLower.length < 10)) {
      needs.push('orderStatus');
    }
    
    // 🚫 Impedimentos de entrega (NUEVA CATEGORÍA)
    if (msgLower.includes('no puedo recibir') || msgLower.includes('no puedo') || msgLower.includes('no estaré') ||
        msgLower.includes('no estare') || msgLower.includes('no voy a estar') || msgLower.includes('no voy estar') ||
        msgLower.includes('tengo que trabajar') || msgLower.includes('tengo trabajo') || msgLower.includes('viajo') ||
        msgLower.includes('viaje') || msgLower.includes('no me sirve') || msgLower.includes('cambiar fecha') ||
        msgLower.includes('cambiar dia') || msgLower.includes('reprogramar') || msgLower.includes('reagendar') ||
        msgLower.includes('no sirve') || msgLower.includes('no funciona') || msgLower.includes('imposible') ||
        msgLower.includes('problema') || msgLower.includes('inconveniente') || msgLower.includes('ocupado') ||
        msgLower.includes('no podré') || msgLower.includes('no podre') || msgLower.includes('ausente') ||
        // 🔄 Respuestas de seguimiento a impedimentos
        msgLower.includes('no tengo a nadie') || msgLower.includes('no tengo nadie') || 
        msgLower.includes('no hay nadie') || msgLower.includes('nadie puede') ||
        msgLower.includes('no conozco') || msgLower.includes('no se quien') ||
        msgLower.includes('vivo solo') || msgLower.includes('vivo sola') ||
        msgLower.includes('no hay vecinos') || msgLower.includes('otra direccion') ||
        msgLower.includes('otra dirección') || msgLower.includes('cambiar direccion') ||
        msgLower.includes('enviar a otra') || msgLower.includes('mandar a otra')) {
      needs.push('delivery_impediment');
      logger.info({ message: msgLower }, '🚫 DEBUG: Detectado impedimento de entrega');
    }
    
    // 💰 Consultas de pagos/dinero (DETECCIÓN COMPLETA)
    if (msgLower.includes('pagar') || msgLower.includes('pago') || msgLower.includes('pagado') ||
        msgLower.includes('cuanto') || msgLower.includes('cuánto') || msgLower.includes('precio') ||
        msgLower.includes('cuesta') || msgLower.includes('dinero') || msgLower.includes('saldo') ||
        msgLower.includes('debe') || msgLower.includes('debo') || msgLower.includes('total') ||
        msgLower.includes('cancelar') || msgLower.includes('abonar') || msgLower.includes('cobrar') ||
        msgLower.includes('despacho') || msgLower.includes('envio') || msgLower.includes('envío') ||
        msgLower.includes('costo') || msgLower.includes('valor') || msgLower.includes('monto') ||
        msgLower.includes('pagué') || msgLower.includes('pague') || msgLower.includes('cancelé') ||
        msgLower.includes('cancele') || msgLower.includes('saldado') || msgLower.includes('incluido') ||
        msgLower.includes('costó') || msgLower.includes('costo') || msgLower.includes('fue') ||
        msgLower.includes('abonado') || msgLower.includes('ya pague') || msgLower.includes('ya pagué')) {
      needs.push('orderStatus'); // Usa orderStatus porque incluye info de pagos enriched
      logger.info({ message: msgLower }, '💰 DEBUG: Detectado como consulta de PAGOS');
    }
    
    // 🏠 Consultas de dirección/ubicación (COMPLETAMENTE AMPLIADA)
    if (msgLower.includes('direccion') || msgLower.includes('dirección') || msgLower.includes('zona') || 
        msgLower.includes('donde') || msgLower.includes('dónde') || msgLower.includes('ubicacion') ||
        msgLower.includes('ubicación') || msgLower.includes('llegar') || msgLower.includes('repartir') ||
        msgLower.includes('llevan') || msgLower.includes('casa') || msgLower.includes('conocen') ||
        msgLower.includes('encuentran') || msgLower.includes('a dónde') || msgLower.includes('a donde')) {
      needs.push('orderStatus'); // Usar orderStatus para datos enriched de dirección
    }
    
    // 👤 Consultas sobre personal de entrega (NUEVA CATEGORÍA)
    if (msgLower.includes('quién') || msgLower.includes('quien') || msgLower.includes('transportista') ||
        msgLower.includes('despachador') || msgLower.includes('chofer') || msgLower.includes('conductor') ||
        msgLower.includes('repartidor') || msgLower.includes('trae') || msgLower.includes('llamar') ||
        msgLower.includes('contactar') || msgLower.includes('van a llamar') || msgLower.includes('teléfono')) {
      needs.push('orderStatus'); // Usar orderStatus para info del despachador
    }
    
    // ✅ Confirmaciones simples (NUEVA CATEGORÍA) - SOLO si no hay contexto previo importante
    if (msgLower === 'ok' || msgLower === 'perfecto' || msgLower === 'gracias' || 
        msgLower === 'entendido' || msgLower === 'vale' || msgLower === 'bien' ||
        msgLower === 'excelente' || msgLower === 'listo') {
      // Solo marcar como confirmación simple si el mensaje es muy básico
      // Si hay contexto conversacional, dejar que la IA procese con historial
      if (msgLower.length <= 10) {
        needs.push('confirmation');
      }
    }
    
    // ❓ Consultas de proceso (NUEVA CATEGORÍA)
    if (msgLower.includes('y ahora qué') || msgLower.includes('y ahora que') ||
        msgLower.includes('qué sigue') || msgLower.includes('que sigue') ||
        msgLower.includes('cómo funciona') || msgLower.includes('como funciona') ||
        msgLower.includes('próximos pasos') || msgLower.includes('proximos pasos')) {
      needs.push('process');
    }
    
    // ⚠️ Problemas/errores (ESCALAMIENTO INMEDIATO)
    if (msgLower.includes('error') || msgLower.includes('mal') || msgLower.includes('problema') ||
        msgLower.includes('no es correcto') || msgLower.includes('está mal') || msgLower.includes('esta mal') ||
        msgLower.includes('no es') || msgLower.includes('incorrecto')) {
      needs.push('problem');
    }
    
    // 🏠 Cambios de dirección/ubicación (DERIVACIÓN AUTOMÁTICA)
    if (msgLower.includes('cambiar direccion') || msgLower.includes('cambiar dirección') ||
        msgLower.includes('otra direccion') || msgLower.includes('otra dirección') ||
        msgLower.includes('enviar a otra') || msgLower.includes('mandar a otra') ||
        msgLower.includes('en recoleta') || msgLower.includes('en providencia') ||
        msgLower.includes('en las condes') || msgLower.includes('en ñuñoa') ||
        msgLower.includes('en santiago') || msgLower.includes('en maipú') ||
        msgLower.includes('en maipu') || msgLower.includes('en la florida') ||
        msgLower.includes('en puente alto') || msgLower.includes('en san miguel') ||
        msgLower.includes('otra comuna') || msgLower.includes('otra región') ||
        msgLower.includes('otra region') || msgLower.includes('cambio de') && msgLower.includes('direccion')) {
      needs.push('location_change');
      logger.info({ message: msgLower }, '🏠 DEBUG: Detectado cambio de ubicación');
    }
    
    // 🔄 Otros cambios (ESCALAMIENTO CONTEXTUAL)
    if (msgLower.includes('cambiar') || msgLower.includes('modificar') || msgLower.includes('cancelar') ||
        msgLower.includes('reprogramar') || msgLower.includes('otro') || msgLower.includes('diferente')) {
      needs.push('change');
    }
    
    if (msgLower.includes('cliente') || msgLower.includes('cuenta') || msgLower.includes('perfil')) {
      needs.push('clientInfo');
    }
    
    logger.info({ message: msgLower, detectedNeeds: needs }, '🔍 Necesidades detectadas del mensaje');
    
    return needs;
  }

  /**
   * Extrae número de teléfono del contexto de sesión
   */
  extractPhoneFromSession(session) {
    // Intentar extraer de diferentes fuentes
    if (session.phone_number) return session.phone_number;
    if (session.sessionId && session.sessionId.includes('_')) {
      return session.sessionId.split('_')[0];
    }
    return session.sessionId || '';
  }

  /**
   * Consulta datos reales del sistema principal
   */
  async gatherContextData(phone, needs, sessionId = null) {
    const data = {
      sessionId: sessionId // Agregar sessionId al contexto
    };
    
    logger.info({ phone, needs, sessionId }, '🔍 Consultando datos del sistema principal');
    
    for (const need of needs) {
      try {
        switch (need) {
          case 'schedules':
            data.schedules = await this.getDeliverySchedules(phone);
            break;
            
          case 'orderStatus':
            logger.info({ phone, sessionId, need: 'orderStatus' }, '🔍 Ejecutando consulta de estado del pedido');
            data.orderStatus = await this.getOrderStatus(phone, sessionId);
            logger.info({ phone, sessionId, hasData: !!data.orderStatus }, '📦 Resultado consulta orderStatus');
            break;
            
          case 'delivery_impediment':
            logger.info({ phone, sessionId, need: 'delivery_impediment' }, '🚫 Ejecutando consulta para impedimento de entrega');
            data.orderStatus = await this.getOrderStatus(phone, sessionId);
            data.impedimentType = 'delivery_issue'; // Marcar como impedimento
            logger.info({ phone, sessionId, hasData: !!data.orderStatus }, '🚫 Resultado consulta impedimento');
            break;
            
          case 'zones':
            data.zones = await this.getDeliveryZones(phone);
            break;
            
          case 'clientInfo':
            data.clientInfo = await this.getClientInfo(phone);
            break;
            
          case 'confirmation':
            // Solo marcar que es una confirmación, no necesita datos externos
            data.confirmation = true;
            break;
            
          case 'process':
            // Consulta de proceso, no necesita datos externos específicos
            data.process = true;
            break;
            
          case 'problem':
            // Es un problema, marcar para escalamiento inmediato
            data.problem = true;
            break;
            
          case 'location_change':
            // Cambio de dirección/ubicación, derivar automáticamente
            data.locationChange = true;
            break;
            
          case 'change':
            // Solicitud de cambio, marcar para escalamiento contextual
            data.change = true;
            break;
        }
      } catch (e) {
        logger.error({ need, error: e.message, phone }, 'Error consultando datos externos');
      }
    }
    
    return data;
  }

  /**
   * Consulta horarios de entrega
   */
  async getDeliverySchedules(phone) {
    try {
      const url = `${this.CHATBOT_ENDPOINTS.schedules}?phone=${encodeURIComponent(phone)}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        logger.warn({ status: response.status, phone }, 'Error consultando horarios');
        return null;
      }
      
      const data = await response.json();
      return data.schedules || [];
      
    } catch (error) {
      logger.error({ error: error.message, phone }, 'Error fetching schedules');
      return null;
    }
  }

  /**
   * Consulta estado del pedido
   */
  async getOrderStatus(phone, sessionId = null) {
    try {
      let numOrden = null;
      
      // PASO 1: Obtener contexto del pedido desde nuestra BD local (chat_sessions)
      if (sessionId) {
        try {
          const [[contextRow]] = await this.pool.query(
            `SELECT current_order_context 
             FROM chat_sessions 
             WHERE id = ? 
             AND current_order_context IS NOT NULL 
             AND order_context_expires > NOW()
             LIMIT 1`,
            [sessionId]
          );
          
          if (contextRow && contextRow.current_order_context) {
            numOrden = contextRow.current_order_context;
            logger.info({ sessionId, numOrden }, '📦 Contexto de pedido encontrado localmente');
          }
        } catch (contextError) {
          logger.warn({ error: contextError.message }, 'Error obteniendo contexto local');
        }
      }
      
      // PASO 2: Construir URL con num_orden si lo tenemos
      let url = `${this.CHATBOT_ENDPOINTS.orderStatus}?phone=${encodeURIComponent(phone)}`;
      if (numOrden) {
        url += `&num_orden=${encodeURIComponent(numOrden)}`;
      }
      
      logger.info({ url, phone, numOrden }, '🔍 Consultando estado del pedido...');
      
      const response = await fetch(url);
      const data = await response.json();
      
      // 🔍 DEBUG: Mostrar TODA la respuesta del API
      logger.info({
        fullApiResponse: JSON.stringify(data, null, 2)
      }, '📊 DEBUG: Respuesta completa del API order-status');
      
      logger.info({ 
        phone, 
        numOrden,
        hasOrder: !!data.order,
        orderNumber: data.order?.numero_pedido,
        contextUsed: !!numOrden,
        orderSource: numOrden ? 'context' : 'recent'
      }, '📦 Respuesta de API order-status');
      
      // 🔧 Agregar información de contexto al objeto de pedido
      if (data.order) {
        data.order.context_used = data.context_used || !!numOrden;
        data.order.order_source = data.order_source || (numOrden ? 'context' : 'recent');
        
        logger.info({
          contextUsedInOrder: data.order.context_used,
          orderSourceInOrder: data.order.order_source
        }, '🔧 DEBUG: Campos agregados al pedido');
      }
      
      return data.order || null;
      
    } catch (error) {
      logger.error({ error: error.message, phone }, 'Error fetching order status');
      return null;
    }
  }

  /**
   * Consulta y confirma estado del pedido a través de validacion_transferencia.php
   */
  async consultOrderStatus(phone, numOrden) {
    try {
      logger.info({ phone, numOrden }, '🔍 consultOrderStatus: Consultando estado para confirmación');
      
      // Construir URL para la consulta de estado
      const url = `https://respaldoschile.cl/onlinev2/api/chatbot-whatsapp/order-status.php?phone=${encodeURIComponent(phone)}&num_orden=${encodeURIComponent(numOrden)}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      logger.info({ 
        phone, 
        numOrden, 
        hasOrder: !!data.order,
        orderNumber: data.order?.numero_pedido 
      }, '📦 consultOrderStatus: Respuesta de API order-status');
      
      return data.order || null;
      
    } catch (error) {
      logger.error({ error: error.message, phone, numOrden }, 'Error en consultOrderStatus');
      return null;
    }
  }

  /**
   * Consulta zonas de entrega
   */
  async getDeliveryZones(phone) {
    try {
      const url = `${this.CHATBOT_ENDPOINTS.zones}?phone=${encodeURIComponent(phone)}`;
      const response = await fetch(url);
      const data = await response.json();
      
      return data.client_zone || data.zones || null;
      
    } catch (error) {
      logger.error({ error: error.message, phone }, 'Error fetching zones');
      return null;
    }
  }

  /**
   * Consulta información del cliente
   */
  async getClientInfo(phone) {
    try {
      const url = `${this.CHATBOT_ENDPOINTS.clientInfo}?phone=${encodeURIComponent(phone)}`;
      const response = await fetch(url);
      const data = await response.json();
      
      return data.client || null;
      
    } catch (error) {
      logger.error({ error: error.message, phone }, 'Error fetching client info');
      return null;
    }
  }

  /**
   * Genera respuesta con IA usando datos reales
   */
  async generateAIResponseWithRealData(clientMessage, contextData, config) {
    try {
      // 🔄 MANEJO DE CATEGORÍAS ESPECIALES (antes de IA)
      
      // 🚫 Impedimentos de entrega - Manejo inteligente
      if (contextData.impedimentType === 'delivery_issue') {
        logger.info({ 
          clientMessage,
          impedimentType: contextData.impedimentType,
          sessionId: contextData.sessionId
        }, '🚫 Procesando impedimento de entrega con handleDeliveryImpediment');
        return await this.handleDeliveryImpediment(clientMessage, contextData);
      }
      
      // ✅ Confirmaciones simples
      if (contextData.confirmation) {
        return {
          text: "Perfecto. Te avisaremos cuando el camión salga de ruta 👍",
          isConversationFlow: false,
          shouldEscalate: false
        };
      }
      
      // ❓ Consultas de proceso
      if (contextData.process) {
        return {
          text: "El siguiente paso es esperar que el camión salga de ruta. Te llegará un mensaje con la hora exacta 📱",
          isConversationFlow: false,
          shouldEscalate: false
        };
      }
      
      // ⚠️ Problemas - Escalamiento inmediato
      if (contextData.problem) {
        return {
          text: "Entiendo que hay un problema. Enviaré esto a un agente para solucionarlo. Te contactará pronto 👨‍💼",
          isConversationFlow: false,
          shouldEscalate: true,
          escalationReason: "Problema reportado por el cliente"
        };
      }
      
      // 🏠 Cambios de ubicación - Derivación automática
      if (contextData.locationChange) {
        return {
          text: "Te conecto con un agente para coordinar el cambio de dirección 👨‍💼",
          isConversationFlow: false,
          shouldEscalate: true,
          escalationReason: "Solicitud de cambio de dirección/ubicación"
        };
      }
      
      // 🔄 Otros cambios - Escalamiento contextual
      if (contextData.change) {
        return {
          text: "Te conecto con un agente para coordinar esto 👨‍💼",
          isConversationFlow: false,
          shouldEscalate: true,
          escalationReason: "Solicitud de cambio/modificación"
        };
      }
      
      // Continuar con lógica normal para consultas de datos
      // Determinar si hay contexto específico del pedido
      const hasSpecificOrder = contextData.orderStatus && contextData.orderStatus.context_used;
      const orderInfo = contextData.orderStatus;
      
      logger.info({ 
        hasOrderData: !!contextData.orderStatus,
        hasSpecificOrder,
        orderNumber: orderInfo?.numero_pedido,
        orderSource: orderInfo?.order_source,
        fullOrderInfo: orderInfo
      }, '🎯 Análisis de contexto del pedido');
      
      // 🔍 DEBUG: Mostrar TODA la data que llega del API
      logger.info({
        contextData: JSON.stringify(contextData, null, 2)
      }, '📊 DEBUG: TODA la data del contexto');
      
      let contextPrompt = '';
      if (hasSpecificOrder && orderInfo) {
        // 🆕 Construir prompt enriquecido usando TODOS los datos disponibles
        contextPrompt = `
🎯 CONTEXTO ESPECÍFICO: El cliente pregunta sobre su pedido #${orderInfo.numero_pedido}

📦 PRODUCTO:
- ${orderInfo.modelo || 'Producto'} ${orderInfo.tamano ? `(${orderInfo.tamano} plazas)` : ''} 
- Color: ${orderInfo.color || 'No especificado'}
- Precio: $${Number(orderInfo.precio || 0).toLocaleString('es-CL')}

📋 ESTADO ACTUAL: ${orderInfo.estado_descripcion || 'En proceso'}`;

        // ✅ INFORMACIÓN DE ENTREGA (si está disponible)
        if (orderInfo.enriched) {
          const enriched = orderInfo.enriched;
          
          // 📅 Fecha de entrega
          if (enriched.route?.fecha) {
            const fechaEntrega = new Date(enriched.route.fecha);
            const fechaFormateada = fechaEntrega.toLocaleDateString('es-CL', {
              weekday: 'long',
              year: 'numeric', 
              month: 'long',
              day: 'numeric'
            });
            contextPrompt += `\n📅 ENTREGA PROGRAMADA: ${fechaFormateada}`;
          }
          
          // 🏠 Dirección completa
          if (enriched.items && enriched.items[0]) {
            const item = enriched.items[0];
            let direccion = '';
            if (item.direccion) direccion += item.direccion;
            if (item.numero) direccion += ` ${item.numero}`;
            if (item.dpto) direccion += `, ${item.dpto}`;
            if (item.comuna) direccion += `, ${item.comuna}`;
            
            if (direccion) {
              contextPrompt += `\n🏠 DIRECCIÓN: ${direccion}`;
              contextPrompt += `\n🚛 MÉTODO: ${item.metodo_entrega === 'DESPACHO_DOMICILIO' ? 'Despacho a domicilio' : item.metodo_entrega || 'Por definir'}`;
              
              if (item.orden_ruta) {
                contextPrompt += ` (orden #${item.orden_ruta} en ruta)`;
                contextPrompt += `\n🕐 ORDEN DE ENTREGA: ${item.orden_ruta}º pedido a entregar en la ruta`;
              }
            }
          }
          
          // 👤 Despachador
          if (enriched.route?.despachador_nombre && enriched.route.despachador_nombre !== 'Sin asignar') {
            contextPrompt += `\n👤 DESPACHADOR: ${enriched.route.despachador_nombre}`;
          }
          
          // 💰 Estado de pago
          if (enriched.totals) {
            const totals = enriched.totals;
            const totalFormateado = totals.total_con_despacho ? `$${totals.total_con_despacho.toLocaleString('es-CL')}` : '';
            const pagadoFormateado = totals.pagado ? `$${totals.pagado.toLocaleString('es-CL')}` : '$0';
            
            if (totals.saldo === 0) {
              contextPrompt += `\n💰 PAGO: Completamente pagado (${pagadoFormateado})`;
            } else if (totals.saldo > 0) {
              const saldoFormateado = `$${totals.saldo.toLocaleString('es-CL')}`;
              if (totals.pagado === 0) {
                contextPrompt += `\n💰 PAGO: PENDIENTE - Debe pagar ${totalFormateado} (sin pagos registrados)`;
              } else {
                contextPrompt += `\n💰 PAGO: Pagado ${pagadoFormateado} de ${totalFormateado} (saldo pendiente: ${saldoFormateado})`;
              }
            }
          }
        }

        contextPrompt += `\n\n⚡ RESPONDE ESPECÍFICAMENTE sobre ESTE pedido usando la información detallada arriba.`;
      } else if (contextData.orderStatus) {
        contextPrompt = `
📦 PEDIDO ENCONTRADO (más reciente):
- Número: ${orderInfo.numero_pedido}
- Estado: ${orderInfo.estado}
- Información disponible limitada`;
      } else {
        contextPrompt = `❌ No se encontró información del pedido para este teléfono.`;
      }
      
      const systemPrompt = `${config.contextualPrompt}
      
      ${contextPrompt}
      
      OTROS DATOS DISPONIBLES:
      ${contextData.schedules ? `Horarios: ${JSON.stringify(contextData.schedules)}` : ''}
      ${contextData.zones ? `Zona: ${JSON.stringify(contextData.zones)}` : ''}
      ${contextData.clientInfo ? `Cliente: ${JSON.stringify(contextData.clientInfo)}` : ''}
      
      Cliente pregunta: "${clientMessage}"
      
      🎯 REGLAS DE RESPUESTA ESPECÍFICA:
      ${hasSpecificOrder ? '✅ HAY CONTEXTO → Responde SOLO lo que te preguntan específicamente' : '❌ SIN CONTEXTO → Respuesta genérica o escalación'}
      
      📋 RESPONDE SOLO LO PREGUNTADO:
      - Si pregunta sobre PAGO/DINERO → Solo info de pagos y costos
      - Si pregunta sobre ENTREGA/FECHA → Solo fecha y dirección 
      - Si pregunta sobre ESTADO → Solo estado actual del producto
      - Si pregunta sobre DESPACHO → Solo costo de despacho
      - Si pregunta sobre HORA EXACTA/ORDEN → "Tu pedido será entregado de {orden_ruta}º en la ruta del {fecha}. Te avisaremos cuando salga el camión 🚛"
      - Si pregunta sobre DIRECCIÓN → Solo dirección específica
      - Si pregunta sobre DESPACHADOR → Solo info del transportista
      
      📏 FORMATO:
      - Máximo 1-2 líneas cortas
      - UN emoji máximo por respuesta
      - NO agregues información extra no solicitada
      - NO combines múltiples temas en una respuesta
      
      ❌ IMPORTANTE: NO des información completa si solo pregunta algo específico
      `;
      
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: clientMessage }
      ];
      
      // 🔍 DEBUG: Mostrar prompt completo que se envía a OpenAI
      logger.info({
        systemPrompt,
        clientMessage,
        hasSpecificOrder
      }, '🤖 DEBUG: Prompt enviado a OpenAI');
      
      const aiResponse = await this.generateAIResponse(messages);
      
      // 🔍 DEBUG: Mostrar respuesta de OpenAI
      logger.info({
        aiResponse,
        aiResponseExists: !!aiResponse
      }, '🤖 DEBUG: Respuesta de OpenAI');
      
      return {
        text: aiResponse || "Te contactaremos con información actualizada sobre tu pedido 📦",
        isConversationFlow: false,
        shouldEscalate: !aiResponse,
        escalationReason: !aiResponse ? "IA no pudo generar respuesta" : null,
        contextUsed: hasSpecificOrder,
        orderNumber: hasSpecificOrder ? orderInfo.numero_pedido : null
      };
      
    } catch (error) {
      logger.error({ error: error.message }, 'Error generando respuesta con IA');
      return await this.generateGenericEscalation();
    }
  }

  /**
   * Genera escalamiento genérico amigable
   */
  async generateGenericEscalation() {
    return {
      text: "Entiendo tu consulta. Derivaré esto a un agente que te ayudará mejor. Te contactará pronto 👨‍💼",
      isConversationFlow: false,
      shouldEscalate: true,
      escalationReason: "Consulta general sin contexto específico"
    };
  }

  /**
   * Genera respuesta con IA usando OpenAI
   */
  async generateAIResponse(messages) {
    // 🔍 DEBUG: Verificar configuración de OpenAI
    logger.info({
      hasApiKey: !!this.OPENAI_API_KEY,
      apiKeyLength: this.OPENAI_API_KEY ? this.OPENAI_API_KEY.length : 0,
      isDefaultKey: this.OPENAI_API_KEY === 'sk-your-openai-api-key-here'
    }, '🔑 DEBUG: Configuración OpenAI API Key');
    
    if (!this.OPENAI_API_KEY || this.OPENAI_API_KEY === 'sk-your-openai-api-key-here') {
      logger.warn({}, '❌ OpenAI API Key no configurada o es la default');
      return null; // AI no configurada
    }
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.7,
          max_tokens: 100
        })
      });
      
      if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
      
      const data = await response.json();
      return data.choices[0]?.message?.content || null;
      
    } catch (e) {
      logger.error({ e }, 'OpenAI API error en ConversationEngine');
      return null;
    }
  }

  /**
   * Genera respuesta genérica con IA cuando no hay flujo específico
   */
  async generateGenericAIResponse(templateName, clientMessage) {
    try {
      // Verificar API key
      if (!this.OPENAI_API_KEY || this.OPENAI_API_KEY === 'sk-your-openai-api-key-here') {
        return 'Gracias por tu mensaje. Un representante te contactará pronto para ayudarte.';
      }

      const systemPrompt = `
        Eres un asistente de WhatsApp de Respaldos Chile (logística).
        El cliente recibió notificación de entrega "${templateName}".
        Responde MÁXIMO 2 frases. Sé directo y útil. No uses saludos largos.
      `;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: process.env.CHATBOT_AI_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: clientMessage }
          ],
          temperature: 0.2,
          max_tokens: 50
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const completion = await response.json();
      return completion.choices[0]?.message?.content?.trim() || 
        'Gracias por tu mensaje. Un representante te contactará pronto para ayudarte.';

    } catch (error) {
      return 'Gracias por tu mensaje. Un representante te contactará pronto para ayudarte.';
    }
  }

  /**
   * Registra analíticas de uso de pasos
   */
  async recordAnalytics(templateName, stepId, processingTime) {
    try {
      await this.pool.query(`
        INSERT INTO conversation_analytics (
          template_name, step_id, date_recorded, times_triggered, avg_response_time_ms
        ) VALUES (?, ?, CURDATE(), 1, ?)
        ON DUPLICATE KEY UPDATE 
          times_triggered = times_triggered + 1,
          avg_response_time_ms = (avg_response_time_ms + VALUES(avg_response_time_ms)) / 2
      `, [templateName, stepId, processingTime]);
    } catch (error) {
      logger.error({ error: error.message }, '🎯 Error registrando analíticas');
    }
  }

  /**
   * 🆕 Genera respuesta IA estricta usando SOLO datos reales del endpoint
   * NO permite inventar información - Solo datos exactos
   */
  async generateStrictAIFallback(clientMessage, contextData, templateConfig, conversationHistory = []) {
    try {
      const orderInfo = contextData.orderStatus;
      const hasOrderData = !!orderInfo;
      // Usar conversationHistory pasado como parámetro o del contexto como fallback
      const historyToUse = conversationHistory.length > 0 ? conversationHistory : (contextData.conversationHistory || []);
      
      logger.info({ 
        hasOrderData,
        orderNumber: orderInfo?.numero_pedido,
        orderSource: orderInfo?.order_source,
        clientMessage,
        historyLength: historyToUse.length
      }, '🧠 IA Estricta: Analizando mensaje con datos disponibles y contexto');

      // Si no hay datos del pedido → Escalación directa
      if (!hasOrderData) {
        logger.info({ clientMessage }, '🧠 IA Estricta: Sin datos del pedido, escalando');
        return {
          text: templateConfig.friendlyEscalation,
          isConversationFlow: false,
          shouldEscalate: true,
          escalationReason: 'Sin datos del pedido disponibles'
        };
      }

      // Construir datos disponibles para la IA
      const availableData = this.buildAvailableDataSummary(orderInfo);
      
      // Prompt que da respuestas útiles antes de derivar
      const strictSystemPrompt = `
ERES UN ASISTENTE DE RESPALDOS CHILE.

🚫 REGLAS:
1. SOLO info de los datos proporcionados
2. NO inventes nada
3. Máximo 1 frase corta
4. Considera el CONTEXTO de la conversación

🧠 CONTEXTO CONVERSACIONAL:
- Si cliente dice "Ok/gracias" DESPUÉS de que TÚ diste información = cliente satisfecho
- Si cliente dice "Ok" DESPUÉS de que TÚ pediste cambios/info = derivar a agente
- Si cliente pregunta por cambios = derivar inmediatamente

📋 RESPUESTAS:
- 1 línea máximo
- Directo
- Solo 1 emoji simple

✅ EJEMPLOS:
- "¿Está pagado?" → "Sí, completamente pagado 💰"
- "¿Cuándo llega?" → "23 de julio en Ñuñoa 📦"
- "Ok" (después de TÚ pedir dirección) → "Te conecto con un agente 👨‍💼"
- "Ok gracias" (después de TÚ dar info de entrega) → "Perfecto, cualquier duda me dices 👍"
- "Si puedo recibir" → "Perfecto, 23 de julio 👍"

DATOS:
${availableData}
      `;

      const userPrompt = `
MENSAJE: "${clientMessage}"

ANÁLISIS DEL CONTEXTO:
- Revisa el historial: ¿acabas de DAR información o PEDIR información?

INSTRUCCIONES:
1. Si pregunta info específica → responde con los datos (1 línea)
2. Si dice "Ok/gracias" después de TÚ dar información → respuesta de satisfacción
3. Si dice "Ok" después de TÚ pedir algo → "Te conecto con un agente 👨‍💼"
4. Si confirma recibir → "Perfecto, [fecha] 👍"
5. Si no tienes la info → deriva

RESPONDE MÁXIMO 1 LÍNEA.
      `;

      // Consultar OpenAI con prompt estricto
      if (!this.OPENAI_API_KEY || this.OPENAI_API_KEY === 'sk-your-openai-api-key-here') {
        logger.warn('🧠 IA Estricta: OpenAI API key no configurada, escalando');
        return {
          text: templateConfig.friendlyEscalation,
          isConversationFlow: false,
          shouldEscalate: true,
          escalationReason: 'API key no configurada'
        };
      }

      // 💬 Construir array de mensajes con historial
      const messages = [{ role: 'system', content: strictSystemPrompt }];
      
      // Agregar historial relevante (últimos 4 mensajes para contexto)
      if (historyToUse && historyToUse.length > 0) {
        const recentHistory = historyToUse.slice(-4);
        recentHistory.forEach(msg => {
          // No incluir mensajes de plantilla
          if (!msg.content.includes('[TEMPLATE:')) {
            messages.push({
              role: msg.role === 'user' ? 'user' : 'assistant',
              content: msg.content
            });
          }
        });
      }
      
      // Agregar mensaje actual
      messages.push({ role: 'user', content: userPrompt });
      
      logger.info({ 
        messageCount: messages.length,
        hasHistory: historyToUse.length > 0 
      }, '💬 Enviando a OpenAI con historial');

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: process.env.CHATBOT_AI_MODEL || 'gpt-4o-mini',
          messages: messages,
          temperature: 0.1, // Muy bajo para respuestas precisas
          max_tokens: 50 // Respuestas MUY concisas (máximo 1 línea)
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const completion = await response.json();
      const aiResponse = completion.choices[0]?.message?.content?.trim();
      
      if (!aiResponse) {
        logger.warn('🧠 IA Estricta: No generó respuesta, escalando');
        return {
          text: templateConfig.friendlyEscalation,
          isConversationFlow: false,
          shouldEscalate: true,
          escalationReason: 'IA no pudo generar respuesta'
        };
      }

      // Detectar si IA decidió escalar (solo si es derivación clara)
      const shouldEscalate = aiResponse.toLowerCase().includes('no puedo ayudar') || 
                             aiResponse.toLowerCase().includes('necesitas hablar con') ||
                             aiResponse.toLowerCase().includes('deriva inmediatamente') ||
                             aiResponse.toLowerCase().includes('voy a derivarte') ||
                             aiResponse.toLowerCase().includes('te ayudo con el pago') ||
                             aiResponse.toLowerCase().includes('te conecto con un agente') ||
                             aiResponse.toLowerCase().includes('te conecto con agente') ||
                             (aiResponse.toLowerCase().includes('agente') && aiResponse.toLowerCase().includes('👨‍💼') && 
                              !aiResponse.toLowerCase().includes('cualquier duda')); // No escalar si es mensaje de satisfacción

      logger.info({ 
        clientMessage, 
        aiResponse: aiResponse.substring(0, 100),
        shouldEscalate,
        hasOrderData: true
      }, '🧠 IA Estricta: Respuesta generada');

      return {
        text: aiResponse,
        isConversationFlow: false,
        shouldEscalate,
        escalationReason: shouldEscalate ? 'IA determinó escalación necesaria' : null
      };

    } catch (error) {
      logger.error({ error: error.message }, '🧠 IA Estricta: Error en análisis');
      return {
        text: templateConfig.friendlyEscalation,
        isConversationFlow: false,
        shouldEscalate: true,
        escalationReason: `Error en IA estricta: ${error.message}`
      };
    }
  }

  /**
   * ✅ Maneja confirmación automática de entrega para template notificacion_entrega
   */
  async handleDeliveryConfirmation(sessionId, clientMessage, phoneNumber) {
    try {
      // Detectar si el mensaje es una confirmación de entrega
      const isConfirmation = this.detectDeliveryConfirmation(clientMessage);
      
      if (!isConfirmation) {
        return { wasConfirmed: false };
      }

      logger.info({ sessionId, clientMessage, phoneNumber }, '✅ Detectada confirmación de entrega');

      // Obtener datos de la orden desde el contexto local
      const orderContext = await this.getOrderContext(sessionId);
      if (!orderContext) {
        logger.warn({ sessionId }, '⚠️ No se encontró contexto de orden para confirmación');
        return { wasConfirmed: false };
      }

      const numOrden = orderContext.num_orden;
      let rutaAsignada = null;

      // Consultar datos completos de la orden para obtener ruta
      const orderData = await this.consultOrderStatus(phoneNumber, numOrden);
      
      if (orderData && orderData.enriched && orderData.enriched.route) {
        rutaAsignada = orderData.enriched.route.id;
      }

      if (!rutaAsignada) {
        logger.warn({ sessionId, numOrden }, '⚠️ No se encontró ruta asignada para confirmación');
        return { wasConfirmed: false };
      }

      // Llamar al endpoint de confirmación
      const confirmationData = {
        opcion: 'confirmar_entrega',
        num_orden: numOrden,
        ruta_asignada: rutaAsignada
      };

      logger.info({ sessionId, confirmationData }, '📞 Llamando endpoint de confirmación');

      // Crear FormData para envío como application/x-www-form-urlencoded
      const formData = new URLSearchParams();
      formData.append('opcion', 'confirmar_entrega');
      formData.append('num_orden', numOrden);
      formData.append('ruta_asignada', rutaAsignada);

      const response = await fetch('https://respaldoschile.cl/validacion_transferencia.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData
      });

      const result = await response.text();
      
      // Intentar parsear como JSON
      let parsedResult = null;
      try {
        parsedResult = JSON.parse(result);
      } catch (e) {
        logger.warn({ sessionId, result }, '⚠️ Respuesta del endpoint no es JSON válido');
      }
      
      logger.info({ 
        sessionId, 
        numOrden, 
        rutaAsignada,
        response: result.substring(0, 200),
        parsedResponse: parsedResult
      }, '✅ Confirmación de entrega enviada al sistema');

      const success = parsedResult?.ok === true || result.includes('confirmada');

      return { 
        wasConfirmed: success, 
        numOrden, 
        rutaAsignada,
        endpointResponse: result,
        parsedResponse: parsedResult,
        message: parsedResult?.message || 'Confirmación procesada'
      };

    } catch (error) {
      logger.error({ 
        error: error.message, 
        sessionId, 
        phoneNumber 
      }, '❌ Error en confirmación automática de entrega');
      
      return { wasConfirmed: false, error: error.message };
    }
  }

  /**
   * Detecta si un mensaje es una confirmación de entrega
   */
  detectDeliveryConfirmation(message) {
    const msgLower = message.toLowerCase().trim();
    
    // Patrones de confirmación
    const confirmationPatterns = [
      // Confirmaciones directas
      /^(si|sí)$/,
      /^(ok|okay)$/,
      /^(perfecto|bien|bueno)$/,
      /^(confirmo|confirmado)$/,
      
      // Confirmaciones con contexto
      /(si|sí).*(puedo|puede).*(recibir|esperar)/,
      /(ok|perfecto|bien).*(espero|recibi|recibo)/,
      /los?\s*espero/,
      /puedo\s*recibir/,
      /si\s*puedo/,
      /(vale|listo).*(espero|recibo)/,
      /estoy\s*en\s*casa/,
      /voy\s*a\s*estar/,
      /(confirmo|confirmar).*(entrega|pedido)/
    ];

    const isConfirmation = confirmationPatterns.some(pattern => 
      msgLower.match(pattern)
    );

    logger.debug({ 
      message: msgLower, 
      isConfirmation 
    }, '🔍 Análisis de confirmación de entrega');

    return isConfirmation;
  }

  /**
   * Obtiene el contexto de orden guardado localmente
   */
  async getOrderContext(sessionId) {
    try {
      const [[row]] = await this.pool.query(
        `SELECT current_order_context FROM chat_sessions WHERE id = ? LIMIT 1`,
        [sessionId]
      );
      
      if (row && row.current_order_context) {
        return { num_orden: row.current_order_context };
      }
      
      return null;
    } catch (error) {
      logger.warn({ error: error.message, sessionId }, '⚠️ Error obteniendo contexto de orden');
      return null;
    }
  }

  /**
   * Construye resumen de datos disponibles para IA estricta
   */
  buildAvailableDataSummary(orderInfo) {
    if (!orderInfo) return 'Sin datos del pedido disponibles';

    let summary = `
PEDIDO #${orderInfo.numero_pedido}:
- Producto: ${orderInfo.modelo || 'No especificado'}
- Tamaño: ${orderInfo.tamano || 'No especificado'}
- Color: ${orderInfo.color || 'No especificado'}
- Estado: ${orderInfo.estado_descripcion || 'No especificado'}
- Precio: $${orderInfo.precio || 'No especificado'}
    `;

    // Agregar información enriquecida si existe
    if (orderInfo.enriched) {
      const enriched = orderInfo.enriched;
      
      // Información de entrega
      if (enriched.route?.fecha) {
        summary += `\n- Fecha entrega: ${enriched.route.fecha}`;
      }
      
      if (enriched.route?.orden_ruta) {
        summary += `\n- Orden en ruta: ${enriched.route.orden_ruta}`;
      }
      
      // Dirección
      if (enriched.items?.[0]) {
        const item = enriched.items[0];
        let direccion = '';
        if (item.direccion) direccion += item.direccion;
        if (item.numero) direccion += ` ${item.numero}`;
        if (item.dpto) direccion += `, ${item.dpto}`;
        if (item.comuna) direccion += `, ${item.comuna}`;
        
        if (direccion) summary += `\n- Dirección: ${direccion}`;
      }
      
      // Información de pagos
      if (enriched.totals) {
        const totals = enriched.totals;
        summary += `\n- Total productos: $${totals.productos || 0}`;
        summary += `\n- Despacho: $${totals.despacho || 0}`;
        summary += `\n- Total a pagar: $${totals.total_con_despacho || 0}`;
        summary += `\n- Pagado: $${totals.pagado || 0}`;
        summary += `\n- Saldo pendiente: $${totals.saldo || 0}`;
      }
    }

    return summary;
  }

  /**
   * 🚫 Manejo inteligente de impedimentos de entrega
   * Detecta cuando clientes no pueden recibir y ofrece alternativas
   */
  async handleDeliveryImpediment(clientMessage, contextData) {
    try {
      const orderInfo = contextData.orderStatus;
      const msgLower = clientMessage.toLowerCase();
      
      logger.info({ 
        message: msgLower,
        hasOrderData: !!orderInfo,
        orderNumber: orderInfo?.numero_pedido 
      }, '🚫 DEBUG: Procesando impedimento de entrega');

      // Verificar si tenemos información del pedido para contexto
      const hasOrderContext = orderInfo && orderInfo.direccion_despacho;
      
      // Determinar tipo de impedimento
      let impedimentType = 'general';
      if (msgLower.includes('trabajar') || msgLower.includes('trabajo') || msgLower.includes('ocupado')) {
        impedimentType = 'work';
      } else if (msgLower.includes('viaj') || msgLower.includes('ausente')) {
        impedimentType = 'travel';
      } else if (msgLower.includes('cambiar') || msgLower.includes('reprogramar') || msgLower.includes('reagendar') ||
                 msgLower.includes('otra direccion') || msgLower.includes('otra dirección') || 
                 msgLower.includes('cambiar direccion') || msgLower.includes('enviar a otra')) {
        impedimentType = 'reschedule';
      } else if (msgLower.includes('no tengo a nadie') || msgLower.includes('no tengo nadie') ||
                 msgLower.includes('no hay nadie') || msgLower.includes('nadie puede') ||
                 msgLower.includes('vivo solo') || msgLower.includes('vivo sola') ||
                 msgLower.includes('no hay vecinos')) {
        impedimentType = 'no_alternatives';
      }

      // Para casos sin alternativas, escalar directamente
      if (impedimentType === 'no_alternatives') {
        logger.info({ 
          sessionId: contextData.sessionId,
          impedimentType 
        }, '🚫 DETECTADO: Cliente sin alternativas - escalando y marcando sesión');
        
        // Marcar sesión como escalada en BD
        await this.markSessionAsEscalated(contextData.sessionId, "Cliente sin alternativas para recibir entrega");
        
        return {
          text: "Entiendo tu situación 😔 Como no tienes alternativas disponibles, derivaré esto a un agente especializado para buscar una solución personalizada. Te contactará pronto para coordinar la entrega 👨‍💼",
          isConversationFlow: false,
          shouldEscalate: true,
          escalationReason: "Cliente sin alternativas para recibir entrega",
          contextUsed: hasOrderContext,
          orderNumber: orderInfo?.numero_pedido || null,
          impedimentType: impedimentType
        };
      }

      // Construir prompt para IA con contexto específico
      const systemPrompt = `
Eres un asistente de WhatsApp de Respaldos Chile (empresa de logística).
El cliente tiene un impedimento para recibir su entrega.

INSTRUCCIONES ESTRICTAS:
1. Detecta el tipo de impedimento del cliente
2. Ofrece alternativas INTELIGENTES basadas en la información disponible
3. Para impedimentos de horario/trabajo: pregunta por vecinos o familiares que puedan recibir
4. Para viajes/ausencias: pregunta si hay alguien más en la dirección
5. Si el cliente menciona otra dirección: pregunta por la comuna para evaluar factibilidad
6. NO inventes información sobre horarios, costos o políticas
7. Máximo 2-3 frases, sé empático pero directo
8. Usa emojis apropiados pero sin exceso
9. Si el cliente ya descartó todas las opciones básicas, derivar a agente

${hasOrderContext ? `CONTEXTO DEL PEDIDO:
- Número: ${orderInfo.numero_pedido}
- Dirección actual: ${orderInfo.direccion_despacho}
- Comuna: ${orderInfo.comuna || 'No especificada'}` : 'No hay información específica del pedido disponible.'}`;

      const userPrompt = `Cliente dice: "${clientMessage}"
Tipo de impedimento detectado: ${impedimentType}
¿Cómo puedo ayudarle a encontrar una alternativa para recibir su pedido?`;

      // Generar respuesta con IA
      const aiResponse = await this.generateAIResponseForImpediment(systemPrompt, userPrompt);
      
      if (aiResponse) {
        // 💬 GUARDAR CONTEXTO: Si la IA hace una pregunta, guardar para entender la respuesta siguiente
        if (aiResponse.includes('?') || aiResponse.includes('vecino') || aiResponse.includes('familiar') || 
            aiResponse.includes('dirección') || aiResponse.includes('alguien')) {
          await this.saveConversationContext(contextData.sessionId, {
            lastQuestion: aiResponse,
            awaitingType: 'impediment_solution',
            impedimentType: impedimentType,
            orderNumber: orderInfo?.numero_pedido
          });
        }
        
        return {
          text: aiResponse,
          isConversationFlow: false,
          shouldEscalate: false,
          escalationReason: null,
          contextUsed: hasOrderContext,
          orderNumber: orderInfo?.numero_pedido || null,
          impedimentType: impedimentType
        };
      }

      // Fallback si IA no funciona
      const fallbackResponse = this.generateFallbackImpedimentResponse(impedimentType, hasOrderContext);
      
      return {
        text: fallbackResponse,
        isConversationFlow: false,
        shouldEscalate: false,
        escalationReason: null,
        contextUsed: hasOrderContext,
        orderNumber: orderInfo?.numero_pedido || null,
        impedimentType: impedimentType
      };

    } catch (error) {
      logger.error({ error: error.message }, '🚫 Error manejando impedimento de entrega');
      
      return {
        text: "Entiendo que tienes dificultades para recibir tu pedido 😔 Derivaré esto a un agente para buscar la mejor solución. Te contactará pronto 👨‍💼",
        isConversationFlow: false,
        shouldEscalate: true,
        escalationReason: "Error procesando impedimento de entrega"
      };
    }
  }

  /**
   * Genera respuesta AI especializada para impedimentos
   */
  async generateAIResponseForImpediment(systemPrompt, userPrompt) {
    try {
      if (!this.OPENAI_API_KEY || this.OPENAI_API_KEY === 'sk-your-openai-api-key-here') {
        return null;
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: process.env.CHATBOT_AI_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3, // Más conservador para respuestas consistentes
          max_tokens: 100
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const completion = await response.json();
      const aiResponse = completion.choices[0]?.message?.content?.trim();
      
      logger.info({ 
        aiResponse: aiResponse?.substring(0, 100) + '...',
        hasResponse: !!aiResponse 
      }, '🚫 DEBUG: Respuesta IA para impedimento generada');
      
      return aiResponse;

    } catch (error) {
      logger.error({ error: error.message }, '🚫 Error generando respuesta IA para impedimento');
      return null;
    }
  }

  /**
   * Respuestas de fallback para impedimentos cuando IA no está disponible
   */
  generateFallbackImpedimentResponse(impedimentType, hasOrderContext) {
    const responses = {
      work: "Entiendo que tienes trabajo 💼 ¿Hay algún vecino o familiar que pueda recibir el pedido por ti? O si tienes otra dirección cercana, podemos evaluar envíarlo ahí 🏠",
      travel: "Comprendo que no estarás disponible ✈️ ¿Hay alguien más en tu domicilio que pueda recibir el pedido? También podemos revisar envíos a direcciones alternativas 📍",
      reschedule: "Sin problema, podemos buscar alternativas 📅 ¿Prefieres que alguien más lo reciba o tienes otra dirección donde enviarlo? Evaluemos las opciones 🤝",
      no_alternatives: "Entiendo tu situación 😔 Como no tienes alternativas disponibles, derivaré esto a un agente especializado para buscar una solución personalizada. Te contactará pronto 👨‍💼",
      general: "Entiendo tu situación 😔 ¿Hay algún vecino, familiar o dirección alternativa donde podamos enviar tu pedido? Busquemos la mejor solución 💡"
    };

    return responses[impedimentType] || responses.general;
  }

  /**
   * 🚫 Marca una sesión como escalada para silenciar IA automática
   */
  async markSessionAsEscalated(sessionId, reason) {
    try {
      // Verificar si los campos existen antes de actualizar
      const [[columnCheck]] = await this.pool.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'chat_sessions' 
        AND COLUMN_NAME = 'escalation_status'
        LIMIT 1
      `);
      
      if (!columnCheck) {
        logger.debug({ sessionId }, '🚫 Campo escalation_status no existe aún - saltando marcado');
        return;
      }
      
      await this.pool.query(`
        UPDATE chat_sessions 
        SET escalation_status = 'ESCALATED',
            escalation_reason = ?,
            escalated_at = NOW()
        WHERE id = ?
      `, [reason, sessionId]);
      
      logger.info({ 
        sessionId, 
        reason 
      }, '🚫 DEBUG: Sesión marcada como escalada');
      
    } catch (error) {
      logger.debug({ 
        error: error.message?.substring(0, 100), 
        sessionId, 
        reason 
      }, '🚫 Error marcando sesión como escalada - continuando sin marcar');
    }
  }

  /**
   * 🔍 Verifica si una sesión está escalada (silenciar IA)
   */
  async isSessionEscalated(sessionId) {
    try {
      // Primero verificar si los campos existen (defensivo para antes del deploy)
      const [[columnCheck]] = await this.pool.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'chat_sessions' 
        AND COLUMN_NAME = 'escalation_status'
        LIMIT 1
      `);
      
      // Si el campo no existe aún, retornar false (permitir IA)
      if (!columnCheck) {
        logger.debug({ sessionId }, '🔍 Campo escalation_status no existe aún - permitiendo IA');
        return false;
      }
      
      // Si existe, hacer la consulta normal
      const [[session]] = await this.pool.query(`
        SELECT escalation_status, escalated_at, escalation_reason
        FROM chat_sessions 
        WHERE id = ? 
        LIMIT 1
      `, [sessionId]);
      
      if (!session) return false;
      
      const isEscalated = session.escalation_status === 'ESCALATED';
      
      if (isEscalated) {
        logger.info({ 
          sessionId,
          isEscalated,
          escalationStatus: session.escalation_status,
          escalatedAt: session.escalated_at,
          reason: session.escalation_reason
        }, '🔍 DEBUG: Sesión está escalada');
      }
      
      return isEscalated;
      
    } catch (error) {
      // Si hay cualquier error (campo no existe, etc), permitir IA
      logger.debug({ 
        error: error.message?.substring(0, 100), 
        sessionId 
      }, '🔍 Error verificando escalamiento - permitiendo IA por defecto');
      return false; // En caso de error, permitir IA
    }
  }

  /**
   * 🔄 Resetea estado de escalamiento (cuando agente toma control)
   */
  async resetEscalationStatus(sessionId) {
    try {
      await this.pool.query(`
        UPDATE chat_sessions 
        SET escalation_status = 'RESOLVED',
            escalation_reason = NULL,
            escalated_at = NULL
        WHERE id = ?
      `, [sessionId]);
      
      logger.info({ sessionId }, '🔄 DEBUG: Estado de escalamiento reseteado');
      
    } catch (error) {
      logger.error({ 
        error: error.message, 
        sessionId 
      }, '🔄 Error reseteando estado de escalamiento');
    }
  }

  /**
   * 💬 Obtiene el historial de conversación de los últimos mensajes
   */
  async getConversationHistory(sessionId, limit = 10) {
    try {
      const [messages] = await this.pool.query(`
        SELECT direction, text, created_at, is_ai_generated
        FROM chat_messages
        WHERE session_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `, [sessionId, limit]);
      
      // Invertir para tener orden cronológico
      const history = messages.reverse().map(msg => ({
        role: msg.direction === 'in' ? 'user' : 'assistant',
        content: msg.text,
        timestamp: msg.created_at,
        isAI: msg.is_ai_generated
      }));
      
      logger.info({ 
        sessionId,
        messageCount: history.length,
        lastMessage: history[history.length - 1]?.content?.substring(0, 50) + '...'
      }, '💬 Historial de chat recuperado');
      
      return history;
      
    } catch (error) {
      logger.error({ 
        error: error.message,
        sessionId 
      }, '💬 Error recuperando historial de chat');
      return [];
    }
  }

  /**
   * 💬 Guarda contexto de la conversación para mantener continuidad
   */
  async saveConversationContext(sessionId, context) {
    try {
      const contextJson = JSON.stringify(context);
      
      // Verificar si los campos existen (defensivo)
      const [[columnCheck]] = await this.pool.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'chat_sessions' 
        AND COLUMN_NAME = 'conversation_context'
        LIMIT 1
      `);
      
      if (!columnCheck) {
        logger.debug({ sessionId }, '💬 Campo conversation_context no existe aún');
        return;
      }
      
      await this.pool.query(`
        UPDATE chat_sessions 
        SET conversation_context = ?,
            last_bot_question = ?,
            awaiting_response_type = ?
        WHERE id = ?
      `, [contextJson, context.lastQuestion || null, context.awaitingType || null, sessionId]);
      
      logger.info({ 
        sessionId,
        awaitingType: context.awaitingType,
        lastQuestion: context.lastQuestion?.substring(0, 50) + '...'
      }, '💬 Contexto conversacional guardado');
      
    } catch (error) {
      logger.debug({ 
        error: error.message?.substring(0, 100),
        sessionId 
      }, '💬 Error guardando contexto - continuando');
    }
  }

  /**
   * 💬 Recupera contexto de la conversación previa
   */
  async getConversationContext(sessionId) {
    try {
      // Verificar si los campos existen
      const [[columnCheck]] = await this.pool.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'chat_sessions' 
        AND COLUMN_NAME = 'conversation_context'
        LIMIT 1
      `);
      
      if (!columnCheck) {
        return null;
      }
      
      const [[session]] = await this.pool.query(`
        SELECT conversation_context, last_bot_question, awaiting_response_type
        FROM chat_sessions 
        WHERE id = ?
        LIMIT 1
      `, [sessionId]);
      
      if (!session || !session.conversation_context) {
        return null;
      }
      
      const context = typeof session.conversation_context === 'string' 
        ? JSON.parse(session.conversation_context)
        : session.conversation_context;
      
      logger.info({ 
        sessionId,
        awaitingType: session.awaiting_response_type,
        hasContext: !!context
      }, '💬 Contexto conversacional recuperado');
      
      return {
        ...context,
        lastBotQuestion: session.last_bot_question,
        awaitingType: session.awaiting_response_type
      };
      
    } catch (error) {
      logger.debug({ 
        error: error.message?.substring(0, 100),
        sessionId 
      }, '💬 Error recuperando contexto - retornando null');
      return null;
    }
  }

  /**
   * 💬 Limpia el contexto conversacional (después de resolver o timeout)
   */
  async clearConversationContext(sessionId) {
    try {
      // Verificar si los campos existen
      const [[columnCheck]] = await this.pool.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'chat_sessions' 
        AND COLUMN_NAME = 'conversation_context'
        LIMIT 1
      `);
      
      if (!columnCheck) {
        return;
      }
      
      await this.pool.query(`
        UPDATE chat_sessions 
        SET conversation_context = NULL,
            last_bot_question = NULL,
            awaiting_response_type = NULL
        WHERE id = ?
      `, [sessionId]);
      
      logger.info({ sessionId }, '💬 Contexto conversacional limpiado');
      
    } catch (error) {
      logger.debug({ 
        error: error.message?.substring(0, 100),
        sessionId 
      }, '💬 Error limpiando contexto');
    }
  }
}

module.exports = ConversationEngine;