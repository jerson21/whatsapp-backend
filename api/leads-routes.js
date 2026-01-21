/**
 * API Routes: Lead Management
 * Endpoints para gestión de leads y scoring
 */

const express = require('express');
const router = express.Router();

module.exports = function(db) {

  /**
   * GET /api/leads
   * Listar leads con filtros y paginación
   */
  router.get('/', async (req, res) => {
    try {
      const {
        status,
        min_score,
        max_score,
        search,
        sort_by = 'current_score',
        sort_dir = 'desc',
        limit = 50,
        offset = 0
      } = req.query;

      let query = `
        SELECT
          ls.id,
          ls.phone,
          ls.current_score,
          ls.score_breakdown,
          ls.status,
          ls.total_messages,
          ls.total_sessions,
          ls.total_purchases,
          ls.first_contact,
          ls.last_interaction,
          ls.created_at,
          cs.name as contact_name,
          (SELECT COUNT(*) FROM chat_messages WHERE session_id IN
            (SELECT id FROM chat_sessions WHERE phone = ls.phone)
          ) as message_count
        FROM lead_scores ls
        LEFT JOIN chat_sessions cs ON cs.phone = ls.phone
        WHERE 1=1
      `;
      const params = [];

      if (status) {
        query += ' AND ls.status = ?';
        params.push(status);
      }

      if (min_score) {
        query += ' AND ls.current_score >= ?';
        params.push(parseInt(min_score));
      }

      if (max_score) {
        query += ' AND ls.current_score <= ?';
        params.push(parseInt(max_score));
      }

      if (search) {
        query += ' AND (ls.phone LIKE ? OR cs.name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      // Validate sort column to prevent SQL injection
      const validSortColumns = ['current_score', 'last_interaction', 'total_messages', 'created_at'];
      const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'current_score';
      const sortDirection = sort_dir.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      query += ` ORDER BY ls.${sortColumn} ${sortDirection} LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), parseInt(offset));

      const [rows] = await db.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) as total FROM lead_scores ls WHERE 1=1';
      const countParams = [];

      if (status) {
        countQuery += ' AND ls.status = ?';
        countParams.push(status);
      }
      if (min_score) {
        countQuery += ' AND ls.current_score >= ?';
        countParams.push(parseInt(min_score));
      }

      const [[{ total }]] = await db.query(countQuery, countParams);

      // Parse JSON fields
      const leads = rows.map(row => ({
        ...row,
        score_breakdown: typeof row.score_breakdown === 'string'
          ? JSON.parse(row.score_breakdown)
          : row.score_breakdown
      }));

      res.json({
        success: true,
        leads,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (err) {
      console.error('Error fetching leads:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/leads/stats
   * Estadísticas de leads
   */
  router.get('/stats', async (req, res) => {
    try {
      // Overall stats
      const [[stats]] = await db.query(`
        SELECT
          COUNT(*) as total_leads,
          AVG(current_score) as avg_score,
          SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_leads,
          SUM(CASE WHEN status = 'engaged' THEN 1 ELSE 0 END) as engaged_leads,
          SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END) as qualified_leads,
          SUM(CASE WHEN status = 'customer' THEN 1 ELSE 0 END) as customers,
          SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive_leads
        FROM lead_scores
      `);

      // Score distribution
      const [scoreDistribution] = await db.query(`
        SELECT
          CASE
            WHEN current_score >= 80 THEN 'hot'
            WHEN current_score >= 50 THEN 'warm'
            WHEN current_score >= 20 THEN 'cold'
            ELSE 'new'
          END as category,
          COUNT(*) as count
        FROM lead_scores
        GROUP BY category
      `);

      // Recent leads
      const [recentLeads] = await db.query(`
        SELECT phone, current_score, status, created_at
        FROM lead_scores
        ORDER BY created_at DESC
        LIMIT 5
      `);

      res.json({
        success: true,
        stats: {
          ...stats,
          avg_score: Math.round(stats.avg_score || 0)
        },
        score_distribution: scoreDistribution,
        recent_leads: recentLeads
      });
    } catch (err) {
      console.error('Error fetching lead stats:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/leads/:phone
   * Perfil completo de un lead
   */
  router.get('/:phone', async (req, res) => {
    try {
      const { phone } = req.params;

      // Get lead info
      const [leadRows] = await db.query(`
        SELECT * FROM lead_scores WHERE phone = ?
      `, [phone]);

      if (leadRows.length === 0) {
        return res.status(404).json({ success: false, error: 'Lead not found' });
      }

      const lead = leadRows[0];

      // Parse JSON fields
      if (typeof lead.score_breakdown === 'string') {
        lead.score_breakdown = JSON.parse(lead.score_breakdown);
      }
      if (typeof lead.score_history === 'string') {
        lead.score_history = JSON.parse(lead.score_history);
      }

      // Get classifications
      const [classifications] = await db.query(`
        SELECT classification, flow_triggered, classified_at
        FROM message_classifications
        WHERE phone = ?
        ORDER BY classified_at DESC
        LIMIT 10
      `, [phone]);

      // Get recent messages
      const [messages] = await db.query(`
        SELECT text, direction, created_at
        FROM chat_messages cm
        JOIN chat_sessions cs ON cm.session_id = cs.id
        WHERE cs.phone = ?
        ORDER BY cm.created_at DESC
        LIMIT 20
      `, [phone]);

      // Get flow executions
      const [flowExecutions] = await db.query(`
        SELECT flow_name, status, started_at, completed_at
        FROM flow_execution_logs
        WHERE phone = ?
        ORDER BY started_at DESC
        LIMIT 10
      `, [phone]);

      res.json({
        success: true,
        lead: {
          ...lead,
          classifications: classifications.map(c => ({
            ...c,
            classification: typeof c.classification === 'string'
              ? JSON.parse(c.classification)
              : c.classification
          })),
          recent_messages: messages,
          flow_executions: flowExecutions
        }
      });
    } catch (err) {
      console.error('Error fetching lead profile:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * PUT /api/leads/:phone
   * Actualizar lead
   */
  router.put('/:phone', async (req, res) => {
    try {
      const { phone } = req.params;
      const { status, current_score, notes } = req.body;

      const updates = [];
      const params = [];

      if (status) {
        updates.push('status = ?');
        params.push(status);
      }

      if (current_score !== undefined) {
        updates.push('current_score = ?');
        params.push(parseInt(current_score));
      }

      if (updates.length === 0) {
        return res.status(400).json({ success: false, error: 'No fields to update' });
      }

      params.push(phone);

      await db.query(`
        UPDATE lead_scores SET ${updates.join(', ')} WHERE phone = ?
      `, params);

      res.json({ success: true, message: 'Lead updated' });
    } catch (err) {
      console.error('Error updating lead:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/leads
   * Crear o actualizar lead
   */
  router.post('/', async (req, res) => {
    try {
      const { phone, score = 0, status = 'new' } = req.body;

      if (!phone) {
        return res.status(400).json({ success: false, error: 'Phone is required' });
      }

      await db.query(`
        INSERT INTO lead_scores (phone, current_score, status, first_contact, last_interaction)
        VALUES (?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          last_interaction = NOW(),
          current_score = GREATEST(current_score, VALUES(current_score))
      `, [phone, score, status]);

      res.json({ success: true, message: 'Lead created/updated' });
    } catch (err) {
      console.error('Error creating lead:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * DELETE /api/leads/:phone
   * Eliminar lead
   */
  router.delete('/:phone', async (req, res) => {
    try {
      const { phone } = req.params;

      await db.query('DELETE FROM lead_scores WHERE phone = ?', [phone]);

      res.json({ success: true, message: 'Lead deleted' });
    } catch (err) {
      console.error('Error deleting lead:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/leads/:phone/adjust-score
   * Ajustar score de un lead
   */
  router.post('/:phone/adjust-score', async (req, res) => {
    try {
      const { phone } = req.params;
      const { adjustment, reason } = req.body;

      if (!adjustment) {
        return res.status(400).json({ success: false, error: 'Adjustment value is required' });
      }

      // Get current score
      const [[lead]] = await db.query(
        'SELECT current_score, score_history FROM lead_scores WHERE phone = ?',
        [phone]
      );

      if (!lead) {
        return res.status(404).json({ success: false, error: 'Lead not found' });
      }

      const newScore = Math.max(0, Math.min(100, lead.current_score + parseInt(adjustment)));

      // Update score history
      let history = lead.score_history;
      if (typeof history === 'string') history = JSON.parse(history);
      if (!Array.isArray(history)) history = [];

      history.push({
        date: new Date().toISOString(),
        previous_score: lead.current_score,
        new_score: newScore,
        adjustment: parseInt(adjustment),
        reason: reason || 'Manual adjustment'
      });

      // Keep only last 50 history entries
      if (history.length > 50) {
        history = history.slice(-50);
      }

      await db.query(`
        UPDATE lead_scores
        SET current_score = ?, score_history = ?, last_interaction = NOW()
        WHERE phone = ?
      `, [newScore, JSON.stringify(history), phone]);

      res.json({
        success: true,
        message: 'Score adjusted',
        new_score: newScore
      });
    } catch (err) {
      console.error('Error adjusting score:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
