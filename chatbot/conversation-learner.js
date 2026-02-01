'use strict';

/**
 * conversation-learner.js
 *
 * Extrae pares pregunta/respuesta de conversaciones resueltas por agentes humanos.
 * Puntua la calidad de cada par y los almacena en learned_qa_pairs.
 * Genera embeddings para pares aprobados (job periodico).
 */

const LEARNING_ENABLED = () => String(process.env.LEARNING_ENABLED || 'false').toLowerCase() === 'true';
const LEARNING_MIN_QUALITY = () => Number(process.env.LEARNING_MIN_QUALITY || 20);
const LEARNING_AUTO_APPROVE = () => String(process.env.LEARNING_AUTO_APPROVE || 'false').toLowerCase() === 'true';
const AUTO_APPROVE_THRESHOLD = 80;

// Saludos triviales que no aportan como pregunta
const TRIVIAL_PATTERNS = [
  /^hola\s*$/i,
  /^buenas?\s*(tardes?|dias?|noches?)?\s*$/i,
  /^hey\s*$/i,
  /^alo\s*$/i,
  /^buen\s*dia\s*$/i,
  /^holi\s*$/i,
  /^holaa+\s*$/i,
  /^que\s*tal\s*$/i,
  /^ok\s*$/i,
  /^si\s*$/i,
  /^no\s*$/i,
  /^gracias?\s*$/i,
  /^dale\s*$/i,
  /^ya\s*$/i,
  /^listo\s*$/i,
  /^perfecto\s*$/i,
  /^👍*$/,
  /^❤️*$/
];

function isTrivialGreeting(text) {
  const trimmed = String(text || '').trim();
  if (trimmed.length < 3) return true;
  return TRIVIAL_PATTERNS.some(p => p.test(trimmed));
}

// =============================================
// Quality Scoring (0-100)
// =============================================

// Criterios de rubro detectados automaticamente via regex
const RUBRO_PATTERNS = {
  medida: /plaza|king|queen|full|\d+\s*cm|\d+x\d+|1\.5|super\s*king/i,
  comparaModelos: /(\$[\d.,]+.*\$[\d.,]+)|(plaza.*plaza)|(king.*queen|queen.*king)/i,
  recomendacion: /te recomiendo|te sugiero|la mejor opci[oó]n|ideal para|te conviene/i,
  plazoFabricacion: /d[ií]as h[aá]biles|semanas|plazo|fabricamos en|demora|d[ií]as aprox/i,
  precio: /\$\s*[\d.,]+|CLP|pesos/i,
  despacho: /despacho|env[ií]o|enviar|santiago|regi[oó]n|regi[oó]nes|transporte/i
};

const POSITIVE_RESPONSES = /^(ok|ya|dale|perfecto|genial|listo|bueno|excelente|gracias|me interesa|quiero)/i;

function calculateQualityScore({ question, answer, session, agentId, nextClientMessage }) {
  let score = 0;

  // --- Criterios base (genericos) ---

  // +20: Respuesta sustancial (> 50 chars)
  if (answer.length > 50) score += 20;

  // +15: Contiene info especifica (precios, fechas, URLs)
  if (RUBRO_PATTERNS.precio.test(answer) || /\d{1,2}\s*(de|\/)\s*\w+/i.test(answer)) score += 15;

  // +15: Cliente respondio positivamente despues
  if (nextClientMessage && POSITIVE_RESPONSES.test(nextClientMessage.trim())) score += 15;

  // +10: Agente es supervisor
  if (session?.agent_role === 'supervisor') score += 10;

  // +10: Conversacion resuelta (no escalada a otro)
  if (session?.escalation_status !== 'ESCALATED') score += 10;

  // --- Criterios de rubro (auto-detectados) ---

  // +10: Menciona medida
  if (RUBRO_PATTERNS.medida.test(answer)) score += 10;

  // +10: Compara modelos o medidas
  if (RUBRO_PATTERNS.comparaModelos.test(answer)) score += 10;

  // +10: Recomienda activamente
  if (RUBRO_PATTERNS.recomendacion.test(answer)) score += 10;

  // +10: Incluye plazo de fabricacion
  if (RUBRO_PATTERNS.plazoFabricacion.test(answer)) score += 10;

  // Cap a 100
  return Math.min(100, score);
}

