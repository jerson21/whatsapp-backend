/**
 * Channel Detector
 * Detecta de qué canal proviene el mensaje basándose en la estructura del webhook
 */

class ChannelDetector {
  /**
   * Detectar canal desde el webhook payload
   * @param {object} body - Body del webhook
   * @param {object} headers - Headers HTTP del webhook
   * @returns {string} - 'whatsapp' | 'instagram' | 'messenger' | 'tester'
   */
  static detectChannel(body, headers = {}) {
    // WhatsApp Cloud API
    if (body.object === 'whatsapp_business_account') {
      return 'whatsapp';
    }

    // Instagram (usa Graph API similar a WhatsApp)
    if (body.object === 'instagram') {
      return 'instagram';
    }

    // Messenger (Facebook Messenger)
    if (body.object === 'page') {
      return 'messenger';
    }

    // Tester (simulación interna)
    if (headers['x-simulator'] === 'true' || body._simulator === true) {
      return 'tester';
    }

    // Default: WhatsApp (para compatibilidad)
    return 'whatsapp';
  }

  /**
   * Normalizar mensaje desde diferentes canales a formato estándar
   * @param {object} rawMessage - Mensaje crudo del webhook
   * @param {string} channel - Canal detectado
   * @returns {object} - Mensaje normalizado
   */
  static normalizeMessage(rawMessage, channel) {
    switch (channel) {
      case 'whatsapp':
        return this.normalizeWhatsApp(rawMessage);

      case 'instagram':
        return this.normalizeInstagram(rawMessage);

      case 'messenger':
        return this.normalizeMessenger(rawMessage);

      case 'tester':
        return this.normalizeTester(rawMessage);

      default:
        throw new Error(`Unknown channel: ${channel}`);
    }
  }

  /**
   * Normalizar mensaje de WhatsApp
   */
  static normalizeWhatsApp(message) {
    const from = message.from; // E.164 format
    const messageId = message.id;

    let text = '';
    let mediaType = null;
    let mediaId = null;
    let metadata = {};

    // Texto
    if (message.text) {
      text = message.text.body;
    }
    // Imagen
    else if (message.image) {
      mediaType = 'image';
      mediaId = message.image.id;
      text = message.image.caption || '';
      metadata.mimeType = message.image.mime_type;
      metadata.sha256 = message.image.sha256;
    }
    // Video
    else if (message.video) {
      mediaType = 'video';
      mediaId = message.video.id;
      text = message.video.caption || '';
      metadata.mimeType = message.video.mime_type;
      metadata.sha256 = message.video.sha256;
    }
    // Audio
    else if (message.audio) {
      mediaType = 'audio';
      mediaId = message.audio.id;
      metadata.mimeType = message.audio.mime_type;
      metadata.sha256 = message.audio.sha256;
      // Detectar si es nota de voz
      if (message.audio.voice === true) {
        metadata.isVoice = true;
      }
    }
    // Documento
    else if (message.document) {
      mediaType = 'document';
      mediaId = message.document.id;
      text = message.document.filename || '';
      metadata.mimeType = message.document.mime_type;
      metadata.sha256 = message.document.sha256;
      metadata.filename = message.document.filename;
    }
    // Sticker
    else if (message.sticker) {
      mediaType = 'sticker';
      mediaId = message.sticker.id;
      metadata.mimeType = message.sticker.mime_type || 'image/webp';
      metadata.sha256 = message.sticker.sha256;
      metadata.animated = message.sticker.animated || false;
    }
    // Location (ubicación)
    else if (message.location) {
      mediaType = 'location';
      metadata.latitude = message.location.latitude;
      metadata.longitude = message.location.longitude;
      metadata.name = message.location.name || null;
      metadata.address = message.location.address || null;
      metadata.url = message.location.url || null;
      // Texto descriptivo para mostrar
      text = message.location.name || message.location.address || `📍 ${message.location.latitude}, ${message.location.longitude}`;
    }
    // Contacts (contactos compartidos)
    else if (message.contacts && Array.isArray(message.contacts)) {
      mediaType = 'contacts';
      metadata.contacts = message.contacts.map(c => ({
        name: c.name?.formatted_name || c.name?.first_name || 'Sin nombre',
        phones: c.phones?.map(p => ({ phone: p.phone, type: p.type })) || [],
        emails: c.emails?.map(e => ({ email: e.email, type: e.type })) || []
      }));
      // Texto descriptivo
      const names = metadata.contacts.map(c => c.name).join(', ');
      text = `📇 Contacto: ${names}`;
    }
    // Reaction (reacción a mensaje)
    else if (message.reaction) {
      mediaType = 'reaction';
      metadata.emoji = message.reaction.emoji;
      metadata.reactedMessageId = message.reaction.message_id;
      text = message.reaction.emoji || '';
    }
    // Botón simple (no interactivo)
    else if (message.button) {
      text = message.button.text;
      metadata.buttonPayload = message.button.payload;
    }
    // Botón interactivo
    else if (message.interactive?.type === 'button_reply') {
      text = message.interactive.button_reply.title;
      metadata.buttonId = message.interactive.button_reply.id;
    }
    // Lista interactiva
    else if (message.interactive?.type === 'list_reply') {
      text = message.interactive.list_reply.title;
      metadata.listId = message.interactive.list_reply.id;
    }
    // Flow interactivo (nfm_reply)
    else if (message.interactive?.type === 'nfm_reply') {
      mediaType = 'flow_reply';
      text = message.interactive.nfm_reply?.name || 'Flow response';
      metadata.flowResponseJson = message.interactive.nfm_reply?.response_json;
      metadata.flowBody = message.interactive.nfm_reply?.body;
    }
    // Orden (order)
    else if (message.order) {
      mediaType = 'order';
      metadata.catalogId = message.order.catalog_id;
      metadata.products = message.order.product_items;
      text = `🛒 Orden con ${message.order.product_items?.length || 0} productos`;
    }
    // Mensaje no soportado/desconocido
    else if (message.type === 'unsupported') {
      mediaType = 'unsupported';
      text = '[Mensaje no soportado]';
    }

    return {
      userId: from,
      messageId,
      text,
      mediaType,
      mediaId,
      metadata,
      channel: 'whatsapp',
      timestamp: parseInt(message.timestamp) * 1000
    };
  }

