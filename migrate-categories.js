#!/usr/bin/env node

/**
 * Script para migrar sistema de categorías de chat
 * Uso: node migrate-categories.js
 */

require('dotenv').config();
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

async function migrateCategories() {
  console.log('🚀 Iniciando migración de sistema de categorías...');
  
  // Mostrar configuración de BD
  console.log('📋 Configuración de BD:');
  console.log(`  Host: ${process.env.DB_HOST || '127.0.0.1'}`);
  console.log(`  Port: ${process.env.DB_PORT || 3306}`);
  console.log(`  User: ${process.env.DB_USER || 'root'}`);
  console.log(`  Database: ${process.env.DB_NAME || 'respaldos'}`);
  console.log(`  Password: ${process.env.DB_PASS ? '***' : '(vacía)'}`);
  
  try {
    // 1. Crear tabla de categorías de conversaciones
    console.log('📊 Creando tabla chat_categories...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_categories (
        id INT PRIMARY KEY AUTO_INCREMENT,
        session_id BIGINT NOT NULL,
        category VARCHAR(50) NOT NULL,
        assigned_by VARCHAR(100),
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
        INDEX idx_session_category (session_id, category),
        INDEX idx_category (category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Tabla chat_categories creada/verificada');
    
    // 2. Crear tabla de definiciones de categorías
    console.log('📊 Creando tabla category_definitions...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS category_definitions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(50) NOT NULL UNIQUE,
        display_name VARCHAR(100) NOT NULL,
        icon VARCHAR(50),
        color VARCHAR(20),
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Tabla category_definitions creada/verificada');
    
    // 3. Insertar categorías básicas
    console.log('📝 Insertando categorías básicas...');
    const categories = [
      { name: 'urgente', display_name: 'Urgente', icon: 'fas fa-exclamation-triangle', color: '#dc3545' },
      { name: 'ventas', display_name: 'Ventas', icon: 'fas fa-shopping-cart', color: '#28a745' },
      { name: 'postventa', display_name: 'Postventa', icon: 'fas fa-tools', color: '#ffc107' },
      { name: 'entrega', display_name: 'Entrega', icon: 'fas fa-truck', color: '#17a2b8' },
      { name: 'finalizado', display_name: 'Finalizado', icon: 'fas fa-check-circle', color: '#6c757d' },
      { name: 'general', display_name: 'General', icon: 'fas fa-comments', color: '#6f42c1' }
    ];
    
    let inserted = 0;
    for (const cat of categories) {
      try {
        const [result] = await pool.query(`
          INSERT IGNORE INTO category_definitions (name, display_name, icon, color)
          VALUES (?, ?, ?, ?)
        `, [cat.name, cat.display_name, cat.icon, cat.color]);
        
        if (result.affectedRows > 0) {
          inserted++;
          console.log(`✅ Categoría "${cat.display_name}" insertada`);
        } else {
          console.log(`⚠️  Categoría "${cat.display_name}" ya existía`);
        }
      } catch (error) {
        console.error(`❌ Error insertando categoría "${cat.display_name}":`, error.message);
      }
    }
    
    console.log(`📊 Total categorías insertadas: ${inserted}`);
    
    // 4. Verificar datos en BD
    const [categoryCount] = await pool.query('SELECT COUNT(*) as count FROM category_definitions');
    console.log(`🗄️  Total categorías en base de datos: ${categoryCount[0].count}`);
    
    // 5. Mostrar categorías disponibles
    const [categoriesList] = await pool.query('SELECT name, display_name, icon, color FROM category_definitions WHERE active = TRUE ORDER BY id');
    console.log('\n📋 Categorías disponibles:');
    categoriesList.forEach(cat => {
      console.log(`  • ${cat.display_name} (${cat.name}) - ${cat.icon} - ${cat.color}`);
    });
    
    console.log('\n🎉 ¡Migración de categorías completada exitosamente!');
    
  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    throw error;
  } finally {
    await pool.end();
    console.log('🔚 Conexión a base de datos cerrada');
  }
}

// Ejecutar migración
migrateCategories().catch(console.error);
