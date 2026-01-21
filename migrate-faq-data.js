#!/usr/bin/env node

/**
 * Script para migrar datos de FAQ del archivo JSON a la base de datos MySQL
 * Uso: node migrate-faq-data.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

  // Configuración de la base de datos (usar las mismas variables de entorno que app-cloud.js)
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'respaldos',
    waitForConnections: true,
    connectionLimit: 10,
    timezone: 'Z',
    charset: 'utf8mb4',
    collation: 'utf8mb4_unicode_ci',
    supportBigNumbers: true,
    bigNumberStrings: true
  });

async function migrateFAQData() {
  console.log('🚀 Iniciando migración de datos FAQ...');
  
  // Mostrar configuración de BD
  console.log('📋 Configuración de BD:');
  console.log(`  Host: ${process.env.DB_HOST || '127.0.0.1'}`);
  console.log(`  Port: ${process.env.DB_PORT || 3306}`);
  console.log(`  User: ${process.env.DB_USER || 'root'}`);
  console.log(`  Database: ${process.env.DB_NAME || 'respaldos'}`);
  console.log(`  Password: ${process.env.DB_PASS ? '***' : '(vacía)'}`);
  
  // Verificar que las variables críticas estén definidas
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASS) {
    console.log('⚠️  Variables de entorno no encontradas. Verificando archivo .env...');
    if (fs.existsSync('.env')) {
      console.log('✅ Archivo .env existe');
      const envContent = fs.readFileSync('.env', 'utf8');
      const hasDBHost = envContent.includes('DB_HOST');
      const hasDBUser = envContent.includes('DB_USER');
      const hasDBPass = envContent.includes('DB_PASS');
      console.log(`  DB_HOST en .env: ${hasDBHost ? '✅' : '❌'}`);
      console.log(`  DB_USER en .env: ${hasDBUser ? '✅' : '❌'}`);
      console.log(`  DB_PASS en .env: ${hasDBPass ? '✅' : '❌'}`);
    } else {
      console.log('❌ Archivo .env no existe');
    }
  }
  
  try {
    // Leer el archivo JSON existente
    const jsonPath = path.join(__dirname, 'data', 'faq-data.json');
    
    if (!fs.existsSync(jsonPath)) {
      console.log('❌ No se encontró el archivo faq-data.json');
      return;
    }
    
    const jsonData = fs.readFileSync(jsonPath, 'utf8');
    const faqData = JSON.parse(jsonData);
    
    console.log(`📄 Encontradas ${faqData.length} FAQ en el archivo JSON`);
    
    // Verificar que la tabla existe
    const [tables] = await pool.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'faq_entries'
    `);
    
    if (tables.length === 0) {
      console.log('❌ La tabla faq_entries no existe. Ejecuta primero el script de creación de tabla.');
      return;
    }
    
    // Limpiar datos existentes para migración limpia
    const [existingCount] = await pool.query('SELECT COUNT(*) as count FROM faq_entries');
    if (existingCount[0].count > 0) {
      console.log(`🗑️  Limpiando ${existingCount[0].count} registros existentes...`);
      await pool.query('DELETE FROM faq_entries');
      console.log('✅ Datos existentes eliminados');
    }
    
    // Migrar cada FAQ
    let migrated = 0;
    let errors = 0;
    
    for (const faq of faqData) {
      try {
        await pool.query(`
          INSERT INTO faq_entries (id, title, question, answer, tags, active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, [
          faq.id,
          faq.title || null,
          faq.q,
          faq.a,
          JSON.stringify(faq.tags || []),
          true
        ]);
        
        migrated++;
        console.log(`✅ Migrada FAQ ID ${faq.id}: ${faq.q.substring(0, 50)}...`);
        
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          console.log(`⚠️  FAQ ID ${faq.id} ya existe, saltando...`);
        } else {
          console.error(`❌ Error migrando FAQ ID ${faq.id}:`, error.message);
          errors++;
        }
      }
    }
    
    console.log('\n📊 Resumen de migración:');
    console.log(`✅ FAQ migradas exitosamente: ${migrated}`);
    console.log(`❌ Errores: ${errors}`);
    console.log(`📄 Total en archivo JSON: ${faqData.length}`);
    
    // Verificar datos en BD
    const [finalCount] = await pool.query('SELECT COUNT(*) as count FROM faq_entries');
    console.log(`🗄️  Total en base de datos: ${finalCount[0].count}`);
    
  } catch (error) {
    console.error('❌ Error durante la migración:', error);
  } finally {
    await pool.end();
    console.log('🔚 Conexión a base de datos cerrada');
  }
}

// Ejecutar migración
migrateFAQData().catch(console.error);
