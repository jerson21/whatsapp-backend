/**
 * Message Classifier
 * Clasifica mensajes entrantes por: intención, urgencia, lead score, sentimiento
 */

const logger = require('pino')({ level: process.env.LOG_LEVEL || 'info' });

class MessageClassifier {
  constructor(dbPool) {
    this.db = dbPool;
    this.rules = {
      intent: [],
      urgency: [],
      lead_score: [],
      sentiment: []
    };
    this.rulesLoaded = false;
  }

  /**
   * Cargar reglas desde la base de datos
   */
  async loadRules() {
    try {
      const [rows] = await this.db.query(`
        SELECT id, name, type, conditions, result_value, score_modifier, priority
        FROM classifier_rules
        WHERE active = TRUE
        ORDER BY priority DESC
      `);

      // Resetear reglas
      this.rules = { intent: [], urgency: [], lead_score: [], sentiment: [] };

      for (const row of rows) {
        const rule = {
          id: row.id,
          name: row.name,
          conditions: typeof row.conditions === 'string' ? JSON.parse(row.conditions) : row.conditions,
          resultValue: row.result_value,
          scoreModifier: row.score_modifier || 0,
          priority: row.priority
        };

        if (this.rules[row.type]) {
          this.rules[row.type].push(rule);
        }
      }

      this.rulesLoaded = true;
      logger.info({
        intentRules: this.rules.intent.length,
        urgencyRules: this.rules.urgency.length,
        leadScoreRules: this.rules.lead_score.length
      }, 'Classifier rules loaded');

      return true;
    } catch (err) {
      logger.error({ err }, 'Error loading classifier rules');
      return false;
    }
  }

  /**
   * Clasificar un mensaje
   * @param {string} message - Texto del mensaje
   * @param {object} context - Contexto adicional (phone, session, historial)
   * @returns {object} Resultado de clasificación
   */
  async classify(message, context = {}) {
    if (!this.rulesLoaded) {
      await this.loadRules();
    }

    const normalizedMessage = this.normalizeText(message);

    const result = {
      intent: this.classifyIntent(normalizedMessage),
      urgency: this.classifyUrgency(normalizedMessage),
      leadScore: await this.calculateLeadScore(normalizedMessage, context),
      sentiment: this.classifySentiment(normalizedMessage),
      originalMessage: message,
      normalizedMessage,
      classifiedAt: new Date().toISOString()
    };

    // Guardar clasificación en historial
    if (context.phone) {
      await this.saveClassification(context.phone, context.sessionId, message, result, context.flowTriggered);
    }

    return result;
  }

  /**
   * Normalizar texto para comparación
   */
  normalizeText(text) {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
      .replace(/[^\w\s]/g, ' ')        // Quitar puntuación
      .replace(/\s+/g, ' ')            // Espacios múltiples
      .trim();
  }

  /**
   * Clasificar intención del mensaje
   */
  classifyIntent(message) {
    let bestMatch = {
      type: 'unknown',
      confidence: 0,
      matchedRule: null,
      matchedKeywords: []
    };

    for (const rule of this.rules.intent) {
      const matchResult = this.matchRule(message, rule.conditions);

      if (matchResult.matched && matchResult.score > bestMatch.confidence) {
        bestMatch = {
          type: rule.resultValue,
          confidence: Math.min(matchResult.score, 1),
          matchedRule: rule.id,
          matchedKeywords: matchResult.matchedKeywords
        };
      }
    }

    return bestMatch;
  }

  /**
   * Clasificar urgencia del mensaje
   */
  classifyUrgency(message) {
    let result = {
      level: 'low',
      signals: [],
      matchedRule: null
    };

    for (const rule of this.rules.urgency) {
      const matchResult = this.matchRule(message, rule.conditions);

      if (matchResult.matched) {
        // Tomar el nivel más alto de urgencia encontrado
        const levels = { high: 3, medium: 2, low: 1 };
        const currentLevel = levels[result.level] || 1;
        const newLevel = levels[rule.resultValue] || 1;

        if (newLevel > currentLevel) {
          result.level = rule.resultValue;
          result.matchedRule = rule.id;
        }
        result.signals.push(...matchResult.matchedKeywords);
      }
    }

    return result;
  }

  /**
   * Calcular lead score
   */
  async calculateLeadScore(message, context) {
    const factors = {
      messageSignals: 0,
      engagement: 0,
      purchaseHistory: 0,
      recency: 0,
      profileCompletion: 0
    };

    // 1. Señales del mensaje actual
    for (const rule of this.rules.lead_score) {
      const matchResult = this.matchRule(message, rule.conditions);
      if (matchResult.matched) {
        factors.messageSignals += rule.scoreModifier;
      }
    }

    // 2. Si tenemos contexto del lead, agregar más factores
    if (context.phone) {
      const leadData = await this.getLeadData(context.phone);

      if (leadData) {
        // Engagement basado en mensajes
        factors.engagement = Math.min(leadData.total_messages * 2, 25);

        // Historial de compras
        if (leadData.total_purchases > 0) {
          factors.purchaseHistory = Math.min(Math.floor(leadData.total_purchases / 10000) * 5, 30);
        }

        // Recencia (más reciente = más puntos)
        if (leadData.last_interaction) {
          const daysSince = (Date.now() - new Date(leadData.last_interaction)) / (1000 * 60 * 60 * 24);
          if (daysSince < 1) factors.recency = 20;
          else if (daysSince < 7) factors.recency = 15;
          else if (daysSince < 30) factors.recency = 10;
          else factors.recency = 5;
        }
      }
    }

    // Calcular score total (0-100)
    const totalScore = Math.max(0, Math.min(100,
      factors.messageSignals +
      factors.engagement +
      factors.purchaseHistory +
      factors.recency +
      factors.profileCompletion
    ));

    return {
      value: totalScore,
      factors
    };
  }

