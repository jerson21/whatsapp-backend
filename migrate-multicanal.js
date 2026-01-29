/**
 * Migración a Sistema Multicanal
 * Agrega soporte para WhatsApp, Instagram, Messenger y Tester
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const logger = {
  info: (msg) => console.log(`✅ ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  step: (msg) => console.log(`🔄 ${msg}`)
};

async function migrate() {
  let connection;

  try {
    logger.step('Conectando a base de datos...');

    connection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'whatsapp_chat',
      multipleStatements: true
    });

    logger.info('Conectado a base de datos');

    // ============================================
    // PASO 1: Agregar columna channel a chat_sessions
    // ============================================
    logger.step('Agregando columna channel a chat_sessions...');

    try {
      await connection.query(`
        ALTER TABLE chat_sessions
        ADD COLUMN channel ENUM('whatsapp', 'instagram', 'messenger', 'tester')
        DEFAULT 'whatsapp'
        AFTER phone
      `);
      logger.info('Columna channel agregada a chat_sessions');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        logger.warn('Columna channel ya existe en chat_sessions');
      } else {
        throw error;
      }
    }

    // ============================================
    // PASO 2: Agregar columna channel_metadata a chat_sessions
    // ============================================
    logger.step('Agregando columna channel_metadata a chat_sessions...');

    try {
      await connection.query(`
        ALTER TABLE chat_sessions
        ADD COLUMN channel_metadata JSON
        AFTER channel
      `);
      logger.info('Columna channel_metadata agregada a chat_sessions');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        logger.warn('Columna channel_metadata ya existe en chat_sessions');
      } else {
        throw error;
      }
    }

    // ============================================
    // PASO 3: Agregar columna channel a chat_messages
    // ============================================
    logger.step('Agregando columna channel a chat_messages...');

    try {
      await connection.query(`
        ALTER TABLE chat_messages
        ADD COLUMN channel ENUM('whatsapp', 'instagram', 'messenger', 'tester')
        DEFAULT 'whatsapp'
        AFTER session_id
      `);
      logger.info('Columna channel agregada a chat_messages');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        logger.warn('Columna channel ya existe en chat_messages');
      } else {
        throw error;
      }
    }

    // ============================================
    // PASO 4: Crear índices
    // ============================================
    logger.step('Creando índices...');

    try {
      await connection.query('CREATE INDEX idx_sessions_channel ON chat_sessions(channel)');
      logger.info('Índice idx_sessions_channel creado');
    } catch (error) {
      if (error.code === 'ER_DUP_KEYNAME') {
        logger.warn('Índice idx_sessions_channel ya existe');
      } else {
        throw error;
      }
    }

    try {
      await connection.query('CREATE INDEX idx_sessions_phone_channel ON chat_sessions(phone, channel, status)');
      logger.info('Índice idx_sessions_phone_channel creado');
    } catch (error) {
      if (error.code === 'ER_DUP_KEYNAME') {
        logger.warn('Índice idx_sessions_phone_channel ya existe');
      } else {
        throw error;
      }
    }

    try {
      await connection.query('CREATE INDEX idx_messages_channel ON chat_messages(channel)');
      logger.info('Índice idx_messages_channel creado');
    } catch (error) {
      if (error.code === 'ER_DUP_KEYNAME') {
        logger.warn('Índice idx_messages_channel ya existe');
      } else {
        throw error;
      }
    }

    // ============================================
    // PASO 5: Actualizar datos existentes
    // ============================================
    logger.step('Actualizando datos existentes...');

    await connection.query(`UPDATE chat_sessions SET channel = 'whatsapp' WHERE channel IS NULL`);
    await connection.query(`UPDATE chat_messages SET channel = 'whatsapp' WHERE channel IS NULL`);

    logger.info('Datos existentes actualizados');

    // ============================================
    // VERIFICACIÓN
    // ============================================
    logger.step('Verificando migración...');

    const [sessionsCols] = await connection.query(`SHOW COLUMNS FROM chat_sessions LIKE '%channel%'`);
    logger.info(`Columnas de channel en chat_sessions: ${sessionsCols.length}`);

    const [messagesCols] = await connection.query(`SHOW COLUMNS FROM chat_messages LIKE '%channel%'`);
    logger.info(`Columnas de channel en chat_messages: ${messagesCols.length}`);

    const [indexes] = await connection.query(`
      SELECT DISTINCT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('chat_sessions', 'chat_messages')
      AND INDEX_NAME LIKE 'idx_%channel%'
    `, [process.env.DB_NAME || 'whatsapp_chat']);

    logger.info(`Índices creados: ${indexes.length}`);

    // Estadísticas
    const [[{ total_sessions }]] = await connection.query('SELECT COUNT(*) as total_sessions FROM chat_sessions');
    const [[{ total_messages }]] = await connection.query('SELECT COUNT(*) as total_messages FROM chat_messages');

    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE MIGRACIÓN');
    console.log('='.repeat(60));
    console.log(`Total de sesiones: ${total_sessions}`);
    console.log(`Total de mensajes: ${total_messages}`);
    console.log(`Columnas agregadas: 3 (channel x2, channel_metadata x1)`);
    console.log(`Índices creados: ${indexes.length}`);
    console.log('='.repeat(60));
    console.log('\n✅ MIGRACIÓN COMPLETADA EXITOSAMENTE\n');

    console.log('📝 Próximos pasos:');
    console.log('   1. Reiniciar el backend: docker-compose restart backend');
    console.log('   2. Verificar logs: docker logs whatsapp-backend --tail=50');
    console.log('   3. Probar Chat Tester: http://localhost:3001/chat-tester');
    console.log('   4. Configurar variables de entorno para Instagram/Messenger');
    console.log('');

  } catch (error) {
    logger.error(`Error en migración: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      logger.info('Conexión cerrada');
    }
  }
}

// Ejecutar migración
console.log('\n' + '='.repeat(60));
console.log('🚀 MIGRACIÓN A SISTEMA MULTICANAL');
console.log('='.repeat(60));
console.log('Canales soportados:');
console.log('  - WhatsApp');
console.log('  - Instagram');
console.log('  - Facebook Messenger');
console.log('  - Tester (Simulador)');
console.log('='.repeat(60) + '\n');

migrate();
