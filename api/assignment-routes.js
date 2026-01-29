'use strict';

const { Router } = require('express');

/**
 * API de Asignación y Transferencia de Chats
 * Rutas montadas en /api/chat/
 */
module.exports = function assignmentRoutes(pool) {
  const router = Router();

  // POST /api/chat/assign - Asignar chat a agente y/o departamento
  router.post('/assign', async (req, res) => {
    try {
      const { sessionId, agentId, departmentId } = req.body || {};
      if (!sessionId) return res.status(400).json({ ok: false, error: 'Falta sessionId' });
      if (!agentId && !departmentId) return res.status(400).json({ ok: false, error: 'Falta agentId o departmentId' });

      const updates = ['assigned_at=NOW()', "assignment_type='manual'"];
      const params = [];

      if (agentId) {
        updates.push('assigned_agent_id=?');
        params.push(agentId);
      }
      if (departmentId) {
        updates.push('assigned_department_id=?');
        params.push(departmentId);
      }

      params.push(sessionId);
      await pool.query(`UPDATE chat_sessions SET ${updates.join(', ')} WHERE id=?`, params);

      // Emitir evento socket
      if (global.io) {
        const [[session]] = await pool.query('SELECT phone FROM chat_sessions WHERE id=?', [sessionId]);
        const payload = { sessionId, agentId, departmentId, assignedBy: req.agent?.name, assignmentType: 'manual', phone: session?.phone, timestamp: Date.now() };
        global.io.of('/chat').to('dashboard_all').emit('chat_assigned', payload);
        if (agentId) global.io.of('/chat').to(`agent_${agentId}`).emit('chat_assigned', payload);
        if (departmentId) global.io.of('/chat').to(`department_${departmentId}`).emit('chat_assigned', payload);
      }

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /api/chat/transfer - Transferir chat entre agentes/departamentos
  router.post('/transfer', async (req, res) => {
    try {
      const { sessionId, toAgentId, toDepartmentId, reason } = req.body || {};
      if (!sessionId) return res.status(400).json({ ok: false, error: 'Falta sessionId' });

      // Obtener asignación actual para notificar
      const [[current]] = await pool.query(
        'SELECT assigned_agent_id, assigned_department_id, phone FROM chat_sessions WHERE id=?',
        [sessionId]
      );

      const updates = ['assigned_at=NOW()', "assignment_type='manual'"];
      const params = [];

      if (toAgentId !== undefined) {
        updates.push('assigned_agent_id=?');
        params.push(toAgentId || null);
      }
      if (toDepartmentId !== undefined) {
        updates.push('assigned_department_id=?');
        params.push(toDepartmentId || null);
      }

      params.push(sessionId);
      await pool.query(`UPDATE chat_sessions SET ${updates.join(', ')} WHERE id=?`, params);

      // Emitir evento socket
      if (global.io) {
        const payload = {
          sessionId, phone: current?.phone,
          fromAgentId: current?.assigned_agent_id, toAgentId,
          fromDepartmentId: current?.assigned_department_id, toDepartmentId,
          reason, transferredBy: req.agent?.name, timestamp: Date.now()
        };
        global.io.of('/chat').to('dashboard_all').emit('chat_transferred', payload);
        if (current?.assigned_agent_id) global.io.of('/chat').to(`agent_${current.assigned_agent_id}`).emit('chat_transferred', payload);
        if (toAgentId) global.io.of('/chat').to(`agent_${toAgentId}`).emit('chat_transferred', payload);
        if (toDepartmentId) global.io.of('/chat').to(`department_${toDepartmentId}`).emit('chat_transferred', payload);
      }

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /api/chat/self-assign - Agente toma un chat del queue
  router.post('/self-assign', async (req, res) => {
    try {
      const { sessionId } = req.body || {};
      if (!sessionId) return res.status(400).json({ ok: false, error: 'Falta sessionId' });
      const agentId = req.agent?.id;
      if (!agentId) return res.status(400).json({ ok: false, error: 'No se pudo identificar al agente' });

      await pool.query(
        `UPDATE chat_sessions SET assigned_agent_id=?, assigned_at=NOW(), assignment_type='self' WHERE id=? AND (assigned_agent_id IS NULL OR assigned_agent_id=?)`,
        [agentId, sessionId, agentId]
      );

      if (global.io) {
        const [[session]] = await pool.query('SELECT phone FROM chat_sessions WHERE id=?', [sessionId]);
        global.io.of('/chat').to('dashboard_all').emit('chat_assigned', {
          sessionId, agentId, assignedBy: req.agent?.name, assignmentType: 'self', phone: session?.phone, timestamp: Date.now()
        });
      }

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /api/chat/unassign - Liberar chat al queue
  router.post('/unassign', async (req, res) => {
    try {
      const { sessionId } = req.body || {};
      if (!sessionId) return res.status(400).json({ ok: false, error: 'Falta sessionId' });

      await pool.query(
        `UPDATE chat_sessions SET assigned_agent_id=NULL, assigned_at=NULL, assignment_type=NULL WHERE id=?`,
        [sessionId]
      );

      if (global.io) {
        const [[session]] = await pool.query('SELECT phone, assigned_department_id FROM chat_sessions WHERE id=?', [sessionId]);
        global.io.of('/chat').to('dashboard_all').emit('chat_unassigned', {
          sessionId, phone: session?.phone, departmentId: session?.assigned_department_id, timestamp: Date.now()
        });
      }

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/chat/my-conversations - Chats asignados al agente actual
  router.get('/my-conversations', async (req, res) => {
    try {
      const agentId = req.agent?.id;
      if (!agentId) return res.json({ ok: true, conversations: [] });

      const [conversations] = await pool.query(`
        SELECT s.id, s.phone, s.name, s.status, s.channel, s.assigned_agent_id, s.assigned_department_id,
               d.display_name as department_name, d.color as department_color,
               (SELECT text FROM chat_messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message,
               (SELECT created_at FROM chat_messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message_time,
               (SELECT COUNT(*) FROM chat_messages WHERE session_id = s.id AND direction = 'in' AND status != 'read') as unread_count
        FROM chat_sessions s
        LEFT JOIN departments d ON s.assigned_department_id = d.id
        WHERE s.assigned_agent_id = ? AND s.status = 'OPEN'
        ORDER BY last_message_time DESC
      `, [agentId]);

      res.json({ ok: true, conversations: conversations.map(c => ({ ...c, sessionId: c.id, contact_name: c.name })) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/chat/queue/:departmentId - Chats sin agente en departamento
  router.get('/queue/:departmentId', async (req, res) => {
    try {
      const { departmentId } = req.params;
      const [conversations] = await pool.query(`
        SELECT s.id, s.phone, s.name, s.status, s.channel, s.assigned_department_id,
               (SELECT text FROM chat_messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message,
               (SELECT created_at FROM chat_messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message_time,
               (SELECT COUNT(*) FROM chat_messages WHERE session_id = s.id AND direction = 'in' AND status != 'read') as unread_count
        FROM chat_sessions s
        WHERE s.assigned_department_id = ? AND s.assigned_agent_id IS NULL AND s.status = 'OPEN'
        ORDER BY last_message_time DESC
      `, [departmentId]);

      res.json({ ok: true, conversations: conversations.map(c => ({ ...c, sessionId: c.id, contact_name: c.name })) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/chat/queue - Todos los chats sin agente (supervisor)
  router.get('/queue', async (req, res) => {
    try {
      const [conversations] = await pool.query(`
        SELECT s.id, s.phone, s.name, s.status, s.channel, s.assigned_department_id,
               d.display_name as department_name, d.color as department_color,
               (SELECT text FROM chat_messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message,
               (SELECT created_at FROM chat_messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message_time,
               (SELECT COUNT(*) FROM chat_messages WHERE session_id = s.id AND direction = 'in' AND status != 'read') as unread_count
        FROM chat_sessions s
        LEFT JOIN departments d ON s.assigned_department_id = d.id
        WHERE s.assigned_agent_id IS NULL AND s.status = 'OPEN'
        ORDER BY last_message_time DESC
      `);

      res.json({ ok: true, conversations: conversations.map(c => ({ ...c, sessionId: c.id, contact_name: c.name })) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  return router;
};
