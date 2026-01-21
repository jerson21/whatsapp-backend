/**
 * Migration: Insert default visual flows into database
 *
 * This script inserts predefined flow templates directly into visual_flows table
 * so they are available immediately and can be activated.
 *
 * Usage: node migrate-insert-default-flows.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'whatsapp_chat'
};

// Flow templates from api/flows-routes.js
const templates = {
  sales_funnel: {
    name: 'Embudo de Ventas',
    description: 'Flujo para calificar y convertir leads',
    trigger_config: {
      type: 'classification',
      conditions: { intent: ['sales'] }
    },
    nodes: [
      { id: 'trigger', type: 'trigger', content: 'Cuando intención = ventas', position: { x: 250, y: 50 } },
      { id: 'welcome', type: 'message', content: '¡Hola! Gracias por tu interés. ¿Sobre qué producto te gustaría saber más?', position: { x: 250, y: 150 } },
      { id: 'product', type: 'question', content: 'Selecciona una opción:', variable: 'product_interest', options: [
        { label: 'Producto A', value: 'product_a' },
        { label: 'Producto B', value: 'product_b' },
        { label: 'Otro', value: 'other' }
      ], position: { x: 250, y: 250 } },
      { id: 'budget', type: 'question', content: '¿Cuál es tu presupuesto aproximado?', variable: 'budget', options: [
        { label: 'Menos de $50.000', value: 'low' },
        { label: '$50.000 - $100.000', value: 'medium' },
        { label: 'Más de $100.000', value: 'high' }
      ], position: { x: 250, y: 350 } },
      { id: 'condition', type: 'condition', conditions: [
        { if: 'budget == "high"', goto: 'premium' },
        { else: true, goto: 'standard' }
      ], position: { x: 250, y: 450 } },
      { id: 'premium', type: 'action', action: 'notify_sales', payload: { priority: 'high' }, position: { x: 100, y: 550 } },
      { id: 'standard', type: 'message', content: 'Te envío nuestro catálogo. Un asesor te contactará pronto.', position: { x: 400, y: 550 } },
      { id: 'end', type: 'end', position: { x: 250, y: 650 } }
    ],
    connections: [
      { from: 'trigger', to: 'welcome' },
      { from: 'welcome', to: 'product' },
      { from: 'product', to: 'budget' },
      { from: 'budget', to: 'condition' },
      { from: 'condition', to: 'premium', label: 'budget=high' },
      { from: 'condition', to: 'standard', label: 'else' },
      { from: 'premium', to: 'end' },
      { from: 'standard', to: 'end' }
    ],
    variables: { product_interest: '', budget: '' }
  },

  support_funnel: {
    name: 'Embudo de Soporte',
    description: 'Flujo para resolver dudas y escalar problemas',
    trigger_config: {
      type: 'classification',
      conditions: { intent: ['support', 'complaint'] }
    },
    nodes: [
      { id: 'trigger', type: 'trigger', content: 'Cuando intención = soporte/queja', position: { x: 250, y: 50 } },
      { id: 'greeting', type: 'message', content: 'Lamento que tengas un problema. Estoy aquí para ayudarte.', position: { x: 250, y: 150 } },
      { id: 'issue_type', type: 'question', content: '¿Qué tipo de problema tienes?', variable: 'issue_type', options: [
        { label: 'Producto defectuoso', value: 'defective' },
        { label: 'No llegó mi pedido', value: 'shipping' },
        { label: 'Facturación', value: 'billing' },
        { label: 'Otro', value: 'other' }
      ], position: { x: 250, y: 250 } },
      { id: 'search_faq', type: 'action', action: 'search_faq', position: { x: 250, y: 350 } },
      { id: 'faq_found', type: 'condition', conditions: [
        { if: 'faq_answer != null', goto: 'show_answer' },
        { else: true, goto: 'transfer' }
      ], position: { x: 250, y: 450 } },
      { id: 'show_answer', type: 'message', content: '{{faq_answer}}', position: { x: 100, y: 550 } },
      { id: 'transfer', type: 'transfer', content: 'Te transfiero con un agente humano.', position: { x: 400, y: 550 } }
    ],
    connections: [
      { from: 'trigger', to: 'greeting' },
      { from: 'greeting', to: 'issue_type' },
      { from: 'issue_type', to: 'search_faq' },
      { from: 'search_faq', to: 'faq_found' },
      { from: 'faq_found', to: 'show_answer', label: 'FAQ encontrado' },
      { from: 'faq_found', to: 'transfer', label: 'No encontrado' }
    ]
  },

  lead_capture: {
    name: 'Captura de Leads',
    description: 'Recolecta información de contacto del usuario',
    trigger_config: { type: 'keyword', keywords: ['información', 'info', 'contacto'] },
    nodes: [
      { id: 'trigger', type: 'trigger', content: 'Cuando keyword = info/contacto', position: { x: 250, y: 50 } },
      { id: 'ask_name', type: 'question', content: '¿Cuál es tu nombre?', variable: 'name', position: { x: 250, y: 150 } },
      { id: 'ask_email', type: 'question', content: 'Gracias {{name}}. ¿Cuál es tu email?', variable: 'email', position: { x: 250, y: 250 } },
      { id: 'save_lead', type: 'action', action: 'save_lead', payload: { name: '{{name}}', email: '{{email}}' }, position: { x: 250, y: 350 } },
      { id: 'thanks', type: 'message', content: '¡Perfecto! Te contactaremos pronto a {{email}}.', position: { x: 250, y: 450 } }
    ],
    connections: [
      { from: 'trigger', to: 'ask_name' },
      { from: 'ask_name', to: 'ask_email' },
      { from: 'ask_email', to: 'save_lead' },
      { from: 'save_lead', to: 'thanks' }
    ]
  },

  appointment_booking: {
    name: 'Agendar Cita',
    description: 'Flujo para agendar una cita o llamada',
    trigger_config: { type: 'keyword', keywords: ['cita', 'agendar', 'reunión', 'llamada'] },
    nodes: [
      { id: 'trigger', type: 'trigger', content: 'Cuando keyword = cita/agendar', position: { x: 250, y: 50 } },
      { id: 'ask_day', type: 'question', content: '¿Qué día te acomoda?', variable: 'day', options: [
        { label: 'Hoy', value: 'today' },
        { label: 'Mañana', value: 'tomorrow' },
        { label: 'Esta semana', value: 'this_week' }
      ], position: { x: 250, y: 150 } },
      { id: 'ask_time', type: 'question', content: '¿En qué horario?', variable: 'time', options: [
        { label: 'Mañana (9-12)', value: 'morning' },
        { label: 'Tarde (14-18)', value: 'afternoon' }
      ], position: { x: 250, y: 250 } },
      { id: 'ask_phone', type: 'question', content: '¿A qué número te llamamos?', variable: 'callback_phone', position: { x: 250, y: 350 } },
      { id: 'confirm', type: 'message', content: 'Perfecto. Te llamaremos el {{day}} en horario {{time}} al {{callback_phone}}.', position: { x: 250, y: 450 } },
      { id: 'notify', type: 'action', action: 'create_appointment', position: { x: 250, y: 550 } },
      { id: 'end', type: 'end', position: { x: 250, y: 650 } }
    ],
    connections: [
      { from: 'trigger', to: 'ask_day' },
      { from: 'ask_day', to: 'ask_time' },
      { from: 'ask_time', to: 'ask_phone' },
      { from: 'ask_phone', to: 'confirm' },
      { from: 'confirm', to: 'notify' },
      { from: 'notify', to: 'end' }
    ]
  },

  greeting_flow: {
    name: 'Saludo y Bienvenida',
    description: 'Responde a saludos con mensaje de bienvenida',
    trigger_config: { type: 'keyword', keywords: ['hola', 'buenas', 'hi', 'buenos días', 'buenas tardes'] },
    nodes: [
      { id: 'trigger', type: 'trigger', content: 'Cuando keyword = hola/saludo', position: { x: 250, y: 50 } },
      { id: 'greeting', type: 'message', content: '¡Hola! 👋 Bienvenido/a. Soy tu asistente virtual de Respaldos Chile.\n\n¿En qué puedo ayudarte hoy?', position: { x: 250, y: 150 } },
      { id: 'options', type: 'question', content: 'Selecciona una opción:', variable: 'selection', options: [
        { label: '💼 Información de productos', value: 'products' },
        { label: '🆘 Soporte técnico', value: 'support' },
        { label: '📞 Hablar con un agente', value: 'human' }
      ], position: { x: 250, y: 250 } },
      { id: 'condition', type: 'condition', conditions: [
        { if: 'selection == "products"', goto: 'products_msg' },
        { if: 'selection == "support"', goto: 'support_msg' },
        { if: 'selection == "human"', goto: 'transfer' },
        { else: true, goto: 'products_msg' }
      ], position: { x: 250, y: 350 } },
      { id: 'products_msg', type: 'message', content: 'Genial! Te puedo ayudar con información sobre nuestros productos y servicios de respaldo.', position: { x: 100, y: 450 } },
      { id: 'support_msg', type: 'message', content: 'Entiendo que necesitas soporte. Déjame ayudarte con tu problema.', position: { x: 250, y: 450 } },
      { id: 'transfer', type: 'transfer', content: 'Te conectaré con un agente humano en un momento.', position: { x: 400, y: 450 } }
    ],
    connections: [
      { from: 'trigger', to: 'greeting' },
      { from: 'greeting', to: 'options' },
      { from: 'options', to: 'condition' },
      { from: 'condition', to: 'products_msg', label: 'productos' },
      { from: 'condition', to: 'support_msg', label: 'soporte' },
      { from: 'condition', to: 'transfer', label: 'humano' }
    ],
    variables: { selection: '' }
  }
};

function generateSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function main() {
  let connection;

  try {
    console.log('🔌 Conectando a la base de datos...');
    connection = await mysql.createConnection(config);
    console.log('✅ Conectado');

    // Check if table exists
    const [tables] = await connection.query(`
      SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'visual_flows'
    `, [config.database]);

    if (tables.length === 0) {
      console.log('❌ Tabla visual_flows no existe. Ejecuta las migraciones primero.');
      process.exit(1);
    }

    console.log('\n📦 Insertando flujos de ejemplo...\n');

    // Flows to insert with active status
    const flowsToInsert = [
      { key: 'greeting_flow', active: true },  // Activo: responde a "hola"
      { key: 'support_funnel', active: false }, // Inactivo: usuario puede activar
      { key: 'sales_funnel', active: false },
      { key: 'lead_capture', active: false },
      { key: 'appointment_booking', active: false }
    ];

    let inserted = 0;
    let skipped = 0;

    for (const { key, active } of flowsToInsert) {
      const template = templates[key];
      const slug = generateSlug(template.name);

      // Check if flow already exists
      const [existing] = await connection.query(
        'SELECT id FROM visual_flows WHERE slug = ?',
        [slug]
      );

      if (existing.length > 0) {
        console.log(`⏭️  "${template.name}" ya existe (slug: ${slug})`);
        skipped++;
        continue;
      }

      // Insert flow
      await connection.query(`
        INSERT INTO visual_flows
        (slug, name, description, trigger_config, nodes, connections, variables, is_active, is_default)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        slug,
        template.name,
        template.description,
        JSON.stringify(template.trigger_config),
        JSON.stringify(template.nodes),
        JSON.stringify(template.connections),
        JSON.stringify(template.variables || {}),
        active,
        false
      ]);

      console.log(`✅ Insertado: "${template.name}" (${active ? 'ACTIVO' : 'inactivo'})`);
      inserted++;
    }

    console.log(`\n📊 Resumen:`);
    console.log(`   ✅ Insertados: ${inserted}`);
    console.log(`   ⏭️  Omitidos: ${skipped}`);
    console.log(`   📝 Total: ${flowsToInsert.length}`);

    // Show active flows
    const [activeFlows] = await connection.query(`
      SELECT name, slug FROM visual_flows WHERE is_active = TRUE
    `);

    if (activeFlows.length > 0) {
      console.log(`\n🟢 Flujos activos:`);
      activeFlows.forEach(f => console.log(`   - ${f.name} (${f.slug})`));
    } else {
      console.log(`\n⚠️  No hay flujos activos. Ve al frontend para activar flujos.`);
    }

    console.log('\n✅ Migración completada\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

main();
