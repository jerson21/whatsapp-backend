'use strict';

/**
 * learning-routes.js
 *
 * API REST para gestionar el sistema de aprendizaje:
 * - Pares Q&A aprendidos (listar, aprobar, rechazar, eliminar, reprocesar)
 * - Precios vigentes (CRUD)
 * - Estadisticas
 * - Reporte cerebral IA (auto-analisis con OpenAI)
 */

const express = require('express');

// =============================================
// Helpers para el reporte cerebral
// =============================================

const TOPIC_KEYWORDS = {
  'Precios y Cotizaciones': /precio|costo|valor|cotiz|cu[aá]nto/i,
  'Medidas y Tallas': /plaza|king|queen|full|medida|tama[nñ]o|dimensi/i,
  'Despacho y Envio': /despacho|env[ií]o|enviar|entrega|transporte|santiago|regi[oó]n/i,
  'Plazos y Fabricacion': /plazo|d[ií]as|semana|demora|fabricar|fabricaci/i,
  'Materiales y Calidad': /material|tela|espuma|calidad|garant[ií]a|densidad/i,
  'Pagos y Transferencias': /pago|transfer|abono|cuota|mercadopago|webpay/i,
  'Productos y Modelos': /modelo|colch[oó]n|cama|box|somm?ier|respaldo/i,
  'Reclamos y Problemas': /reclamo|problema|da[nñ]ado|devol|queja/i
};

function extractTopics(pairs) {
  return Object.entries(TOPIC_KEYWORDS)
    .map(([topic, pattern]) => ({
      topic,
      count: pairs.filter(p => pattern.test(p.question) || pattern.test(p.answer)).length
    }))
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count);
}

function generateFallbackSections(rawData) {
  return {
    resumen: rawData.stats.approved > 0
      ? `El sistema tiene ${rawData.stats.approved} pares de conocimiento aprobados y ${rawData.stats.active_prices} precios activos. La calidad promedio de las respuestas es ${rawData.stats.avg_quality}/100.`
      : 'El sistema aun no tiene conocimiento aprobado. Aprueba pares Q&A para que la IA comience a aprender.',
    temas_dominados: rawData.sample_topics.map(t => ({
      tema: t.topic,
      confianza: Math.min(100, t.count * 15),
      ejemplos: t.count,
      detalle: `${t.count} pares de Q&A relacionados`
    })),
    brechas_conocimiento: [],
    razonamiento: 'Analisis detallado no disponible (sin clave OpenAI configurada). Los datos crudos estan disponibles para revision manual.',
    capacidades: {
      puede_responder_precios: rawData.stats.active_prices > 0,
      puede_comparar_productos: rawData.stats.active_prices > 3,
      puede_recomendar: rawData.stats.approved > 10,
      puede_dar_plazos: rawData.sample_topics.some(t => t.topic.includes('Plazo')),
      puede_informar_despacho: rawData.sample_topics.some(t => t.topic.includes('Despacho'))
    },
    metricas_confianza: {
      confianza_general: Math.min(100, rawData.stats.approved * 2),
      cobertura_temas: Math.min(100, rawData.sample_topics.length * 15),
      calidad_respuestas: rawData.stats.avg_quality || 0,
      actualizacion_precios: rawData.stats.active_prices > 0 ? 80 : 0
    },
    recomendaciones: [
      rawData.stats.pending > 0 ? `Hay ${rawData.stats.pending} pares pendientes de revision.` : null,
      rawData.stats.approved < 20 ? 'Aumentar la base de conocimiento aprobando mas pares Q&A.' : null,
      rawData.stats.active_prices === 0 ? 'No hay precios cargados. Agregar precios permite responder consultas comerciales.' : null,
      'Configurar OPENAI_API_KEY para obtener un analisis detallado generado por IA.'
    ].filter(Boolean)
  };
}

// =============================================
// Factory function
// =============================================

