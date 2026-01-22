/**
 * API Routes: Flow Execution Logs
 * Endpoints para ver logs de ejecución de flujos
 */

const express = require('express');
const router = express.Router();

module.exports = function(db) {

  /**
   * GET /api/flow-logs
   * Listar logs de ejecución con filtros
   */
  router.get('/', async (req, res) => {
    try {
      const {
        flow_id,
        phone,
        status,
        date_from,
        date_to,
        limit = 50,
        offset = 0
      } = req.query;

      let query = `
        SELECT
          id,
          flow_id,
          flow_name,
          flow_slug,
          phone,
          session_id,
          status,
          trigger_message,
          trigger_type,
          total_nodes_executed,
          total_duration_ms,
          was_transferred,
          error_message,
          started_at,
          completed_at
        FROM flow_execution_logs
        WHERE 1=1
      `;
      const params = [];

      if (flow_id) {
        query += ' AND flow_id = ?';
        params.push(flow_id);
      }

      if (phone) {
        query += ' AND phone LIKE ?';
        params.push(`%${phone}%`);
      }

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      if (date_from) {
        query += ' AND started_at >= ?';
        params.push(date_from);
      }

      if (date_to) {
        query += ' AND started_at <= ?';
        params.push(date_to);
      }

      query += ' ORDER BY started_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      const [rows] = await db.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) as total FROM flow_execution_logs WHERE 1=1';
      const countParams = [];

      if (flow_id) {
        countQuery += ' AND flow_id = ?';
        countParams.push(flow_id);
      }
      if (phone) {
        countQuery += ' AND phone LIKE ?';
        countParams.push(`%${phone}%`);
      }
      if (status) {
        countQuery += ' AND status = ?';
        countParams.push(status);
      }

      const [[{ total }]] = await db.query(countQuery, countParams);

      res.json({
        success: true,
        logs: rows,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (err) {
      console.error('Error fetching flow logs:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/flow-logs/stats/summary
   * Obtener estadísticas resumidas
   * IMPORTANTE: Esta ruta debe ir ANTES de /:id para evitar conflictos
   */
  router.get('/stats/summary', async (req, res) => {
    try {
      const { days = 7 } = req.query;

      // Overall stats
      const [[stats]] = await db.query(`
        SELECT
          COUNT(*) as total_executions,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'transferred' THEN 1 ELSE 0 END) as transferred,
          AVG(total_duration_ms) as avg_duration_ms,
          AVG(total_nodes_executed) as avg_nodes_executed
        FROM flow_execution_logs
        WHERE started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      `, [parseInt(days)]);

      // Stats by flow
      const [byFlow] = await db.query(`
        SELECT
          flow_id,
          flow_name,
          COUNT(*) as executions,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          AVG(total_duration_ms) as avg_duration_ms
        FROM flow_execution_logs
        WHERE started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY flow_id, flow_name
        ORDER BY executions DESC
        LIMIT 10
      `, [parseInt(days)]);

      // Timeline (executions per day)
      const [timeline] = await db.query(`
        SELECT
          DATE(started_at) as date,
          COUNT(*) as executions,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM flow_execution_logs
        WHERE started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY DATE(started_at)
        ORDER BY date ASC
      `, [parseInt(days)]);

      res.json({
        success: true,
        stats: {
          ...stats,
          completion_rate: stats.total_executions > 0
            ? Math.round((stats.completed / stats.total_executions) * 100)
            : 0
        },
        by_flow: byFlow,
        timeline
      });
    } catch (err) {
      console.error('Error fetching stats:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/flow-logs/:id
   * Obtener detalle de una ejecución
   * IMPORTANTE: Esta ruta debe ir DESPUÉS de /stats/summary
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const [rows] = await db.query(`
        SELECT * FROM flow_execution_logs WHERE id = ?
      `, [id]);

      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Log not found' });
      }

      const log = rows[0];

      // Parse JSON fields
      if (typeof log.steps === 'string') log.steps = JSON.parse(log.steps);
      if (typeof log.variables === 'string') log.variables = JSON.parse(log.variables);
      if (typeof log.classification === 'string') log.classification = JSON.parse(log.classification);

      res.json({
        success: true,
        log
      });
    } catch (err) {
      console.error('Error fetching log detail:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * DELETE /api/flow-logs/:id
   * Eliminar un log (admin)
   */
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      await db.query('DELETE FROM flow_execution_logs WHERE id = ?', [id]);

      res.json({ success: true, message: 'Log deleted' });
    } catch (err) {
      console.error('Error deleting log:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * DELETE /api/flow-logs
   * Limpiar logs antiguos
   */
  router.delete('/', async (req, res) => {
    try {
      const { older_than_days = 30 } = req.query;

      const [result] = await db.query(`
        DELETE FROM flow_execution_logs
        WHERE started_at < DATE_SUB(NOW(), INTERVAL ? DAY)
      `, [parseInt(older_than_days)]);

      res.json({
        success: true,
        message: `Deleted ${result.affectedRows} old logs`,
        deleted: result.affectedRows
      });
    } catch (err) {
      console.error('Error cleaning logs:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
