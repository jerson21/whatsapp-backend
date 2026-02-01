/**
 * Auto-Migrate Script
 * Se ejecuta automáticamente al iniciar el contenedor
 * Ejecuta todas las migraciones pendientes
 */

const mysql = require('mysql2/promise');

const migrations = [
  {
    name: 'add_channel_to_sessions',
    description: 'Agregar columna channel a chat_sessions',
    sql: `
      ALTER TABLE chat_sessions
      ADD COLUMN channel ENUM('whatsapp', 'instagram', 'messenger', 'tester')
      DEFAULT 'whatsapp'
      AFTER phone
    `
  },
  {
    name: 'add_channel_metadata_to_sessions',
    description: 'Agregar columna channel_metadata a chat_sessions',
    sql: `
      ALTER TABLE chat_sessions
      ADD COLUMN channel_metadata JSON
      AFTER channel
    `
  },
  {
    name: 'add_channel_to_messages',
    description: 'Agregar columna channel a chat_messages',
    sql: `
      ALTER TABLE chat_messages
      ADD COLUMN channel ENUM('whatsapp', 'instagram', 'messenger', 'tester')
      DEFAULT 'whatsapp'
      AFTER session_id
    `
  },
  {
    name: 'create_index_sessions_channel',
    description: 'Crear índice en chat_sessions.channel',
    sql: `CREATE INDEX idx_sessions_channel ON chat_sessions(channel)`
  },
  {
    name: 'create_index_sessions_phone_channel',
    description: 'Crear índice compuesto en chat_sessions',
    sql: `CREATE INDEX idx_sessions_phone_channel ON chat_sessions(phone, channel, status)`
  },
  {
    name: 'create_index_messages_channel',
    description: 'Crear índice en chat_messages.channel',
    sql: `CREATE INDEX idx_messages_channel ON chat_messages(channel)`
  },
  // === Agents & Departments ===
  {
    name: 'create_departments_table',
    description: 'Crear tabla departments',
    sql: `
      CREATE TABLE IF NOT EXISTS departments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        display_name VARCHAR(100) NOT NULL,
        icon VARCHAR(50) DEFAULT 'MessageSquare',
        color VARCHAR(20) DEFAULT '#6f42c1',
        auto_assign_intents JSON NULL,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_dept_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  },
  {
    name: 'seed_default_departments',
    description: 'Insertar departamentos por defecto',
    sql: `
      INSERT IGNORE INTO departments (name, display_name, icon, color, auto_assign_intents) VALUES
      ('ventas', 'Ventas', 'ShoppingCart', '#28a745', '["sales","ventas","comprar","precio","cotizar","producto"]'),
      ('soporte', 'Soporte', 'Wrench', '#17a2b8', '["support","complaint","soporte","problema","error","ayuda","falla"]'),
      ('postventa', 'Post-venta', 'Package', '#ffc107', '["postventa","devolucion","cambio","garantia","entrega","reclamo"]'),
      ('general', 'General', 'MessageSquare', '#6f42c1', '[]')
    `
  },
  {
    name: 'create_agents_table',
    description: 'Crear tabla agents',
    sql: `
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
        api_key VARCHAR(64) NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login TIMESTAMP NULL,
        INDEX idx_agent_status (status),
        INDEX idx_agent_role (role),
        INDEX idx_agent_dept (department_id),
        INDEX idx_agent_api_key (api_key),
        CONSTRAINT fk_agent_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  },
  {
    name: 'add_assigned_agent_id_to_sessions',
    description: 'Agregar assigned_agent_id a chat_sessions',
    sql: `ALTER TABLE chat_sessions ADD COLUMN assigned_agent_id INT NULL`
  },
  {
    name: 'add_assigned_department_id_to_sessions',
    description: 'Agregar assigned_department_id a chat_sessions',
    sql: `ALTER TABLE chat_sessions ADD COLUMN assigned_department_id INT NULL`
  },
  {
    name: 'add_assigned_at_to_sessions',
    description: 'Agregar assigned_at a chat_sessions',
    sql: `ALTER TABLE chat_sessions ADD COLUMN assigned_at TIMESTAMP NULL`
  },
  {
    name: 'add_assignment_type_to_sessions',
    description: 'Agregar assignment_type a chat_sessions',
    sql: `ALTER TABLE chat_sessions ADD COLUMN assignment_type ENUM('auto','manual','self') NULL`
  },
  {
    name: 'create_index_assigned_agent',
    description: 'Crear índice assigned_agent en chat_sessions',
    sql: `CREATE INDEX idx_assigned_agent ON chat_sessions(assigned_agent_id)`
  },
  {
    name: 'create_index_assigned_dept',
    description: 'Crear índice assigned_dept en chat_sessions',
    sql: `CREATE INDEX idx_assigned_dept ON chat_sessions(assigned_department_id)`
  },
  {
    name: 'update_dept_ventas_add_sales_intent',
    description: 'Agregar intent "sales" al departamento Ventas',
    sql: `UPDATE departments SET auto_assign_intents = '["sales","ventas","comprar","precio","cotizar","producto"]'
          WHERE name = 'ventas' AND (auto_assign_intents IS NULL OR NOT JSON_CONTAINS(auto_assign_intents, '"sales"'))`
  },
  {
    name: 'update_dept_soporte_add_support_intent',
    description: 'Agregar intents "support","complaint" al departamento Soporte',
    sql: `UPDATE departments SET auto_assign_intents = '["support","complaint","soporte","problema","error","ayuda","falla"]'
          WHERE name = 'soporte' AND (auto_assign_intents IS NULL OR NOT JSON_CONTAINS(auto_assign_intents, '"support"'))`
  },
  {
    name: 'update_sales_flow_add_transfer',
    description: 'Actualizar flujo de ventas: transferir a agente humano en vez de capturar lead',
    sql: `UPDATE visual_flows SET
            description = 'Detecta intención de compra y transfiere a agente de ventas',
            nodes = '[{"id":"trigger","type":"trigger","content":"Cuando intención = ventas"},{"id":"welcome","type":"message","content":"¡Entendido! Te conecto con un asesor de ventas que te ayudará personalmente."},{"id":"transfer","type":"transfer","content":"Un momento, estoy transfiriendo tu consulta a nuestro equipo de ventas..."}]',
            connections = '[{"from":"trigger","to":"welcome"},{"from":"welcome","to":"transfer"}]',
            variables = '{}',
            updated_at = NOW()
          WHERE slug = 'embudo-ventas'`
  },
  {
    name: 'add_custom_instructions_to_chatbot_config',
    description: 'Agregar custom_instructions a chatbot_config',
    sql: `ALTER TABLE chatbot_config ADD COLUMN custom_instructions TEXT NULL AFTER fallback_message`
  },
  {
    name: 'add_system_prompt_to_chatbot_config',
    description: 'Agregar system_prompt editable a chatbot_config',
    sql: `ALTER TABLE chatbot_config ADD COLUMN system_prompt TEXT NULL AFTER custom_instructions`
  }
];

