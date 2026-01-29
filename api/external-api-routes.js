"use strict";

/**
 * External API Routes
 *
 * Autenticación via header X-API-Key (se valida en panelAuth).
 * Permite a CRM, apps móviles y sistemas externos:
 * - Consultar conversaciones del agente
 * - Leer mensajes de una conversación
 * - Enviar mensajes
 * - Asignar chats
 * - Listar departamentos
 */

const { Router } = require('express');

module.exports = function externalApiRoutes(pool, sendTextViaCloudAPI) {
  const router = Router();

  // GET /api/external/conversations — chats del agente autenticado
  router.get('/conversations', async (req, res) => {
    try {
      const agentId = req.agent?.id;
      const agentRole = req.agent?.role;
      const agentDeptId = req.agent?.departmentId;
      const { status, limit: rawLimit, offset: rawOffset } = req.query;

      const limitNum = Math.min(Math.max(Number(rawLimit) || 50, 1), 200);
      const offsetNum = Math.max(Number(rawOffset) || 0, 0);

      let where = "s.status = ?";
      const params = [status || 'OPEN'];

      // Agentes normales ven solo sus chats + su departamento sin asignar
      if (agentRole !== 'supervisor') {
        where += " AND (s.assigned_agent_id = ? OR (s.assigned_department_id = ? AND s.assigned_agent_id IS NULL))";
        params.push(agentId, agentDeptId);
      }

      const [rows] = await pool.query(`
        SELECT s.id AS session_id, s.phone, s.contact_name, s.status,
               s.assigned_agent_id, s.assigned_department_id,
               s.escalation_status, s.chatbot_mode,
               s.created_at, s.updated_at,
               a.name AS agent_name,
               d.display_name AS department_name, d.color AS department_color,
               (SELECT text FROM chat_messages WHERE session_id=s.id ORDER BY id DESC LIMIT 1) AS last_message,
               (SELECT created_at FROM chat_messages WHERE session_id=s.id ORDER BY id DESC LIMIT 1) AS last_message_time
        FROM chat_sessions s
        LEFT JOIN agents a ON a.id = s.assigned_agent_id
        LEFT JOIN departments d ON d.id = s.assigned_department_id
        WHERE ${where}
        ORDER BY last_message_time DESC
        LIMIT ? OFFSET ?
      `, [...params, limitNum, offsetNum]);

      res.json({ ok: true, conversations: rows, limit: limitNum, offset: offsetNum });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/external/conversations/:phone/messages — mensajes de una conversación
  router.get('/conversations/:phone/messages', async (req, res) => {
    try {
      const { phone } = req.params;
      const { limit: rawLimit, offset: rawOffset } = req.query;

      const limitNum = Math.min(Math.max(Number(rawLimit) || 100, 1), 500);
      const offsetNum = Math.max(Number(rawOffset) || 0, 0);

      // Verificar que el agente tiene acceso a esta conversación
      const agentId = req.agent?.id;
      const agentRole = req.agent?.role;
      const agentDeptId = req.agent?.departmentId;

      let accessCheck = "s.phone = ?";
      const accessParams = [phone];

      if (agentRole !== 'supervisor') {
        accessCheck += " AND (s.assigned_agent_id = ? OR s.assigned_department_id = ?)";
        accessParams.push(agentId, agentDeptId);
      }

      const [[session]] = await pool.query(
        `SELECT id FROM chat_sessions s WHERE ${accessCheck} AND s.status='OPEN' LIMIT 1`,
        accessParams
      );

      if (!session) {
        return res.status(404).json({ ok: false, error: 'Conversación no encontrada o sin acceso' });
      }

      const [messages] = await pool.query(`
        SELECT id, direction, text AS body, media_type, media_id, media_mime, media_caption,
               status, is_ai_generated AS is_bot, wa_msg_id, created_at
        FROM chat_messages
        WHERE session_id = ?
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `, [session.id, limitNum, offsetNum]);

      // Revertir para orden cronológico
      messages.reverse();

      res.json({ ok: true, sessionId: session.id, phone, messages, limit: limitNum, offset: offsetNum });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /api/external/send — enviar mensaje
  router.post('/send', async (req, res) => {
    try {
      const { phone, message } = req.body || {};
      if (!phone || !message) {
        return res.status(400).json({ ok: false, error: 'Campos phone y message requeridos' });
      }

      // Verificar acceso
      const agentId = req.agent?.id;
      const agentRole = req.agent?.role;
      const agentDeptId = req.agent?.departmentId;

      let accessCheck = "s.phone = ? AND s.status = 'OPEN'";
      const accessParams = [phone];

      if (agentRole !== 'supervisor') {
        accessCheck += " AND (s.assigned_agent_id = ? OR s.assigned_department_id = ?)";
        accessParams.push(agentId, agentDeptId);
      }

      const [[session]] = await pool.query(
        `SELECT id FROM chat_sessions s WHERE ${accessCheck} LIMIT 1`,
        accessParams
      );

      if (!session) {
        return res.status(404).json({ ok: false, error: 'Conversación no encontrada o sin acceso' });
      }

      // Cuando agente externo envía mensaje, cambiar a modo manual
      await pool.query(`UPDATE chat_sessions SET chatbot_mode='manual' WHERE id=?`, [session.id]);

      const waMsgId = await sendTextViaCloudAPI(phone, message, session.id);

      // Guardar en BD
      const [result] = await pool.query(
        `INSERT INTO chat_messages (session_id, direction, text, wa_jid, wa_msg_id, status, is_ai_generated) VALUES (?,?,?,?,?,?,?)`,
        [session.id, 'out', message, phone, waMsgId, 'sent', 0]
      );

      res.json({ ok: true, messageId: result.insertId, waMsgId });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /api/external/assign — asignar chat a agente/departamento
  router.post('/assign', async (req, res) => {
    try {
      const { sessionId, phone, agentId: targetAgentId, departmentId } = req.body || {};

      // Encontrar sesión por ID o por teléfono
      let session;
      if (sessionId) {
        const [[s]] = await pool.query('SELECT id, phone FROM chat_sessions WHERE id=? AND status="OPEN"', [sessionId]);
        session = s;
      } else if (phone) {
        const [[s]] = await pool.query('SELECT id, phone FROM chat_sessions WHERE phone=? AND status="OPEN" ORDER BY id DESC LIMIT 1', [phone]);
        session = s;
      }

      if (!session) {
        return res.status(404).json({ ok: false, error: 'Sesión no encontrada' });
      }

      // Solo supervisores pueden asignar a otros
      if (req.agent?.role !== 'supervisor' && targetAgentId && Number(targetAgentId) !== req.agent?.id) {
        return res.status(403).json({ ok: false, error: 'Solo supervisores pueden asignar a otros agentes' });
      }

      const updates = [];
      const params = [];

      if (targetAgentId) {
        updates.push('assigned_agent_id=?', "assigned_at=NOW()", "assignment_type='manual'");
        params.push(Number(targetAgentId));
      }
      if (departmentId) {
        updates.push('assigned_department_id=?');
        params.push(Number(departmentId));
      }

      if (updates.length === 0) {
        return res.status(400).json({ ok: false, error: 'Especifica agentId o departmentId' });
      }

      params.push(session.id);
      await pool.query(`UPDATE chat_sessions SET ${updates.join(', ')} WHERE id=?`, params);

      res.json({ ok: true, sessionId: session.id });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/external/departments — listar departamentos
  router.get('/departments', async (req, res) => {
    try {
      const [rows] = await pool.query(
        'SELECT id, name, display_name, icon, color, active FROM departments WHERE active=TRUE ORDER BY name'
      );
      res.json({ ok: true, departments: rows });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/external/me — info del agente autenticado
  router.get('/me', (req, res) => {
    res.json({
      ok: true,
      agent: {
        id: req.agent.id,
        username: req.agent.username,
        name: req.agent.name,
        role: req.agent.role,
        departmentId: req.agent.departmentId
      }
    });
  });

  return router;
};
