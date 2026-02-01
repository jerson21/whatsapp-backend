"use strict";

/**
 * Chatbot Module - VERSIÓN LIMPIA
 *
 * Solo usa Visual Flow Engine + MessageClassifier
 * TODO el código legacy (FAQ, Intentions, ConversationEngine) ha sido ELIMINADO
 */

const VisualFlowEngine = require('./visual-flow-engine');
const MessageClassifier = require('./message-classifier');

function createChatbot({ pool, logger, ssePush, sendTextViaCloudAPI, sendInteractiveButtons, sendInteractiveList, sendTypingIndicator, emitFlowEvent, autoAssignDepartment, knowledgeRetriever }) {
  // Configuración
  const CHATBOT_MODE_DEFAULT = process.env.CHATBOT_MODE_DEFAULT || 'automatic';
  const CHATBOT_AUTO_REPLY_DELAY = Number(process.env.CHATBOT_AUTO_REPLY_DELAY || 1000);

  // Toggle global para habilitar/deshabilitar visual flows (puede cambiarse en runtime)
  let visualFlowsGlobalEnabled = String(process.env.VISUAL_FLOWS_ENABLED || 'true').toLowerCase() === 'true';

  // State per session
  const sessionModes = new Map(); // sessionId -> mode

  // Initialize Visual Flow Engine y MessageClassifier
  const messageClassifier = new MessageClassifier(pool);
  const visualFlowEngine = new VisualFlowEngine(
    pool,
    messageClassifier,
    sendTextViaCloudAPI,
    emitFlowEvent,
    sendInteractiveButtons,
    sendInteractiveList,
    knowledgeRetriever || null,
    sendTypingIndicator || null
  );

  // Cargar flujos activos al inicio
  visualFlowEngine.loadActiveFlows().catch(e => {
    logger.warn({ err: e, message: e?.message }, 'Error loading visual flows at startup');
  });

  // Cargar reglas del clasificador al inicio
  messageClassifier.loadRules().catch(e => {
    logger.warn({ err: e, message: e?.message }, 'Error loading classifier rules at startup');
  });

  /**
   * Manejar mensaje entrante
   * FLUJO SIMPLE:
   * 1. Si mode='manual' → No responder, solo notificar
   * 2. Intentar Visual Flow Engine
   * 3. Si no hay match → Enviar fallback
   */
  async function handleChatbotMessage({ sessionId, phone, text, buttonId, waMsgId }) {
    try {
      logger.info({ sessionId, phone, text: text?.slice(0, 50) }, '🤖 handleChatbotMessage INICIADO');

      const normalized = String(text || '').trim();
      if (!normalized) {
        logger.debug({ sessionId, phone }, '🤖 Mensaje vacío, ignorando');
        return;
      }

      // Obtener modo de la sesión
      const sessionIdNum = Number(sessionId);
      let mode = sessionModes.get(sessionIdNum);

      if (!mode) {
        try {
          const [[row]] = await pool.query(`SELECT chatbot_mode FROM chat_sessions WHERE id=?`, [sessionId]);
          mode = row?.chatbot_mode || CHATBOT_MODE_DEFAULT;
          sessionModes.set(sessionIdNum, mode);
          logger.info({ sessionId, mode }, '🤖 Modo cargado de BD');
        } catch (e) {
          mode = CHATBOT_MODE_DEFAULT;
          logger.warn({ sessionId, error: e.message, mode }, '🤖 Error cargando modo, usando default');
        }
      } else {
        logger.debug({ sessionId, mode }, '🤖 Modo desde memoria');
      }

      // ========================================
      // MODO MANUAL: No responder automáticamente
      // ========================================
      if (mode === 'manual') {
        logger.info({ sessionId, mode }, '🤖 Modo MANUAL - No respondiendo automáticamente');
        ssePush(sessionId, {
          type: 'ai_mode',
          mode: 'manual',
          message: 'Nuevo mensaje recibido - Responde manualmente'
        });
        return;
      }

      // ========================================
      // VERIFICAR SI VISUAL FLOWS ESTÁ HABILITADO GLOBALMENTE
      // ========================================
      if (!visualFlowsGlobalEnabled) {
        logger.info({ sessionId, mode }, '🤖 Visual Flows DESHABILITADO globalmente - no respondiendo');
        ssePush(sessionId, {
          type: 'visual_flows_disabled',
          mode: 'off',
          message: 'Visual Flows deshabilitado - modo manual activo'
        });
        return;
      }

      // ========================================
      // MODO ASSISTED/AUTOMATIC: Usar Visual Flow Engine
      // ========================================
      logger.info({ sessionId, mode, phone, buttonId }, '🤖 Procesando con Visual Flow Engine...');

      try {
        const flowResult = await visualFlowEngine.processMessage(phone, normalized, {
          sessionId,
          phone,
          buttonId, // ID del botón interactivo si el usuario presionó uno
          waMsgId   // ID del mensaje entrante para typing indicator
        });

        if (flowResult) {
          logger.info({ phone, flowResult: flowResult.type }, '🎯 Visual Flow manejó el mensaje');

          switch (flowResult.type) {
            case 'waiting_for_response':
              ssePush(sessionId, {
                type: 'visual_flow_active',
                flowState: 'waiting',
                message: 'Flujo visual activo - esperando respuesta del cliente'
              });
              return;

            case 'transfer_to_human':
              ssePush(sessionId, {
                type: 'visual_flow_transfer',
                variables: flowResult.variables,
                reason: flowResult.reason || 'flow_triggered',
                message: flowResult.reason === 'user_requested'
                  ? 'Cliente solicitó hablar con agente'
                  : 'Cliente transferido por flujo visual'
              });
              // Cambiar a modo manual
              sessionModes.set(sessionIdNum, 'manual');
              await pool.query(`UPDATE chat_sessions SET chatbot_mode='manual', escalation_status='ESCALATED', escalated_at=NOW() WHERE id=?`, [sessionId]);
              // Auto-asignar departamento + agente menos ocupado
              try {
                if (typeof autoAssignDepartment === 'function') {
                  if (flowResult.targetDepartmentId) {
                    // Flow especificó departamento → asignar ese + agente
                    await autoAssignDepartment(sessionId, null, flowResult.targetDepartmentId);
                  } else {
                    // Usar intent del flujo que disparó el transfer, o fallback a 'general'
                    const intent = flowResult.flowIntent || 'general';
                    logger.info({ sessionId, intent }, 'Auto-asignando departamento por intent del flujo');
                    await autoAssignDepartment(sessionId, intent);
                  }
                }
              } catch (e) {
                logger.error({ err: e, sessionId }, 'Error en auto-asignación desde chatbot');
              }
              return;

            case 'flow_completed':
            case 'message_sent':
            case 'ai_response_sent':
              ssePush(sessionId, {
                type: 'visual_flow_completed',
                message: 'Flujo visual completado'
              });
              return;

            case 'global_keyword':
              ssePush(sessionId, {
                type: 'global_keyword_triggered',
                action: flowResult.action,
                message: `Keyword global activada: ${flowResult.action}`
              });
              return;

            case 'session_ended':
              ssePush(sessionId, {
                type: 'session_ended',
                message: 'Usuario terminó la conversación'
              });
              return;

            case 'ai_fallback':
              // Notificar cada mensaje IA guardado en BD al frontend
              if (flowResult.sentMessages && flowResult.sentMessages.length > 0) {
                for (const msg of flowResult.sentMessages) {
                  ssePush(sessionId, {
                    type: 'message',
                    direction: 'out',
                    text: msg.text,
                    msgId: msg.waMsgId,
                    dbId: msg.dbId,
                    status: 'sent',
                    isAI: true,
                    at: Date.now()
                  });
                }
              }
              return;

            case 'personalized_greeting':
              ssePush(sessionId, {
                type: 'personalized_greeting',
                user: flowResult.user,
                message: `Saludo personalizado para ${flowResult.user}`
              });
              return;

            default:
              logger.debug({ flowResultType: flowResult.type }, 'Flow result type no manejado específicamente');
              return;
          }
        }

        // ========================================
        // NO HAY FLUJO QUE MATCHEE: Enviar fallback
        // ========================================
        logger.info({ phone, text: normalized.slice(0, 50) }, '🎯 No hay flujo visual que matchee - enviando fallback');

        // Obtener mensaje de fallback de configuración
        const [configRows] = await pool.query('SELECT fallback_message FROM chatbot_config ORDER BY id DESC LIMIT 1');
        const fallbackMessage = configRows.length > 0 && configRows[0].fallback_message
          ? configRows[0].fallback_message
          : 'Gracias por tu mensaje. Un agente te atenderá pronto.';

        // Delay antes de responder
        if (CHATBOT_AUTO_REPLY_DELAY > 0) {
          await new Promise(r => setTimeout(r, CHATBOT_AUTO_REPLY_DELAY));
        }

        // Enviar fallback (sendTextViaCloudAPI ya guarda en BD)
        const fallbackMsgId = await sendTextViaCloudAPI(phone, fallbackMessage, sessionId);

        // Obtener el messageId del mensaje recién insertado
        const [[lastMsg]] = await pool.query(
          `SELECT id FROM chat_messages WHERE session_id=? AND wa_msg_id=? ORDER BY id DESC LIMIT 1`,
          [sessionId, fallbackMsgId]
        );
        const messageId = lastMsg ? lastMsg.id : null;

        // Notificar al frontend
        ssePush(sessionId, {
          type: 'message',
          direction: 'out',
          text: fallbackMessage,
          msgId: fallbackMsgId,
          dbId: messageId,
          status: 'sent',
          isAI: false,
          at: Date.now()
        });

        logger.info({ sessionId, waMsgId: fallbackMsgId, messageId }, '🎯 Fallback enviado');

      } catch (e) {
        logger.error({ err: e, phone, message: e?.message, stack: e?.stack }, 'Error en Visual Flow Engine');
        // En caso de error, no enviar nada para evitar confusión
      }

    } catch (e) {
      logger.error({ err: e, message: e?.message }, 'handleChatbotMessage error');
    }
  }

  /**
   * Registrar rutas de API para el chatbot
   */
  function registerRoutes(app, panelAuth) {
    // Cambiar modo del bot
    app.post('/api/chat/bot-mode', async (req, res) => {
      try {
        const { sessionId, token, mode } = req.body || {};
        if (!sessionId || !token || !mode) {
          return res.status(400).json({ ok: false, error: 'Faltan campos' });
        }
        if (!['manual', 'assisted', 'automatic'].includes(mode)) {
          return res.status(400).json({ ok: false, error: 'Modo inválido' });
        }

        const [rows] = await pool.query(
          `SELECT id FROM chat_sessions WHERE id=? AND token=? AND status='OPEN' LIMIT 1`,
          [Number(sessionId), String(token)]
        );
        if (!rows.length) {
          return res.status(401).json({ ok: false, error: 'Sesión inválida' });
        }

        await pool.query(`UPDATE chat_sessions SET chatbot_mode=? WHERE id=?`, [mode, Number(sessionId)]);
        sessionModes.set(Number(sessionId), mode);
        ssePush(Number(sessionId), { type: 'mode_changed', mode, at: Date.now() });

        res.json({ ok: true, sessionId: Number(sessionId), mode });
      } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
      }
    });

    // Enviar respuesta manual
    app.post('/api/chat/send-reply', async (req, res) => {
      try {
        const { sessionId, token, text } = req.body || {};
        if (!sessionId || !token || !text) {
          return res.status(400).json({ ok: false, error: 'Faltan campos' });
        }

        const [rows] = await pool.query(
          `SELECT id, phone FROM chat_sessions WHERE id=? AND token=? AND status='OPEN' LIMIT 1`,
          [Number(sessionId), String(token)]
        );
        if (!rows.length) {
          return res.status(401).json({ ok: false, error: 'Sesión inválida' });
        }

        const phone = rows[0].phone;

        // Cuando agente humano envía mensaje, cambiar a modo manual
        await pool.query(`UPDATE chat_sessions SET chatbot_mode = 'manual' WHERE id = ?`, [sessionId]);
        setSessionMode(Number(sessionId), 'manual');

        const waMsgId = await sendTextViaCloudAPI(phone, text);
        const [result] = await pool.query(
          `INSERT INTO chat_messages (session_id, direction, text, wa_jid, wa_msg_id, status, is_ai_generated) VALUES (?,?,?,?,?,?,?)`,
          [sessionId, 'out', text, phone, waMsgId, 'sent', 0]
        );
        const messageId = result.insertId;

        ssePush(Number(sessionId), {
          type: 'message',
          direction: 'out',
          text,
          msgId: waMsgId,
          dbId: messageId,
          status: 'sent',
          isAI: false,
          at: Date.now()
        });

        res.json({ ok: true, messageId, waMsgId, sent: true });
      } catch (e) {
        logger.error({ e }, 'send-reply error');
        res.status(500).json({ ok: false, error: e.message });
      }
    });

    // ========================================
    // TOGGLE GLOBAL DE VISUAL FLOWS
    // ========================================

    // GET: Obtener estado actual de visual flows
    app.get('/api/settings/visual-flows', (req, res) => {
      res.json({
        ok: true,
        enabled: visualFlowsGlobalEnabled,
        message: visualFlowsGlobalEnabled ? 'Visual Flows activo' : 'Visual Flows desactivado'
      });
    });

    // POST: Cambiar estado de visual flows
    app.post('/api/settings/visual-flows', (req, res) => {
      try {
        const { enabled } = req.body || {};

        if (typeof enabled !== 'boolean') {
          return res.status(400).json({ ok: false, error: 'Campo "enabled" requerido (boolean)' });
        }

        visualFlowsGlobalEnabled = enabled;
        logger.info({ enabled }, '🔄 Visual Flows global toggle changed');

        res.json({
          ok: true,
          enabled: visualFlowsGlobalEnabled,
          message: enabled ? 'Visual Flows ACTIVADO' : 'Visual Flows DESACTIVADO'
        });
      } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
      }
    });

    // Toggle bot (legacy - mantener por compatibilidad)
    app.post('/api/chat/bot-toggle', async (req, res) => {
      try {
        const { sessionId, token, enabled } = req.body || {};
        if (!sessionId || !token || typeof enabled !== 'boolean') {
          return res.status(400).json({ ok: false, error: 'Faltan campos' });
        }

        const [rows] = await pool.query(
          `SELECT id FROM chat_sessions WHERE id=? AND token=? AND status='OPEN' LIMIT 1`,
          [Number(sessionId), String(token)]
        );
        if (!rows.length) {
          return res.status(401).json({ ok: false, error: 'Sesión inválida' });
        }

        // Convertir enabled a modo
        const newMode = enabled ? 'automatic' : 'manual';
        await pool.query(`UPDATE chat_sessions SET chatbot_mode=? WHERE id=?`, [newMode, Number(sessionId)]);
        sessionModes.set(Number(sessionId), newMode);

        res.json({ ok: true, sessionId: Number(sessionId), chatbotEnabled: enabled, mode: newMode });
      } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
      }
    });
  }

  /**
   * Actualizar modo de sesión desde fuera del módulo
   */
  function setSessionMode(sessionId, mode) {
    sessionModes.set(sessionId, mode);
    logger.info({ sessionId, mode }, '🤖 Modo de sesión actualizado');
  }

  /**
   * Recargar flujos visuales
   */
  async function reloadVisualFlows() {
    await visualFlowEngine.loadActiveFlows();
    logger.info('🔄 Visual flows reloaded');
    return true;
  }

  /**
   * Limpiar estado en memoria al eliminar una conversación
   */
  function clearSessionState(sessionId, phone) {
    if (sessionId) sessionModes.delete(Number(sessionId));
    if (phone) visualFlowEngine.clearSession(phone);
    logger.info({ sessionId, phone }, '🧹 Estado de sesión limpiado (memoria)');
  }

  /**
   * Obtener motor de flujos para uso externo
   */
  function getVisualFlowEngine() {
    return visualFlowEngine;
  }

  /**
   * Obtener clasificador de mensajes
   */
  function getMessageClassifier() {
    return messageClassifier;
  }

  return {
    registerRoutes,
    handleChatbotMessage,
    setSessionMode,
    clearSessionState,
    reloadVisualFlows,
    getVisualFlowEngine,
    getMessageClassifier
  };
}

module.exports = { createChatbot };
