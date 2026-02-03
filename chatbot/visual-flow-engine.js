/**
 * Visual Flow Engine
 * Ejecuta flujos creados en el Flow Builder cuando llegan mensajes
 */

const logger = require('pino')({ level: process.env.LOG_LEVEL || 'info' });
const OpenAI = require('openai');
const { createTrace, finalizeTrace, traceStep } = require('./trace-builder');

class VisualFlowEngine {
  constructor(dbPool, classifier, sendMessage, emitFlowEvent = null, sendInteractiveButtons = null, sendInteractiveList = null, knowledgeRetriever = null, sendTypingIndicator = null) {
    this.db = dbPool;
    this.classifier = classifier;
    this.sendMessage = sendMessage; // Función para enviar mensajes de texto a WhatsApp
    this.sendInteractiveButtons = sendInteractiveButtons; // Función para enviar botones interactivos
    this.sendInteractiveList = sendInteractiveList; // Función para enviar listas interactivas
    this.emitFlowEvent = emitFlowEvent; // Función para emitir eventos al monitor
    this.knowledgeRetriever = knowledgeRetriever; // Sistema de aprendizaje (puede ser null)
    this.sendTypingIndicator = sendTypingIndicator; // Función para enviar indicador de "escribiendo..."
    this.activeFlows = [];
    this.sessionStates = new Map(); // phone -> { flowId, currentNodeId, variables }

    // Cache de configuración del chatbot (TTL 5 min)
    this._cachedConfig = null;
    this._configCacheTime = 0;
    this._configCacheTTL = 5 * 60 * 1000;

    // Keywords globales que funcionan en cualquier momento
    this.globalKeywords = {
      'menu': { action: 'show_menu', response: '📋 *Menú Principal*\n\n¿En qué puedo ayudarte?\n\n1️⃣ Información de productos\n2️⃣ Soporte técnico\n3️⃣ Hablar con un agente\n4️⃣ Volver al inicio' },
      'ayuda': { action: 'show_help', response: '❓ *Ayuda*\n\nPuedes escribir:\n• *menu* - Ver opciones disponibles\n• *agente* - Hablar con una persona\n• *salir* - Terminar conversación\n\nO simplemente cuéntame qué necesitas.' },
      'agente': { action: 'transfer', response: '👤 Entendido, te comunico con un agente humano. Por favor espera un momento...' },
      'humano': { action: 'transfer', response: '👤 Entendido, te comunico con un agente humano. Por favor espera un momento...' },
      'salir': { action: 'exit', response: '👋 ¡Hasta pronto! Si necesitas algo más, escríbeme.' },
      'cancelar': { action: 'exit', response: '✅ Conversación cancelada. Escribe *menu* para ver las opciones.' },
      'hola': { action: 'greeting', response: null } // null = dejar que el flujo maneje
    };

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
   * Cargar configuración del chatbot con cache
   */
  async loadChatbotConfig() {
    const now = Date.now();
    if (this._cachedConfig && (now - this._configCacheTime) < this._configCacheTTL) {
      return this._cachedConfig;
    }
    try {
      const [rows] = await this.db.query('SELECT * FROM chatbot_config ORDER BY id DESC LIMIT 1');
      this._cachedConfig = rows[0] || null;
      this._configCacheTime = now;
      return this._cachedConfig;
    } catch (err) {
      logger.error({ err }, 'Error loading chatbot config');
      return this._cachedConfig;
    }
  }

  /**
   * Invalidar cache de configuración (llamar después de guardar config)
   */
  invalidateConfigCache() {
    this._cachedConfig = null;
    this._configCacheTime = 0;
    logger.info('Chatbot config cache invalidated');
  }

  /**
   * Prompt por defecto (fallback si no hay system_prompt en la BD)
   */
  _getDefaultSystemPrompt(userName) {
    return `Eres un vendedor humano de Respaldos Chile que conversa por WhatsApp e Instagram.
Respaldos Chile vende respaldos de cama, cabeceras y accesorios de dormitorio.

Hablas como una persona real, cercana y profesional (chileno neutro).
Nada de lenguaje robotico, corporativo ni de catalogo.

Los mensajes deben ser cortos y naturales:
- Maximo 3-4 lineas
- Una sola idea por mensaje
- Cierra siempre con una pregunta que avance la conversacion
${userName ? `\nEl cliente se llama ${userName}, usalo naturalmente en la conversacion.` : ''}

FLUJO DE CONVERSACION:
1. Si es primer mensaje o saludo: responde con un saludo corto y pregunta abierta tipo "en que te puedo ayudar?" o "cuentame, en que andas?". NO menciones productos, respaldos, cabeceras ni nada especifico. El cliente puede querer cualquier cosa: comprar, reclamar, preguntar por un pedido, cotizar, o algo que no tiene nada que ver con respaldos.
2. Espera a que el cliente diga que necesita antes de asumir NADA.
3. Si falta info (medida, estilo, color): pregunta antes de recomendar. Una pregunta por mensaje. NO preguntes cosas obvias ni redundantes (ej: si quiere un respaldo de cama, no preguntes "donde lo vas a poner" porque es obvio que es en su dormitorio).
4. Si ya tienes contexto: sugiere maximo 2 opciones, condicionadas a lo que dijo el cliente.
5. Si el cliente tiene dudas: responde con calma, no contradigas, confirma si no sabes.
6. Si quiere comprar o pagar: "Te conecto con alguien del equipo para cerrar eso"
7. Nunca saltes etapas: no cotices sin contexto, no recomiendes sin entender.

Reglas estrictas:
- NUNCA asumas el motivo de contacto del cliente. Pregunta primero.
- NUNCA inventes materiales, modelos, estilos ni tipos de producto. Si no tienes info concreta de lo que vendemos, di "Dejame confirmarlo con el equipo y te respondo al tiro"
- No usar listas ni formato de catalogo
- No entregar fichas tecnicas ni especificaciones duras
- No inventar precios, plazos, stock ni condiciones
- No asumir medidas, colores ni disponibilidad
- No usar frases tipo "Estimado/a cliente" o "Le informamos que..."

Nunca emitas juicios genericos de gusto como:
"queda bonito", "es lindo", "es precioso", "te va a encantar".

Las recomendaciones deben ser siempre condicionadas al contexto del cliente:
"Suele funcionar bien cuando..."
"En espacios como el tuyo..."
"Por lo que me comentas..."
"Para el uso que buscas..."

Si no tienes certeza, responde exactamente:
"Dejame confirmarlo con el equipo y te respondo al tiro"

Usa solo informacion confirmada. Puedes mejorar redaccion y trato, pero sin cambiar datos.`;
  }

  /**
   * Construir el system prompt base: usa el de la BD si existe, sino el default
   */
  _buildBaseSystemPrompt(config, userName) {
    if (config && config.system_prompt && config.system_prompt.trim()) {
      // Reemplazar {{nombre}} por el nombre del cliente, o eliminar el placeholder si no hay nombre
      let prompt = config.system_prompt;
      prompt = prompt.replace(/,?\s*\{\{nombre\}\}/gi, userName ? `, ${userName}` : '');
      prompt = prompt.replace(/\{\{nombre\}\}\s*,?/gi, userName ? `${userName} ` : '');
      prompt = prompt.replace(/\{\{nombre\}\}/gi, userName || '');
      return prompt;
    }
    return this._getDefaultSystemPrompt(userName);
  }

  /**
   * Construir el prompt actual sin llamar a OpenAI (para panel "Ver Prompt")
   */
  async buildCurrentPrompt(phone) {
    const savedFields = phone ? await this.loadContactFields(phone) : {};
    const userName = savedFields.nombre || savedFields.name || '';

    const fidelityLevel = process.env.LEARNING_FIDELITY_LEVEL || 'enhanced';
    const fidelityInstruction = this._getFidelityInstruction(fidelityLevel);

    const config = await this.loadChatbotConfig();
    let systemPrompt = this._buildBaseSystemPrompt(config, userName || '(se inyecta si está disponible)');

    // Cargar instrucciones personalizadas
    if (config && config.custom_instructions) {
      systemPrompt += `\n\n--- INSTRUCCIONES DEL ADMIN ---\n${config.custom_instructions}\n--- FIN INSTRUCCIONES ---`;
    }

    // Agregar instrucción de fidelidad
    systemPrompt += `\n\n${fidelityInstruction}`;

    // Contar conocimiento disponible
    let knowledgeCount = 0;
    let priceCount = 0;
    try {
      const [qaPairs] = await this.db.query("SELECT COUNT(*) as c FROM learned_qa_pairs WHERE status = 'approved'");
      knowledgeCount = qaPairs[0]?.c || 0;
    } catch (e) { /* tabla puede no existir */ }
    try {
      const [prices] = await this.db.query("SELECT COUNT(*) as c FROM product_prices WHERE active = 1");
      priceCount = prices[0]?.c || 0;
    } catch (e) { /* tabla puede no existir */ }

    return {
      systemPrompt,
      isCustomSystemPrompt: !!(config && config.system_prompt && config.system_prompt.trim()),
      fidelityLevel,
      fidelityInstruction,
      customInstructions: config?.custom_instructions || '',
      knowledgeCount,
      priceCount,
      model: process.env.CHATBOT_AI_MODEL || 'gpt-4o-mini',
      temperature: '0.3 (con conocimiento) / 0.5 (sin conocimiento)',
      maxTokens: 350
    };
  }

  /**
   * Procesar mensaje entrante
   * @param {string} phone - Número de teléfono
   * @param {string} message - Texto del mensaje
   * @param {object} context - Contexto adicional (sessionId, buttonId, etc.)
   * @returns {object|null} - Respuesta del flujo o null si no hay flujo activo
   */
  async processMessage(phone, message, context = {}) {
    const normalizedMessage = message.toLowerCase().trim();
    const buttonId = context.buttonId; // ID del botón interactivo si fue presionado
    const trace = context.__trace || null;

    // ========================================
    // 1. VERIFICAR KEYWORDS GLOBALES (siempre funcionan)
    // ========================================
    const globalKeywordResult = await this.handleGlobalKeyword(phone, normalizedMessage, context);
    if (globalKeywordResult) {
      // Si la keyword global devuelve algo, significa que manejó el mensaje
      if (globalKeywordResult.handled) {
        if (trace) {
          const kw = this.globalKeywords[normalizedMessage];
          trace.globalKeyword = {
            checked: true,
            normalizedInput: normalizedMessage,
            matched: true,
            keyword: normalizedMessage,
            action: kw ? kw.action : globalKeywordResult.action,
            outcome: globalKeywordResult.type,
            sessionCleared: ['show_menu', 'show_help', 'transfer', 'exit'].includes(kw ? kw.action : '')
          };
        }
        return globalKeywordResult;
      }
      // Si devuelve { continueFlow: true }, seguir con el flujo normal
      if (trace) {
        trace.globalKeyword = {
          checked: true,
          normalizedInput: normalizedMessage,
          matched: true,
          keyword: normalizedMessage,
          action: 'greeting',
          outcome: 'continueFlow',
          sessionCleared: false
        };
      }
    } else {
      if (trace) {
        trace.globalKeyword = {
          checked: true,
          normalizedInput: normalizedMessage,
          matched: false,
          keyword: null,
          action: null,
          outcome: 'no_match',
          sessionCleared: false
        };
      }
    }

    // ========================================
    // 2. VERIFICAR SI HAY SESIÓN ACTIVA
    // ========================================
    let sessionState = this.sessionStates.get(phone);

    if (trace) {
      trace.sessionState = {
        hasActiveSession: !!sessionState,
        flowId: sessionState ? sessionState.flowId : null,
        flowSlug: sessionState ? sessionState.flowSlug : null,
        currentNodeId: sessionState ? sessionState.currentNodeId : null
      };
    }

    if (sessionState) {
      // Continuar flujo existente (pasar buttonId si existe)
      return this.continueFlow(phone, message, sessionState, context, buttonId);
    }

    // ========================================
    // 3. NO HAY SESIÓN ACTIVA - BUSCAR FLUJO QUE COINCIDA
    // ========================================
    const matchedFlow = await this.matchFlow(message, context);

    if (matchedFlow) {
      // Iniciar nuevo flujo
      return this.startFlow(phone, matchedFlow, message, context);
    }

    // ========================================
    // 4. NO HAY FLUJO - USAR FALLBACK CON IA
    // ========================================
    logger.debug({ phone, message: normalizedMessage.slice(0, 50) }, 'No matching visual flow - using AI fallback');
    return this.handleAIFallback(phone, message, context);
  }

  /**
   * Manejar keywords globales que funcionan en cualquier momento
   */
  async handleGlobalKeyword(phone, normalizedMessage, context) {
    const keyword = this.globalKeywords[normalizedMessage];

    if (!keyword) {
      return null; // No es keyword global
    }

    logger.info({ phone, keyword: normalizedMessage, action: keyword.action }, '🔑 Global keyword detected');

    switch (keyword.action) {
      case 'show_menu':
      case 'show_help':
        // Limpiar cualquier sesión activa
        this.sessionStates.delete(phone);
        // Enviar respuesta
        if (this.sendMessage && keyword.response) {
          await this.sendMessage(phone, keyword.response);
        }
        return { handled: true, type: 'global_keyword', action: keyword.action };

      case 'transfer':
        // Limpiar sesión y marcar para transferencia
        this.sessionStates.delete(phone);
        if (this.sendMessage && keyword.response) {
          await this.sendMessage(phone, keyword.response);
        }
        return {
          handled: true,
          type: 'transfer_to_human',
          text: keyword.response,
          reason: 'user_requested'
        };

      case 'exit':
        // Limpiar sesión
        this.sessionStates.delete(phone);
        if (this.sendMessage && keyword.response) {
          await this.sendMessage(phone, keyword.response);
        }
        return { handled: true, type: 'session_ended', action: keyword.action };

      case 'greeting':
        // Permitir que el flujo de saludo maneje esto
        return { continueFlow: true };

      default:
        return null;
    }
  }

  /**
   * Fallback con IA cuando no hay flujo que coincida.
   * Si el sistema de aprendizaje esta activo, inyecta:
   * - Conocimiento aprendido de conversaciones reales
   * - Precios vigentes de product_prices
   * - Historial conversacional (ultimos 30 msgs agrupados)
   * - Instruccion de fidelidad configurable
   */
  async handleAIFallback(phone, message, context) {
    if (!this.openai) {
      logger.warn({ phone }, 'AI fallback not available - no OpenAI key');
      return null;
    }

    const trace = (context && context.__trace) ? context.__trace : null;

    try {
      // Cargar datos del usuario para personalizar
      const savedFields = await this.loadContactFields(phone);
      const userName = savedFields.nombre || savedFields.name || '';

      if (trace) {
        trace.aiFallback = {
          contactFields: savedFields,
          userName
        };
      }

      // --- Conocimiento aprendido + precios (si el retriever esta disponible) ---
      let knowledgeContext = [];
      let priceContext = [];
      let recentHistory = [];
      let vectorSearchResults = [];
      let bm25SearchResults = [];
      let vectorSearchDurationMs = 0;
      let priceQueryDurationMs = 0;
      let isPriceQueryResult = false;
      let extractedProduct = null;
      let extractedVariant = null;

      if (this.knowledgeRetriever) {
        // Buscar Q&A similares aprendidos
        const vectorStart = Date.now();
        knowledgeContext = await this.knowledgeRetriever.retrieve(message).catch(err => {
          logger.error({ err }, 'Error en knowledge retriever');
          return [];
        });
        vectorSearchDurationMs = Date.now() - vectorStart;
        vectorSearchResults = knowledgeContext.filter(c => c.source === 'learned');
        bm25SearchResults = knowledgeContext.filter(c => c.source === 'faq');

        // Buscar precios vigentes si es consulta de precio
        isPriceQueryResult = this.knowledgeRetriever.isPriceQuery(message);
        if (isPriceQueryResult) {
          const priceStart = Date.now();
          const extracted = this.knowledgeRetriever.extractProductInfo(message);
          extractedProduct = extracted.productName;
          extractedVariant = extracted.variant;
          if (extractedProduct) {
            priceContext = await this.knowledgeRetriever.findPrice(extractedProduct, extractedVariant).catch(() => []);
          }
          priceQueryDurationMs = Date.now() - priceStart;
        }

        // Cargar historial conversacional
        if (context.sessionId) {
          recentHistory = await this.knowledgeRetriever.getRecentContext(context.sessionId).catch(() => []);
        }
      }

      if (trace) {
        trace.aiFallback.knowledge = {
          retrieverAvailable: !!this.knowledgeRetriever,
          vectorSearch: {
            ran: !!this.knowledgeRetriever,
            results: vectorSearchResults.map(r => ({
              source: r.source,
              question: r.question,
              answerPreview: (r.answer || '').slice(0, 120),
              similarityScore: r.score || null,
              qualityScore: r.qualityScore || null
            })),
            durationMs: vectorSearchDurationMs
          },
          bm25Search: {
            ran: !!this.knowledgeRetriever,
            resultsCount: bm25SearchResults.length,
            results: bm25SearchResults.map(r => ({
              source: r.source,
              question: r.question,
              answerPreview: (r.answer || '').slice(0, 120)
            }))
          },
          combinedCount: knowledgeContext.length
        };

        trace.aiFallback.priceQuery = {
          isPriceQuery: isPriceQueryResult,
          extractedProduct,
          extractedVariant,
          pricesFound: priceContext.map(p => ({
            productName: p.product_name,
            variant: p.variant || null,
            price: p.price
          })),
          durationMs: priceQueryDurationMs
        };

        trace.aiFallback.conversationHistory = {
          loaded: recentHistory.length > 0,
          turnsLoaded: recentHistory.length,
          turns: recentHistory.map(t => ({
            direction: t.direction,
            text: (t.text || '').slice(0, 300),
            timestamp: t.created_at || null
          }))
        };
      }

      // --- Construir system prompt enriquecido ---
      const fidelityLevel = process.env.LEARNING_FIDELITY_LEVEL || 'enhanced';
      const fidelityInstruction = this._getFidelityInstruction(fidelityLevel);

      const config = await this.loadChatbotConfig();
      const isCustomSystemPrompt = !!(config && config.system_prompt && config.system_prompt.trim());
      let systemPrompt = this._buildBaseSystemPrompt(config, userName);

      // Inyectar conocimiento aprendido
      if (knowledgeContext.length > 0) {
        systemPrompt += `\n\n--- CONOCIMIENTO DEL EQUIPO ---
Estas son respuestas que tu equipo humano ha dado a preguntas similares.
Usa esta informacion para responder de forma precisa:

${knowledgeContext.map(c => `Pregunta: "${c.question}"
Respuesta del equipo: "${c.answer}"`).join('\n\n')}
--- FIN CONOCIMIENTO ---`;
      }

      // Inyectar precios vigentes
      if (priceContext.length > 0) {
        systemPrompt += `\n\n--- PRECIOS VIGENTES ---
${priceContext.map(p => `${p.product_name} ${p.variant || ''}: $${Number(p.price).toLocaleString('es-CL')}${p.notes ? ` (${p.notes})` : ''}`).join('\n')}
IMPORTANTE: Usa SOLO estos precios. Los precios en las respuestas del equipo pueden estar desactualizados.
--- FIN PRECIOS ---`;
      }

      // Agregar instruccion de fidelidad
      if (knowledgeContext.length > 0) {
        systemPrompt += `\n\n${fidelityInstruction}`;
      }

      // Inyectar instrucciones personalizadas del admin
      const hasCustomInstructions = !!(config && config.custom_instructions);
      if (hasCustomInstructions) {
        systemPrompt += `\n\n--- INSTRUCCIONES DEL ADMIN ---\n${config.custom_instructions}\n--- FIN INSTRUCCIONES ---`;
      }

      // Load behavioral rules
      let behavioralRules = [];
      try {
        const [rules] = await this.db.query(
          `SELECT rule_text, category FROM chatbot_behavioral_rules WHERE is_active = TRUE ORDER BY priority DESC LIMIT 30`
        );
        behavioralRules = rules;
        if (rules.length > 0) {
          const rulesText = rules.map(r => `- ${r.rule_text}`).join('\n');
          systemPrompt += `\n\n--- REGLAS DE COMPORTAMIENTO (PRIORIDAD ALTA) ---
IMPORTANTE: Estas reglas fueron definidas por el administrador y DEBEN cumplirse siempre, incluso si contradicen el comportamiento anterior en la conversacion.
${rulesText}
--- FIN REGLAS ---`;
        }
      } catch (err) {
        if (err.code !== 'ER_NO_SUCH_TABLE') {
          logger.error({ err }, 'Error loading behavioral rules');
        }
      }

      // --- Construir array de mensajes con historial ---
      const messages = [
        { role: 'system', content: systemPrompt }
      ];

      // Historial agrupado (turnos reales de conversacion)
      if (recentHistory.length > 0) {
        for (const turn of recentHistory) {
          messages.push({
            role: turn.direction === 'incoming' ? 'user' : 'assistant',
            content: turn.text
          });
        }
      }

      // Mensaje actual del cliente
      messages.push({ role: 'user', content: message });

      const aiModel = process.env.CHATBOT_AI_MODEL || 'gpt-4o-mini';
      const aiTemperature = knowledgeContext.length > 0 ? 0.3 : 0.5;
      const aiMaxTokens = 350;

      // Estimate tokens (rough: 1 token ~ 4 chars)
      const estimatedTokens = Math.ceil(messages.reduce((sum, m) => sum + (m.content || '').length, 0) / 4);

      if (trace) {
        trace.aiFallback.prompt = {
          isCustomSystemPrompt,
          hasCustomInstructions,
          customInstructionsPreview: hasCustomInstructions ? (config.custom_instructions || '').slice(0, 200) : null,
          fidelityLevel,
          knowledgeInjected: knowledgeContext.length > 0,
          knowledgePairsInjected: knowledgeContext.length,
          pricesInjected: priceContext.length > 0,
          behavioralRulesInjected: behavioralRules.length > 0,
          behavioralRulesCount: behavioralRules.length,
          totalSystemPromptChars: systemPrompt.length,
          totalMessagesInArray: messages.length,
          estimatedTokens,
          systemPromptFull: systemPrompt,
          behavioralRulesText: behavioralRules.length > 0 ? behavioralRules.map(r => `- ${r.rule_text}`).join('\n') : null,
          customInstructionsText: hasCustomInstructions ? config.custom_instructions : null
        };
      }

      // --- Llamar a OpenAI ---
      const openaiStart = Date.now();
      const aiResponse = await this.openai.chat.completions.create({
        model: aiModel,
        messages,
        temperature: aiTemperature,
        max_tokens: aiMaxTokens
      });
      const openaiDurationMs = Date.now() - openaiStart;

      const responseText = aiResponse.choices[0]?.message?.content || 'Gracias por tu mensaje. ¿En qué puedo ayudarte?';

      if (trace) {
        const usage = aiResponse.usage || {};
        trace.aiFallback.openaiCall = {
          model: aiModel,
          temperature: aiTemperature,
          maxTokens: aiMaxTokens,
          durationMs: openaiDurationMs,
          promptTokens: usage.prompt_tokens || null,
          completionTokens: usage.completion_tokens || null,
          totalTokens: usage.total_tokens || null,
          finishReason: aiResponse.choices[0]?.finish_reason || null,
          responseText,
          responseLength: responseText.length
        };
      }

      // Enviar typing indicator antes de responder
      let typingIndicatorSent = false;
      if (this.sendTypingIndicator && context.waMsgId) {
        await this.sendTypingIndicator(context.waMsgId);
        typingIndicatorSent = true;
      }

      // Enviar con delay realista y guardar en BD
      const sentMessages = await this._sendBotResponse(phone, responseText, context);

      if (trace) {
        const parts = this._splitResponse(responseText);
        trace.aiFallback.delivery = {
          splitInto: parts.length,
          parts: parts.map((part, idx) => ({
            index: idx,
            text: part,
            charCount: part.length,
            calculatedDelayMs: this._calculateTypingDelay(part)
          })),
          typingIndicatorSent
        };
      }

      logger.info({
        phone,
        response: responseText.slice(0, 80),
        contextUsed: knowledgeContext.length,
        pricesUsed: priceContext.length,
        historyTurns: recentHistory.length,
        messagesSaved: sentMessages.length
      }, '🤖 AI fallback response sent');

      return {
        type: 'ai_fallback',
        text: responseText,
        sentMessages,
        handled: true
      };

    } catch (err) {
      logger.error({ err, phone }, 'Error in AI fallback');
      if (trace && trace.aiFallback) {
        trace.aiFallback.error = { stage: 'handleAIFallback', message: err.message || String(err) };
      } else if (trace) {
        trace.aiFallback = { error: { stage: 'handleAIFallback', message: err.message || String(err) } };
      }
      return null;
    }
  }

  /**
   * Instruccion de fidelidad para el system prompt
   */
  _getFidelityInstruction(level) {
    switch (level) {
      case 'exact':
        return `FIDELIDAD: Responde usando las respuestas del equipo TAL CUAL, sin modificar ni una palabra. Copia la respuesta exacta.`;
      case 'polished':
        return `FIDELIDAD: Responde usando las respuestas del equipo como base. Puedes corregir ortografia y formato, pero NO cambies el contenido ni agregues info.`;
      case 'enhanced':
        return `FIDELIDAD: Responde usando la informacion de las respuestas del equipo. Puedes reorganizar, mejorar la redaccion y agregar cortesia. Cierra con una pregunta cuando sea apropiado. Manten los datos exactos.`;
      case 'creative':
        return `FIDELIDAD: USA la informacion de las respuestas del equipo como referencia. Responde de forma natural y conversacional con tu propio estilo. Los datos (precios, plazos, medidas) deben ser exactos, pero la forma de decirlo es libre. Se vendedor, no robot.`;
      default:
        return `FIDELIDAD: Responde usando la informacion de las respuestas del equipo. Manten los datos exactos pero mejora la redaccion.`;
    }
  }

  /**
   * Calcula delay realista de escritura humana
   */
  _calculateTypingDelay(text) {
    const CHARS_PER_SECOND = Number(process.env.LEARNING_TYPING_SPEED || 3.5);
    const MIN_DELAY = 1500;
    const MAX_DELAY = 12000;

    const charCount = (text || '').length;
    const calculatedDelay = (charCount / CHARS_PER_SECOND) * 1000;
    // Variacion +-20% para que no sea roboticamente exacto
    const variation = calculatedDelay * (0.8 + Math.random() * 0.4);

    return Math.min(MAX_DELAY, Math.max(MIN_DELAY, Math.round(variation)));
  }

  /**
   * Divide respuesta larga en multiples mensajes cortos
   */
  _splitResponse(text) {
    const MAX_CHARS = Number(process.env.LEARNING_MAX_MSG_LENGTH || 180);

    if (!text || text.length <= MAX_CHARS) return [text];

    const parts = [];
    // Dividir por oraciones (punto, signo de exclamacion, interrogacion)
    const sentences = text.split(/(?<=[.!?])\s+/);
    let current = '';

    for (const sentence of sentences) {
      if ((current + ' ' + sentence).trim().length > MAX_CHARS && current) {
        parts.push(current.trim());
        current = sentence;
      } else {
        current = current ? current + ' ' + sentence : sentence;
      }
    }
    if (current.trim()) parts.push(current.trim());

    // Si quedo en mas de 3 partes, reagrupar en 2
    if (parts.length > 3) {
      const mid = Math.ceil(parts.length / 2);
      return [
        parts.slice(0, mid).join(' '),
        parts.slice(mid).join(' ')
      ];
    }

    return parts;
  }

  /**
   * Envia respuesta con delay realista, dividida en multiples mensajes,
   * y guarda cada parte en chat_messages con is_ai_generated=1
   * @returns {Array} Array de { waMsgId, dbId, text } por cada mensaje enviado
   */
  async _sendBotResponse(phone, fullText, context = {}) {
    const parts = this._splitResponse(fullText);
    const waMsgId = context.waMsgId;
    const sessionId = context.sessionId;
    const trace = context.__trace || null;
    const skipDelays = !!trace; // Skip all delays in trace/tester mode
    const sentMessages = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      // Enviar typing indicator antes de cada parte
      if (!skipDelays && this.sendTypingIndicator && waMsgId) {
        await this.sendTypingIndicator(waMsgId);
      }

      // Delay proporcional al texto (skip in trace mode)
      const delay = this._calculateTypingDelay(part);
      if (!skipDelays) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Enviar parte
      let msgId = null;
      if (this.sendMessage) {
        msgId = await this.sendMessage(phone, part);
      }

      // Guardar en BD con is_ai_generated = 1
      let dbId = null;
      if (sessionId && msgId) {
        try {
          const [result] = await this.db.query(
            `INSERT INTO chat_messages (session_id, direction, text, wa_jid, wa_msg_id, status, is_ai_generated)
             VALUES (?, 'out', ?, ?, ?, 'sent', 1)`,
            [sessionId, part, phone, msgId]
          );
          dbId = result.insertId;
        } catch (err) {
          logger.error({ err, sessionId, msgId }, 'Error saving AI message to DB');
        }
      }

      sentMessages.push({ waMsgId: msgId, dbId, text: part });

      // Pausa extra entre mensajes (skip in trace mode)
      if (i < parts.length - 1 && !skipDelays) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return sentMessages;
  }

  /**
   * Buscar flujo que coincida con el mensaje
   */
  async matchFlow(message, context) {
    if (this.activeFlows.length === 0) {
      await this.loadActiveFlows();
    }

    const trace = (context && context.__trace) ? context.__trace : null;

    // Clasificar el mensaje
    let classification = null;
    const classifyStart = Date.now();
    if (this.classifier) {
      classification = await this.classifier.classify(message, context);
    }
    const classifyDurationMs = Date.now() - classifyStart;

    if (trace) {
      trace.classification = {
        intent: classification?.intent || null,
        urgency: classification?.urgency || null,
        leadScore: classification?.leadScore || null,
        sentiment: classification?.sentiment || null,
        ruleCount: classification?._ruleCount || null,
        durationMs: classifyDurationMs
      };
    }

    // Buscar flujo que coincida con el trigger
    const flowsEvaluated = [];
    let matchedFlowResult = null;

    for (const flow of this.activeFlows) {
      const { matched, reason } = this.matchTriggerWithReason(flow.triggerConfig, message, classification);
      if (trace) {
        flowsEvaluated.push({
          flowId: flow.id,
          name: flow.name,
          triggerType: flow.triggerConfig?.type || 'unknown',
          matched,
          reason
        });
      }
      if (matched && !matchedFlowResult) {
        matchedFlowResult = flow;
        if (!trace) break; // Without trace, stop at first match
      }
    }

    let usedDefault = false;
    if (!matchedFlowResult) {
      // Si no hay match, usar flujo por defecto si existe
      const defaultFlow = this.activeFlows.find(f => f.isDefault);
      if (defaultFlow) {
        matchedFlowResult = defaultFlow;
        usedDefault = true;
      }
    }

    if (trace) {
      trace.flowMatching = {
        activeFlowCount: this.activeFlows.length,
        flowsEvaluated,
        matchedFlow: matchedFlowResult ? { flowId: matchedFlowResult.id, name: matchedFlowResult.name, slug: matchedFlowResult.slug } : null,
        usedDefault,
        outcome: matchedFlowResult ? (usedDefault ? 'default_flow' : 'trigger_matched') : 'no_match'
      };
    }

    return matchedFlowResult || null;
  }

  /**
   * Wrapper around matchTrigger that also returns a reason string
   */
  matchTriggerWithReason(triggerConfig, message, classification) {
    if (!triggerConfig || !triggerConfig.type) {
      return { matched: false, reason: 'no trigger config or type' };
    }

    const normalizedMessage = message.toLowerCase().trim();

    switch (triggerConfig.type) {
      case 'keyword': {
        const keywords = triggerConfig.keywords || [];
        const matchedKw = keywords.find(kw => normalizedMessage.includes(kw.toLowerCase()));
        if (matchedKw) {
          return { matched: true, reason: `keyword "${matchedKw}" found in message` };
        }
        return { matched: false, reason: `no keywords matched (checked: ${keywords.join(', ')})` };
      }

      case 'classification': {
        if (!classification) return { matched: false, reason: 'no classification available' };
        const conditions = triggerConfig.conditions || {};

        if (conditions.intent) {
          const intents = Array.isArray(conditions.intent) ? conditions.intent : [conditions.intent];
          if (!intents.includes(classification.intent?.type)) {
            return { matched: false, reason: `intent "${classification.intent?.type}" not in required [${intents.join(', ')}]` };
          }
        }
        if (conditions.urgency && classification.urgency?.level !== conditions.urgency) {
          return { matched: false, reason: `urgency "${classification.urgency?.level}" != required "${conditions.urgency}"` };
        }
        if (conditions.lead_score_min && classification.leadScore?.value < conditions.lead_score_min) {
          return { matched: false, reason: `leadScore ${classification.leadScore?.value} < min ${conditions.lead_score_min}` };
        }
        return { matched: true, reason: 'all classification conditions met' };
      }

      case 'intent': {
        if (!classification || !classification.intent) {
          return { matched: false, reason: 'no classification/intent available' };
        }
        const targetIntents = triggerConfig.intents || [];
        const confidenceThreshold = triggerConfig.confidence_threshold || 0.5;
        const detectedIntent = classification.intent.type;
        const detectedConfidence = classification.intent.confidence || 0;

        if (!targetIntents.includes(detectedIntent)) {
          return { matched: false, reason: `intent "${detectedIntent}" not in targets [${targetIntents.join(', ')}]` };
        }
        if (detectedConfidence < confidenceThreshold) {
          return { matched: false, reason: `confidence ${detectedConfidence.toFixed(2)} < threshold ${confidenceThreshold}` };
        }
        return { matched: true, reason: `intent "${detectedIntent}" matched with confidence ${detectedConfidence.toFixed(2)}` };
      }

      case 'always':
        return { matched: true, reason: 'trigger type is always' };

      default:
        return { matched: false, reason: `unknown trigger type "${triggerConfig.type}"` };
    }
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

      case 'intent':
        // 🆕 Trigger simple por intent con threshold
        if (!classification || !classification.intent) return false;

        const targetIntents = triggerConfig.intents || [];
        const confidenceThreshold = triggerConfig.confidence_threshold || 0.5;

        const detectedIntent = classification.intent.type;
        const detectedConfidence = classification.intent.confidence || 0;

        // Log para debugging
        logger.debug({
          targetIntents,
          detectedIntent,
          detectedConfidence,
          confidenceThreshold
        }, 'Intent trigger evaluation');

        // Verificar si el intent detectado está en la lista y supera el threshold
        if (targetIntents.includes(detectedIntent) && detectedConfidence >= confidenceThreshold) {
          logger.info({
            detectedIntent,
            confidence: detectedConfidence,
            threshold: confidenceThreshold
          }, '🎯 Intent trigger matched');
          return true;
        }
        return false;

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

    // CARGAR DATOS GUARDADOS DEL USUARIO
    const savedFields = await this.loadContactFields(phone);
    const hasSavedData = Object.keys(savedFields).length > 0;

    // Verificar si este flujo tiene skip_if_completed habilitado
    const skipIfCompleted = flow.triggerConfig?.skip_if_completed !== false; // Por defecto true

    // Si el usuario ya tiene nombre guardado y es un flujo de greeting/onboarding,
    // usar saludo personalizado en lugar de repetir el flujo completo
    if (hasSavedData && savedFields.nombre && skipIfCompleted) {
      const isGreetingFlow = flow.triggerConfig?.type === 'keyword' &&
        (flow.triggerConfig?.keywords?.some(k => ['hola', 'hi', 'buenas', 'buenos'].includes(k.toLowerCase())) ||
         flow.slug?.includes('onboarding') || flow.slug?.includes('saludo') || flow.slug?.includes('bienvenida'));

      if (isGreetingFlow) {
        logger.info({ phone, flowId: flow.id, nombre: savedFields.nombre }, 'User already completed onboarding, sending personalized greeting');

        // Enviar saludo personalizado en lugar de repetir el flujo
        if (this.sendMessage) {
          try {
            const sid = context?.sessionId || null;
            await this.sendMessage(phone, `¡Hola de nuevo ${savedFields.nombre}! 👋 ¿En qué puedo ayudarte hoy?`, sid);
            return { type: 'personalized_greeting', user: savedFields.nombre };
          } catch (sendErr) {
            logger.error({ err: sendErr, message: sendErr?.message, phone }, 'Error enviando saludo personalizado');
            // No retornar — caer al flujo normal como fallback
          }
        } else {
          return { type: 'personalized_greeting', user: savedFields.nombre };
        }
      }
    }

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

    // Crear estado de sesión CON DATOS GUARDADOS
    const sessionState = {
      flowId: flow.id,
      flowSlug: flow.slug,
      currentNodeId: null,
      variables: {
        phone,
        initial_message: initialMessage,
        ...savedFields,  // Incluir datos guardados del usuario
        ...context
      },
      context,          // Contexto original (contiene waMsgId para typing indicator)
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
  async continueFlow(phone, message, sessionState, context, buttonId = null) {
    const flow = this.activeFlows.find(f => f.id === sessionState.flowId);

    if (!flow) {
      logger.warn({ phone, flowId: sessionState.flowId }, 'Flow not found, clearing session');
      this.sessionStates.delete(phone);
      return null;
    }

    // ========================================
    // VERIFICAR SI EL USUARIO QUIERE CAMBIAR DE TEMA
    // (solo si NO hizo clic en un botón y el mensaje es largo)
    // ========================================
    if (!buttonId && message.length > 10 && this.classifier) {
      try {
        const classification = await this.classifier.classify(message, context);
        const detectedIntent = classification?.intent?.type;
        const confidence = classification?.intent?.confidence || 0;

        // Intents de alta prioridad que interrumpen cualquier flujo
        const highPriorityIntents = ['complaint', 'support', 'sales'];

        if (highPriorityIntents.includes(detectedIntent) && confidence >= 0.6) {
          // Verificar si el flujo actual NO es de ese intent
          const currentFlowIntents = flow.triggerConfig?.intents || [];
          if (!currentFlowIntents.includes(detectedIntent)) {
            logger.info({
              phone,
              currentFlow: flow.name,
              detectedIntent,
              confidence
            }, '🔀 Usuario cambió de tema - buscando nuevo flujo');

            // Limpiar sesión actual
            this.sessionStates.delete(phone);

            // Buscar flujo que coincida con el nuevo intent
            const newFlow = this.activeFlows.find(f => {
              const intents = f.triggerConfig?.intents || [];
              return intents.includes(detectedIntent);
            });

            if (newFlow) {
              return this.startFlow(phone, newFlow, message, context);
            } else {
              // No hay flujo específico, usar fallback
              return this.handleAIFallback(phone, message, context);
            }
          }
        }
      } catch (err) {
        logger.warn({ err, phone }, 'Error checking intent during flow');
        // Continuar con el flujo normal si hay error
      }
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
        let matchedOption = null;
        const messageLower = message.toLowerCase().trim();

        // 0. PRIORITARIO: Si hay buttonId (clic en botón interactivo), buscar por ese ID
        if (buttonId) {
          matchedOption = currentNode.options.find(
            (opt, idx) => opt.value === buttonId || `opt_${idx + 1}` === buttonId
          );
          if (matchedOption) {
            logger.debug({ buttonId, matchedOption: matchedOption.label }, 'Matched option by buttonId (interactive button click)');
          }
        }

        // 1. Buscar por ID exacto en el mensaje (fallback para texto que coincide con value)
        if (!matchedOption) {
          matchedOption = currentNode.options.find(
            (opt, idx) => opt.value === message || opt.value === messageLower ||
                   `opt_${idx + 1}` === messageLower
          );
          if (matchedOption) {
            logger.debug({ matchedById: matchedOption.label }, 'Matched option by value/ID in message');
          }
        }

        // 2. Buscar por número (1, 2, 3...)
        if (!matchedOption) {
          const numericInput = parseInt(message.trim(), 10);
          if (!isNaN(numericInput) && numericInput >= 1 && numericInput <= currentNode.options.length) {
            matchedOption = currentNode.options[numericInput - 1];
            logger.debug({ numericInput, matchedOption: matchedOption?.label }, 'Matched option by number');
          }
        }

        // 3. Buscar por label exacto o value exacto
        if (!matchedOption) {
          matchedOption = currentNode.options.find(
            opt => opt.label.toLowerCase() === messageLower ||
                   opt.value?.toLowerCase() === messageLower
          );
          if (matchedOption) {
            logger.debug({ matchedByLabel: matchedOption.label }, 'Matched option by label/value');
          }
        }

        // 4. Buscar si el mensaje contiene el label
        if (!matchedOption) {
          matchedOption = currentNode.options.find(
            opt => messageLower.includes(opt.label.toLowerCase())
          );
          if (matchedOption) {
            logger.debug({ matchedByContains: matchedOption.label }, 'Matched option by contains');
          }
        }

        if (matchedOption) {
          valueToSave = matchedOption.value || matchedOption.label;
          logger.debug({ matched: matchedOption.label, value: valueToSave }, 'Option matched');
        } else {
          // No matcheó ninguna opción - Verificar si quiere cambiar de tema
          logger.info({ message, optionsCount: currentNode.options.length }, 'No option matched - checking if user wants to change topic');

          // Verificar si el usuario quiere cambiar de tema (incluso con mensajes cortos)
          if (this.classifier && message.length >= 5) {
            try {
              const classification = await this.classifier.classify(message, context);
              const detectedIntent = classification?.intent?.type;
              const confidence = classification?.intent?.confidence || 0;

              // Intents que permiten salir del flujo actual
              const escapeIntents = ['complaint', 'support', 'greeting', 'sales'];
              const currentFlowIntents = flow.triggerConfig?.intents || [];

              if (escapeIntents.includes(detectedIntent) && confidence >= 0.5 && !currentFlowIntents.includes(detectedIntent)) {
                logger.info({
                  phone,
                  currentFlow: flow.name,
                  detectedIntent,
                  confidence
                }, '🔀 Usuario quiere cambiar de tema durante pregunta');

                // Limpiar sesión actual
                this.sessionStates.delete(phone);

                // Buscar flujo que coincida con el nuevo intent
                const newFlow = this.activeFlows.find(f => {
                  const intents = f.triggerConfig?.intents || [];
                  return intents.includes(detectedIntent);
                });

                if (newFlow) {
                  return this.startFlow(phone, newFlow, message, context);
                } else {
                  return this.handleAIFallback(phone, message, context);
                }
              }
            } catch (err) {
              logger.warn({ err, phone }, 'Error checking intent during re-ask');
            }
          }

          // Si llegamos aquí, re-preguntar amablemente
          const helpMessage = '🤔 No entendí tu respuesta. Por favor selecciona una de las opciones:';

          if (this.sendMessage) {
            await this.sendMessage(phone, helpMessage);
          }

          // Re-enviar las opciones (usando botones si es posible)
          if (currentNode.options.length <= 3 && this.sendInteractiveButtons) {
            try {
              const buttons = currentNode.options.map((opt, idx) => ({
                id: opt.value || `opt_${idx + 1}`,
                title: opt.label
              }));
              const questionText = this.replaceVariables(currentNode.content || '', sessionState.variables);
              await this.sendInteractiveButtons(phone, questionText, buttons);
            } catch (err) {
              // Fallback a texto
              const optionsText = currentNode.options.map((opt, i) => `${i + 1}. ${opt.label}`).join('\n');
              await this.sendMessage(phone, optionsText);
            }
          } else if (currentNode.options.length > 3 && this.sendInteractiveList) {
            try {
              const rows = currentNode.options.map((opt, idx) => ({
                id: opt.value || `opt_${idx + 1}`,
                title: opt.label,
                description: opt.description || ''
              }));
              const questionText = this.replaceVariables(currentNode.content || '', sessionState.variables);
              await this.sendInteractiveList(phone, questionText, 'Ver opciones', [{ title: 'Opciones', rows }]);
            } catch (err) {
              const optionsText = currentNode.options.map((opt, i) => `${i + 1}. ${opt.label}`).join('\n');
              await this.sendMessage(phone, optionsText);
            }
          } else if (this.sendMessage) {
            const optionsText = currentNode.options.map((opt, i) => `${i + 1}. ${opt.label}`).join('\n');
            await this.sendMessage(phone, optionsText);
          }

          // NO avanzar - seguir esperando respuesta válida
          return {
            type: 'waiting_for_response',
            text: 'Re-asking for valid option',
            options: currentNode.options,
            variable: currentNode.variable,
            retry: true
          };
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

        // Enviar typing indicator antes del mensaje
        if (this.sendTypingIndicator && sessionState.context?.waMsgId) {
          await this.sendTypingIndicator(sessionState.context.waMsgId);
        }

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

        // Flow completed - guardar variables y marcar como completado
        await this.saveContactFields(phone, sessionState.variables);
        await this.markFlowCompleted(phone, flow.id, flow.slug);
        await this.updateLogVariables(sessionState.executionLogId, sessionState.variables);
        await this.completeExecutionLog(sessionState.executionLogId, 'completed', node.id, 'message');
        this.sessionStates.delete(phone);
        return { type: 'message_sent', text: messageText, flowCompleted: true };

      case 'question':
        const questionText = this.replaceVariables(node.content || '', sessionState.variables);

        // Enviar pregunta con opciones
        if (node.options && node.options.length > 0) {
          // Usar botones interactivos si hay 3 o menos opciones
          if (node.options.length <= 3 && this.sendInteractiveButtons) {
            try {
              const buttons = node.options.map((opt, idx) => ({
                id: opt.value || `opt_${idx + 1}`,
                title: opt.label
              }));
              await this.sendInteractiveButtons(phone, questionText, buttons);
              logger.debug({ phone, buttons: buttons.length }, 'Sent interactive buttons');
            } catch (err) {
              logger.warn({ err, phone }, 'Failed to send interactive buttons, falling back to text');
              // Fallback a texto si falla
              if (this.sendMessage) {
                await this.sendMessage(phone, questionText);
                const optionsText = node.options.map((opt, i) => `${i + 1}. ${opt.label}`).join('\n');
                await this.sendMessage(phone, optionsText);
              }
            }
          }
          // Usar lista interactiva si hay más de 3 opciones
          else if (node.options.length > 3 && this.sendInteractiveList) {
            try {
              const rows = node.options.map((opt, idx) => ({
                id: opt.value || `opt_${idx + 1}`,
                title: opt.label,
                description: opt.description || ''
              }));
              await this.sendInteractiveList(
                phone,
                questionText,
                'Ver opciones',
                [{ title: 'Opciones', rows }]
              );
              logger.debug({ phone, options: rows.length }, 'Sent interactive list');
            } catch (err) {
              logger.warn({ err, phone }, 'Failed to send interactive list, falling back to text');
              // Fallback a texto si falla
              if (this.sendMessage) {
                await this.sendMessage(phone, questionText);
                const optionsText = node.options.map((opt, i) => `${i + 1}. ${opt.label}`).join('\n');
                await this.sendMessage(phone, optionsText);
              }
            }
          }
          // Fallback: enviar como texto simple
          else if (this.sendMessage) {
            await this.sendMessage(phone, questionText);
            const optionsText = node.options.map((opt, i) => `${i + 1}. ${opt.label}`).join('\n');
            await this.sendMessage(phone, optionsText);
          }
        } else {
          // Pregunta sin opciones - solo texto
          if (this.sendMessage) {
            await this.sendMessage(phone, questionText);
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

        // Guardar variables antes de transferir
        await this.saveContactFields(phone, sessionState.variables);
        await this.updateLogVariables(sessionState.executionLogId, sessionState.variables);
        await this.completeExecutionLog(sessionState.executionLogId, 'transferred', node.id, 'transfer');
        this.sessionStates.delete(phone);
        // Extraer intent del trigger del flujo para auto-asignación de departamento
        const flowIntent = flow.triggerConfig?.intents?.[0] || null;
        return {
          type: 'transfer_to_human',
          text: transferText,
          variables: sessionState.variables,
          targetDepartmentId: node.targetDepartmentId || node.departmentId || null,
          flowIntent
        };

      case 'end':
        await logStep('Flow ended');
        // GUARDAR variables importantes del usuario para futuras interacciones
        await this.saveContactFields(phone, sessionState.variables);
        // MARCAR flujo como completado
        await this.markFlowCompleted(phone, flow.id, flow.slug);
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

          // Enviar typing indicator antes de la respuesta AI
          if (this.sendTypingIndicator && sessionState.context?.waMsgId) {
            await this.sendTypingIndicator(sessionState.context.waMsgId);
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

          // Guardar variables y marcar flujo como completado
          await this.saveContactFields(phone, sessionState.variables);
          await this.markFlowCompleted(phone, flow.id, flow.slug);
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

        if (showTyping && this.sendTypingIndicator && sessionState?.context?.waMsgId) {
          await this.sendTypingIndicator(sessionState.context.waMsgId);
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

  // ========================================
  // PERSISTENT CONTACT DATA
  // ========================================

  /**
   * Cargar custom fields guardados del contacto
   */
  async loadContactFields(phone) {
    try {
      const [rows] = await this.db.query(`
        SELECT field_name, field_value, field_type
        FROM contact_custom_fields
        WHERE phone = ?
      `, [phone]);

      const fields = {};
      for (const row of rows) {
        let value = row.field_value;
        // Parse según tipo
        if (row.field_type === 'number') value = Number(value);
        else if (row.field_type === 'boolean') value = value === 'true';
        else if (row.field_type === 'json') {
          try { value = JSON.parse(value); } catch(e) {}
        }
        fields[row.field_name] = value;
      }

      logger.debug({ phone, fieldCount: Object.keys(fields).length }, 'Loaded contact fields');
      return fields;
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE') {
        logger.error({ err, phone }, 'Error loading contact fields');
      }
      return {};
    }
  }

  /**
   * Guardar custom field del contacto
   */
  async saveContactField(phone, fieldName, value, fieldType = 'text') {
    try {
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      await this.db.query(`
        INSERT INTO contact_custom_fields (phone, field_name, field_value, field_type)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE field_value = ?, field_type = ?, updated_at = NOW()
      `, [phone, fieldName, stringValue, fieldType, stringValue, fieldType]);

      logger.debug({ phone, fieldName, value }, 'Saved contact field');
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE') {
        logger.error({ err, phone, fieldName }, 'Error saving contact field');
      }
    }
  }

  /**
   * Guardar múltiples custom fields del contacto
   */
  async saveContactFields(phone, fields) {
    const keysToSave = ['nombre', 'name', 'email', 'interes', 'interest', 'phone_number'];
    for (const [key, value] of Object.entries(fields)) {
      if (keysToSave.includes(key.toLowerCase()) && value) {
        await this.saveContactField(phone, key, value);
      }
    }
  }

  /**
   * Verificar si el contacto ya completó un flujo
   */
  async hasCompletedFlow(phone, flowId) {
    try {
      const [rows] = await this.db.query(`
        SELECT id FROM contact_completed_flows
        WHERE phone = ? AND flow_id = ?
      `, [phone, flowId]);
      return rows.length > 0;
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE') {
        logger.error({ err, phone, flowId }, 'Error checking completed flow');
      }
      return false;
    }
  }

  /**
   * Marcar flujo como completado por el contacto
   */
  async markFlowCompleted(phone, flowId, flowSlug) {
    try {
      await this.db.query(`
        INSERT INTO contact_completed_flows (phone, flow_id, flow_slug)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE completed_at = NOW()
      `, [phone, flowId, flowSlug]);
      logger.debug({ phone, flowId, flowSlug }, 'Flow marked as completed');
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE') {
        logger.error({ err, phone, flowId }, 'Error marking flow completed');
      }
    }
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
