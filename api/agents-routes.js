'use strict';

const { Router } = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * CRUD de Agentes (supervisor only)
 * Rutas: GET/, POST/, PUT/:id, DELETE/:id, POST/:id/regenerate-api-key
 */
module.exports = function agentsRoutes(pool) {
  const router = Router();

  // GET /api/agents - Listar agentes
  router.get('/', async (req, res) => {
    try {
      const [agents] = await pool.query(`
        SELECT a.id, a.username, a.name, a.email, a.role, a.department_id,
               a.status, a.avatar_color, a.api_key, a.created_at, a.last_login,
               d.display_name as department_name, d.color as department_color
        FROM agents a
        LEFT JOIN departments d ON a.department_id = d.id
        ORDER BY a.role DESC, a.name ASC
      `);
      res.json({ ok: true, agents });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/agents/online - Agentes conectados
  router.get('/online', async (req, res) => {
    try {
      // agentPresence es un Map global expuesto en app-cloud.js
      const online = [];
      if (global.agentPresence) {
        for (const [agentId, info] of global.agentPresence) {
          online.push({ agentId, name: info.name, connectedAt: info.connectedAt });
        }
      }
      res.json({ ok: true, online });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /api/agents - Crear agente
  router.post('/', async (req, res) => {
    try {
      const { username, password, name, email, role, departmentId, avatarColor } = req.body || {};

      if (!username || !password || !name) {
        return res.status(400).json({ ok: false, error: 'Faltan campos requeridos: username, password, name' });
      }
      if (username.length < 3) {
        return res.status(400).json({ ok: false, error: 'El username debe tener al menos 3 caracteres' });
      }
      if (password.length < 6) {
        return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres' });
      }
      if (role && !['supervisor', 'agent'].includes(role)) {
        return res.status(400).json({ ok: false, error: 'Rol inválido. Usar: supervisor o agent' });
      }

      // Verificar username único
      const [existing] = await pool.query('SELECT id FROM agents WHERE username=?', [username]);
      if (existing.length) {
        return res.status(409).json({ ok: false, error: 'El username ya existe' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const apiKey = crypto.randomBytes(32).toString('hex');

      const [result] = await pool.query(
        `INSERT INTO agents (username, password_hash, name, email, role, department_id, avatar_color, api_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [username, passwordHash, name, email || null, role || 'agent', departmentId || null, avatarColor || '#6366f1', apiKey]
      );

      res.json({
        ok: true,
        agent: {
          id: result.insertId,
          username, name, email, role: role || 'agent',
          departmentId: departmentId || null,
          avatarColor: avatarColor || '#6366f1',
          apiKey
        }
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // PUT /api/agents/:id - Actualizar agente
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, email, role, departmentId, avatarColor, status, password } = req.body || {};

      const updates = [];
      const params = [];

      if (name !== undefined) { updates.push('name=?'); params.push(name); }
      if (email !== undefined) { updates.push('email=?'); params.push(email || null); }
      if (role !== undefined) {
        if (!['supervisor', 'agent'].includes(role)) {
          return res.status(400).json({ ok: false, error: 'Rol inválido' });
        }
        updates.push('role=?'); params.push(role);
      }
      if (departmentId !== undefined) { updates.push('department_id=?'); params.push(departmentId || null); }
      if (avatarColor !== undefined) { updates.push('avatar_color=?'); params.push(avatarColor); }
      if (status !== undefined) {
        if (!['active', 'inactive'].includes(status)) {
          return res.status(400).json({ ok: false, error: 'Status inválido' });
        }
        updates.push('status=?'); params.push(status);
      }
      if (password) {
        if (password.length < 6) {
          return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres' });
        }
        const hash = await bcrypt.hash(password, 10);
        updates.push('password_hash=?'); params.push(hash);
      }

      if (!updates.length) {
        return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
      }

      params.push(id);
      await pool.query(`UPDATE agents SET ${updates.join(', ')} WHERE id=?`, params);

      const [[agent]] = await pool.query(
        `SELECT a.id, a.username, a.name, a.email, a.role, a.department_id, a.status, a.avatar_color, a.api_key,
                d.display_name as department_name
         FROM agents a LEFT JOIN departments d ON a.department_id = d.id
         WHERE a.id=?`,
        [id]
      );

      res.json({ ok: true, agent });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // DELETE /api/agents/:id - Desactivar agente (soft delete)
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      // No permitir eliminar al propio usuario
      if (req.agent && req.agent.id === Number(id)) {
        return res.status(400).json({ ok: false, error: 'No puedes desactivar tu propia cuenta' });
      }

      await pool.query('UPDATE agents SET status="inactive" WHERE id=?', [id]);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /api/agents/:id/regenerate-api-key - Regenerar API key
  router.post('/:id/regenerate-api-key', async (req, res) => {
    try {
      const { id } = req.params;
      const apiKey = crypto.randomBytes(32).toString('hex');
      await pool.query('UPDATE agents SET api_key=? WHERE id=?', [apiKey, id]);
      res.json({ ok: true, apiKey });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  return router;
};
