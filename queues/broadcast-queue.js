/**
 * Broadcast Queue - Cola para envíos masivos de WhatsApp
 *
 * Características:
 * - Throttling inteligente según tier de WhatsApp Business API
 * - Reintentos con backoff exponencial
 * - Tracking de estado por destinatario
 * - Soporte para templates de WhatsApp
 */

const queueService = require('./queue-service');

// Límites de rate según tier de WhatsApp
const RATE_LIMITS = {
  tier1: { perSecond: 80, perDay: 1000 },
  tier2: { perSecond: 80, perDay: 10000 },
  tier3: { perSecond: 80, perDay: 100000 },
  tier4: { perSecond: 80, perDay: 999999 }
};

class BroadcastQueue {
  constructor(pool) {
    this.pool = pool;
    this.tier = 'tier1'; // Default, debe configurarse según cuenta
  }

  /**
   * Inicializa el worker de broadcasts
   * @param {Function} sendMessageFn - Función para enviar mensaje por WhatsApp
   */
  initializeWorker(sendMessageFn) {
    queueService.registerWorker('broadcast', async (job) => {
      const { broadcastId, recipientPhone, message, variables } = job.data;

      try {
        // Reemplazar variables en mensaje
        const finalMessage = this.replaceVariables(message, variables);

        // Enviar mensaje
        await sendMessageFn(recipientPhone, finalMessage);

        // Actualizar estado del destinatario
        await this.updateRecipientStatus(broadcastId, recipientPhone, 'sent');

        // Actualizar contador de broadcast
        await this.incrementBroadcastSentCount(broadcastId);

        return { success: true, phone: recipientPhone };
      } catch (error) {
        // Marcar como fallido
        await this.updateRecipientStatus(broadcastId, recipientPhone, 'failed', error.message);

        throw error; // Re-throw para que BullMQ maneje reintentos
      }
    }, { concurrency: 10 }); // 10 mensajes en paralelo

    console.log('[BroadcastQueue] Worker initialized');
  }

