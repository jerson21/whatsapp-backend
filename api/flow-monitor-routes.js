/**
 * API Routes: Flow Monitor en Tiempo Real
 * Endpoints SSE para monitorear ejecuciones de flujos
 */

const express = require('express');
const router = express.Router();

// Suscriptores del monitor (connections SSE)
const monitorSubscribers = new Set();

// Cache de ejecuciones activas en memoria
const activeExecutions = new Map(); // executionId -> execution data

/**
 * Emitir evento a todos los monitores conectados
 */
function emitFlowEvent(event) {
  if (!monitorSubscribers.size) return;

  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of monitorSubscribers) {
    try {
      res.write(data);
    } catch (err) {
      // Si falla, el cliente se desconectó
      monitorSubscribers.delete(res);
    }
  }

  // Actualizar cache de ejecuciones activas
  if (event.type === 'flow_started') {
    activeExecutions.set(event.executionId, {
      ...event,
      currentNodeId: null,
      steps: [],
      startedAt: event.timestamp
    });
  } else if (event.type === 'node_started' || event.type === 'node_completed') {
    const exec = activeExecutions.get(event.executionId);
    if (exec) {
      exec.currentNodeId = event.nodeId;
      exec.currentNodeType = event.nodeType;
      exec.variables = event.variables;
      if (event.type === 'node_completed') {
        exec.steps.push({
          nodeId: event.nodeId,
          nodeType: event.nodeType,
          durationMs: event.durationMs,
          status: event.status,
          timestamp: event.timestamp
        });
      }
    }
  } else if (event.type === 'flow_completed' || event.type === 'flow_error' || event.type === 'flow_transferred') {
    // Mover a completados y limpiar después de 30 segundos
    const exec = activeExecutions.get(event.executionId);
    if (exec) {
      exec.status = event.type === 'flow_completed' ? 'completed' :
                    event.type === 'flow_error' ? 'failed' : 'transferred';
      exec.completedAt = event.timestamp;
      setTimeout(() => activeExecutions.delete(event.executionId), 30000);
    }
  }
}

module.exports = function(db) {

  /**
   * GET /api/flow-monitor/stream
   * Stream SSE para monitorear ejecuciones en tiempo real
   */
  router.get('/stream', (req, res) => {
    // Configurar headers SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Agregar a suscriptores
    monitorSubscribers.add(res);
    console.log(`[FlowMonitor] Cliente conectado. Total: ${monitorSubscribers.size}`);

    // Enviar estado inicial
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      activeCount: activeExecutions.size,
      timestamp: new Date().toISOString()
    })}\n\n`);

    // Enviar ejecuciones activas actuales
    for (const [id, exec] of activeExecutions) {
      res.write(`data: ${JSON.stringify({
        type: 'active_execution',
        ...exec
      })}\n\n`);
    }

    // Heartbeat cada 25 segundos
    const heartbeat = setInterval(() => {
      try {
        res.write('event: ping\ndata: {}\n\n');
      } catch {
        clearInterval(heartbeat);
        monitorSubscribers.delete(res);
      }
    }, 25000);

    // Cleanup al desconectar
    req.on('close', () => {
      clearInterval(heartbeat);
      monitorSubscribers.delete(res);
      console.log(`[FlowMonitor] Cliente desconectado. Total: ${monitorSubscribers.size}`);
    });
  });

  /**
   * GET /api/flow-monitor/active
   * Obtener ejecuciones activas (snapshot)
   */
  router.get('/active', async (req, res) => {
    try {
      // Obtener de la base de datos
      const [rows] = await db.query(`
        SELECT
          id,
          flow_id,
          flow_name,
          flow_slug,
          phone,
          contact_name,
          status,
          trigger_message,
          trigger_type,
          steps,
          variables,
          total_nodes_executed,
          started_at
        FROM flow_execution_logs
        WHERE status = 'running'
        ORDER BY started_at DESC
        LIMIT 50
      `);

      // Parsear JSON fields
      const executions = rows.map(row => ({
        ...row,
        steps: typeof row.steps === 'string' ? JSON.parse(row.steps || '[]') : (row.steps || []),
        variables: typeof row.variables === 'string' ? JSON.parse(row.variables || '{}') : (row.variables || {})
      }));

      res.json({
        success: true,
        executions,
        memoryCache: Array.from(activeExecutions.values())
      });
    } catch (err) {
      console.error('Error fetching active executions:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/flow-monitor/recent
   * Obtener ejecuciones recientes (últimos 5 minutos)
   */
  router.get('/recent', async (req, res) => {
    try {
      const [rows] = await db.query(`
        SELECT
          id,
          flow_id,
          flow_name,
          phone,
          status,
          trigger_message,
          total_nodes_executed,
          total_duration_ms,
          started_at,
          completed_at
        FROM flow_execution_logs
        WHERE started_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
        ORDER BY started_at DESC
        LIMIT 100
      `);

      res.json({
        success: true,
        executions: rows
      });
    } catch (err) {
      console.error('Error fetching recent executions:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/flow-monitor/stats
   * Estadísticas en tiempo real
   */
  router.get('/stats', async (req, res) => {
    try {
      // Ejecuciones activas
      const [[activeStats]] = await db.query(`
        SELECT COUNT(*) as running FROM flow_execution_logs WHERE status = 'running'
      `);

      // Últimos 5 minutos
      const [[recentStats]] = await db.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'transferred' THEN 1 ELSE 0 END) as transferred,
          AVG(total_duration_ms) as avg_duration
        FROM flow_execution_logs
        WHERE started_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
      `);

      res.json({
        success: true,
        stats: {
          running: activeStats.running,
          connectedMonitors: monitorSubscribers.size,
          last5Minutes: recentStats
        }
      });
    } catch (err) {
      console.error('Error fetching stats:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return { router, emitFlowEvent };
};