// =============================================
// Factory function
// =============================================
function createConversationLearner({ pool, logger, openai }) {

  /**
   * Extrae pares Q&A de una sesion usando IA para entender el contexto.
   * Le pasa la conversacion completa a GPT-4o-mini y le pide que extraiga
   * los pares pregunta/respuesta utiles para entrenar un chatbot de ventas.
   */
  async function extractPairsWithAI(messages, session) {
    // Construir transcript legible para la IA
    const transcript = messages
      .filter(m => m.text && m.text.trim())
      .map(m => `[${m.direction === 'in' ? 'CLIENTE' : 'AGENTE'}]: ${m.text.trim()}`)
      .join('\n');

    // Si el transcript es muy corto, no vale la pena
    if (transcript.length < 50) return [];

    // Truncar a ~4000 chars para no gastar tokens de mas
    const truncated = transcript.length > 4000 ? transcript.slice(0, 4000) + '\n[...conversacion truncada]' : transcript;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MINI_MODEL || 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 2000,
      messages: [
        {
          role: 'system',
          content: `Eres un experto en extraccion de conocimiento de conversaciones de venta.
El negocio es una tienda de RESPALDOS DE CAMA (cabeceras/headboards) en Chile.

Tu trabajo: analizar la conversacion entre CLIENTE y AGENTE, y extraer pares pregunta/respuesta FIELES a lo que realmente se dijo.

REGLAS ESTRICTAS:
1. La "pregunta" debe representar lo que el cliente realmente quiere saber. Puedes limpiar errores de ortografia o reformular levemente para claridad, pero mantente fiel al intent original del cliente.
2. La "respuesta" DEBE usar las palabras EXACTAS que escribio el agente humano. Si el agente envio varios mensajes consecutivos respondiendo la misma pregunta, concatenalos con un punto o coma. NUNCA parafrasees, reformules ni cambies el texto del agente.
3. PROHIBIDO inventar, agregar o inferir informacion que el agente NO haya escrito explicitamente en la conversacion. Si el agente no menciono un dato, NO lo incluyas en la respuesta.
4. Incluye info de precios, modelos, medidas, materiales, despacho, plazos, formas de pago — SOLO si el agente los menciono.
5. NO incluyas saludos triviales (hola, gracias, ok, etc.)
6. NO incluyas pares donde la respuesta no tiene info util
7. NO extraigas pares que contengan precios especificos, montos en pesos, valores numericos de productos o cotizaciones. Los precios cambian frecuentemente y se manejan por separado.
8. Califica cada par con quality_score de 0-100 segun que tan util y completa es la respuesta del agente

Responde SOLO con un JSON array. Ejemplo:
[
  {"question": "Cuanto cuesta el modelo Venecia King?", "answer": "el venecia king en lino gris claro esta a $65.000 oferta, el envio son $6.000", "quality_score": 85},
  {"question": "Cuanto demora el despacho?", "answer": "dentro de santiago son 3 a 5 dias habiles", "quality_score": 75}
]

Si no hay pares utiles, responde: []`
        },
        {
          role: 'user',
          content: truncated
        }
      ]
    });

    const content = response.choices[0]?.message?.content?.trim() || '[]';

    // Extraer JSON array del response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.warn({ sessionId: session.id, content: content.slice(0, 200) }, 'Learning AI: respuesta no parseable');
      return [];
    }

    const extracted = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(extracted)) return [];

    // Patron para detectar precios (pesos chilenos, dolares, montos)
    const PRICE_PATTERN = /\$\s*[\d.,]+|[\d.,]+\s*pesos|CLP\s*[\d.,]+|[\d.,]+\s*CLP/i;

    // Validar estructura y filtrar
    return extracted
      .filter(p => p.question && p.answer && typeof p.quality_score === 'number')
      .filter(p => p.question.length >= 5 && p.answer.length >= 10)
      .filter(p => p.quality_score >= LEARNING_MIN_QUALITY())
      .filter(p => !PRICE_PATTERN.test(p.answer)) // Excluir pares con precios
      .map(p => ({
        question: p.question.trim(),
        answer: p.answer.trim(),
        score: Math.min(100, Math.max(0, p.quality_score)),
        agentId: session.assigned_agent_id || null
      }));
  }

  /**
   * Extrae pares Q&A usando turnos (fallback cuando no hay OpenAI)
   */
  function extractPairsFromTurns(messages, session) {
    const pairs = [];

    // Agrupar mensajes en turnos conversacionales
    const turns = [];
    for (const msg of messages) {
      if (!msg.text || msg.text.trim().length === 0) continue;
      const lastTurn = turns[turns.length - 1];
      if (lastTurn && lastTurn.direction === msg.direction) {
        lastTurn.texts.push(msg.text);
      } else {
        turns.push({ direction: msg.direction, texts: [msg.text], isAi: msg.is_ai_generated });
      }
    }

    for (let i = 0; i < turns.length - 1; i++) {
      const questionTurn = turns[i];
      const answerTurn = turns[i + 1];

      if (questionTurn.direction !== 'in' || answerTurn.direction !== 'out') continue;
      if (answerTurn.isAi) continue;

      const questionTexts = questionTurn.texts.filter(t => !isTrivialGreeting(t) && t.length >= 3);
      const question = questionTexts.join('\n').trim();
      const answer = answerTurn.texts.join('\n').trim();

      if (!question || question.length < 3) continue;
      if (!answer || answer.length < 5) continue;

      const nextClientTurn = turns.slice(i + 2).find(t => t.direction === 'in');
      const nextClientMessage = nextClientTurn ? nextClientTurn.texts[0] : null;

      const score = calculateQualityScore({
        question, answer, session,
        agentId: session.assigned_agent_id || null,
        nextClientMessage
      });

      if (score >= LEARNING_MIN_QUALITY()) {
        pairs.push({ question, answer, score, agentId: session.assigned_agent_id || null });
      }
    }

    return pairs;
  }

  /**
   * Extrae pares Q&A de una sesion resuelta
   */
  async function extractFromSession(sessionId) {
    if (!LEARNING_ENABLED()) return;

    try {
      // 1. Obtener mensajes de la sesion
      const [messages] = await pool.query(
        `SELECT id, direction, text, is_ai_generated, created_at
         FROM chat_messages
         WHERE session_id = ? AND text IS NOT NULL AND text != ''
         ORDER BY created_at ASC`,
        [sessionId]
      );

      if (messages.length < 2) {
        logger.debug({ sessionId, msgCount: messages.length }, 'Learning: sesion con menos de 2 mensajes, saltando');
        return;
      }

      // 2. Obtener info de la sesion
      const [sessions] = await pool.query(
        `SELECT s.id, s.escalation_status, s.channel, s.assigned_agent_id, a.role as agent_role
         FROM chat_sessions s
         LEFT JOIN agents a ON s.assigned_agent_id = a.id
         WHERE s.id = ?`,
        [sessionId]
      );
      const session = sessions[0];
      if (!session) return;

      // 3. Extraer pares: con IA si hay OpenAI, sino con turnos (fallback)
      let pairs;
      if (openai) {
        try {
          pairs = await extractPairsWithAI(messages, session);
          logger.info({ sessionId, pairsFromAI: pairs.length }, 'Learning: pares extraidos con IA');
        } catch (aiErr) {
          logger.warn({ err: aiErr, sessionId }, 'Learning: IA fallo, usando fallback por turnos');
          pairs = extractPairsFromTurns(messages, session);
        }
      } else {
        pairs = extractPairsFromTurns(messages, session);
      }

      if (pairs.length === 0) {
        logger.debug({ sessionId }, 'Learning: no se encontraron pares utiles');
        return;
      }

      // 4. Insertar pares en BD (con prevencion de duplicados)
      const autoApprove = LEARNING_AUTO_APPROVE();
      let inserted = 0;
      for (const pair of pairs) {
        const [[existing]] = await pool.query(
          `SELECT id FROM learned_qa_pairs WHERE session_id = ? AND question = ? LIMIT 1`,
          [sessionId, pair.question]
        );
        if (existing) continue;

        const status = (autoApprove && pair.score >= AUTO_APPROVE_THRESHOLD) ? 'approved' : 'pending';
        await pool.query(
          `INSERT INTO learned_qa_pairs (session_id, question, answer, quality_score, status, agent_id, channel)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [sessionId, pair.question, pair.answer, pair.score, status, pair.agentId, session.channel || 'whatsapp']
        );
        inserted++;
      }

      if (inserted > 0) {
        logger.info({ sessionId, inserted, total: pairs.length, avgScore: Math.round(pairs.reduce((s, p) => s + p.score, 0) / pairs.length) },
          'Learning: pares Q&A extraidos');
      } else {
        logger.debug({ sessionId, total: pairs.length }, 'Learning: todos los pares ya existian (duplicados omitidos)');
      }

    } catch (err) {
      logger.error({ err, sessionId }, 'Learning: error extrayendo pares');
    }
  }

  /**
   * Genera embeddings para pares aprobados que aun no tienen
   * Se ejecuta periodicamente via setInterval
   */
  async function generateEmbeddings() {
    if (!LEARNING_ENABLED() || !openai) return;

    try {
      const [pairs] = await pool.query(
        `SELECT id, question FROM learned_qa_pairs
         WHERE status = 'approved' AND embedding IS NULL
         LIMIT 20`
      );

      if (!pairs.length) return;

      const texts = pairs.map(p => p.question);
      const embeddingModel = process.env.OPENAI_EMBEDDINGS_MODEL || 'text-embedding-3-small';

      const response = await openai.embeddings.create({
        model: embeddingModel,
        input: texts
      });

      for (let i = 0; i < pairs.length; i++) {
        const vector = response.data[i].embedding;
        await pool.query(
          'UPDATE learned_qa_pairs SET embedding = ? WHERE id = ?',
          [JSON.stringify(vector), pairs[i].id]
        );
      }

      logger.info({ count: pairs.length }, 'Learning: embeddings generados');
    } catch (err) {
      logger.error({ err }, 'Learning: error generando embeddings');
    }
  }

  /**
   * Re-procesa sesiones pasadas (para migrar historico)
   */
  async function reprocessSessions({ from, to } = {}) {
    if (!LEARNING_ENABLED()) return { processed: 0 };

    try {
      // Limpiar pares anteriores para regenerar con la logica actualizada
      const [deleted] = await pool.query('DELETE FROM learned_qa_pairs WHERE status != ?', ['approved']);
      if (deleted.affectedRows > 0) {
        logger.info({ deleted: deleted.affectedRows }, 'Learning: pares pendientes/rechazados eliminados para reprocesar');
      }

      // Procesar sesiones resueltas, cerradas, o abiertas con suficientes mensajes
      let query = `SELECT s.id FROM chat_sessions s
        WHERE (
          s.escalation_status = 'RESOLVED'
          OR s.status = 'CLOSED'
          OR (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id AND m.direction = 'out') >= 3
        )`;
      const params = [];

      if (from) {
        query += ' AND s.created_at >= ?';
        params.push(from);
      }
      if (to) {
        query += ' AND s.created_at <= ?';
        params.push(to);
      }

      query += ' ORDER BY s.id ASC';
      const [sessions] = await pool.query(query, params);

      let processed = 0;
      for (const session of sessions) {
        await extractFromSession(session.id);
        processed++;
      }

      logger.info({ processed }, 'Learning: sesiones reprocesadas');
      return { processed };
    } catch (err) {
      logger.error({ err }, 'Learning: error reprocesando sesiones');
      return { processed: 0, error: err.message };
    }
  }

  /**
   * Extrae pares Q&A de sesiones inactivas automaticamente.
   * Busca sesiones con 3+ respuestas del agente y 30+ min sin actividad
   * que aun no han sido procesadas.
   * Se ejecuta periodicamente via setInterval (cada 10 min).
   */
  async function extractInactiveSessions() {
    if (!LEARNING_ENABLED()) return { processed: 0 };

    try {
      const [sessions] = await pool.query(`
        SELECT DISTINCT s.id
        FROM chat_sessions s
        INNER JOIN chat_messages m ON m.session_id = s.id
        WHERE (SELECT COUNT(*) FROM chat_messages cm
               WHERE cm.session_id = s.id AND cm.direction = 'out' AND cm.is_ai_generated = 0) >= 3
          AND (SELECT MAX(cm2.created_at) FROM chat_messages cm2
               WHERE cm2.session_id = s.id) < NOW() - INTERVAL 30 MINUTE
          AND s.id NOT IN (SELECT DISTINCT lqp.session_id FROM learned_qa_pairs lqp)
      `);

      if (sessions.length === 0) return { processed: 0 };

      let processed = 0;
      for (const session of sessions) {
        await extractFromSession(session.id);
        processed++;
      }

      if (processed > 0) {
        logger.info({ processed }, 'Learning: sesiones inactivas procesadas');
      }
      return { processed };
    } catch (err) {
      logger.error({ err }, 'Learning: error en job de extraccion por inactividad');
      return { processed: 0 };
    }
  }

  return {
    extractFromSession,
    generateEmbeddings,
    reprocessSessions,
    extractInactiveSessions
  };
}

module.exports = { createConversationLearner };