  /**
   * Crea un nuevo broadcast y encola todos los mensajes
   * @param {Object} broadcastData - Datos del broadcast
   * @returns {Promise<number>} ID del broadcast creado
   */
  async createBroadcast(broadcastData) {
    const { name, message, targetType, targetConfig, scheduleType, scheduledAt, createdBy } = broadcastData;

    // Crear registro de broadcast
    const [result] = await this.pool.query(`
      INSERT INTO broadcasts (name, message_template, target_type, target_config, schedule_type, scheduled_at, created_by, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name,
      message,
      targetType,
      JSON.stringify(targetConfig),
      scheduleType,
      scheduledAt,
      createdBy,
      scheduleType === 'immediate' ? 'sending' : 'scheduled'
    ]);

    const broadcastId = result.insertId;

    // Obtener destinatarios según segmentación
    const recipients = await this.getRecipients(targetType, targetConfig);

    // Actualizar total de destinatarios
    await this.pool.query(`UPDATE broadcasts SET total_recipients = ? WHERE id = ?`, [recipients.length, broadcastId]);

    // Insertar destinatarios en tabla de tracking
    if (recipients.length > 0) {
      const recipientValues = recipients.map(r => [broadcastId, r.phone, 'pending']);
      await this.pool.query(`
        INSERT INTO broadcast_recipients (broadcast_id, phone, status)
        VALUES ?
      `, [recipientValues]);
    }

    // Encolar mensajes si es inmediato
    if (scheduleType === 'immediate') {
      await this.enqueueBroadcastMessages(broadcastId, message, recipients);
    }

    console.log(`[BroadcastQueue] Created broadcast ${broadcastId} with ${recipients.length} recipients`);
    return broadcastId;
  }

  /**
   * Obtiene destinatarios según tipo de segmentación
   * @param {string} targetType - Tipo de segmentación
   * @param {Object} targetConfig - Configuración de segmentación
   * @returns {Promise<Array>}
   */
  async getRecipients(targetType, targetConfig) {
    let query;
    let params = [];

    switch (targetType) {
      case 'all':
        // Todos los contactos activos
        query = `SELECT DISTINCT phone FROM chat_sessions WHERE phone IS NOT NULL`;
        break;

      case 'tags':
        // Contactos con tags específicos
        const { includeTags = [], excludeTags = [] } = targetConfig;

        query = `
          SELECT DISTINCT cs.phone
          FROM chat_sessions cs
          INNER JOIN contact_tags ct ON ct.phone = cs.phone
          WHERE ct.tag IN (?)
        `;
        params.push(includeTags);

        if (excludeTags.length > 0) {
          query += ` AND cs.phone NOT IN (
            SELECT phone FROM contact_tags WHERE tag IN (?)
          )`;
          params.push(excludeTags);
        }
        break;

      case 'custom_query':
        // Query personalizado (con validación)
        // Solo permitir campos específicos por seguridad
        const allowedFields = ['phone', 'last_activity', 'message_count', 'created_at'];
        query = `SELECT DISTINCT phone FROM chat_sessions WHERE phone IS NOT NULL`;

        if (targetConfig.conditions && targetConfig.conditions.length > 0) {
          const conditions = targetConfig.conditions
            .filter(c => allowedFields.includes(c.field))
            .map(c => {
              params.push(c.value);
              return `${c.field} ${this.sanitizeOperator(c.operator)} ?`;
            });

          if (conditions.length > 0) {
            query += ` AND ${conditions.join(' AND ')}`;
          }
        }
        break;

      default:
        throw new Error(`Unknown target type: ${targetType}`);
    }

    const [rows] = await this.pool.query(query, params);
    return rows;
  }

  /**
   * Encola mensajes para un broadcast
   * @param {number} broadcastId - ID del broadcast
   * @param {string} message - Template del mensaje
   * @param {Array} recipients - Lista de destinatarios
   */
  async enqueueBroadcastMessages(broadcastId, message, recipients) {
    const rateLimit = RATE_LIMITS[this.tier];
    const delayBetweenBatches = 1000; // 1 segundo entre batches
    const batchSize = rateLimit.perSecond;

    let batchIndex = 0;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const delay = batchIndex * delayBetweenBatches;

      for (const recipient of batch) {
        // Obtener variables del contacto
        const variables = await this.getContactVariables(recipient.phone);

        await queueService.addJob('broadcast', 'send-message', {
          broadcastId,
          recipientPhone: recipient.phone,
          message,
          variables
        }, {
          delay,
          priority: 5 // Prioridad media
        });
      }

      batchIndex++;
    }

    console.log(`[BroadcastQueue] Enqueued ${recipients.length} messages for broadcast ${broadcastId}`);
  }

  /**
   * Obtiene variables de un contacto para reemplazo
   * @param {string} phone - Teléfono del contacto
   * @returns {Promise<Object>}
   */
  async getContactVariables(phone) {
    try {
      const [rows] = await this.pool.query(`
        SELECT field_name, field_value
        FROM contact_custom_fields
        WHERE phone = ?
      `, [phone]);

      const variables = { phone };
      for (const row of rows) {
        variables[row.field_name] = row.field_value;
      }
      return variables;
    } catch (err) {
      // Si la tabla no existe aún, retornar solo phone
      return { phone };
    }
  }

  /**
   * Reemplaza variables en el mensaje
   * @param {string} message - Mensaje con variables {{var}}
   * @param {Object} variables - Objeto con variables
   * @returns {string}
   */
  replaceVariables(message, variables) {
    if (!message) return message;
    return message.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return variables[varName] !== undefined ? variables[varName] : match;
    });
  }

  /**
   * Actualiza estado de un destinatario
   */
  async updateRecipientStatus(broadcastId, phone, status, errorMessage = null) {
    await this.pool.query(`
      UPDATE broadcast_recipients
      SET status = ?, sent_at = CASE WHEN ? = 'sent' THEN NOW() ELSE sent_at END,
          error_message = ?
      WHERE broadcast_id = ? AND phone = ?
    `, [status, status, errorMessage, broadcastId, phone]);
  }

  /**
   * Incrementa contador de enviados
   */
  async incrementBroadcastSentCount(broadcastId) {
    await this.pool.query(`
      UPDATE broadcasts
      SET sent_count = sent_count + 1,
          sent_at = COALESCE(sent_at, NOW())
      WHERE id = ?
    `, [broadcastId]);
  }

  /**
   * Sanitiza operadores SQL
   */
  sanitizeOperator(op) {
    const allowed = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'];
    return allowed.includes(op.toUpperCase()) ? op : '=';
  }

  /**
   * Obtiene estadísticas de un broadcast
   */
  async getBroadcastStats(broadcastId) {
    const [broadcast] = await this.pool.query(`
      SELECT * FROM broadcasts WHERE id = ?
    `, [broadcastId]);

    if (!broadcast[0]) return null;

    const [stats] = await this.pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM broadcast_recipients
      WHERE broadcast_id = ?
    `, [broadcastId]);

    return {
      ...broadcast[0],
      recipientStats: stats[0]
    };
  }

  /**
   * Marca broadcast como completado
   */
  async completeBroadcast(broadcastId) {
    await this.pool.query(`
      UPDATE broadcasts
      SET status = 'completed', completed_at = NOW()
      WHERE id = ?
    `, [broadcastId]);
  }
}

module.exports = BroadcastQueue;
