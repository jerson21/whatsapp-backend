"use strict";

const { fetch } = require('undici');
const ConversationEngine = require('./conversation-engine');
const VisualFlowEngine = require('./visual-flow-engine');
const MessageClassifier = require('./message-classifier');

function createChatbot({ pool, logger, ssePush, sendTextViaCloudAPI }) {
  // Feature flag para flujos visuales
  const VISUAL_FLOWS_ENABLED = String(process.env.VISUAL_FLOWS_ENABLED || 'true').toLowerCase() === 'true';

  // Initialize Visual Flow Engine
  let visualFlowEngine = null;
  let messageClassifier = null;

  if (VISUAL_FLOWS_ENABLED) {
    messageClassifier = new MessageClassifier(pool);
    visualFlowEngine = new VisualFlowEngine(pool, messageClassifier, sendTextViaCloudAPI);

    // Cargar flujos activos al inicio
    visualFlowEngine.loadActiveFlows().catch(e => {
      logger.warn({ e }, 'Error loading visual flows at startup');
    });
  }
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
  const CHATBOT_MODE_DEFAULT = process.env.CHATBOT_MODE_DEFAULT || 'automatic';
  const CHATBOT_AI_MODEL = process.env.CHATBOT_AI_MODEL || 'gpt-4o-mini';
  const CHATBOT_AI_TEMPERATURE = Number(process.env.CHATBOT_AI_TEMPERATURE || 0.7);
  const CHATBOT_AI_MAX_TOKENS = Number(process.env.CHATBOT_AI_MAX_TOKENS || 500);
  const CHATBOT_AUTO_REPLY_DELAY = Number(process.env.CHATBOT_AUTO_REPLY_DELAY || 2000);
  const OPENAI_EMBEDDINGS_MODEL = process.env.OPENAI_EMBEDDINGS_MODEL || 'text-embedding-3-small';
  const RAG_ENABLED = String(process.env.RAG_ENABLED || 'false').toLowerCase() === 'true';
  const RAG_TOP_K = Math.max(1, Math.min(10, Number(process.env.RAG_TOP_K || 3)));

  // State per session
  const sessionModes = new Map(); // sessionId -> mode
  const sessionContexts = new Map(); // sessionId -> messages[]

  // Initialize ConversationEngine
  const conversationEngine = new ConversationEngine(pool);

  async function getAIResponse(messages, model = CHATBOT_AI_MODEL) {
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'sk-your-openai-api-key-here') {
      return null; // AI no configurada
    }
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: CHATBOT_AI_TEMPERATURE,
          max_tokens: CHATBOT_AI_MAX_TOKENS
        })
      });
      if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
      const data = await response.json();
      return data.choices[0]?.message?.content || null;
    } catch (e) {
      logger.error({ e }, 'OpenAI API error');
      return null;
    }
  }

  function normalizeStyle(styleIn) {
    const s = styleIn && typeof styleIn === 'object' ? styleIn : {};
    return {
      audiencia: s.audiencia || 'operador',
      proposito: s.proposito || 'formular_pregunta',
      longitud: s.longitud || 'corta',
      cantidad: Math.min(Math.max(Number(s.cantidad || 3), 1), 5),
      trato: s.trato || 'tu',
      tono: s.tono || 'neutral'
    };
  }

  async function generateOperatorSuggestions(userText, style, contexts) {
    const s = normalizeStyle(style);
    const maxLen = s.longitud === 'corta' ? 180 : 280;
    const trato = s.trato === 'usted' ? 'usted' : 'tú';
    const ctxLines = (Array.isArray(contexts) ? contexts : []).map(c => `- ${c.title || 'Contexto'}: ${String(c.content || '').slice(0, 400)}`);
    const messages = [
      {
        role: 'system',
        content: [
          'Eres un asistente que ayuda a un operador humano a redactar mensajes de WhatsApp para clientes.',
          'Objetivo: generar frases cortas, directas y listas para enviar.',
          `Estilo: ${s.tono}, trato de "${trato}", máximo ${maxLen} caracteres por opción.`,
          'No agregues saludos ni meta-texto. No expliques. No incluyas despedidas innecesarias.',
          'Responde SOLO en JSON con la forma {"variants":["..."]} con la cantidad solicitada.',
          ctxLines.length ? `Contexto relevante (no inventes fuera de esto):\n${ctxLines.join('\n')}` : ''
        ].join(' ')
      },
      {
        role: 'user',
        content: [
          `Instrucción del operador: ${String(userText)}`,
          `Cantidad de opciones: ${s.cantidad}.`
        ].join('\n')
      }
    ];
    const raw = await getAIResponse(messages);
    let variants = [];
    try {
      const j = JSON.parse(raw || '{}');
      if (Array.isArray(j.variants)) variants = j.variants.filter(v => typeof v === 'string');
    } catch {}
    if (!variants.length && raw) {
      variants = String(raw).split('\n').map(x => x.trim()).filter(Boolean).slice(0, s.cantidad);
    }
    return { variants: variants.slice(0, s.cantidad) };
  }

  async function generateCustomerReply(userText, style, contexts) {
    const s = normalizeStyle(style);
    const maxLen = s.longitud === 'corta' ? 200 : 320;
    const trato = s.trato === 'usted' ? 'usted' : 'tú';
    const ctxLines = (Array.isArray(contexts) ? contexts : []).map(c => `- ${c.title || 'Contexto'}: ${String(c.content || '').slice(0, 400)}`);
    const messages = [
      {
        role: 'system',
        content: [
          'Eres un asistente que redacta respuestas breves para clientes por WhatsApp.',
          `Estilo: ${s.tono}, trato de "${trato}", máximo ${maxLen} caracteres, 1 sola respuesta.`,
          'No agregues meta-texto. Responde SOLO con el contenido final (sin JSON).',
          ctxLines.length ? `Contexto relevante (no inventes fuera de esto):\n${ctxLines.join('\n')}` : ''
        ].join(' ')
      },
      { role: 'user', content: String(userText) }
    ];
    const text = await getAIResponse(messages);
    return { text: (text || '').trim() };
  }

  async function handleChatbotMessage({ sessionId, phone, text, buttonId }) {
    try {
      logger.info({ sessionId, phone, text: text?.slice(0, 50) }, '🤖 handleChatbotMessage INICIADO');
      
      const normalized = String(text || '').trim();
      if (!normalized) {
        logger.info({ sessionId, phone }, '🤖 Mensaje vacío, saliendo');
        return;
      }

      // Obtener modo de la sesión (si no está en memoria, cargar de BD)
      // Normalizar sessionId para consistencia (siempre como número)
      const sessionIdNum = Number(sessionId);
      let mode = sessionModes.get(sessionIdNum);
      if (!mode) {
        try {
          const [[row]] = await pool.query(`SELECT chatbot_mode FROM chat_sessions WHERE id=?`, [sessionId]);
          mode = row?.chatbot_mode || CHATBOT_MODE_DEFAULT;
          sessionModes.set(sessionIdNum, mode);
          logger.info({ sessionId, mode, default: CHATBOT_MODE_DEFAULT }, '🤖 Modo cargado de BD');
        } catch (e) {
          mode = CHATBOT_MODE_DEFAULT;
          logger.warn({ sessionId, error: e.message, mode }, '🤖 Error cargando modo, usando default');
        }
      } else {
        logger.info({ sessionId, mode }, '🤖 Modo desde memoria');
      }

      // Obtener contexto de la sesión (últimos turnos)
      let context = sessionContexts.get(sessionIdNum) || [];

      // Agregar mensaje del usuario al contexto
      context.push({ role: 'user', content: text });

      // Mantener solo los últimos 10 mensajes
      if (context.length > 10) context = context.slice(-10);
      sessionContexts.set(sessionIdNum, context);

      let reply = null;
      let isAISuggestion = false;
      let requiresHuman = false;

      // 🆕 INTENTAR FLUJO VISUAL PRIMERO (si está habilitado)
      if (VISUAL_FLOWS_ENABLED && visualFlowEngine && mode !== 'manual') {
        try {
          const flowResult = await visualFlowEngine.processMessage(phone, normalized, {
            sessionId,
            phone
          });

          if (flowResult) {
            logger.info({ phone, flowResult: flowResult.type }, '🎯 Visual flow handled message');

            // Si el flujo manejó el mensaje, salir
            if (flowResult.type === 'waiting_for_response') {
              // El flujo envió mensaje y espera respuesta
              ssePush(sessionId, {
                type: 'visual_flow_active',
                flowState: 'waiting',
                message: 'Flujo visual activo - esperando respuesta del cliente'
              });
              return;
            }

            if (flowResult.type === 'transfer_to_human') {
              // Transferir a humano
              ssePush(sessionId, {
                type: 'visual_flow_transfer',
                variables: flowResult.variables,
                message: 'Cliente transferido por flujo visual'
              });
              // Cambiar modo a manual para que humano tome el control
              sessionModes.set(sessionIdNum, 'manual');
              await pool.query(`UPDATE chat_sessions SET chatbot_mode='manual' WHERE id=?`, [sessionId]);
              return;
            }

            if (flowResult.type === 'flow_completed' || flowResult.type === 'message_sent') {
              // Flujo completado
              ssePush(sessionId, {
                type: 'visual_flow_completed',
                message: 'Flujo visual completado'
              });
              return;
            }
          }
        } catch (e) {
          logger.error({ e, phone }, 'Error in visual flow engine');
          // Continuar con el chatbot tradicional si falla el flujo visual
        }
      }

      if (mode === 'manual') {
        logger.info({ sessionId, mode }, '🤖 Modo MANUAL - No respondiendo automáticamente');
        ssePush(sessionId, { type: 'ai_mode', mode: 'manual', message: 'Nuevo mensaje recibido - Responde manualmente' });
        return;
      } else if (mode === 'assisted' || mode === 'automatic') {
        logger.info({ sessionId, mode }, '🤖 Modo ASISTIDO/AUTOMÁTICO - Procesando...');
        // Intent para filtrar KB (si existe)
        let lastIntent = null;
        try {
          const [[rowIntent]] = await pool.query(`SELECT last_intent FROM chat_sessions WHERE id=?`, [sessionId]);
          lastIntent = rowIntent?.last_intent || null;
        } catch {}
        let contexts = []; // No usamos RAG, todo viene de la BD

        if (mode === 'assisted') {
          const { variants } = await generateOperatorSuggestions(text, { cantidad: 3, longitud: 'corta', trato: 'tu', tono: 'neutral' }, contexts);
          if (variants && variants.length) {
            isAISuggestion = true;
            ssePush(sessionId, { type: 'ai_suggestion', suggestion: variants[0], variants, canEdit: true, kbHitIds: contexts.map(c => c.id) });
            return;
          }
          ssePush(sessionId, { type: 'ai_mode', mode: 'manual', message: 'No hay sugerencias. Responde manualmente.' });
          return;
        }

        // mode === 'automatic': PRIMERO verificar si es primera respuesta, luego buscar contexto de plantilla
        
        // 🆕 VERIFICAR SI ES LA PRIMERA RESPUESTA DEL BOT (MOVER AQUÍ PARA EJECUTAR SIEMPRE)
        let isFirstResponse = false;
        try {
          isFirstResponse = await conversationEngine.isFirstBotResponse(sessionId);
        } catch (e) {
          logger.debug({ error: e.message?.substring(0, 100), sessionId }, '⚠️ Error verificando primera respuesta - asumiendo que no es primera vez');
          isFirstResponse = false; // Si hay error, asumir que no es primera vez para evitar spam
        }
        
        if (isFirstResponse) {
          logger.info({ sessionId, isFirstResponse }, '🤖 Primera respuesta del bot - enviando introducción ANTES de procesar');
          
          // Mensaje 1: Introducción del asistente virtual
          const introMessage = '¡Hola! 👋 Soy tu asistente virtual y te ayudaré en primera instancia. Si hay algo que no sepa, te derivaré con un agente humano.';
          
          logger.info({ sessionId, introMessage }, '🤖 Enviando mensaje de introducción');
          if (CHATBOT_AUTO_REPLY_DELAY > 0) await new Promise(r => setTimeout(r, CHATBOT_AUTO_REPLY_DELAY));
          const introWaMsgId = await sendTextViaCloudAPI(phone, introMessage);
          
          // Guardar mensaje de introducción en BD
          const [introResult] = await pool.query(
            `INSERT INTO chat_messages (session_id, direction, text, wa_jid, wa_msg_id, status, is_ai_generated) VALUES (?,?,?,?,?,?,?)`,
            [sessionId, 'out', introMessage, phone, introWaMsgId, 'sent', 1]
          );
          
          // Agregar al contexto
          context.push({ role: 'assistant', content: introMessage });
          
          // Notificar al frontend
          const introMessageId = introResult.insertId;
          ssePush(sessionId, { type: 'message', direction: 'out', text: introMessage, msgId: introWaMsgId, dbId: introMessageId, status: 'sent', isAI: true, at: Date.now() });
          
          logger.info({ sessionId, introWaMsgId, introMessageId }, '🤖 ✅ Mensaje de introducción enviado');
          
          // Marcar que ya se envió la primera respuesta (con manejo defensivo)
          try {
            await conversationEngine.markFirstBotResponseSent(sessionId);
          } catch (e) {
            logger.debug({ error: e.message?.substring(0, 100), sessionId }, '⚠️ Error marcando primera respuesta - continuando');
          }
          
          // Esperar un poco antes del segundo mensaje
          await new Promise(r => setTimeout(r, 1500));
        }
        
        // 🎯 NUEVO SISTEMA DE FLUJOS CONVERSACIONALES INTELIGENTES
        try {
          logger.info({ sessionId, text }, '🎯 Iniciando ConversationEngine...');
          
          // Buscar template reciente para determinar contexto
          const [templateRows] = await pool.query(`
            SELECT cm.created_at, cm.text as template_info, 
                   TIMESTAMPDIFF(HOUR, cm.created_at, NOW()) as hours_ago
            FROM chat_messages cm 
            WHERE cm.session_id = ? 
              AND cm.direction = 'out' 
              AND cm.text LIKE '%[TEMPLATE:%'
            ORDER BY cm.created_at DESC 
            LIMIT 1
          `, [sessionId]);

          if (templateRows.length > 0) {
            // Extraer nombre de template
            const templateInfo = templateRows[0].template_info || '';
            const templateMatch = templateInfo.match(/\[TEMPLATE:(\w+)/i);
            
            if (templateMatch) {
              const templateName = templateMatch[1];
              const hoursAgo = templateRows[0].hours_ago;
              
              logger.info({ 
                sessionId, 
                templateName, 
                hoursAgo,
                templateInfo: templateInfo.slice(0, 100) 
              }, '🎯 Template encontrado, procesando con ConversationEngine');
              
              // Verificar si el contexto aún es válido (dentro de 72 horas por defecto)
              if (hoursAgo <= 72) {
                // Usar buttonId si está disponible (como en producción), sino text
                const messageForProcessing = buttonId || text;
                
                const conversationResponse = await conversationEngine.processMessage(
                  sessionId, 
                  templateName, 
                  messageForProcessing, 
                  phone
                );
                
                if (conversationResponse) {
                  // 🚫 Verificar si la respuesta fue silenciada por escalamiento
                  if (conversationResponse.silenced) {
                    logger.info({ sessionId }, '🚫 Respuesta silenciada - sesión escalada, no enviando mensaje automático');
                    return; // Salir sin enviar respuesta
                  }
                  
                  reply = conversationResponse.text;
                  isAISuggestion = !conversationResponse.isConversationFlow;
                  requiresHuman = conversationResponse.shouldEscalate;
                  
                  logger.info({ 
                    sessionId, 
                    templateName,
                    isConversationFlow: conversationResponse.isConversationFlow,
                    shouldEscalate: conversationResponse.shouldEscalate,
                    processingTime: conversationResponse.processingTime,
                    reply: reply ? reply.slice(0, 100) : 'null'
                  }, '🎯 ✅ ConversationEngine generó respuesta');
                  
                  if (conversationResponse.shouldEscalate) {
                    // Cambiar a modo manual
                    await pool.query(`UPDATE chat_sessions SET chatbot_mode = 'manual' WHERE id = ?`, [sessionId]);
                    sessionModes.set(sessionId, 'manual');
                    
                    // 🚫 IMPORTANTE: También marcar como escalado para silenciar IA
                    // Hacer UPDATE defensivo en caso de que los campos no existan aún
                    try {
                      await pool.query(`
                        UPDATE chat_sessions 
                        SET escalation_status = 'ESCALATED',
                            escalation_reason = ?,
                            escalated_at = NOW()
                        WHERE id = ?
                      `, [conversationResponse.escalationReason || 'Escalado por sistema', sessionId]);
                      
                      logger.info({ 
                        sessionId, 
                        reason: conversationResponse.escalationReason 
                      }, '🚫 Sesión marcada como ESCALATED - IA silenciada');
                    } catch (e) {
                      // Si los campos no existen, continuar sin error
                      logger.debug({ 
                        error: e.message?.substring(0, 100), 
                        sessionId 
                      }, '🚫 No se pudo marcar escalamiento (campos pueden no existir)');
                    }
                    
                    logger.info({ sessionId, reason: conversationResponse.escalationReason }, '🎯 Escalando a humano según ConversationEngine');
                  }
                }
              } else {
                logger.info({ sessionId, templateName, hoursAgo }, '🎯 Template encontrado pero contexto expirado');
              }
            }
          } else {
            logger.info({ sessionId }, '🎯 No se encontraron templates recientes');
          }
        } catch (e) {
          logger.error({ error: e.message, sessionId }, '🎯 Error en ConversationEngine, continuando con lógica normal');
        }
        
        // Si no hay respuesta de plantilla, continuar con lógica normal
        if (!reply) {
        
        // 🚨 Detectar si cliente quiere hablar con humano
        if (/(hablar con.*persona|agente|operador|humano|representante)/i.test(text)) {
          await pool.query(`UPDATE chat_sessions SET chatbot_mode = 'manual' WHERE id = ?`, [sessionId]);
          sessionModes.set(sessionId, 'manual');
          reply = 'Te conecto con un agente humano. Un momento por favor...';
          isAISuggestion = false;
          requiresHuman = true;
          logger.info({ sessionId, phone }, '🤖 Cliente solicita agente humano, cambiando a manual');
        } else {
        
        try {
          logger.info({ sessionId, text }, '🤖 Iniciando búsqueda en FAQ...');
          logger.info({ sessionId }, '🤖 DEBUG: Antes de consulta FAQ');
          
          // Buscar en FAQ desde la base de datos
          const [faqRows] = await pool.query(`
            SELECT question, answer 
            FROM faq_entries 
            WHERE active = 1 
            ORDER BY created_at DESC
          `);
          
          logger.info({ sessionId, faqCount: faqRows.length }, '🤖 FAQs encontradas en BD');
          logger.info({ sessionId }, '🤖 DEBUG: Después de consulta FAQ, iniciando búsqueda');
          
          let foundFAQ = false;
          
          // Buscar coincidencias en las FAQs de la BD
          let bestMatch = null;
          let bestScore = 0;
          
          for (const faq of faqRows) {
            const questionLower = faq.question.toLowerCase();
            const textLower = text.toLowerCase();
            
            // Palabras clave importantes para búsqueda
            const importantWords = ['pedido', 'orden', 'envio', 'despacho', 'precio', 'costo', 'horario', 'ubicacion', 'pago', 'cuotas', 'stock', 'cambio', 'garantia'];
            
            // Buscar palabras clave coincidentes
            const questionWords = questionLower.split(/\s+/).filter(w => w.length > 2);
            const textWords = textLower.split(/\s+/).filter(w => w.length > 2);
            
            let score = 0;
            
            // Dar más peso a palabras importantes
            for (const word of textWords) {
              if (importantWords.includes(word)) {
                if (questionWords.some(qw => qw.includes(word) || word.includes(qw))) {
                  score += 3; // Mayor peso para palabras importantes
                }
              } else if (questionWords.some(qw => qw.includes(word) || word.includes(qw))) {
                score += 1;
              }
            }
            
            // Coincidencia exacta de frase
            if (questionLower.includes(textLower) || textLower.includes(questionLower)) {
              score += 5;
            }
            
            // Guardar mejor coincidencia
            if (score > bestScore) {
              bestScore = score;
              bestMatch = faq;
            }
          }
          
          // Solo responder si hay una buena coincidencia
          if (bestMatch && bestScore >= 2) {
            reply = String(bestMatch.answer).trim();
            foundFAQ = true;
            logger.info({ sessionId, phone, text, faq: bestMatch.question, score: bestScore, reply: reply.slice(0, 100) }, 'Respuesta automática desde FAQ de BD');
          }
          
          if (!foundFAQ) {
            logger.info({ sessionId, text }, '🤖 No se encontró FAQ, buscando intenciones...');
            logger.info({ sessionId }, '🤖 DEBUG: Antes de consulta intenciones');
            
            // Buscar en intenciones configuradas de la BD
            const [intentionRows] = await pool.query(`
              SELECT name, response_template, requires_human, keywords 
              FROM chatbot_intentions 
              WHERE active = 1 
              ORDER BY priority DESC
            `);
            
            logger.info({ sessionId, intentionCount: intentionRows.length }, '🤖 Intenciones encontradas en BD');
            logger.info({ sessionId }, '🤖 DEBUG: Después de consulta intenciones, iniciando detección');
            
            let detectedIntention = null;
            let confidence = 0;
            
            for (const intention of intentionRows) {
              let keywords = [];
              try {
                keywords = typeof intention.keywords === 'string' 
                  ? JSON.parse(intention.keywords) 
                  : Array.isArray(intention.keywords) 
                    ? intention.keywords 
                    : [];
              } catch (e) {
                logger.warn(`Error parsing keywords for intention ${intention.name}:`, e.message);
                continue;
              }
              
              const textLower = text.toLowerCase();
              let matches = 0;
              
              for (const keyword of keywords) {
                if (textLower.includes(keyword.toLowerCase())) {
                  matches++;
                }
              }
              
              if (matches > 0) {
                const currentConfidence = matches / keywords.length;
                if (currentConfidence > confidence) {
                  confidence = currentConfidence;
                  detectedIntention = intention;
                }
              }
            }
            
            if (detectedIntention && confidence > 0.3) {
              reply = detectedIntention.response_template || null;
              requiresHuman = detectedIntention.requires_human || false;
              logger.info({ 
                sessionId, phone, text, 
                intention: detectedIntention.name, 
                confidence: Math.round(confidence * 100),
                requiresHuman 
              }, 'Respuesta desde intención de BD');
            }
            
            // Si no hay FAQ ni intención, obtener fallback_message de la configuración
            if (!reply) {
              logger.info({ sessionId }, '🤖 DEBUG: No hay reply, obteniendo fallback');
              const [configRows] = await pool.query('SELECT fallback_message FROM chatbot_config ORDER BY id DESC LIMIT 1');
              reply = configRows.length > 0 && configRows[0].fallback_message 
                ? configRows[0].fallback_message 
                : 'Gracias por tu mensaje. Un representante te atenderá pronto.';
              requiresHuman = true; // Si no entiende, derivar a humano
              logger.info({ sessionId, phone, text }, 'Usando fallback_message de configuración');
            }
          }
        } catch (e) {
          logger.error({ e, sessionId, phone, text }, 'Error procesando mensaje');
          // Solo en caso de error crítico, usar mensaje mínimo
          const [configRows] = await pool.query('SELECT fallback_message FROM chatbot_config ORDER BY id DESC LIMIT 1');
          reply = configRows.length > 0 && configRows[0].fallback_message 
            ? configRows[0].fallback_message 
            : 'Error procesando mensaje. Un representante te atenderá pronto.';
          requiresHuman = true;
        }
        } // Cerrar el if (!reply) - contexto de plantilla
        } // Cerrar el else del bloque "hablar con persona"
      }

      if (reply && mode === 'automatic') {
        logger.info({ sessionId, reply: reply?.slice(0, 100), isAISuggestion, delay: CHATBOT_AUTO_REPLY_DELAY }, '🤖 Enviando respuesta automática');
        
        if (CHATBOT_AUTO_REPLY_DELAY > 0) await new Promise(r => setTimeout(r, CHATBOT_AUTO_REPLY_DELAY));
        const waMsgId = await sendTextViaCloudAPI(phone, reply);
        const [result] = await pool.query(
          `INSERT INTO chat_messages (session_id, direction, text, wa_jid, wa_msg_id, status, is_ai_generated) VALUES (?,?,?,?,?,?,?)`,
          [sessionId, 'out', reply, phone, waMsgId, 'sent', isAISuggestion ? 1 : 0]
        );
        context.push({ role: 'assistant', content: reply });
        sessionContexts.set(sessionIdNum, context);
        const messageId = result.insertId;
        ssePush(sessionId, { type: 'message', direction: 'out', text: reply, msgId: waMsgId, dbId: messageId, status: 'sent', isAI: isAISuggestion, at: Date.now() });
        
        logger.info({ sessionId, waMsgId, messageId }, '🤖 ✅ Respuesta enviada correctamente');
      } else if (reply) {
        logger.info({ sessionId, mode, reply: reply?.slice(0, 100) }, '🤖 Respuesta generada pero no enviada (modo no automático)');
      } else {
        logger.info({ sessionId, mode }, '🤖 No se generó respuesta');
      }
    } catch (e) {
      logger.error({ e }, 'handleChatbotMessage error');
    }
  }

  function registerRoutes(app, panelAuth) {
    app.post('/api/chat/bot-toggle', async (req, res) => {
      try {
        const { sessionId, token, enabled } = req.body || {};
        if (!sessionId || !token || typeof enabled !== 'boolean') return res.status(400).json({ ok: false, error: 'Faltan campos' });
        const [rows] = await pool.query(`SELECT id FROM chat_sessions WHERE id=? AND token=? AND status='OPEN' LIMIT 1`, [Number(sessionId), String(token)]);
        if (!rows.length) return res.status(401).json({ ok: false, error: 'Sesión inválida' });
        await pool.query(`UPDATE chat_sessions SET chatbot_enabled=? WHERE id=?`, [enabled, Number(sessionId)]);
        res.json({ ok: true, sessionId: Number(sessionId), chatbotEnabled: enabled });
      } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
    });

    app.post('/api/chat/bot-mode', async (req, res) => {
      try {
        const { sessionId, token, mode } = req.body || {};
        if (!sessionId || !token || !mode) return res.status(400).json({ ok: false, error: 'Faltan campos' });
        if (!['manual', 'assisted', 'automatic'].includes(mode)) return res.status(400).json({ ok: false, error: 'Modo inválido' });
        const [rows] = await pool.query(`SELECT id FROM chat_sessions WHERE id=? AND token=? AND status='OPEN' LIMIT 1`, [Number(sessionId), String(token)]);
        if (!rows.length) return res.status(401).json({ ok: false, error: 'Sesión inválida' });
        await pool.query(`UPDATE chat_sessions SET chatbot_mode=? WHERE id=?`, [mode, Number(sessionId)]);
        sessionModes.set(Number(sessionId), mode);
        ssePush(Number(sessionId), { type: 'mode_changed', mode, at: Date.now() });
        res.json({ ok: true, sessionId: Number(sessionId), mode });
      } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
    });

    app.post('/api/chat/send-reply', async (req, res) => {
      try {
        const { sessionId, token, text, useAISuggestion } = req.body || {};
        if (!sessionId || !token || !text) return res.status(400).json({ ok: false, error: 'Faltan campos' });
        const [rows] = await pool.query(`SELECT id, phone FROM chat_sessions WHERE id=? AND token=? AND status='OPEN' LIMIT 1`, [Number(sessionId), String(token)]);
        if (!rows.length) return res.status(401).json({ ok: false, error: 'Sesión inválida' });
        const phone = rows[0].phone;
        
        // 🤖 Cuando agente humano envía mensaje, cambiar a modo manual inmediatamente
        await pool.query(
          `UPDATE chat_sessions SET chatbot_mode = 'manual' WHERE id = ?`,
          [sessionId]
        );
        setSessionMode(Number(sessionId), 'manual'); // Actualizar cache en memoria
        
        const waMsgId = await sendTextViaCloudAPI(phone, text);
        const [result] = await pool.query(
          `INSERT INTO chat_messages (session_id, direction, text, wa_jid, wa_msg_id, status, is_ai_generated) VALUES (?,?,?,?,?,?,?)`,
          [sessionId, 'out', text, phone, waMsgId, 'sent', useAISuggestion ? 1 : 0]
        );
        const context = sessionContexts.get(Number(sessionId)) || [];
        context.push({ role: 'assistant', content: text });
        sessionContexts.set(Number(sessionId), context);
        const messageId = result.insertId;
        ssePush(Number(sessionId), { type: 'message', direction: 'out', text, msgId: waMsgId, dbId: messageId, status: 'sent', isAI: Boolean(useAISuggestion), at: Date.now() });
        res.json({ ok: true, messageId, waMsgId, sent: true });
      } catch (e) { logger.error({ e }, 'send-reply error'); res.status(500).json({ ok: false, error: e.message }); }
    });

    app.post('/api/chat/get-ai-suggestion', async (req, res) => {
      try {
        const { sessionId, token, text, style } = req.body || {};
        if (!sessionId || !token || !text) return res.status(400).json({ ok: false, error: 'Faltan campos' });
        const [rows] = await pool.query(`SELECT id FROM chat_sessions WHERE id=? AND token=? AND status='OPEN' LIMIT 1`, [Number(sessionId), String(token)]);
        if (!rows.length) return res.status(401).json({ ok: false, error: 'Sesión inválida' });
        const s = normalizeStyle(style);
        let lastIntent = null;
        try {
          const [[rowIntent]] = await pool.query(`SELECT last_intent FROM chat_sessions WHERE id=?`, [sessionId]);
          lastIntent = rowIntent?.last_intent || null;
        } catch {}
        let contexts = []; // No usamos RAG, todo viene de la BD
        if (s.audiencia === 'cliente' && s.cantidad === 1) {
          const { text: sug } = await generateCustomerReply(text, s, contexts);
          if (!sug) return res.json({ ok: true, suggestion: '¿Podrías darme más detalles?', isAI: false });
          return res.json({ ok: true, suggestion: sug, isAI: true, kbHitIds: contexts.map(c => c.id) });
        } else {
          const { variants } = await generateOperatorSuggestions(text, s, contexts);
          if (!variants || !variants.length) {
            return res.json({ ok: true, variants: [ '¿Puedes confirmar?', '¿Podrías detallar un poco más?' ], suggestion: '¿Puedes confirmar?', isAI: false, kbHitIds: contexts.map(c => c.id) });
          }
          return res.json({ ok: true, variants, suggestion: variants[0], isAI: true, kbHitIds: contexts.map(c => c.id) });
        }
      } catch (e) { logger.error({ e }, 'get-ai-suggestion error'); res.status(500).json({ ok: false, error: e.message }); }
    });
  }

  // Función para actualizar el modo de sesión desde fuera del módulo
  function setSessionMode(sessionId, mode) {
    sessionModes.set(sessionId, mode);
    logger.info({ sessionId, mode }, '🤖 Modo de sesión actualizado externamente');
  }

  // Función para recargar flujos visuales
  async function reloadVisualFlows() {
    if (visualFlowEngine) {
      await visualFlowEngine.loadActiveFlows();
      logger.info('🔄 Visual flows reloaded');
      return true;
    }
    return false;
  }

  // Obtener motor de flujos para uso externo
  function getVisualFlowEngine() {
    return visualFlowEngine;
  }

  return { registerRoutes, handleChatbotMessage, setSessionMode, reloadVisualFlows, getVisualFlowEngine };
}

module.exports = { createChatbot };


