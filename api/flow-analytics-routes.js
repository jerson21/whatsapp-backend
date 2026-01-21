/**
 * API Routes: Flow Analytics
 * Endpoints para métricas y análisis de flujos
 */

const express = require('express');
const router = express.Router();

module.exports = function(db) {

  /**
   * GET /api/flow-analytics/summary
   * KPIs principales de flujos
   */
  router.get('/summary', async (req, res) => {
    try {
      const { days = 7 } = req.query;

      // Overall execution stats
      const [[execStats]] = await db.query(`
        SELECT
          COUNT(*) as total_executions,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'transferred' THEN 1 ELSE 0 END) as transferred,
          AVG(total_duration_ms) as avg_duration_ms,
          AVG(total_nodes_executed) as avg_nodes_executed,
          COUNT(DISTINCT phone) as unique_users
        FROM flow_execution_logs
        WHERE started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      `, [parseInt(days)]);

      // Active flows count
      const [[flowStats]] = await db.query(`
        SELECT
          COUNT(*) as total_flows,
          SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as active_flows,
          SUM(times_triggered) as total_triggered,
          SUM(times_completed) as total_completed
        FROM visual_flows
      `);

      // Lead stats
      const [[leadStats]] = await db.query(`
        SELECT
          COUNT(*) as total_leads,
          AVG(current_score) as avg_score,
          SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END) as qualified_leads,
          SUM(CASE WHEN status = 'customer' THEN 1 ELSE 0 END) as customers
        FROM lead_scores
      `);

      // Calculate completion rate
      const completionRate = execStats.total_executions > 0
        ? Math.round((execStats.completed / execStats.total_executions) * 100)
        : 0;

      res.json({
        success: true,
        summary: {
          executions: {
            total: execStats.total_executions || 0,
            completed: execStats.completed || 0,
            failed: execStats.failed || 0,
            transferred: execStats.transferred || 0,
            completion_rate: completionRate,
            avg_duration_ms: Math.round(execStats.avg_duration_ms || 0),
            avg_nodes: Math.round(execStats.avg_nodes_executed || 0),
            unique_users: execStats.unique_users || 0
          },
          flows: {
            total: flowStats.total_flows || 0,
            active: flowStats.active_flows || 0,
            total_triggered: flowStats.total_triggered || 0,
            total_completed: flowStats.total_completed || 0
          },
          leads: {
            total: leadStats.total_leads || 0,
            avg_score: Math.round(leadStats.avg_score || 0),
            qualified: leadStats.qualified_leads || 0,
            customers: leadStats.customers || 0
          },
          period_days: parseInt(days)
        }
      });
    } catch (err) {
      console.error('Error fetching analytics summary:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/flow-analytics/timeline
   * Datos para gráfico de líneas por día
   */
  router.get('/timeline', async (req, res) => {
    try {
      const { days = 14 } = req.query;

      const [timeline] = await db.query(`
        SELECT
          DATE(started_at) as date,
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'transferred' THEN 1 ELSE 0 END) as transferred,
          COUNT(DISTINCT phone) as unique_users,
          AVG(total_duration_ms) as avg_duration
        FROM flow_execution_logs
        WHERE started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY DATE(started_at)
        ORDER BY date ASC
      `, [parseInt(days)]);

      res.json({
        success: true,
        timeline: timeline.map(row => ({
          ...row,
          avg_duration: Math.round(row.avg_duration || 0)
        }))
      });
    } catch (err) {
      console.error('Error fetching timeline:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/flow-analytics/by-flow
   * Métricas agrupadas por flujo
   */
  router.get('/by-flow', async (req, res) => {
    try {
      const { days = 7 } = req.query;

      const [byFlow] = await db.query(`
        SELECT
          f.id as flow_id,
          f.name as flow_name,
          f.slug,
          f.is_active,
          f.times_triggered as all_time_triggered,
          f.times_completed as all_time_completed,
          COUNT(l.id) as recent_executions,
          SUM(CASE WHEN l.status = 'completed' THEN 1 ELSE 0 END) as recent_completed,
          SUM(CASE WHEN l.status = 'failed' THEN 1 ELSE 0 END) as recent_failed,
          AVG(l.total_duration_ms) as avg_duration,
          AVG(l.total_nodes_executed) as avg_nodes
        FROM visual_flows f
        LEFT JOIN flow_execution_logs l ON l.flow_id = f.id
          AND l.started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY f.id, f.name, f.slug, f.is_active, f.times_triggered, f.times_completed
        ORDER BY recent_executions DESC
      `, [parseInt(days)]);

      res.json({
        success: true,
        flows: byFlow.map(row => ({
          ...row,
          avg_duration: Math.round(row.avg_duration || 0),
          avg_nodes: Math.round(row.avg_nodes || 0),
          completion_rate: row.recent_executions > 0
            ? Math.round((row.recent_completed / row.recent_executions) * 100)
            : 0
        }))
      });
    } catch (err) {
      console.error('Error fetching flow stats:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/flow-analytics/by-hour
   * Distribución de ejecuciones por hora del día
   */
  router.get('/by-hour', async (req, res) => {
    try {
      const { days = 7 } = req.query;

      const [byHour] = await db.query(`
        SELECT
          HOUR(started_at) as hour,
          COUNT(*) as executions
        FROM flow_execution_logs
        WHERE started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY HOUR(started_at)
        ORDER BY hour
      `, [parseInt(days)]);

      // Fill missing hours with 0
      const hourlyData = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        executions: byHour.find(h => h.hour === i)?.executions || 0
      }));

      res.json({
        success: true,
        hourly: hourlyData
      });
    } catch (err) {
      console.error('Error fetching hourly stats:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/flow-analytics/trigger-types
   * Distribución por tipo de trigger
   */
  router.get('/trigger-types', async (req, res) => {
    try {
      const { days = 7 } = req.query;

      const [byTrigger] = await db.query(`
        SELECT
          COALESCE(trigger_type, 'unknown') as trigger_type,
          COUNT(*) as count,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM flow_execution_logs
        WHERE started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY trigger_type
        ORDER BY count DESC
      `, [parseInt(days)]);

      res.json({
        success: true,
        trigger_types: byTrigger
      });
    } catch (err) {
      console.error('Error fetching trigger type stats:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/flow-analytics/top-nodes
   * Nodos más ejecutados (para identificar cuellos de botella)
   */
  router.get('/top-nodes', async (req, res) => {
    try {
      const { days = 7, limit = 10 } = req.query;

      // This is more complex - need to parse JSON steps
      // Simplified version: just count by final node
      const [topFinalNodes] = await db.query(`
        SELECT
          final_node_type as node_type,
          COUNT(*) as count,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful
        FROM flow_execution_logs
        WHERE started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
          AND final_node_type IS NOT NULL
        GROUP BY final_node_type
        ORDER BY count DESC
        LIMIT ?
      `, [parseInt(days), parseInt(limit)]);

      res.json({
        success: true,
        final_nodes: topFinalNodes
      });
    } catch (err) {
      console.error('Error fetching top nodes:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
