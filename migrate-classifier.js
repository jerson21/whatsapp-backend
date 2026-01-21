/**
 * Migración: Tablas del Clasificador de Mensajes
 * Ejecutar: node migrate-classifier.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function migrate() {
  console.log('🚀 Iniciando migración del clasificador...\n');

  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'whatsapp_chat',
    charset: 'utf8mb4',
    multipleStatements: true
  };

  let connection;

  try {
    console.log(`📦 Conectando a ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}...`);
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conectado a la base de datos\n');

    // Leer archivo SQL
    const sqlPath = path.join(__dirname, 'sql', 'classifier_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Ejecutar el SQL completo directamente (multipleStatements: true)
    // Primero separar las tablas CREATE de los INSERT/UPDATE
    const createTableRegex = /CREATE TABLE IF NOT EXISTS[\s\S]*?ENGINE=InnoDB[^;]*;/gi;
    const insertRegex = /INSERT INTO[\s\S]*?;/gi;
    const updateRegex = /UPDATE[\s\S]*?;/gi;

    const creates = sql.match(createTableRegex) || [];
    const inserts = sql.match(insertRegex) || [];
    const updates = sql.match(updateRegex) || [];

    const statements = [...creates, ...inserts, ...updates]
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`📝 Ejecutando ${statements.length} statements...\n`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (!stmt) continue;

      // Mostrar preview del statement
      const preview = stmt.substring(0, 60).replace(/\n/g, ' ');
      console.log(`  [${i + 1}/${statements.length}] ${preview}...`);

      try {
        await connection.query(stmt);
        console.log(`      ✅ OK`);
      } catch (err) {
        if (err.code === 'ER_TABLE_EXISTS_ERROR' || err.code === 'ER_DUP_ENTRY') {
          console.log(`      ⚠️  Ya existe (ignorando)`);
        } else {
          console.log(`      ❌ Error: ${err.message}`);
        }
      }
    }

    // Verificar tablas creadas
    console.log('\n📋 Verificando tablas creadas...');

    const tables = ['classifier_rules', 'message_classifications', 'lead_scores', 'visual_flows'];

    for (const table of tables) {
      const [rows] = await connection.query(
        `SELECT COUNT(*) as count FROM information_schema.tables
         WHERE table_schema = ? AND table_name = ?`,
        [dbConfig.database, table]
      );

      if (rows[0].count > 0) {
        const [countRows] = await connection.query(`SELECT COUNT(*) as c FROM ${table}`);
        console.log(`  ✅ ${table} (${countRows[0].c} registros)`);
      } else {
        console.log(`  ❌ ${table} NO EXISTE`);
      }
    }

    console.log('\n🎉 Migración completada exitosamente!');

  } catch (err) {
    console.error('\n❌ Error en la migración:', err.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

migrate();
