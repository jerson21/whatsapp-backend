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
        pageId: process.env.INSTAGRAM_PAGE_ID || ''
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
    const { accessToken, pageId } = this.config.instagram;
    // Para Instagram se necesita el Page Access Token
    const pageAccessToken = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN || accessToken;

    if (!pageAccessToken || !pageId) {
      this.logger.warn('Instagram credentials not configured - skipping send');
      return `ig_simulated_${Date.now()}`;
    }

    const url = `https://graph.facebook.com/v22.0/${pageId}/messages`;

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
          'Authorization': `Bearer ${pageAccessToken}`,
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
}

module.exports = ChannelAdapters;