async function runMigrations() {
  let connection;
  const startTime = Date.now();

  try {
    console.log('🔄 [AUTO-MIGRATE] Iniciando migraciones automáticas...');

    // Esperar a que MySQL esté listo
    let retries = 30;
    while (retries > 0) {
      try {
        connection = await mysql.createConnection({
          host: process.env.DB_HOST || '127.0.0.1',
          port: Number(process.env.DB_PORT || 3306),
          user: process.env.DB_USER || 'root',
          password: process.env.DB_PASS || '',
          database: process.env.DB_NAME || 'whatsapp_chat'
        });
        console.log('✅ [AUTO-MIGRATE] Conectado a MySQL');
        break;
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        console.log(`⏳ [AUTO-MIGRATE] Esperando MySQL... (${retries} intentos restantes)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Crear tabla de migraciones si no existe
    await connection.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ejecutar cada migración
    let executed = 0;
    let skipped = 0;

    for (const migration of migrations) {
      try {
        // Verificar si ya fue ejecutada
        const [[existing]] = await connection.query(
          'SELECT id FROM _migrations WHERE name = ?',
          [migration.name]
        );

        if (existing) {
          skipped++;
          continue;
        }

        // Ejecutar migración
        console.log(`🔄 [AUTO-MIGRATE] ${migration.description}...`);
        await connection.query(migration.sql);

        // Marcar como ejecutada
        await connection.query(
          'INSERT INTO _migrations (name) VALUES (?)',
          [migration.name]
        );

        console.log(`✅ [AUTO-MIGRATE] ${migration.description} - OK`);
        executed++;

      } catch (error) {
        // Ignorar errores de duplicados (ya existen las columnas/índices)
        if (error.code === 'ER_DUP_FIELDNAME' || error.code === 'ER_DUP_KEYNAME') {
          console.log(`⚠️  [AUTO-MIGRATE] ${migration.description} - Ya existe`);

          // Marcar como ejecutada aunque haya fallado (para no reintentar)
          try {
            await connection.query(
              'INSERT IGNORE INTO _migrations (name) VALUES (?)',
              [migration.name]
            );
          } catch (e) {
            // Ignorar si ya está en la tabla
          }

          skipped++;
        } else {
          console.error(`❌ [AUTO-MIGRATE] Error en ${migration.name}:`, error.message);
          // No lanzar error, continuar con otras migraciones
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('');
    console.log('📊 [AUTO-MIGRATE] Resumen:');
    console.log(`   - Ejecutadas: ${executed}`);
    console.log(`   - Omitidas: ${skipped}`);
    console.log(`   - Tiempo: ${duration}s`);
    console.log('✅ [AUTO-MIGRATE] Migraciones completadas');
    console.log('');

  } catch (error) {
    console.error('❌ [AUTO-MIGRATE] Error fatal:', error.message);
    // No salir con error para que el servidor pueda iniciar de todos modos
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

module.exports = runMigrations;

// Si se ejecuta directamente
if (require.main === module) {
  runMigrations().then(() => process.exit(0)).catch(() => process.exit(1));
}
