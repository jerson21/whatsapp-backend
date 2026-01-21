/**
 * API Routes: Message Classifier
 * Endpoints para gestionar reglas de clasificación y probar el clasificador
 */

const express = require('express');
const router = express.Router();

module.exports = function(db, classifier) {

  // ============================================
  // REGLAS DE CLASIFICACIÓN
  // ============================================

  /**
   * GET /api/classifier/rules
   * Listar todas las reglas
   */
  router.get('/rules', async (req, res) => {
    try {
      const { type, active } = req.query;

      let query = 'SELECT * FROM classifier_rules WHERE 1=1';
      const params = [];

      if (type) {
        query += ' AND type = ?';
        params.push(type);
      }

      if (active !== undefined) {
        query += ' AND active = ?';
        params.push(active === 'true');
      }

      query += ' ORDER BY type, priority DESC';

      const [rows] = await db.query(query, params);

      // Parsear JSON conditions
      const rules = rows.map(row => ({
        ...row,
        conditions: typeof row.conditions === 'string' ? JSON.parse(row.conditions) : row.conditions
      }));

      res.json({
        success: true,
        count: rules.length,
        rules
      });
    } catch (err) {
      console.error('Error listing rules:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/classifier/rules/:id
   * Obtener una regla específica
   */
  router.get('/rules/:id', async (req, res) => {
    try {
      const [rows] = await db.query(
        'SELECT * FROM classifier_rules WHERE id = ?',
        [req.params.id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Rule not found' });
      }

      const rule = {
        ...rows[0],
        conditions: typeof rows[0].conditions === 'string' ? JSON.parse(rows[0].conditions) : rows[0].conditions
      };

      res.json({ success: true, rule });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/classifier/rules
   * Crear nueva regla
   */
  router.post('/rules', async (req, res) => {
    try {
      const { name, description, type, conditions, result_value, score_modifier, priority, active } = req.body;

      // Validaciones
      if (!name || !type || !conditions) {
        return res.status(400).json({
          success: false,
          error: 'Required fields: name, type, conditions'
        });
      }

      const validTypes = ['intent', 'urgency', 'lead_score', 'sentiment'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          error: `Invalid type. Valid types: ${validTypes.join(', ')}`
        });
      }

      const [result] = await db.query(`
        INSERT INTO classifier_rules
        (name, description, type, conditions, result_value, score_modifier, priority, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        name,
        description || null,
        type,
        JSON.stringify(conditions),
        result_value || null,
        score_modifier || 0,
        priority || 0,
        active !== false
      ]);

      // Recargar reglas en el clasificador
      await classifier.loadRules();

      res.status(201).json({
        success: true,
        message: 'Rule created',
        id: result.insertId
      });
    } catch (err) {
      console.error('Error creating rule:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * PUT /api/classifier/rules/:id
   * Actualizar regla existente
   */
  router.put('/rules/:id', async (req, res) => {
    try {
      const { name, description, type, conditions, result_value, score_modifier, priority, active } = req.body;

      // Verificar que existe
      const [existing] = await db.query(
        'SELECT id FROM classifier_rules WHERE id = ?',
        [req.params.id]
      );

      if (existing.length === 0) {
        return res.status(404).json({ success: false, error: 'Rule not found' });
      }

      // Construir update dinámico
      const updates = [];
      const params = [];

      if (name !== undefined) { updates.push('name = ?'); params.push(name); }
      if (description !== undefined) { updates.push('description = ?'); params.push(description); }
      if (type !== undefined) { updates.push('type = ?'); params.push(type); }
      if (conditions !== undefined) { updates.push('conditions = ?'); params.push(JSON.stringify(conditions)); }
      if (result_value !== undefined) { updates.push('result_value = ?'); params.push(result_value); }
      if (score_modifier !== undefined) { updates.push('score_modifier = ?'); params.push(score_modifier); }
      if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }
      if (active !== undefined) { updates.push('active = ?'); params.push(active); }

      if (updates.length === 0) {
        return res.status(400).json({ success: false, error: 'No fields to update' });
      }

      params.push(req.params.id);

      await db.query(
        `UPDATE classifier_rules SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      // Recargar reglas
      await classifier.loadRules();

      res.json({ success: true, message: 'Rule updated' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * DELETE /api/classifier/rules/:id
   * Eliminar regla
   */
  router.delete('/rules/:id', async (req, res) => {
    try {
      const [result] = await db.query(
        'DELETE FROM classifier_rules WHERE id = ?',
        [req.params.id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, error: 'Rule not found' });
      }

      // Recargar reglas
      await classifier.loadRules();

      res.json({ success: true, message: 'Rule deleted' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================
  // TESTING Y ANÁLISIS
  // ============================================

  /**
   * POST /api/classifier/test
   * Probar clasificación de un mensaje
   */
  router.post('/test', async (req, res) => {
    try {
      const { message, phone, save } = req.body;

      if (!message) {
        return res.status(400).json({
          success: false,
          error: 'Message is required'
        });
      }

      const context = {
        phone: phone || null,
        sessionId: null,
        flowTriggered: null
      };

      // No guardar por defecto en tests
      if (!save) {
        context.phone = null;
      }

      const classification = await classifier.classify(message, context);

      res.json({
        success: true,
        classification
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/classifier/stats
   * Estadísticas de clasificación
   */
  router.get('/stats', async (req, res) => {
    try {
      const days = parseInt(req.query.days) || 7;
      const stats = await classifier.getStats(days);

      res.json({
        success: true,
        period: `${days} days`,
        stats
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/classifier/history
   * Historial de clasificaciones
   */
  router.get('/history', async (req, res) => {
    try {
      const { phone, intent, limit = 50, offset = 0 } = req.query;

      let query = 'SELECT * FROM message_classifications WHERE 1=1';
      const params = [];

      if (phone) {
        query += ' AND phone = ?';
        params.push(phone);
      }

      if (intent) {
        query += ' AND JSON_UNQUOTE(JSON_EXTRACT(classification, "$.intent.type")) = ?';
        params.push(intent);
      }

      query += ' ORDER BY classified_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      const [rows] = await db.query(query, params);

      // Parsear classification JSON
      const history = rows.map(row => ({
        ...row,
        classification: typeof row.classification === 'string' ? JSON.parse(row.classification) : row.classification
      }));

      res.json({
        success: true,
        count: history.length,
        history
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================
  // LEAD SCORING
  // ============================================

  /**
   * GET /api/classifier/leads
   * Listar leads con sus scores
   */
  router.get('/leads', async (req, res) => {
    try {
      const { status, min_score, limit = 50 } = req.query;

      let query = 'SELECT * FROM lead_scores WHERE 1=1';
      const params = [];

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      if (min_score) {
        query += ' AND current_score >= ?';
        params.push(parseInt(min_score));
      }

      query += ' ORDER BY current_score DESC LIMIT ?';
      params.push(parseInt(limit));

      const [rows] = await db.query(query, params);

      const leads = rows.map(row => ({
        ...row,
        score_breakdown: row.score_breakdown ? (typeof row.score_breakdown === 'string' ? JSON.parse(row.score_breakdown) : row.score_breakdown) : null,
        score_history: row.score_history ? (typeof row.score_history === 'string' ? JSON.parse(row.score_history) : row.score_history) : []
      }));

      res.json({
        success: true,
        count: leads.length,
        leads
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/classifier/leads/:phone
   * Detalle de un lead específico
   */
  router.get('/leads/:phone', async (req, res) => {
    try {
      const [rows] = await db.query(
        'SELECT * FROM lead_scores WHERE phone = ?',
        [req.params.phone]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Lead not found' });
      }

      const lead = {
        ...rows[0],
        score_breakdown: rows[0].score_breakdown ? JSON.parse(rows[0].score_breakdown) : null,
        score_history: rows[0].score_history ? JSON.parse(rows[0].score_history) : []
      };

      // Obtener últimas clasificaciones de este lead
      const [classifications] = await db.query(`
        SELECT message_text, classification, classified_at
        FROM message_classifications
        WHERE phone = ?
        ORDER BY classified_at DESC
        LIMIT 10
      `, [req.params.phone]);

      lead.recent_classifications = classifications.map(c => ({
        ...c,
        classification: typeof c.classification === 'string' ? JSON.parse(c.classification) : c.classification
      }));

      res.json({ success: true, lead });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
