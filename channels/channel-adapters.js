/**
 * Channel Adapters
 * Adaptadores para enviar mensajes a diferentes canales
 * Cada canal tiene su propia API y formato de mensajes
 */

const { fetch } = require('undici');

class ChannelAdapters {
  constructor({ logger, db }) {
    this.logger = logger;
    this.db = db;

    // Configuración de cada canal
    this.config = {
      whatsapp: {
        accessToken: process.env.META_ACCESS_TOKEN || '',
        phoneNumberId: process.env.WABA_PHONE_NUMBER_ID || '',
        apiVersion: process.env.GRAPH_API_VERSION || 'v22.0'
      },
      instagram: {
        accessToken: process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '',
        igId: process.env.INSTAGRAM_BUSINESS_ID || ''
      },
      messenger: {
        accessToken: process.env.MESSENGER_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '',
        pageId: process.env.MESSENGER_PAGE_ID || ''
      }
    };
  }

  /**
   * Enviar mensaje a cualquier canal
   * @param {string} channel - 'whatsapp' | 'instagram' | 'messenger' | 'tester'
   * @param {string} userId - ID del usuario en ese canal
   * @param {string} text - Texto del mensaje
   * @param {object} options - Opciones adicionales (botones, media, etc.)
   * @returns {Promise<string>} - ID del mensaje enviado
   */
  async sendMessage(channel, userId, text, options = {}) {
    switch (channel) {
      case 'whatsapp':
        return this.sendWhatsAppMessage(userId, text, options);

      case 'instagram':
        return this.sendInstagramMessage(userId, text, options);

      case 'messenger':
        return this.sendMessengerMessage(userId, text, options);

      case 'tester':
        return this.sendTesterMessage(userId, text, options);

      default:
        throw new Error(`Unknown channel: ${channel}`);
    }
  }