module.exports = function createLearningRoutes(pool, conversationLearner, openaiClient) {
  const router = express.Router();

  // =============================================
  // PARES Q&A
  // =============================================

  /**
   * GET /pairs — Listar pares (paginado, con filtros)
   * Query params: page, limit, status, channel, minQuality
   */
  router.get('/pairs', async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const offset = (page - 1) * limit;

      let where = '1=1';
      const params = [];

      if (req.query.status) {
        where += ' AND status = ?';
        params.push(req.query.status);
      }
      if (req.query.channel) {
        where += ' AND channel = ?';
        params.push(req.query.channel);
      }
      if (req.query.minQuality) {
        where += ' AND quality_score >= ?';
        params.push(Number(req.query.minQuality));
      }

      const [countResult] = await pool.query(
        `SELECT COUNT(*) as total FROM learned_qa_pairs WHERE ${where}`,
        params
      );
      const total = countResult[0].total;

      const [pairs] = await pool.query(
        `SELECT id, session_id, question, answer, quality_score, status, agent_id, channel, created_at
         FROM learned_qa_pairs
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      res.json({
        ok: true,
        pairs,
        total,
        page,
        pages: Math.ceil(total / limit)
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /**
   * PATCH /pairs/:id — Aprobar o rechazar un par
   * Body: { status: 'approved' | 'rejected' }
   */
  router.patch('/pairs/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ ok: false, error: 'Status debe ser approved o rejected' });
      }

      const [result] = await pool.query(
        'UPDATE learned_qa_pairs SET status = ? WHERE id = ?',
        [status, id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: 'Par no encontrado' });
      }

      res.json({ ok: true, id: Number(id), status });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /**
   * DELETE /pairs/:id — Eliminar un par
   */
  router.delete('/pairs/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const [result] = await pool.query('DELETE FROM learned_qa_pairs WHERE id = ?', [id]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: 'Par no encontrado' });
      }

      res.json({ ok: true, id: Number(id) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /**
   * POST /reprocess — Re-procesar sesiones pasadas
   * Body: { from?: '2026-01-01', to?: '2026-01-31' }
   */
  router.post('/reprocess', async (req, res) => {
    try {
      const { from, to } = req.body;
      const result = await conversationLearner.reprocessSessions({ from, to });
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /**
   * GET /stats — Estadisticas del sistema de aprendizaje
   */
  router.get('/stats', async (req, res) => {
    try {
      const [[totals]] = await pool.query(`
        SELECT
          COUNT(*) as total,
          SUM(status = 'pending') as pending,
          SUM(status = 'approved') as approved,
          SUM(status = 'rejected') as rejected,
          SUM(status = 'approved' AND embedding IS NOT NULL) as with_embedding,
          ROUND(AVG(quality_score), 1) as avg_quality
        FROM learned_qa_pairs
      `);

      const [channels] = await pool.query(`
        SELECT channel, COUNT(*) as count
        FROM learned_qa_pairs
        GROUP BY channel
      `);

      const by_channel = {};
      channels.forEach(c => { by_channel[c.channel] = c.count; });

      res.json({
        ok: true,
        stats: {
          total: totals.total || 0,
          pending: Number(totals.pending) || 0,
          approved: Number(totals.approved) || 0,
          rejected: Number(totals.rejected) || 0,
          with_embedding: Number(totals.with_embedding) || 0,
          avg_quality: totals.avg_quality || 0,
          by_channel
        }
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // =============================================
  // PRECIOS VIGENTES
  // =============================================

  /**
   * GET /prices — Listar precios vigentes
   */
  router.get('/prices', async (req, res) => {
    try {
      const activeOnly = req.query.active !== 'false';
      const where = activeOnly ? 'WHERE is_active = TRUE' : '';

      const [prices] = await pool.query(
        `SELECT id, product_name, variant, price, currency, is_active, notes, updated_at
         FROM product_prices ${where}
         ORDER BY product_name, price ASC`
      );

      res.json({ ok: true, prices });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /**
   * POST /prices — Agregar precio
   * Body: { product_name, variant?, price, currency?, notes? }
   */
  router.post('/prices', async (req, res) => {
    try {
      const { product_name, variant, price, currency, notes } = req.body;

      if (!product_name || price == null) {
        return res.status(400).json({ ok: false, error: 'product_name y price son requeridos' });
      }

      const [result] = await pool.query(
        `INSERT INTO product_prices (product_name, variant, price, currency, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [product_name, variant || null, price, currency || 'CLP', notes || null]
      );

      res.json({ ok: true, id: result.insertId });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /**
   * PUT /prices/:id — Actualizar precio
   */
  router.put('/prices/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { product_name, variant, price, currency, notes, is_active } = req.body;

      const [result] = await pool.query(
        `UPDATE product_prices
         SET product_name = COALESCE(?, product_name),
             variant = COALESCE(?, variant),
             price = COALESCE(?, price),
             currency = COALESCE(?, currency),
             notes = COALESCE(?, notes),
             is_active = COALESCE(?, is_active)
         WHERE id = ?`,
        [product_name, variant, price, currency, notes, is_active, id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: 'Precio no encontrado' });
      }

      res.json({ ok: true, id: Number(id) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /**
   * DELETE /prices/:id — Desactivar precio
   */
  router.delete('/prices/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const [result] = await pool.query(
        'UPDATE product_prices SET is_active = FALSE WHERE id = ?',
        [id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: 'Precio no encontrado' });
      }

      res.json({ ok: true, id: Number(id) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // =============================================
  // REPORTE CEREBRAL IA
  // =============================================

  /**
   * GET /brain-report — Reporte de auto-analisis de la IA
   * Query: force=true para forzar regeneracion
   */
  router.get('/brain-report', async (req, res) => {
    try {
      const forceRegenerate = req.query.force === 'true';

      // 1. Obtener conteos actuales para hash de invalidacion
      const [[counts]] = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM learned_qa_pairs WHERE status = 'approved') as approved_pairs,
          (SELECT COUNT(*) FROM product_prices WHERE is_active = TRUE) as active_prices
      `);
      const currentHash = `${counts.approved_pairs}-${counts.active_prices}`;

      // 2. Buscar reporte cacheado
      if (!forceRegenerate) {
        const [cached] = await pool.query(
          `SELECT report_json, generated_at, pairs_hash FROM brain_reports
           ORDER BY generated_at DESC LIMIT 1`
        );
        if (cached.length > 0) {
          const report = cached[0];
          const ageMinutes = (Date.now() - new Date(report.generated_at).getTime()) / 60000;
          if (ageMinutes < 60 && report.pairs_hash === currentHash) {
            const reportData = typeof report.report_json === 'string'
              ? JSON.parse(report.report_json)
              : report.report_json;
            return res.json({
              ok: true,
              report: reportData,
              cached: true,
              generated_at: report.generated_at
            });
          }
        }
      }

      // 3. Recopilar datos para el reporte
      const [approvedPairs] = await pool.query(
        `SELECT question, answer, quality_score, channel, created_at
         FROM learned_qa_pairs WHERE status = 'approved'
         ORDER BY quality_score DESC LIMIT 200`
      );

      const [activePrices] = await pool.query(
        `SELECT product_name, variant, price, currency, notes
         FROM product_prices WHERE is_active = TRUE
         ORDER BY product_name, price`
      );

      const [[stats]] = await pool.query(`
        SELECT
          COUNT(*) as total_pairs,
          SUM(status = 'approved') as approved,
          SUM(status = 'pending') as pending,
          SUM(status = 'rejected') as rejected,
          ROUND(AVG(quality_score), 1) as avg_quality,
          SUM(status = 'approved' AND embedding IS NOT NULL) as with_embedding,
          MIN(created_at) as first_learned,
          MAX(created_at) as last_learned
        FROM learned_qa_pairs
      `);

      const [channelDist] = await pool.query(`
        SELECT channel, COUNT(*) as count
        FROM learned_qa_pairs WHERE status = 'approved'
        GROUP BY channel
      `);

      const rawData = {
        stats: {
          total_pairs: stats.total_pairs || 0,
          approved: Number(stats.approved) || 0,
          pending: Number(stats.pending) || 0,
          rejected: Number(stats.rejected) || 0,
          avg_quality: stats.avg_quality || 0,
          with_embedding: Number(stats.with_embedding) || 0,
          active_prices: activePrices.length,
          first_learned: stats.first_learned,
          last_learned: stats.last_learned,
          channels: channelDist.reduce((acc, c) => { acc[c.channel] = c.count; return acc; }, {})
        },
        sample_topics: extractTopics(approvedPairs),
        prices_summary: activePrices.map(p => ({
          product: p.product_name,
          variant: p.variant,
          price: `${p.currency || 'CLP'} ${p.price}`
        }))
      };

      // 4. Si no hay OpenAI, retornar datos crudos con fallback
      if (!openaiClient) {
        return res.json({
          ok: true,
          report: {
            ai_available: false,
            ...rawData,
            ai_analysis: generateFallbackSections(rawData)
          },
          cached: false,
          generated_at: new Date().toISOString()
        });
      }

      // 5. Generar reporte con OpenAI
      const systemPrompt = `Eres un sistema de IA que analiza su propio conocimiento adquirido.
Genera un reporte de auto-analisis en espanol basado en los datos que se te proporcionan.
Este reporte es para que el administrador del sistema entienda que sabe la IA, que le falta, y como razona.

IMPORTANTE: Responde UNICAMENTE con un JSON valido (sin markdown, sin backticks) con esta estructura exacta:
{
  "resumen": "Parrafo de 2-3 oraciones resumiendo el estado general del conocimiento",
  "temas_dominados": [
    { "tema": "nombre del tema", "confianza": 85, "ejemplos": 3, "detalle": "explicacion breve" }
  ],
  "brechas_conocimiento": [
    { "area": "nombre del area", "descripcion": "que falta por aprender", "prioridad": "alta|media|baja" }
  ],
  "razonamiento": "Parrafo explicando como procesas y conectas la informacion que tienes. Habla en primera persona.",
  "capacidades": {
    "puede_responder_precios": true,
    "puede_comparar_productos": true,
    "puede_recomendar": true,
    "puede_dar_plazos": true,
    "puede_informar_despacho": true
  },
  "metricas_confianza": {
    "confianza_general": 75,
    "cobertura_temas": 60,
    "calidad_respuestas": 82,
    "actualizacion_precios": 90
  },
  "recomendaciones": [
    "Recomendacion 1 para mejorar el conocimiento",
    "Recomendacion 2"
  ]
}`;

      const pricesText = activePrices.length > 0
        ? activePrices.map(p => `- ${p.product_name}${p.variant ? ' (' + p.variant + ')' : ''}: ${p.currency || 'CLP'} $${p.price}${p.notes ? ' — ' + p.notes : ''}`).join('\n')
        : '(Sin precios cargados)';

      const pairsText = approvedPairs.length > 0
        ? approvedPairs.slice(0, 30).map((p, i) => `${i + 1}. P: "${p.question}" → R: "${p.answer}" (calidad: ${p.quality_score}, canal: ${p.channel})`).join('\n')
        : '(Sin pares aprobados aun)';

      const topicsText = rawData.sample_topics.length > 0
        ? rawData.sample_topics.map(t => `- ${t.topic}: ${t.count} pares`).join('\n')
        : '(Sin temas detectados)';

      const userPrompt = `Analiza los siguientes datos sobre mi conocimiento adquirido:

ESTADISTICAS:
- Total de pares Q&A: ${rawData.stats.total_pairs}
- Aprobados: ${rawData.stats.approved}
- Pendientes de revision: ${rawData.stats.pending}
- Rechazados: ${rawData.stats.rejected}
- Con embedding vectorial: ${rawData.stats.with_embedding}
- Calidad promedio: ${rawData.stats.avg_quality}/100
- Canales: ${JSON.stringify(rawData.stats.channels)}
- Primer aprendizaje: ${rawData.stats.first_learned || 'nunca'}
- Ultimo aprendizaje: ${rawData.stats.last_learned || 'nunca'}

PRECIOS QUE CONOZCO (${activePrices.length} productos):
${pricesText}

EJEMPLOS DE PREGUNTAS Y RESPUESTAS APRENDIDAS (top ${Math.min(approvedPairs.length, 30)}):
${pairsText}

TEMAS DETECTADOS:
${topicsText}

Genera el reporte JSON de auto-analisis.`;

      const completion = await openaiClient.chat.completions.create({
        model: process.env.CHATBOT_AI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });

      let aiReport;
      try {
        const raw = completion.choices[0].message.content.trim();
        const cleaned = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
        aiReport = JSON.parse(cleaned);
      } catch (_parseErr) {
        aiReport = {
          resumen: completion.choices[0].message.content,
          parse_error: true
        };
      }

      const fullReport = {
        ai_available: true,
        ...rawData,
        ai_analysis: aiReport
      };

      // 6. Guardar en cache
      await pool.query(
        `INSERT INTO brain_reports (report_json, pairs_hash) VALUES (?, ?)`,
        [JSON.stringify(fullReport), currentHash]
      );

      // Limpiar reportes viejos (mantener ultimos 10)
      await pool.query(`
        DELETE FROM brain_reports WHERE id NOT IN (
          SELECT id FROM (SELECT id FROM brain_reports ORDER BY generated_at DESC LIMIT 10) t
        )
      `);

      res.json({
        ok: true,
        report: fullReport,
        cached: false,
        generated_at: new Date().toISOString()
      });

    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  return router;
};