  /**
   * Normalizar mensaje de Instagram
   */
  static normalizeInstagram(message) {
    // Instagram usa estructura similar a Messenger
    const from = message.sender.id;
    const messageId = message.mid;

    let text = message.message?.text || '';
    let mediaType = null;
    let mediaId = null;
    let metadata = {};

    // Imagen/Video en Instagram
    if (message.message?.attachments) {
      const attachment = message.message.attachments[0];
      if (attachment.type === 'image') {
        mediaType = 'image';
        mediaId = attachment.payload.url;
      } else if (attachment.type === 'video') {
        mediaType = 'video';
        mediaId = attachment.payload.url;
      }
    }

    // Story reply/mention
    if (message.story) {
      metadata.isStoryReply = true;
      metadata.storyId = message.story.id;
    }

    return {
      userId: from,
      messageId,
      text,
      mediaType,
      mediaId,
      metadata,
      channel: 'instagram',
      timestamp: message.timestamp
    };
  }

  /**
   * Normalizar mensaje de Messenger
   */
  static normalizeMessenger(message) {
    const from = message.sender.id;
    const messageId = message.mid;

    let text = message.message?.text || '';
    let mediaType = null;
    let mediaId = null;
    let metadata = {};

    // Attachments (imagen, video, audio, archivo)
    if (message.message?.attachments) {
      const attachment = message.message.attachments[0];
      mediaType = attachment.type; // image, video, audio, file
      mediaId = attachment.payload.url;
    }

    // Quick reply (botones rápidos)
    if (message.message?.quick_reply) {
      metadata.quickReplyPayload = message.message.quick_reply.payload;
    }

    // Postback (botones persistentes)
    if (message.postback) {
      text = message.postback.title;
      metadata.postbackPayload = message.postback.payload;
    }

    return {
      userId: from,
      messageId,
      text,
      mediaType,
      mediaId,
      metadata,
      channel: 'messenger',
      timestamp: message.timestamp
    };
  }

  /**
   * Normalizar mensaje del Tester
   */
  static normalizeTester(message) {
    return {
      userId: message.phone || message.userId,
      messageId: `tester_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: message.message || message.text || '',
      mediaType: null,
      mediaId: null,
      metadata: {},
      channel: 'tester',
      timestamp: Date.now()
    };
  }
}

module.exports = ChannelDetector;