  /**
   * Enviar mensaje a WhatsApp
   */
  async sendWhatsAppMessage(phone, text, options = {}) {
    const { accessToken, phoneNumberId, apiVersion } = this.config.whatsapp;

    if (!accessToken || !phoneNumberId) {
      this.logger.warn('WhatsApp credentials not configured - skipping send');
      return `wa_simulated_${Date.now()}`;
    }

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: text }
    };

    // Botones interactivos
    if (options.buttons && options.buttons.length > 0) {
      payload.type = 'interactive';
      payload.interactive = {
        type: 'button',
        body: { text },
        action: {
          buttons: options.buttons.map((btn, idx) => ({
            type: 'reply',
            reply: {
              id: btn.id || `btn_${idx}`,
              title: btn.label.slice(0, 20) // Max 20 chars
            }
          }))
        }
      };
      delete payload.text;
    }

    // Lista interactiva
    if (options.list && options.list.length > 0) {
      payload.type = 'interactive';
      payload.interactive = {
        type: 'list',
        body: { text },
        action: {
          button: options.listButton || 'Ver opciones',
          sections: [{
            rows: options.list.map((item, idx) => ({
              id: item.id || `list_${idx}`,
              title: item.label.slice(0, 24), // Max 24 chars
              description: item.description?.slice(0, 72) || '' // Max 72 chars
            }))
          }]
        }
      };
      delete payload.text;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`WhatsApp API error: ${JSON.stringify(data)}`);
      }

      return data.messages[0].id;
    } catch (error) {
      this.logger.error({ error: error.message }, 'Error sending WhatsApp message');
      throw error;
    }
  }

  /**
   * Enviar mensaje a Instagram
   */
  async sendInstagramMessage(userId, text, options = {}) {
    const { accessToken, igId } = this.config.instagram;

    if (!accessToken || !igId) {
      this.logger.warn('Instagram credentials not configured - skipping send');
      return `ig_simulated_${Date.now()}`;
    }

    const url = `https://graph.instagram.com/v22.0/${igId}/messages`;

    const payload = {
      recipient: { id: userId },
      message: { text }
    };

    // Quick replies (botones)
    if (options.buttons && options.buttons.length > 0) {
      payload.message.quick_replies = options.buttons.map((btn, idx) => ({
        content_type: 'text',
        title: btn.label.slice(0, 20),
        payload: btn.id || `btn_${idx}`
      }));
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`Instagram API error: ${JSON.stringify(data)}`);
      }

      return data.message_id;
    } catch (error) {
      this.logger.error({ error: error.message }, 'Error sending Instagram message');
      throw error;
    }
  }

  /**
   * Enviar mensaje a Messenger
   */
  async sendMessengerMessage(userId, text, options = {}) {
    const { accessToken } = this.config.messenger;

    if (!accessToken) {
      this.logger.warn('Messenger credentials not configured - skipping send');
      return `fb_simulated_${Date.now()}`;
    }

    const url = `https://graph.facebook.com/v22.0/me/messages`;

    const payload = {
      recipient: { id: userId },
      message: { text }
    };

    // Quick replies (botones)
    if (options.buttons && options.buttons.length > 0) {
      payload.message.quick_replies = options.buttons.slice(0, 13).map((btn, idx) => ({
        content_type: 'text',
        title: btn.label.slice(0, 20),
        payload: btn.id || `btn_${idx}`
      }));
    }

    // Button template (botones persistentes)
    if (options.persistentButtons && options.persistentButtons.length > 0) {
      payload.message = {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: text.slice(0, 640),
            buttons: options.persistentButtons.slice(0, 3).map(btn => ({
              type: 'postback',
              title: btn.label.slice(0, 20),
              payload: btn.id || btn.label
            }))
          }
        }
      };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`Messenger API error: ${JSON.stringify(data)}`);
      }

      return data.message_id;
    } catch (error) {
      this.logger.error({ error: error.message }, 'Error sending Messenger message');
      throw error;
    }
  }

  /**
   * "Enviar" mensaje en Tester (solo guardar en BD)
   */
  async sendTesterMessage(userId, text, options = {}) {
    // En el tester, el mensaje se guarda directamente en la BD
    // por el endpoint de simulación, no necesitamos hacer nada aquí
    this.logger.debug({ userId, text }, 'Tester message - will be saved by simulator');
    return `tester_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ─── Auto-renovación de token Instagram ───

  /**
   * Inicializar: carga token de BD (si existe) y programa renovación semanal
   */
  async initTokenRenewal() {
    try {
      const saved = await this._loadToken('instagram_access_token');
      if (saved) {
        this.config.instagram.accessToken = saved.token;
        this.logger.info({ expiresAt: saved.expiresAt, refreshedAt: saved.refreshedAt },
          '✅ Token Instagram cargado desde BD');
      }
    } catch (e) {
      this.logger.warn({ e: e.message }, 'No se pudo cargar token Instagram de BD, usando .env');
    }

    // Renovar cada 7 días (el token dura 60 días, así queda margen de sobra)
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    this._renewalTimer = setInterval(() => this.refreshInstagramToken(), SEVEN_DAYS);

    // Intentar renovar ahora si el token tiene más de 7 días sin renovarse
    try {
      const saved = await this._loadToken('instagram_access_token');
      if (saved && saved.refreshedAt) {
        const daysSinceRefresh = (Date.now() - new Date(saved.refreshedAt).getTime()) / 86400000;
        if (daysSinceRefresh >= 7) {
          this.logger.info(`Token Instagram tiene ${Math.round(daysSinceRefresh)} días sin renovar, renovando ahora...`);
          await this.refreshInstagramToken();
        }
      }
    } catch (e) { /* silencioso - se renovará en el próximo ciclo */ }

    this.logger.info('✅ Auto-renovación de token Instagram programada (cada 7 días)');
  }

  /**
   * Renovar el token llamando a la API de Instagram
   */
  async refreshInstagramToken() {
    const currentToken = this.config.instagram.accessToken;
    if (!currentToken) {
      this.logger.warn('No hay token Instagram para renovar');
      return;
    }

    try {
      const url = `https://graph.instagram.com/refresh_access_token`
        + `?grant_type=ig_refresh_token`
        + `&access_token=${currentToken}`;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || !data.access_token) {
        throw new Error(JSON.stringify(data.error || data));
      }

      // Actualizar en memoria
      this.config.instagram.accessToken = data.access_token;

      // Guardar en BD con fecha de expiración
      const expiresAt = data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : new Date(Date.now() + 60 * 86400000); // 60 días por defecto

      await this._saveToken('instagram_access_token', data.access_token, expiresAt);

      this.logger.info({ expiresIn: `${Math.round((data.expires_in || 5184000) / 86400)} días` },
        '✅ Token Instagram renovado exitosamente');
    } catch (error) {
      this.logger.error({ error: error.message }, '❌ Error renovando token Instagram');
    }
  }

  async _loadToken(key) {
    const [rows] = await this.db.query(
      'SELECT token_value, expires_at, refreshed_at FROM system_tokens WHERE token_key = ?', [key]
    );
    if (!rows.length) return null;
    return { token: rows[0].token_value, expiresAt: rows[0].expires_at, refreshedAt: rows[0].refreshed_at };
  }

  async _saveToken(key, value, expiresAt) {
    await this.db.query(`
      INSERT INTO system_tokens (token_key, token_value, expires_at, refreshed_at)
      VALUES (?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE token_value = VALUES(token_value), expires_at = VALUES(expires_at), refreshed_at = NOW()
    `, [key, value, expiresAt]);
  }
}

module.exports = ChannelAdapters;