  /**
   * Clasificar sentimiento (básico)
   */
  classifySentiment(message) {
    const positiveWords = ['gracias', 'excelente', 'genial', 'perfecto', 'bueno', 'bien', 'feliz', 'contento', 'encanta'];
    const negativeWords = ['mal', 'malo', 'terrible', 'pesimo', 'horrible', 'enojado', 'molesto', 'decepcionado', 'frustrado'];

    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of positiveWords) {
      if (message.includes(word)) positiveCount++;
    }
    for (const word of negativeWords) {
      if (message.includes(word)) negativeCount++;
    }

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * Evaluar si un mensaje coincide con las condiciones de una regla
   */
  matchRule(message, conditions) {
    const result = {
      matched: false,
      score: 0,
      matchedKeywords: []
    };

    // Verificar exclusiones primero
    if (conditions.exclude) {
      for (const word of conditions.exclude) {
        if (message.includes(word.toLowerCase())) {
          return result; // Excluido, no matchea
        }
      }
    }

    // Verificar keywords
    if (conditions.keywords) {
      for (const keyword of conditions.keywords) {
        const normalizedKeyword = this.normalizeText(keyword);
        if (message.includes(normalizedKeyword)) {
          result.matched = true;
          result.score += 0.3;
          result.matchedKeywords.push(keyword);
        }
      }
    }

    // Verificar patrones regex
    if (conditions.patterns) {
      for (const pattern of conditions.patterns) {
        try {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(message)) {
            result.matched = true;
            result.score += 0.5; // Patterns tienen más peso
            result.matchedKeywords.push(`pattern:${pattern}`);
          }
        } catch (e) {
          logger.warn({ pattern, error: e.message }, 'Invalid regex pattern');
        }
      }
    }

    // Normalizar score máximo a 1
    result.score = Math.min(result.score, 1);

    return result;
  }

  /**
   * Obtener datos de un lead
   */
  async getLeadData(phone) {
    try {
      const [rows] = await this.db.query(
        'SELECT * FROM lead_scores WHERE phone = ?',
        [phone]
      );
      return rows[0] || null;
    } catch (err) {
      logger.error({ err, phone }, 'Error fetching lead data');
      return null;
    }
  }

  /**
   * Guardar clasificación en historial
   */
  async saveClassification(phone, sessionId, message, classification, flowTriggered) {
    try {
      await this.db.query(`
        INSERT INTO message_classifications
        (phone, session_id, message_text, classification, flow_triggered)
        VALUES (?, ?, ?, ?, ?)
      `, [
        phone,
        sessionId || null,
        message,
        JSON.stringify(classification),
        flowTriggered || null
      ]);
    } catch (err) {
      // Si la tabla no existe, ignorar silenciosamente
      if (err.code !== 'ER_NO_SUCH_TABLE') {
        logger.error({ err }, 'Error saving classification');
      }
    }
  }

  /**
   * Actualizar lead score
   */
  async updateLeadScore(phone, scoreChange, reason) {
    try {
      // Upsert lead score
      await this.db.query(`
        INSERT INTO lead_scores (phone, current_score, total_messages, first_contact, last_interaction, score_history)
        VALUES (?, GREATEST(0, LEAST(100, ?)), 1, NOW(), NOW(), JSON_ARRAY(JSON_OBJECT('date', NOW(), 'score', ?, 'reason', ?)))
        ON DUPLICATE KEY UPDATE
          current_score = GREATEST(0, LEAST(100, current_score + VALUES(current_score))),
          total_messages = total_messages + 1,
          last_interaction = NOW(),
          score_history = JSON_ARRAY_APPEND(
            COALESCE(score_history, JSON_ARRAY()),
            '$',
            JSON_OBJECT('date', NOW(), 'score', current_score, 'reason', ?)
          )
      `, [phone, scoreChange, scoreChange, reason, reason]);

      return true;
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE') {
        logger.error({ err, phone }, 'Error updating lead score');
      }
      return false;
    }
  }

  /**
   * Obtener estadísticas de clasificación
   */
  async getStats(days = 7) {
    try {
      const [intentStats] = await this.db.query(`
        SELECT
          JSON_UNQUOTE(JSON_EXTRACT(classification, '$.intent.type')) as intent,
          COUNT(*) as count
        FROM message_classifications
        WHERE classified_at > DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY intent
        ORDER BY count DESC
      `, [days]);

      const [urgencyStats] = await this.db.query(`
        SELECT
          JSON_UNQUOTE(JSON_EXTRACT(classification, '$.urgency.level')) as urgency,
          COUNT(*) as count
        FROM message_classifications
        WHERE classified_at > DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY urgency
        ORDER BY count DESC
      `, [days]);

      return { intentStats, urgencyStats };
    } catch (err) {
      logger.error({ err }, 'Error getting classifier stats');
      return { intentStats: [], urgencyStats: [] };
    }
  }
}

module.exports = MessageClassifier;
