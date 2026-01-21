#!/usr/bin/env node

/**
 * ============================================================================
 * MIGRACIÓN DE TABLAS DEL CHATBOT
 * ============================================================================
 * Script para crear las tablas necesarias para el sistema de configuración
 * del chatbot con detección de intenciones.
 * ============================================================================
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Configuración de base de datos
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'respaldos',
  charset: 'utf8mb4'
};

async function migrateChatbotTables() {
  let connection;
  
  try {
    console.log('🤖 Iniciando migración de tablas del chatbot...');
    console.log(`📍 Conectando a ${dbConfig.host}/${dbConfig.database}`);
    
    // Conectar a la base de datos
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conexión establecida');
    
    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, 'sql', 'create_chatbot_tables.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`Archivo SQL no encontrado: ${sqlPath}`);
    }
    
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    console.log('📄 Archivo SQL leído correctamente');
    
    // Limpiar comentarios y líneas vacías primero
    const cleanedContent = sqlContent
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith('--');
      })
      .join('\n');
    
    // Dividir por punto y coma, pero conservar estructura multilinea
    const rawStatements = cleanedContent.split(';');
    
    const statements = rawStatements
      .map(stmt => stmt.trim())
      .filter(stmt => {
        if (stmt.length === 0) return false;
        
        // Mantener statements que contengan palabras clave SQL
        const upperStmt = stmt.toUpperCase();
        return upperStmt.includes('CREATE TABLE') || 
               upperStmt.includes('INSERT INTO') || 
               upperStmt.includes('UPDATE ') ||
               upperStmt.includes('DELETE ') ||
               upperStmt.includes('ALTER TABLE');
      });
    
    console.log(`🔧 Ejecutando ${statements.length} statements SQL...`);
    
    // Debug: mostrar los primeros statements
    if (statements.length === 0) {
      console.log('❌ No se encontraron statements SQL válidos');
      console.log('📄 Contenido del archivo (primeras 500 chars):');
      console.log(sqlContent.substring(0, 500));
      throw new Error('No hay statements SQL para ejecutar');
    }
    
    console.log('📋 Primeros statements encontrados:');
    statements.slice(0, 3).forEach((stmt, i) => {
      console.log(`   ${i + 1}. ${stmt.substring(0, 80)}...`);
    });
    
    // Ejecutar cada statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      try {
        await connection.execute(statement);
        
        // Identificar el tipo de statement para logging
        if (statement.toUpperCase().includes('CREATE TABLE')) {
          const tableName = statement.match(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(\w+)/i)?.[1];
          console.log(`✅ Tabla creada: ${tableName}`);
        } else if (statement.toUpperCase().includes('INSERT INTO')) {
          const tableName = statement.match(/INSERT INTO\s+(\w+)/i)?.[1];
          console.log(`✅ Datos insertados en: ${tableName}`);
        }
      } catch (error) {
        console.error(`❌ Error en statement ${i + 1}:`, error.message);
        console.log(`📝 Statement: ${statement.substring(0, 100)}...`);
        
        // Continuar con el siguiente statement si no es un error crítico
        if (!error.message.includes('already exists') && 
            !error.message.includes('Duplicate entry')) {
          throw error;
        } else {
          console.log('⚠️  Error no crítico, continuando...');
        }
      }
    }
    
    // Verificar que las tablas se crearon correctamente
    console.log('\n🔍 Verificando tablas creadas...');
    
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME, TABLE_ROWS 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME IN ('chatbot_config', 'chatbot_intentions', 'chatbot_intention_logs')
      ORDER BY TABLE_NAME
    `, [dbConfig.database]);
    
    if (tables.length === 0) {
      throw new Error('No se encontraron las tablas del chatbot después de la migración');
    }
    
    console.log('\n📊 Tablas del chatbot:');
    tables.forEach(table => {
      console.log(`   • ${table.TABLE_NAME}: ${table.TABLE_ROWS || 0} registros`);
    });
    
    // Verificar configuración inicial
    const [configRows] = await connection.execute('SELECT COUNT(*) as count FROM chatbot_config');
    const configCount = configRows[0].count;
    
    const [intentionRows] = await connection.execute('SELECT COUNT(*) as count FROM chatbot_intentions');
    const intentionCount = intentionRows[0].count;
    
    console.log('\n📈 Estado inicial:');
    console.log(`   • Configuraciones: ${configCount}`);
    console.log(`   • Intenciones predeterminadas: ${intentionCount}`);
    
    console.log('\n🎉 ¡Migración de chatbot completada exitosamente!');
    console.log('\n🔧 Próximos pasos:');
    console.log('   1. Acceder a la configuración del chatbot en el frontend');
    console.log('   2. Activar el modo automático si lo deseas');
    console.log('   3. Personalizar las intenciones según tus necesidades');
    console.log('   4. Probar la detección de intenciones con mensajes de ejemplo');
    
  } catch (error) {
    console.error('\n❌ Error durante la migración:', error.message);
    process.exit(1);
    
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Conexión cerrada');
    }
  }
}

// Ejecutar migración si el script se ejecuta directamente
if (require.main === module) {
  migrateChatbotTables().catch(console.error);
}

module.exports = { migrateChatbotTables };