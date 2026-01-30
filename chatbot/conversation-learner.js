'use strict';

/**
 * conversation-learner.js
 *
 * Extrae pares pregunta/respuesta de conversaciones resueltas por agentes humanos.
 * Puntua la calidad de cada par y los almacena en learned_qa_pairs.
 * Genera embeddings para pares aprobados (job periodico).
 */

const LEARNING_ENABLED = () => String(process.env.LEARNING_ENABLED || 'false').toLowerCase() === 'true';
const LEARNING_MIN_QUALITY = () => Number(process.env.LEARNING_MIN_QUALITY || 50);
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
  if (trimmed.length < 5) return true;
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
   * Extrae pares Q&A de una sesion resuelta
   */
  async function extractFromSession(sessionId) {
    if (!LEARNING_ENABLED()) return;

    try {
      // 1. Obtener mensajes de la sesion
      const [messages] = await pool.query(
        `SELECT id, direction, text, is_ai_generated, agent_id, created_at
         FROM chat_messages
         WHERE session_id = ? AND text IS NOT NULL AND text != ''
         ORDER BY created_at ASC`,
        [sessionId]
      );

      if (messages.length < 2) return; // necesitamos al menos pregunta + respuesta

      // 2. Obtener info de la sesion
      const [sessions] = await pool.query(
        `SELECT s.id, s.escalation_status, s.channel, a.role as agent_role
         FROM chat_sessions s
         LEFT JOIN agents a ON s.assigned_agent_id = a.id
         WHERE s.id = ?`,
        [sessionId]
      );
      const session = sessions[0];
      if (!session) return;

      const pairs = [];

      // 3. Recorrer mensajes buscando pares Q→A
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];

        // Solo mensajes salientes de agentes humanos (no del bot)
        if (msg.direction !== 'outgoing' || msg.is_ai_generated) continue;
        if (!msg.text || msg.text.length < 10) continue;

        // Buscar la pregunta previa mas cercana (mensaje entrante)
        let question = null;
        for (let j = i - 1; j >= 0; j--) {
          if (messages[j].direction === 'incoming' && messages[j].text) {
            question = messages[j].text;
            break;
          }
        }

        if (!question) continue;
        if (question.length < 5) continue;
        if (isTrivialGreeting(question)) continue;

        // Siguiente mensaje del cliente (para scoring)
        const nextClientMsg = messages.slice(i + 1).find(m => m.direction === 'incoming');

        const score = calculateQualityScore({
          question,
          answer: msg.text,
          session,
          agentId: msg.agent_id,
          nextClientMessage: nextClientMsg?.text || null
        });

        // Solo guardar si supera el umbral minimo
        if (score >= LEARNING_MIN_QUALITY()) {
          pairs.push({
            question,
            answer: msg.text,
            score,
            agentId: msg.agent_id
          });
        }
      }

      if (pairs.length === 0) {
        logger.debug({ sessionId }, 'Learning: no se encontraron pares utiles');
        return;
      }

      // 4. Insertar pares en BD (con prevencion de duplicados)
      const autoApprove = LEARNING_AUTO_APPROVE();
      let inserted = 0;
      for (const pair of pairs) {
        // Verificar si ya existe un par con la misma sesion y pregunta
        const [[existing]] = await pool.query(
          `SELECT id FROM learned_qa_pairs WHERE session_id = ? AND question = ? LIMIT 1`,
          [sessionId, pair.question]
        );
        if (existing) continue; // Ya fue extraido antes

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
