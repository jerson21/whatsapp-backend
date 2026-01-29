/**
 * Migration: Sistema de Agentes y Departamentos
 * Crea tablas departments, agents y altera chat_sessions
 *
 * Ejecutar manualmente: node scripts/migrate-agents.js
 * O automáticamente via auto-migrate.js en Docker
 */

const mysql = require('mysql2/promise');
const path = require('path');

// Cargar .env si existe
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

async function migrateAgents() {
  let connection;
  try {
    console.log('🔄 [MIGRATE-AGENTS] Iniciando migración de agentes y departamentos...');

    connection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'whatsapp_chat'
    });

    // 1. Tabla departments
    await connection.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        display_name VARCHAR(100) NOT NULL,
        icon VARCHAR(50) DEFAULT 'MessageSquare',
        color VARCHAR(20) DEFAULT '#6f42c1',
        auto_assign_intents JSON NULL COMMENT 'Array de intents que auto-rutan a este departamento',
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_dept_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Tabla departments creada/verificada');

    // 2. Seed departamentos por defecto
    const defaultDepartments = [
      { name: 'ventas', display_name: 'Ventas', icon: 'ShoppingCart', color: '#28a745', intents: '["ventas","comprar","precio","cotizar","producto"]' },
      { name: 'soporte', display_name: 'Soporte', icon: 'Wrench', color: '#17a2b8', intents: '["soporte","problema","error","ayuda","falla"]' },
      { name: 'postventa', display_name: 'Post-venta', icon: 'Package', color: '#ffc107', intents: '["postventa","devolucion","cambio","garantia","entrega","reclamo"]' },
      { name: 'general', display_name: 'General', icon: 'MessageSquare', color: '#6f42c1', intents: '[]' }
    ];

    for (const dept of defaultDepartments) {
      await connection.query(
        `INSERT IGNORE INTO departments (name, display_name, icon, color, auto_assign_intents) VALUES (?, ?, ?, ?, ?)`,
        [dept.name, dept.display_name, dept.icon, dept.color, dept.intents]
      );
    }
    console.log('✅ Departamentos por defecto insertados');

    // 3. Tabla agents
    await connection.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NULL,
        role ENUM('supervisor','agent') DEFAULT 'agent',
        department_id INT NULL,
        status ENUM('active','inactive') DEFAULT 'active',
        avatar_color VARCHAR(20) DEFAULT '#6366f1',
        api_key VARCHAR(64) NULL UNIQUE COMMENT 'Para acceso API externa',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login TIMESTAMP NULL,
        INDEX idx_agent_status (status),
        INDEX idx_agent_role (role),
        INDEX idx_agent_dept (department_id),
        INDEX idx_agent_api_key (api_key),
        CONSTRAINT fk_agent_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Tabla agents creada/verificada');

    // 4. Seed supervisor inicial desde env vars (si existen)
    const adminUser = process.env.ADMIN_USER;
    const adminPass = process.env.ADMIN_PASS;
    if (adminUser && adminPass) {
      try {
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash(adminPass, 10);
        await connection.query(
          `INSERT IGNORE INTO agents (username, password_hash, name, role, status, avatar_color) VALUES (?, ?, 'Administrador', 'supervisor', 'active', '#22c55e')`,
          [adminUser, hash]
        );
        console.log(`✅ Supervisor '${adminUser}' creado/verificado`);
      } catch (e) {
        console.log(`⚠️  No se pudo crear supervisor desde env vars: ${e.message}`);
        console.log('   Instala bcryptjs: npm install bcryptjs');
      }
    }

    // 5. Alterar chat_sessions para asignación
    const columnsToAdd = [
      { name: 'assigned_agent_id', sql: 'ADD COLUMN assigned_agent_id INT NULL AFTER escalated_at' },
      { name: 'assigned_department_id', sql: 'ADD COLUMN assigned_department_id INT NULL AFTER assigned_agent_id' },
      { name: 'assigned_at', sql: 'ADD COLUMN assigned_at TIMESTAMP NULL AFTER assigned_department_id' },
      { name: 'assignment_type', sql: "ADD COLUMN assignment_type ENUM('auto','manual','self') NULL AFTER assigned_at" }
    ];

    for (const col of columnsToAdd) {
      try {
        const [[exists]] = await connection.query(
          `SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='chat_sessions' AND column_name=?`,
          [col.name]
        );
        if (!exists) {
          await connection.query(`ALTER TABLE chat_sessions ${col.sql}`);
          console.log(`✅ Columna chat_sessions.${col.name} agregada`);
        } else {
          console.log(`⏭️  Columna chat_sessions.${col.name} ya existe`);
        }
      } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
          console.log(`⏭️  Columna chat_sessions.${col.name} ya existe`);
        } else {
          console.error(`❌ Error agregando ${col.name}:`, e.message);
        }
      }
    }

    // 6. Índices para asignación
    const indicesToAdd = [
      { name: 'idx_assigned_agent', sql: 'CREATE INDEX idx_assigned_agent ON chat_sessions(assigned_agent_id)' },
      { name: 'idx_assigned_dept', sql: 'CREATE INDEX idx_assigned_dept ON chat_sessions(assigned_department_id)' }
    ];

    for (const idx of indicesToAdd) {
      try {
        await connection.query(idx.sql);
        console.log(`✅ Índice ${idx.name} creado`);
      } catch (e) {
        if (e.code === 'ER_DUP_KEYNAME') {
          console.log(`⏭️  Índice ${idx.name} ya existe`);
        } else {
          console.error(`❌ Error creando índice ${idx.name}:`, e.message);
        }
      }
    }

    console.log('');
    console.log('✅ [MIGRATE-AGENTS] Migración completada exitosamente');
    console.log('');

  } catch (error) {
    console.error('❌ [MIGRATE-AGENTS] Error fatal:', error.message);
    throw error;
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = migrateAgents;

if (require.main === module) {
  migrateAgents().then(() => process.exit(0)).catch(() => process.exit(1));
}
