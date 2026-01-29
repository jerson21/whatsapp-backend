'use strict';

const { Router } = require('express');

/**
 * CRUD de Departamentos
 * GET abierto a todos los agentes autenticados
 * POST/PUT/DELETE solo supervisores
 */
module.exports = function departmentsRoutes(pool, supervisorOnly) {
  const router = Router();

  // GET /api/departments - Listar departamentos (todos los agentes)
  router.get('/', async (req, res) => {
    try {
      const [departments] = await pool.query(`
        SELECT d.*,
          (SELECT COUNT(*) FROM agents a WHERE a.department_id = d.id AND a.status = 'active') as agent_count
        FROM departments d
        ORDER BY d.name ASC
      `);
      res.json({ ok: true, departments });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /api/departments - Crear departamento (supervisor only)
  router.post('/', supervisorOnly, async (req, res) => {
    try {
      const { name, displayName, icon, color, autoAssignIntents } = req.body || {};

      if (!name || !displayName) {
        return res.status(400).json({ ok: false, error: 'Faltan campos requeridos: name, displayName' });
      }

      const [existing] = await pool.query('SELECT id FROM departments WHERE name=?', [name]);
      if (existing.length) {
        return res.status(409).json({ ok: false, error: 'El nombre de departamento ya existe' });
      }

      const intentsJson = JSON.stringify(autoAssignIntents || []);

      const [result] = await pool.query(
        `INSERT INTO departments (name, display_name, icon, color, auto_assign_intents) VALUES (?, ?, ?, ?, ?)`,
        [name, displayName, icon || 'MessageSquare', color || '#6f42c1', intentsJson]
      );

      res.json({
        ok: true,
        department: {
          id: result.insertId,
          name, display_name: displayName,
          icon: icon || 'MessageSquare',
          color: color || '#6f42c1',
          auto_assign_intents: autoAssignIntents || [],
          active: true
        }
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // PUT /api/departments/:id - Actualizar departamento (supervisor only)
  router.put('/:id', supervisorOnly, async (req, res) => {
    try {
      const { id } = req.params;
      const { displayName, icon, color, autoAssignIntents, active } = req.body || {};

      const updates = [];
      const params = [];

      if (displayName !== undefined) { updates.push('display_name=?'); params.push(displayName); }
      if (icon !== undefined) { updates.push('icon=?'); params.push(icon); }
      if (color !== undefined) { updates.push('color=?'); params.push(color); }
      if (autoAssignIntents !== undefined) { updates.push('auto_assign_intents=?'); params.push(JSON.stringify(autoAssignIntents)); }
      if (active !== undefined) { updates.push('active=?'); params.push(active ? 1 : 0); }

      if (!updates.length) {
        return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
      }

      params.push(id);
      await pool.query(`UPDATE departments SET ${updates.join(', ')} WHERE id=?`, params);

      const [[dept]] = await pool.query('SELECT * FROM departments WHERE id=?', [id]);
      res.json({ ok: true, department: dept });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // DELETE /api/departments/:id - Desactivar departamento (supervisor only)
  router.delete('/:id', supervisorOnly, async (req, res) => {
    try {
      const { id } = req.params;

      // No permitir eliminar 'general' (fallback)
      const [[dept]] = await pool.query('SELECT name FROM departments WHERE id=?', [id]);
      if (dept?.name === 'general') {
        return res.status(400).json({ ok: false, error: 'No se puede eliminar el departamento General' });
      }

      await pool.query('UPDATE departments SET active=FALSE WHERE id=?', [id]);
      // Mover agentes del depto desactivado a NULL
      await pool.query('UPDATE agents SET department_id=NULL WHERE department_id=?', [id]);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  return router;
};
