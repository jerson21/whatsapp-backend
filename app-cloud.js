'use strict';

require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const P = require('pino');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const rateLimit = require('express-rate-limit');
const { setDefaultResultOrder } = require('dns');
const path = require('path');
const { fetch, FormData } = require('undici');

setDefaultResultOrder?.('ipv4first');
let BlobCtor = globalThis.Blob;
try {
  if (!BlobCtor) {
    const { Blob: BufferBlob } = require('buffer');
    if (BufferBlob) BlobCtor = BufferBlob;
  }
} catch {}
if (!BlobCtor) {
  const { Blob: FetchBlob } = require('fetch-blob');
  BlobCtor = FetchBlob;
}

const { Readable } = require('stream');
const fs = require('fs');
const multer = require('multer');
const upload = multer(); // memoria
const { createChatbot } = require('./chatbot/chatbot');
// createFAQStore eliminado (codigo muerto — usamos createFAQDatabase)
const { createFAQDatabase } = require('./faq/faq-database');
const MessageClassifier = require('./chatbot/message-classifier');
const queueService = require('./queues/queue-service');
const BroadcastQueue = require('./queues/broadcast-queue');
const ChannelDetector = require('./channels/channel-detector');
const ChannelAdapters = require('./channels/channel-adapters');

/* ========= Config ========= */
const app = express();
app.set('trust proxy', 1);

const logger = P({
  level: process.env.LOG_LEVEL || 'info',
  redact: { paths: ['headers.authorization', '*.access_token', 'META_ACCESS_TOKEN'], censor: '[REDACTED]' }
});

const PORT = Number(process.env.PORT || 3001);
const raw = process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || '';
const allowedOrigins = new Set(
  raw.split(',').map(s => s.trim()).filter(Boolean)
);
const PANEL_USER = process.env.ADMIN_USER || '';
const PANEL_PASS = process.env.ADMIN_PASS || '';

// WhatsApp Cloud API (Meta)
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v19.0';
const WABA_PHONE_NUMBER_ID = process.env.WABA_PHONE_NUMBER_ID || '';
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';



// Chatbot flags (MVP)
const CHATBOT_GLOBAL_ENABLED_ENV = String(process.env.CHATBOT_GLOBAL_ENABLED || 'false').toLowerCase() === 'true';
const CHATBOT_AUTO_ENABLE_NEW_SESSIONS = String(process.env.CHATBOT_AUTO || 'false').toLowerCase() === 'true';
let chatbotGlobalEnabled = CHATBOT_GLOBAL_ENABLED_ENV;

// Modo prueba: si CHATBOT_TEST_PHONES está definido, el bot SOLO responde a esos números
// Formato: lista separada por comas, ej: "56912345678,56987654321"
const CHATBOT_TEST_PHONES_RAW = process.env.CHATBOT_TEST_PHONES || '';
const chatbotTestPhones = new Set(
  CHATBOT_TEST_PHONES_RAW.split(',').map(p => p.trim()).filter(Boolean)
);

// Intent/routing & external actions (feature flags)
const INTENT_DETECT_ENABLED = String(process.env.INTENT_DETECT_ENABLED || 'true').toLowerCase() === 'true';
const INTENT_MIN_CONFIDENCE = Math.max(0, Math.min(1, Number(process.env.INTENT_MIN_CONFIDENCE || 0.6)));
const ROUTING_ENABLED = String(process.env.ROUTING_ENABLED || 'true').toLowerCase() === 'true';
const ACTIONS_HOOK_URL = process.env.ACTIONS_HOOK_URL || '';
const ACTIONS_HOOK_SECRET = process.env.ACTIONS_HOOK_SECRET || '';

// RAG config
const RAG_ENABLED = String(process.env.RAG_ENABLED || 'false').toLowerCase() === 'true';
const OPENAI_EMBEDDINGS_MODEL = process.env.OPENAI_EMBEDDINGS_MODEL || 'text-embedding-3-small';
const RAG_TOP_K = Math.max(1, Math.min(10, Number(process.env.RAG_TOP_K || 3)));

/* ========= Orchestrator Env ========= */
const ORCH_ENABLED = String(process.env.ORCH_ENABLED || 'false').toLowerCase() === 'true';
const ORCH_BOOT_MODE = String(process.env.ORCH_BOOT_MODE || 'off'); // off|replace|tee

/* ========= Agent Auth (JWT + bcrypt) ========= */
const bcrypt = require('bcryptjs');
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 horas

function signJWT(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + JWT_EXPIRY_MS })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyJWT(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');
  const [header, body, signature] = parts;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  if (signature !== expected) throw new Error('Invalid signature');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (payload.exp < Date.now()) throw new Error('Token expired');
  return payload;
}

/* ========= CORS Middleware ========= */
const corsMw = cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.size === 0) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS: ' + origin));
  },
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-API-Key'],
  credentials: true,  // ✅ Cambiado a true para soportar credentials
  maxAge: 86400,
  optionsSuccessStatus: 204
});

app.use('/api', corsMw);
app.options('/api/*', corsMw);

/* ========= Static Editor ========= */
// Forzar no-cache en index del editor para evitar versiones cacheadas
app.get('/editor', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'editor', 'index.html'));
});
app.use('/editor', express.static(path.join(__dirname, 'public', 'editor')));

/* ========= Dashboard de Flujos Conversacionales ========= */
// Servir archivos estáticos del dashboard
app.use('/conversation-debugger', express.static(path.join(__dirname, 'public', 'conversation-debugger')));

// Ruta principal del dashboard (SPA)
app.get('/conversation-debugger*', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'conversation-debugger', 'index.html'));
});

/* ========= Frontend Chatbot React ========= */
// Servir archivos estáticos del frontend
app.use('/chatbot', express.static(path.join(__dirname, 'public', 'chatbot')));

// Ruta principal del chatbot (SPA)
app.get('/chatbot*', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'chatbot', 'index.html'));
});

/* ========= Flow Builder React ========= */
// Servir archivos estáticos del Flow Builder
app.use('/flow-builder', express.static(path.join(__dirname, 'public', 'flow-builder')));

// Ruta principal del Flow Builder (SPA)
app.get('/flow-builder*', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'flow-builder', 'index.html'));
});

/* ========= Chat Tester - Simulador General ========= */
// Servir archivos estáticos del Chat Tester
app.use('/chat-tester', express.static(path.join(__dirname, 'public', 'chat-tester')));

// Ruta principal del Chat Tester
app.get('/chat-tester*', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'chat-tester', 'index.html'));
});

// Evitar error de favicon 404
app.get('/favicon.ico', (req, res) => res.status(204).end());

/* ========= MySQL ========= */
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
const db = pool;

/* ========= Channel Adapters (Multicanal) ========= */
const channelAdapters = new ChannelAdapters({ logger, db });

/* ========= FAQ Store (BM25 ligero) ========= */
const faqStore = createFAQDatabase({ pool, logger });

/* ========= Sistema de Aprendizaje IA ========= */
const OpenAI = require('openai');
const { createConversationLearner } = require('./chatbot/conversation-learner');
const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
const conversationLearner = createConversationLearner({ pool, logger, openai: openaiClient });

const { createKnowledgeRetriever } = require('./chatbot/knowledge-retriever');
const knowledgeRetriever = createKnowledgeRetriever({ pool, logger, openai: openaiClient, faqStore });

/* ========= Schema ========= */
async function ensureSchema() {
  const conn = await pool.getConnection();
  try {
    logger.info('🔧 Verificando/creando tablas de base de datos...');
    
    // Verificar conexión
    await conn.query('SELECT 1');
    logger.info('✅ Conexión a base de datos establecida');
    
    await conn.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        token VARCHAR(64) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        name VARCHAR(100),
        status ENUM('OPEN','CLOSED') DEFAULT 'OPEN',
        profile_pic_url TEXT,
        is_business BOOLEAN DEFAULT FALSE,
        business_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        current_order_context VARCHAR(20) NULL COMMENT 'num_orden del pedido en contexto',
        order_context_expires TIMESTAMP NULL COMMENT 'Cuándo expira el contexto del pedido',
        first_bot_response BOOLEAN DEFAULT FALSE COMMENT 'Indica si el bot ya respondió por primera vez',
        escalation_status ENUM('NONE','ESCALATED','RESOLVED') DEFAULT 'NONE' COMMENT 'Estado de escalamiento: NONE=normal, ESCALATED=derivado a agente, RESOLVED=resuelto por agente',
        escalation_reason VARCHAR(255) NULL COMMENT 'Motivo del escalamiento',
        escalated_at TIMESTAMP NULL COMMENT 'Cuándo se escaló',
        conversation_context JSON NULL COMMENT 'Contexto de la conversación actual',
        last_bot_question VARCHAR(500) NULL COMMENT 'Última pregunta hecha por el bot',
        awaiting_response_type VARCHAR(50) NULL COMMENT 'Tipo de respuesta que espera el bot',
        INDEX idx_phone (phone),
        INDEX idx_status (status),
        INDEX idx_chat_sessions_order_context (current_order_context),
        INDEX idx_chat_sessions_first_bot_response (first_bot_response),
        INDEX idx_chat_sessions_escalation_status (escalation_status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logger.info('✅ Tabla chat_sessions verificada/creada');

await conn.query(`
  CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    direction ENUM('in','out') NOT NULL,
    text TEXT NOT NULL,
    wa_jid VARCHAR(64) NOT NULL,
    wa_msg_id VARCHAR(255),
    status ENUM('pending','sent','delivered','read','played','failed') DEFAULT 'pending',
    delivered_at TIMESTAMP NULL DEFAULT NULL,
    read_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Campos nuevos para media
    media_type VARCHAR(32) NULL,      -- image, audio, video, document, sticker, location, etc.
    media_id TEXT NULL,               -- ID de Meta (WhatsApp) o URL directa (Instagram)
    media_mime VARCHAR(64) NULL,      -- Mime type (image/jpeg, audio/ogg, etc.)
    media_size INT NULL,              -- Tamaño en bytes (si se conoce)
    media_caption TEXT NULL,          -- Texto o caption opcional
    media_extra JSON NULL,            -- Datos adicionales (ej: coordenadas, contactos, flags)

    INDEX idx_session (session_id),
    UNIQUE KEY uniq_wa_msg_id (wa_msg_id),
    CONSTRAINT fk_session FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);


    const [cols4] = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'chat_sessions' 
      AND COLUMN_NAME = 'is_business'
    `);
    if (!cols4.length) {
      logger.info('Agregando columnas is_business y business_name...');
      await conn.query(`
        ALTER TABLE chat_sessions 
        ADD COLUMN is_business BOOLEAN DEFAULT FALSE AFTER profile_pic_url,
        ADD COLUMN business_name VARCHAR(255) AFTER is_business
      `);
    }

    // Add chatbot_enabled column if missing
    const [colsBot] = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'chat_sessions' 
      AND COLUMN_NAME = 'chatbot_enabled'
    `);
    if (!colsBot.length) {
      logger.info('Agregando columna chatbot_enabled a chat_sessions...');
      await conn.query(`
        ALTER TABLE chat_sessions 
        ADD COLUMN chatbot_enabled BOOLEAN DEFAULT FALSE AFTER business_name
      `);
    }

    // Add chatbot_mode column if missing
    const [colsBotMode] = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'chat_sessions' 
      AND COLUMN_NAME = 'chatbot_mode'
    `);
    if (!colsBotMode.length) {
      logger.info('Agregando columna chatbot_mode a chat_sessions...');
      await conn.query(`
        ALTER TABLE chat_sessions 
        ADD COLUMN chatbot_mode ENUM('manual','assisted','automatic') DEFAULT 'manual' AFTER chatbot_enabled,
        ADD INDEX idx_chatbot_mode (chatbot_mode)
      `);
    }

    // Create FAQ table if not exists
    logger.info('🔧 Creando tabla faq_entries...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS faq_entries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Título opcional de la pregunta',
        question TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Texto de la pregunta',
        answer TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Respuesta a la pregunta',
        tags JSON NULL COMMENT 'Array de tags/categorías en formato JSON',
        active BOOLEAN DEFAULT TRUE COMMENT 'Indica si la FAQ está activa para sugerencias',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de creación',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de última actualización',
        
        INDEX idx_faq_active (active),
        INDEX idx_faq_created (created_at),
        INDEX idx_faq_updated (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tabla para almacenar preguntas frecuentes del chatbot'
    `);
    logger.info('✅ Tabla faq_entries verificada/creada');
    
    // Verificar que la tabla se creó correctamente
    const [tables] = await conn.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'faq_entries'
    `);
    
    if (tables.length > 0) {
      logger.info('✅ Tabla faq_entries existe en la base de datos');
      
      // Verificar estructura de la tabla
      const [columns] = await conn.query(`
        SELECT COLUMN_NAME, DATA_TYPE 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'faq_entries'
        ORDER BY ORDINAL_POSITION
      `);
      
      logger.info(`📋 Estructura de faq_entries: ${columns.map(c => c.COLUMN_NAME).join(', ')}`);
    } else {
      logger.error('❌ La tabla faq_entries no se creó correctamente');
    }

    // Add last_intent and intent_confidence columns if missing
    const [colsLastIntent] = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'chat_sessions' 
      AND COLUMN_NAME = 'last_intent'
    `);
    if (!colsLastIntent.length) {
      logger.info('Agregando columnas last_intent e intent_confidence a chat_sessions...');
      await conn.query(`
        ALTER TABLE chat_sessions 
        ADD COLUMN last_intent VARCHAR(128) NULL AFTER chatbot_mode,
        ADD COLUMN intent_confidence DECIMAL(4,3) NULL AFTER last_intent,
        ADD INDEX idx_last_intent (last_intent)
      `);
    }
    
    // Add is_ai_generated column to chat_messages if missing
    const [colsAI] = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'chat_messages' 
      AND COLUMN_NAME = 'is_ai_generated'
    `);
    if (!colsAI.length) {
      logger.info('Agregando columna is_ai_generated a chat_messages...');
      await conn.query(`
        ALTER TABLE chat_messages 
        ADD COLUMN is_ai_generated BOOLEAN DEFAULT FALSE AFTER status
      `);
    }

    // Add panel_seen_at column to chat_messages if missing (solo para el panel, no afecta WhatsApp)
    const [colsSeen] = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'chat_messages' 
      AND COLUMN_NAME = 'panel_seen_at'
    `);
    if (!colsSeen.length) {
      logger.info('Agregando columna panel_seen_at a chat_messages...');
      await conn.query(`
        ALTER TABLE chat_messages 
        ADD COLUMN panel_seen_at TIMESTAMP NULL DEFAULT NULL AFTER read_at,
        ADD INDEX idx_panel_seen (panel_seen_at)
      `);
    }

    // Ampliar media_id para soportar URLs directas de Instagram (antes VARCHAR(128), muy corto)
    const [colsMediaId] = await conn.query(`
      SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'chat_messages'
      AND COLUMN_NAME = 'media_id'
    `);
    if (colsMediaId.length && colsMediaId[0].DATA_TYPE === 'varchar' && colsMediaId[0].CHARACTER_MAXIMUM_LENGTH < 2048) {
      logger.info('Ampliando columna media_id a TEXT en chat_messages (para URLs de Instagram)...');
      await conn.query(`ALTER TABLE chat_messages MODIFY COLUMN media_id TEXT NULL`);
    }

    // Orchestrator tables
    await conn.query(`
      CREATE TABLE IF NOT EXISTS flows (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        status ENUM('DRAFT','ACTIVE','ARCHIVED') DEFAULT 'DRAFT',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS flow_versions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        flow_id BIGINT NOT NULL,
        definition JSON NOT NULL,
        is_active BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_flow (flow_id),
        INDEX idx_active (is_active),
        CONSTRAINT fk_flow_version_flow FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS flow_triggers (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        flow_id BIGINT NOT NULL,
        type ENUM('incoming_message','manual') NOT NULL,
        match_json JSON,
        active BOOLEAN DEFAULT TRUE,
        priority INT DEFAULT 100,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_flow (flow_id),
        INDEX idx_active (active),
        INDEX idx_type (type),
        CONSTRAINT fk_flow_trigger_flow FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS flow_runs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        flow_id BIGINT NOT NULL,
        version_id BIGINT NOT NULL,
        trigger_type VARCHAR(32) NOT NULL,
        status ENUM('RUNNING','COMPLETED','FAILED','CANCELLED') DEFAULT 'RUNNING',
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        finished_at TIMESTAMP NULL DEFAULT NULL,
        context_json JSON,
        INDEX idx_flow (flow_id),
        INDEX idx_status (status),
        CONSTRAINT fk_run_flow FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE,
        CONSTRAINT fk_run_version FOREIGN KEY (version_id) REFERENCES flow_versions(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS flow_run_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        run_id BIGINT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        level ENUM('INFO','WARN','ERROR') DEFAULT 'INFO',
        node_id VARCHAR(64) NULL,
        event_type VARCHAR(32) NOT NULL,
        payload JSON,
        INDEX idx_run (run_id),
        CONSTRAINT fk_event_run FOREIGN KEY (run_id) REFERENCES flow_runs(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    

    // Intent routes table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS intent_routes (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        intent_name VARCHAR(128) NOT NULL,
        action_type ENUM('set_mode','launch_flow','send_text','call_http') NOT NULL,
        action_json JSON NULL,
        active BOOLEAN DEFAULT TRUE,
        priority INT DEFAULT 100,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_intent (intent_name),
        INDEX idx_active (active),
        INDEX idx_priority (priority)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Template button actions mapping
    await conn.query(`
      CREATE TABLE IF NOT EXISTS template_button_actions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        reply_id VARCHAR(128) NOT NULL,
        action_type ENUM('set_mode','launch_flow','send_text','call_http') NOT NULL,
        action_json JSON NULL,
        active BOOLEAN DEFAULT TRUE,
        UNIQUE KEY uniq_reply_id (reply_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Knowledge Base (RAG) — tabla de chunks con embeddings
    await conn.query(`
      CREATE TABLE IF NOT EXISTS kb_chunks (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        source VARCHAR(255) NULL,
        title VARCHAR(255) NOT NULL,
        intent VARCHAR(128) NULL,
        tags JSON NULL,
        chunk_index INT DEFAULT 0,
        content MEDIUMTEXT NOT NULL,
        embedding JSON NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_title (title),
        INDEX idx_intent (intent)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Learning System — pares Q&A aprendidos de conversaciones reales
    await conn.query(`
      CREATE TABLE IF NOT EXISTS learned_qa_pairs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id INT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        quality_score INT DEFAULT 0,
        status ENUM('pending','approved','rejected') DEFAULT 'pending',
        embedding JSON NULL,
        agent_id INT NULL,
        channel VARCHAR(20) DEFAULT 'whatsapp',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_status (status),
        INDEX idx_quality (quality_score)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Learning System — tabla de precios vigentes
    await conn.query(`
      CREATE TABLE IF NOT EXISTS product_prices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_name VARCHAR(255) NOT NULL,
        variant VARCHAR(255) NULL,
        price DECIMAL(10,2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'CLP',
        is_active BOOLEAN DEFAULT TRUE,
        notes TEXT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_product (product_name),
        INDEX idx_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Learning System — tabla de cache para reportes del cerebro IA
    await conn.query(`
      CREATE TABLE IF NOT EXISTS brain_reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        report_json JSON NOT NULL,
        pairs_hash VARCHAR(64) NOT NULL,
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_generated (generated_at DESC)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    logger.info('✅ Esquema de base de datos verificado/actualizado');
  } catch (err) {
    logger.error({ err }, 'Error en ensureSchema');
    throw err;
  } finally {
    conn.release();
  }
}

/* ========= Helpers ========= */

// === Templates (Cloud API / Business Management API) ===
const WABA_ID = process.env.WABA_ID || '';

async function listWabaTemplates({ limit = 100, includeComponents = false } = {}) {
  if (!WABA_ID) throw new Error('Falta WABA_ID en variables de entorno');

  const fields = includeComponents
    ? 'name,language,status,category,components'
    : 'name,language,status,category';

  const base =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${WABA_ID}/message_templates` +
    `?fields=${encodeURIComponent(fields)}&limit=${limit}`;

  const items = [];
  let url = base;

  while (url) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` } });
    const json = await r.json();
    if (!r.ok) throw new Error(json?.error?.message || `Meta API error (${r.status})`);

    if (Array.isArray(json.data)) items.push(...json.data);
    if (items.length >= limit) break;
    url = json.paging?.next || null;
  }
  return items.slice(0, limit);
}


// ============================
// GET /api/chat/media
// ============================
app.get('/api/chat/media', async (req, res) => {
  try {
    const sessionId  = Number(req.query.sessionId);
    const token      = String(req.query.token || '');
    const mediaIdQ   = req.query.mediaId ? String(req.query.mediaId) : null;
    const messageIdQ = req.query.messageId ? Number(req.query.messageId) : null;

    logger.info({ sessionId, hasToken: !!token, mediaIdQ, messageIdQ }, '📩 GET /api/chat/media');

    if (!sessionId || !token || (!mediaIdQ && !messageIdQ)) {
      return res.status(400).json({ ok: false, error: 'Faltan sessionId/token y mediaId o messageId' });
    }

    const [[ses]] = await pool.query(
      `SELECT id FROM chat_sessions WHERE id=? AND token=? AND status='OPEN' LIMIT 1`,
      [sessionId, token]
    );
    if (!ses) return res.status(401).json({ ok: false, error: 'Sesión inválida' });

    let mediaId = mediaIdQ;
    if (!mediaId && messageIdQ) {
      const [[msg]] = await pool.query(
        `SELECT media_id, media_extra FROM chat_messages WHERE id=? AND session_id=? LIMIT 1`,
        [messageIdQ, sessionId]
      );
      if (!msg) return res.status(404).json({ ok: false, error: 'Mensaje no existe' });

      let extra = null;
      try { extra = msg.media_extra && JSON.parse(msg.media_extra); } catch {}
      const storageUrl = extra?.storage_url;
      if (storageUrl) {
        logger.info({ storageUrl }, '↪️ Redirigiendo a storage_url');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.redirect(302, storageUrl);
      }

      if (!msg.media_id) return res.status(404).json({ ok: false, error: 'Mensaje sin media' });
      mediaId = String(msg.media_id);
    }

    // Instagram/Messenger: media_id es una URL directa, no un ID de Graph API
    if (mediaId.startsWith('http://') || mediaId.startsWith('https://')) {
      logger.info({ mediaId }, '↪️ Redirigiendo a URL directa (Instagram/Messenger)');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.redirect(302, mediaId);
    }

    const infoUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`;
    logger.info({ infoUrl }, '🌍 GET media info');
    const r = await fetch(infoUrl, { headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` } });
    const infoText = await r.text();
    let info; try { info = JSON.parse(infoText); } catch { info = null; }

    logger.info({ status: r.status, info: info || infoText }, '📥 Media info response');
    if (!r.ok || !info?.url) return res.status(404).json({ ok: false, error: 'Media URL no disponible' });

    logger.info({ downloadUrl: info.url }, '⬇️ Bajando media (stream)');
    const r2 = await fetch(info.url, { headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` } });
    if (!r2.ok) {
      const t = await r2.text();
      logger.error({ status: r2.status, body: t }, '🔥 Error bajando media');
      return res.status(400).json({ ok: false, error: 'Meta download error' });
    }

    const ct = r2.headers.get('content-type') || 'application/octet-stream';
    const len = r2.headers.get('content-length');
    res.setHeader('Content-Type', ct);
    if (len) res.setHeader('Content-Length', len);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');

    const nodeStream = Readable.fromWeb(r2.body);
    nodeStream.on('error', (err) => { try { res.destroy(err); } catch {} });
    nodeStream.pipe(res);
  } catch (e) {
    logger.error({ err: e.message }, '🔥 GET /api/chat/media FAIL');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/chat/media/:mediaId
// Ruta simplificada para el dashboard (requiere autenticación básica)
// ============================
app.get('/api/chat/media/:mediaId', async (req, res) => {
  try {
    const mediaId = req.params.mediaId;

    if (!mediaId) {
      return res.status(400).json({ ok: false, error: 'Falta mediaId' });
    }

    logger.info({ mediaId }, '📩 GET /api/chat/media/:mediaId');

    // Instagram/Messenger: media_id puede ser URL directa (no debería llegar aquí, pero por si acaso)
    if (mediaId.startsWith('http://') || mediaId.startsWith('https://')) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.redirect(302, mediaId);
    }

    // Descargar desde Graph API
    const infoUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`;
    const r = await fetch(infoUrl, { headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` } });
    const infoText = await r.text();
    let info;
    try { info = JSON.parse(infoText); } catch { info = null; }

    if (!r.ok || !info?.url) {
      logger.warn({ status: r.status, info: info || infoText }, '⚠️ Media info no disponible');
      return res.status(404).json({ ok: false, error: 'Media no disponible o expirada' });
    }

    logger.info({ downloadUrl: info.url }, '⬇️ Bajando media (stream)');
    const r2 = await fetch(info.url, { headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` } });
    if (!r2.ok) {
      const t = await r2.text();
      logger.error({ status: r2.status, body: t }, '🔥 Error bajando media');
      return res.status(400).json({ ok: false, error: 'Error descargando media de Meta' });
    }

    const ct = r2.headers.get('content-type') || 'application/octet-stream';
    const len = r2.headers.get('content-length');
    res.setHeader('Content-Type', ct);
    if (len) res.setHeader('Content-Length', len);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');

    const nodeStream = Readable.fromWeb(r2.body);
    nodeStream.on('error', (err) => { try { res.destroy(err); } catch {} });
    nodeStream.pipe(res);
  } catch (e) {
    logger.error({ err: e.message }, '🔥 GET /api/chat/media/:mediaId FAIL');
    res.status(500).json({ ok: false, error: e.message });
  }
});


/* Subir media (para imagen/audio/video/documento) 
 */

async function uploadMedia(bufferOrStream, filename, mime = 'application/octet-stream') {
  const startedAt = Date.now();
  try {
    logger.info({ filename, mime }, '⬆️ uploadMedia: preparando blob');

    // Normaliza a Blob
    let blob;
    if (Buffer.isBuffer(bufferOrStream)) {
      blob = new BlobCtor([bufferOrStream], { type: mime });
      logger.info({ size: bufferOrStream.length }, 'uploadMedia: buffer recibido');
    } else if (bufferOrStream && typeof bufferOrStream.pipe === 'function') {
      const chunks = [];
      await new Promise((resolve, reject) => {
        bufferOrStream.on('data', (c) => chunks.push(c));
        bufferOrStream.on('end', resolve);
        bufferOrStream.on('error', reject);
      });
      const buf = Buffer.concat(chunks);
      blob = new BlobCtor([buf], { type: mime });
      logger.info({ size: buf.length }, 'uploadMedia: stream convertido a buffer');
    } else {
      throw new Error('uploadMedia: bufferOrStream inválido');
    }

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WABA_PHONE_NUMBER_ID}/media`;
    const form = new FormData();
    form.append('file', blob, filename);     // campo DEBE ser 'file'
    form.append('type', mime);
    form.append('messaging_product', 'whatsapp'); // ← ← 🔴 CLAVE para v20+ 🔴

    logger.info({ url, filename, mime }, '🌍 POST /media a Cloud API');
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` },
      body: form
    });

    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }

    logger.info({
      status: r.status,
      ok: r.ok,
      fbTraceId: r.headers.get('x-fb-trace-id') || null,
      body: json || text
    }, '📥 Respuesta Cloud API /media');

    if (!r.ok) {
      const msg = json?.error?.message || `Meta upload error (${r.status})`;
      throw new Error(msg);
    }

    const mediaId = json.id;
    logger.info({ mediaId, ms: Date.now() - startedAt }, '✅ uploadMedia OK');
    return mediaId;
  } catch (e) {
    logger.error({ err: e.message }, '🔥 uploadMedia FAIL');
    throw e;
  }
}




/*¨Enviar imagen referenciando media_id */
// Reemplaza COMPLETO este helper
async function sendMediaViaCloudAPI(toE164, { type, mediaId, link, caption, filename }) {
  const startedAt = Date.now();
  try {
    // Construcción del objeto "media" según tipo
    const mediaObj =
      type === 'image'    ? { image:    { ...(mediaId ? { id: mediaId } : { link }), ...(caption ? { caption } : {}) } } :
      type === 'video'    ? { video:    { ...(mediaId ? { id: mediaId } : { link }), ...(caption ? { caption } : {}) } } :
      type === 'document' ? { document: { ...(mediaId ? { id: mediaId } : { link }), ...(caption ? { caption } : {}), ...(filename ? { filename } : {}) } } :
      type === 'audio'    ? { audio:    { ...(mediaId ? { id: mediaId } : { link }) } } :
      type === 'sticker'  ? { sticker:  { ...(mediaId ? { id: mediaId } : { link }) } } :
      null;

    if (!mediaObj) throw new Error(`Tipo de media no soportado: ${type}`);

    // Payload JSON (lo que suele causar el #100 si NO llega)
    const payload = {
      messaging_product: 'whatsapp',   // ⚠️ CLAVE
      to: String(toE164),
      type: String(type),
      ...mediaObj
    };

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WABA_PHONE_NUMBER_ID}/messages`;

    // Logs de diagnóstico máximos
    logger.info({
      url,
      to: toE164,
      type,
      using: mediaId ? 'mediaId' : (link ? 'link' : '???'),
      hasMessagingProduct: !!payload.messaging_product,
      payload
    }, '🌍 POST /messages (media) — Request');

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const raw = await r.text();
    let json; try { json = JSON.parse(raw); } catch { json = null; }

    logger.info({
      status: r.status,
      ok: r.ok,
      fbTraceId: r.headers.get('x-fb-trace-id') || null,
      response: json || raw
    }, '📥 Respuesta Cloud API /messages (media)');

    if (!r.ok) {
      const msg = json?.error?.message || `Meta API error (send media) ${r.status}`;
      throw new Error(msg);
    }

    const waMsgId = json?.messages?.[0]?.id || null;
    logger.info({ waMsgId, ms: Date.now() - startedAt }, '✅ sendMediaViaCloudAPI OK');
    return waMsgId;
  } catch (e) {
    logger.error({ err: e.message, to: toE164, type, hasMediaId: !!mediaId, hasLink: !!link }, '🔥 sendMediaViaCloudAPI FAIL');
    throw e;
  }
}




/**
 * Devuelve todas las variantes (idiomas/estados) de una plantilla por nombre.
 * Se usa por /api/chat/send-template?debug=1
 */
async function getTemplateVariants(templateName) {
  const all = await listWabaTemplates({ limit: 5000, includeComponents: false });
  return all
    .filter(t => t?.name === templateName)
    .map(t => ({
      language: t.language,
      status: t.status,
      category: t.category
    }));
}



function randomToken(n = 32) {
  return crypto.randomBytes(n).toString('hex').slice(0, n * 2 > 64 ? 64 : n * 2);
}

function normalizePhoneCL(raw) {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (digits.startsWith('56')) return digits;
  if (digits.startsWith('0') && digits.length >= 10) return '56' + digits.slice(-9);
  if (digits.length === 9) return '56' + digits;
  if (digits.length === 11 && digits.startsWith('569')) return digits;
  return digits;
}

// Cache de perfiles de Instagram/Messenger (evita llamar Graph API en cada mensaje)
const igProfileCache = new Map();
const IG_PROFILE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

/**
 * Obtener nombre/username de un usuario de Instagram via Graph API
 * @param {string} userId - Instagram-scoped user ID
 * @returns {Promise<string|null>} nombre o @username, o null si falla
 */
async function fetchInstagramProfile(userId) {
  // Revisar cache
  const cached = igProfileCache.get(userId);
  if (cached && (Date.now() - cached.ts < IG_PROFILE_CACHE_TTL)) {
    return cached.name;
  }

  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN || META_ACCESS_TOKEN;
  if (!token) {
    logger.warn('No access token available for Instagram profile lookup');
    return null;
  }

  try {
    const url = `https://graph.facebook.com/v22.0/${userId}?fields=name,username&access_token=${token}`;
    const r = await fetch(url);
    if (!r.ok) {
      const errBody = await r.text();
      logger.warn({ userId, status: r.status, body: errBody }, 'Failed to fetch Instagram profile');
      return null;
    }
    const data = await r.json();
    // Preferir name, sino @username
    const displayName = data.name || (data.username ? `@${data.username}` : null);
    // Guardar en cache
    igProfileCache.set(userId, { name: displayName, ts: Date.now() });
    logger.info({ userId, name: displayName, username: data.username }, '📸 Instagram profile fetched');
    return displayName;
  } catch (err) {
    logger.error({ err, userId }, 'Error fetching Instagram profile');
    return null;
  }
}

/* ========= Auth Panel (dual-mode: JWT + Basic + API Key + legacy env) ========= */
async function panelAuth(req, res, next) {
  const hdr = req.headers.authorization || '';

  // 1) Bearer JWT (nuevo sistema de agentes)
  if (hdr.startsWith('Bearer ')) {
    try {
      const payload = verifyJWT(hdr.slice(7));
      req.agent = { id: payload.id, username: payload.username, role: payload.role, departmentId: payload.departmentId, name: payload.name };
      return next();
    } catch {
      return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
    }
  }

  // 2) Basic Auth → validar contra DB agents, luego fallback env vars
  if (hdr.startsWith('Basic ')) {
    const decoded = Buffer.from(hdr.slice(6), 'base64').toString();
    const colonIdx = decoded.indexOf(':');
    if (colonIdx === -1) {
      res.set('WWW-Authenticate', 'Basic realm="panel"');
      return res.status(401).send('Unauthorized');
    }
    const user = decoded.slice(0, colonIdx);
    const pass = decoded.slice(colonIdx + 1);

    // 2a) Verificar en tabla agents
    try {
      const [agents] = await pool.query(
        'SELECT id, username, password_hash, name, role, department_id, avatar_color FROM agents WHERE username=? AND status="active"',
        [user]
      );
      if (agents.length) {
        const agent = agents[0];
        const valid = await bcrypt.compare(pass, agent.password_hash);
        if (valid) {
          req.agent = { id: agent.id, username: agent.username, role: agent.role, departmentId: agent.department_id, name: agent.name };
          return next();
        }
      }
    } catch (e) {
      logger.warn({ err: e.message }, 'DB auth check failed, fallback to env vars');
    }

    // 2b) Fallback: env var auth (legacy)
    if (PANEL_USER && user === PANEL_USER && pass === PANEL_PASS) {
      req.agent = { id: 0, username: PANEL_USER, role: 'supervisor', departmentId: null, name: 'Admin' };
      return next();
    }

    // 2c) Sin PANEL_USER configurado: permitir cualquier Basic auth (compatibilidad anterior)
    if (!PANEL_USER) {
      req.agent = { id: 0, username: user || 'anonymous', role: 'supervisor', departmentId: null, name: user || 'Anonymous' };
      return next();
    }

    res.set('WWW-Authenticate', 'Basic realm="panel"');
    return res.status(401).send('Unauthorized');
  }

  // 3) API Key (para API externa)
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  if (apiKey) {
    try {
      const [agents] = await pool.query(
        'SELECT id, username, name, role, department_id FROM agents WHERE api_key=? AND status="active"',
        [apiKey]
      );
      if (agents.length) {
        const agent = agents[0];
        req.agent = { id: agent.id, username: agent.username, role: agent.role, departmentId: agent.department_id, name: agent.name, isApiKey: true };
        return next();
      }
    } catch (e) {
      logger.warn({ err: e.message }, 'API key auth check failed');
    }
    return res.status(401).json({ ok: false, error: 'API key inválida' });
  }

  // 4) Query auth fallback (EventSource no puede enviar headers)
  const qAuth = req.query.auth ? String(req.query.auth) : null;
  if (qAuth) {
    try {
      // Intentar como JWT
      const payload = verifyJWT(qAuth);
      req.agent = { id: payload.id, username: payload.username, role: payload.role, departmentId: payload.departmentId, name: payload.name };
      return next();
    } catch {}
    // Intentar como Basic base64
    try {
      const decoded = Buffer.from(qAuth, 'base64').toString();
      const colonIdx = decoded.indexOf(':');
      if (colonIdx !== -1) {
        const user = decoded.slice(0, colonIdx);
        const pass = decoded.slice(colonIdx + 1);
        if (PANEL_USER && user === PANEL_USER && pass === PANEL_PASS) {
          req.agent = { id: 0, username: PANEL_USER, role: 'supervisor', departmentId: null, name: 'Admin' };
          return next();
        }
        if (!PANEL_USER) {
          req.agent = { id: 0, username: user || 'anonymous', role: 'supervisor', departmentId: null, name: user || 'Anonymous' };
          return next();
        }
      }
    } catch {}
  }
  const qU = req.query.u ? String(req.query.u) : null;
  const qP = req.query.p ? String(req.query.p) : null;
  if (qU || qP) {
    if (PANEL_USER && qU === PANEL_USER && qP === PANEL_PASS) {
      req.agent = { id: 0, username: PANEL_USER, role: 'supervisor', departmentId: null, name: 'Admin' };
      return next();
    }
    if (!PANEL_USER) {
      req.agent = { id: 0, username: qU || 'anonymous', role: 'supervisor', departmentId: null, name: qU || 'Anonymous' };
      return next();
    }
  }

  res.set('WWW-Authenticate', 'Basic realm="panel"');
  return res.status(401).send('Auth required');
}

// Middleware: solo supervisores
function supervisorOnly(req, res, next) {
  if (req.agent?.role !== 'supervisor') {
    return res.status(403).json({ ok: false, error: 'Solo supervisores pueden realizar esta acción' });
  }
  next();
}

/* ========= Auto-Assignment by Intent ========= */
async function autoAssignDepartment(sessionId, intent, explicitDeptId = null) {
  try {
    let deptId = explicitDeptId || null;
    let deptName = null;

    if (deptId) {
      // Departamento explícito (desde nodo Transfer del flow)
      const [[dept]] = await pool.query("SELECT display_name FROM departments WHERE id=? AND active=TRUE", [deptId]);
      deptName = dept?.display_name || 'Desconocido';
    } else {
      // Buscar departamento por intent
      if (!intent) intent = 'general';
      const [depts] = await pool.query(
        "SELECT id, name, display_name FROM departments WHERE active=TRUE AND JSON_CONTAINS(auto_assign_intents, ?, '$')",
        [JSON.stringify(intent)]
      );

      if (depts.length > 0) {
        deptId = depts[0].id;
        deptName = depts[0].display_name;
      } else {
        // Fallback: departamento 'general'
        const [[generalDept]] = await pool.query("SELECT id, display_name FROM departments WHERE name='general' AND active=TRUE");
        if (generalDept) {
          deptId = generalDept.id;
          deptName = generalDept.display_name;
        }
      }
    }

    if (deptId) {
      // 1) Asignar departamento
      await pool.query(
        "UPDATE chat_sessions SET assigned_department_id=?, assigned_at=NOW(), assignment_type='auto' WHERE id=?",
        [deptId, sessionId]
      );

      // 2) Auto-asignar agente menos ocupado del departamento
      let assignedAgent = null;
      try {
        assignedAgent = await findLeastBusyAgent(deptId);
        if (assignedAgent) {
          await pool.query(
            "UPDATE chat_sessions SET assigned_agent_id=?, assigned_at=NOW() WHERE id=?",
            [assignedAgent.id, sessionId]
          );
          logger.info({ sessionId, agentId: assignedAgent.id, agentName: assignedAgent.name },
            'Auto-asignado agente (menos ocupado)');
        }
      } catch (agentErr) {
        logger.warn({ err: agentErr, sessionId, deptId }, 'Error auto-asignando agente, queda solo departamento');
      }

      // 3) Notificar via Socket.IO
      if (global.io) {
        const [[session]] = await pool.query('SELECT phone FROM chat_sessions WHERE id=?', [sessionId]);
        const payload = {
          sessionId, departmentId: deptId, departmentName: deptName,
          agentId: assignedAgent?.id || null, agentName: assignedAgent?.name || null,
          assignmentType: 'auto', phone: session?.phone, timestamp: Date.now()
        };
        global.io.of('/chat').to(`department_${deptId}`).emit('chat_assigned', payload);
        global.io.of('/chat').to('dashboard_all').emit('chat_assigned', payload);
        if (assignedAgent) {
          global.io.of('/chat').to(`agent_${assignedAgent.id}`).emit('chat_assigned', payload);
        }
      }

      logger.info({ sessionId, intent, departmentId: deptId, deptName, agentId: assignedAgent?.id }, 'Auto-asignado a departamento y agente');
      return { id: deptId, name: deptName, agentId: assignedAgent?.id, agentName: assignedAgent?.name };
    }
    return null;
  } catch (e) {
    logger.error({ err: e, sessionId, intent }, 'Error en auto-asignación de departamento');
    return null;
  }
}

/* ========= Auto-Assign Least Busy Agent ========= */
async function findLeastBusyAgent(departmentId) {
  try {
    // Contar chats activos (con actividad en últimas 24h) por agente del departamento
    const [agents] = await pool.query(`
      SELECT
        a.id AS agent_id,
        a.name AS agent_name,
        COUNT(cs.id) AS active_chat_count
      FROM agents a
      LEFT JOIN chat_sessions cs
        ON cs.assigned_agent_id = a.id
        AND cs.status = 'OPEN'
        AND cs.updated_at >= NOW() - INTERVAL 24 HOUR
      WHERE a.department_id = ?
        AND a.status = 'active'
      GROUP BY a.id, a.name
      ORDER BY active_chat_count ASC,
               COALESCE(a.last_login, '1970-01-01') DESC
    `, [departmentId]);

    if (!agents.length) return null;

    // Nivel 1: Preferir agentes online (conectados al dashboard)
    const onlineAgents = agents.filter(a => global.agentPresence && global.agentPresence.has(a.agent_id));
    if (onlineAgents.length > 0) {
      const chosen = onlineAgents[0];
      logger.info({ agentId: chosen.agent_id, agentName: chosen.agent_name, activeChats: chosen.active_chat_count, tier: 'online' },
        'Agente menos ocupado seleccionado (online)');
      return { id: chosen.agent_id, name: chosen.agent_name };
    }

    // Nivel 2: Cualquier agente activo del departamento (aunque esté offline)
    const chosen = agents[0];
    logger.info({ agentId: chosen.agent_id, agentName: chosen.agent_name, activeChats: chosen.active_chat_count, tier: 'offline' },
      'Agente menos ocupado seleccionado (offline)');
    return { id: chosen.agent_id, name: chosen.agent_name };
  } catch (e) {
    logger.error({ err: e, departmentId }, 'Error buscando agente menos ocupado');
    return null; // Nivel 3: Sin agente, queda solo departamento
  }
}

/* ========= Auth Endpoints ========= */
// POST /api/auth/login - Login de agentes
app.post('/api/auth/login', express.json(), async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ ok: false, error: 'Faltan credenciales' });

    // 1) Verificar en tabla agents
    try {
      const [agents] = await pool.query(
        'SELECT id, username, password_hash, name, email, role, department_id, avatar_color, status FROM agents WHERE username=? AND status="active"',
        [username]
      );
      if (agents.length) {
        const agent = agents[0];
        const valid = await bcrypt.compare(password, agent.password_hash);
        if (!valid) return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });

        await pool.query('UPDATE agents SET last_login=NOW() WHERE id=?', [agent.id]);

        const token = signJWT({ id: agent.id, username: agent.username, role: agent.role, departmentId: agent.department_id, name: agent.name });
        const basicToken = Buffer.from(`${username}:${password}`).toString('base64');

        return res.json({
          ok: true,
          token,
          basicToken,
          agent: {
            id: agent.id,
            username: agent.username,
            name: agent.name,
            email: agent.email,
            role: agent.role,
            departmentId: agent.department_id,
            avatarColor: agent.avatar_color
          }
        });
      }
    } catch (e) {
      logger.warn({ err: e.message }, 'DB login check failed, trying env vars');
    }

    // 2) Fallback: env var auth (legacy)
    if (PANEL_USER && username === PANEL_USER && password === PANEL_PASS) {
      const token = signJWT({ id: 0, username: PANEL_USER, role: 'supervisor', departmentId: null, name: 'Administrador' });
      const basicToken = Buffer.from(`${username}:${password}`).toString('base64');
      return res.json({
        ok: true,
        token,
        basicToken,
        agent: { id: 0, username: PANEL_USER, name: 'Administrador', email: null, role: 'supervisor', departmentId: null, avatarColor: '#22c55e' }
      });
    }

    return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
  } catch (e) {
    logger.error({ err: e }, 'Login error');
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /api/auth/me - Info del agente actual
app.get('/api/auth/me', panelAuth, (req, res) => {
  res.json({ ok: true, agent: req.agent });
});

// === Helper: info de media (url temporal + mime) ===
async function getMediaInfo(mediaId) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` } });
  const json = await r.json();
  if (!r.ok) throw new Error(json?.error?.message || 'Meta get media error');
  return json; // { url, mime_type, ... }
}

// === Helper: descarga siguiendo redirects preservando Authorization ===
async function streamMetaMediaWithAuth(url, res, maxHops = 5) {
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    const r = await fetch(current, {
      headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` },
      redirect: 'manual'
    });

    // Manejo de redirects
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const loc = r.headers.get('location');
      if (!loc) throw new Error('Redirect sin Location');
      current = loc;
      continue;
    }

    if (!r.ok) {
      let msg = `Meta download error (${r.status})`;
      try {
        const j = await r.json();
        if (j?.error?.message) msg = j.error.message;
      } catch {}
      throw new Error(msg);
    }

    // Cabeceras
    const ct = r.headers.get('content-type') || 'application/octet-stream';
    const len = r.headers.get('content-length');
    res.setHeader('Content-Type', ct);
    if (len) res.setHeader('Content-Length', len);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');

    // WebStream -> Node stream
    const nodeStream = Readable.fromWeb(r.body);
    nodeStream.on('error', (err) => { try { res.destroy(err); } catch {} });
    nodeStream.pipe(res);
    return;
  }
  throw new Error('Demasiados redirects al bajar media');
}


/* ========= SSE ========= */
const subscribers = new Map();

// Inbox SSE (lista de conversaciones)
const inboxSubscribers = new Set(); // Set(res)

function ssePush(sessionId, payload) {
  const set = subscribers.get(Number(sessionId));
  if (!set) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) res.write(data);
}

function inboxPush(payload) {
  if (!inboxSubscribers.size) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of inboxSubscribers) {
    try { res.write(data); } catch {}
  }
}

/* ========= Cloud API ========= */
async function sendTextViaCloudAPI(toE164, body, sessionId = null) {
  // 🌐 MULTICANAL: Si no hay credenciales, simular envío y guardar en BD (modo tester)
  if (!META_ACCESS_TOKEN || !WABA_PHONE_NUMBER_ID) {
    // Si no tenemos sessionId, intentar obtenerlo de la BD
    if (!sessionId) {
      try {
        const [[row]] = await pool.query(
          `SELECT id, channel FROM chat_sessions WHERE phone=? AND status='OPEN' ORDER BY id DESC LIMIT 1`,
          [toE164]
        );
        if (row) sessionId = row.id;
      } catch (e) {
        logger.error({ error: e.message }, '❌ Error obteniendo sessionId');
      }
    }

    logger.debug({ toE164, body: body?.slice(0, 50), sessionId }, '🧪 Simulando envío (sin credenciales WhatsApp)');
    const simulatedId = `simulated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Guardar en BD si tenemos sessionId
    if (sessionId) {
      try {
        const [result] = await pool.query(
          `INSERT INTO chat_messages (session_id, direction, text, wa_jid, wa_msg_id, status, channel)
           VALUES (?, 'out', ?, ?, ?, 'sent', 'tester')`,
          [sessionId, body, toE164, simulatedId]
        );
        logger.debug({ sessionId, messageId: result.insertId }, '💾 Mensaje simulado guardado en BD');
      } catch (e) {
        logger.error({ error: e.message, sessionId }, '❌ Error guardando mensaje simulado');
      }
    }

    return simulatedId;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WABA_PHONE_NUMBER_ID}/messages`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toE164,
      type: 'text',
      text: { body }
    })
  });
  const json = await r.json();
  if (!r.ok) {
    throw new Error(json?.error?.message || 'Meta API error');
  }
  return json.messages?.[0]?.id || null;
}

/**
 * Envía indicador de "escribiendo..." al usuario via WhatsApp Cloud API.
 * Requiere el message_id del mensaje entrante al que se está respondiendo.
 * El indicador se muestra hasta 25 segundos o hasta que se envíe la respuesta.
 */
async function sendTypingIndicator(messageId) {
  if (!META_ACCESS_TOKEN || !WABA_PHONE_NUMBER_ID || !messageId) {
    return; // Sin credenciales o sin messageId, no hacer nada
  }

  try {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WABA_PHONE_NUMBER_ID}/messages`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        typing_indicator: { type: 'text' }
      })
    });

    if (!r.ok) {
      const json = await r.json().catch(() => ({}));
      logger.debug({ messageId, error: json?.error?.message }, 'Typing indicator failed (non-critical)');
    }
  } catch (e) {
    // No-op: typing indicator es best-effort, no debe afectar el flujo
    logger.debug({ messageId, error: e.message }, 'Typing indicator error (non-critical)');
  }
}

async function sendTemplateViaCloudAPI(toE164, templateName, languageCode, components) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WABA_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: toE164,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: components || []
    }
  };

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${META_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json?.error?.message || 'Meta API error on send template');
  return json.messages?.[0]?.id || null;
}

/**
 * Enviar mensaje con botones interactivos de WhatsApp
 * @param {string} toE164 - Número de teléfono
 * @param {string} bodyText - Texto principal del mensaje
 * @param {Array} buttons - Array de botones [{id, title}] (máximo 3)
 * @param {string} headerText - Texto opcional del header
 * @param {string} footerText - Texto opcional del footer
 */
async function sendInteractiveButtons(toE164, bodyText, buttons, headerText = null, footerText = null, sessionId = null) {
  // 🌐 MULTICANAL: Si no hay credenciales, simular envío y guardar en BD (modo tester)
  if (!META_ACCESS_TOKEN || !WABA_PHONE_NUMBER_ID) {
    // Si no tenemos sessionId, intentar obtenerlo de la BD
    if (!sessionId) {
      try {
        const [[row]] = await pool.query(
          `SELECT id, channel FROM chat_sessions WHERE phone=? AND status='OPEN' ORDER BY id DESC LIMIT 1`,
          [toE164]
        );
        if (row) sessionId = row.id;
      } catch (e) {
        logger.error({ error: e.message }, '❌ Error obteniendo sessionId');
      }
    }

    logger.debug({ toE164, bodyText: bodyText?.slice(0, 50), buttons: buttons?.length, sessionId }, '🧪 Simulando envío de botones (sin credenciales WhatsApp)');
    const simulatedId = `simulated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Guardar en BD si tenemos sessionId
    if (sessionId) {
      try {
        // Formatear texto con botones para mostrar en el chat
        const buttonsList = buttons.map((btn, idx) => `${idx + 1}. ${btn.title || btn.label}`).join('\n');
        const fullText = `${bodyText}\n\n${buttonsList}`;

        const [result] = await pool.query(
          `INSERT INTO chat_messages (session_id, direction, text, wa_jid, wa_msg_id, status, channel)
           VALUES (?, 'out', ?, ?, ?, 'sent', 'tester')`,
          [sessionId, fullText, toE164, simulatedId]
        );
        logger.debug({ sessionId, messageId: result.insertId, buttonsCount: buttons.length }, '💾 Mensaje con botones simulado guardado en BD');
      } catch (e) {
        logger.error({ error: e.message, sessionId }, '❌ Error guardando mensaje con botones simulado');
      }
    }

    return simulatedId;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WABA_PHONE_NUMBER_ID}/messages`;

  // WhatsApp permite máximo 3 botones
  const validButtons = buttons.slice(0, 3).map((btn, idx) => ({
    type: 'reply',
    reply: {
      id: btn.id || `btn_${idx + 1}`,
      title: (btn.title || btn.label || `Opción ${idx + 1}`).slice(0, 20) // Máx 20 chars
    }
  }));

  const interactive = {
    type: 'button',
    body: { text: bodyText.slice(0, 1024) }, // Máx 1024 chars
    action: { buttons: validButtons }
  };

  // Header opcional (texto)
  if (headerText) {
    interactive.header = { type: 'text', text: headerText.slice(0, 60) }; // Máx 60 chars
  }

  // Footer opcional
  if (footerText) {
    interactive.footer = { text: footerText.slice(0, 60) }; // Máx 60 chars
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: toE164,
    type: 'interactive',
    interactive
  };

  logger.debug({ url, toE164, buttons: validButtons.length }, 'Sending interactive buttons');

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${META_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const json = await r.json();
  if (!r.ok) {
    logger.error({ error: json?.error, payload }, 'Error sending interactive buttons');
    throw new Error(json?.error?.message || 'Meta API error on send interactive buttons');
  }
  return json.messages?.[0]?.id || null;
}

/**
 * Enviar mensaje con lista interactiva de WhatsApp
 * @param {string} toE164 - Número de teléfono
 * @param {string} bodyText - Texto principal del mensaje
 * @param {string} buttonText - Texto del botón que abre la lista (máx 20 chars)
 * @param {Array} sections - Secciones con opciones [{title, rows: [{id, title, description}]}]
 * @param {string} headerText - Texto opcional del header
 * @param {string} footerText - Texto opcional del footer
 */
async function sendInteractiveList(toE164, bodyText, buttonText, sections, headerText = null, footerText = null, sessionId = null) {
  // 🌐 MULTICANAL: Si no hay credenciales, simular envío y guardar en BD (modo tester)
  if (!META_ACCESS_TOKEN || !WABA_PHONE_NUMBER_ID) {
    // Si no tenemos sessionId, intentar obtenerlo de la BD
    if (!sessionId) {
      try {
        const [[row]] = await pool.query(
          `SELECT id, channel FROM chat_sessions WHERE phone=? AND status='OPEN' ORDER BY id DESC LIMIT 1`,
          [toE164]
        );
        if (row) sessionId = row.id;
      } catch (e) {
        logger.error({ error: e.message }, '❌ Error obteniendo sessionId');
      }
    }

    logger.debug({ toE164, bodyText: bodyText?.slice(0, 50), sections: sections?.length, sessionId }, '🧪 Simulando envío de lista (sin credenciales WhatsApp)');
    const simulatedId = `simulated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Guardar en BD si tenemos sessionId
    if (sessionId) {
      try {
        // Formatear texto con opciones de lista para mostrar en el chat
        let fullText = bodyText;
        sections.forEach((section, secIdx) => {
          if (section.title) fullText += `\n\n${section.title}:`;
          section.rows.forEach((row, rowIdx) => {
            fullText += `\n${secIdx * 10 + rowIdx + 1}. ${row.title || row.label}`;
            if (row.description) fullText += ` - ${row.description}`;
          });
        });

        const [result] = await pool.query(
          `INSERT INTO chat_messages (session_id, direction, text, wa_jid, wa_msg_id, status, channel)
           VALUES (?, 'out', ?, ?, ?, 'sent', 'tester')`,
          [sessionId, fullText, toE164, simulatedId]
        );
        logger.debug({ sessionId, messageId: result.insertId }, '💾 Mensaje con lista simulado guardado en BD');
      } catch (e) {
        logger.error({ error: e.message, sessionId }, '❌ Error guardando mensaje con lista simulado');
      }
    }

    return simulatedId;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WABA_PHONE_NUMBER_ID}/messages`;

  // Formatear secciones
  const validSections = sections.map(section => ({
    title: (section.title || 'Opciones').slice(0, 24), // Máx 24 chars
    rows: section.rows.slice(0, 10).map((row, idx) => ({
      id: row.id || `row_${idx + 1}`,
      title: (row.title || row.label || `Opción ${idx + 1}`).slice(0, 24), // Máx 24 chars
      description: row.description ? row.description.slice(0, 72) : undefined // Máx 72 chars
    }))
  }));

  const interactive = {
    type: 'list',
    body: { text: bodyText.slice(0, 1024) },
    action: {
      button: buttonText.slice(0, 20), // Texto del botón que abre la lista
      sections: validSections
    }
  };

  if (headerText) {
    interactive.header = { type: 'text', text: headerText.slice(0, 60) };
  }

  if (footerText) {
    interactive.footer = { text: footerText.slice(0, 60) };
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: toE164,
    type: 'interactive',
    interactive
  };

  logger.debug({ url, toE164, sectionsCount: validSections.length }, 'Sending interactive list');

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${META_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const json = await r.json();
  if (!r.ok) {
    logger.error({ error: json?.error, payload }, 'Error sending interactive list');
    throw new Error(json?.error?.message || 'Meta API error on send interactive list');
  }
  return json.messages?.[0]?.id || null;
}


// Webhook (Meta) — debe ir antes del parser JSON global
/* ========= Webhook (Meta) ========= */
/* Debe ir ANTES del parser JSON global para poder usar express.raw */

/** Verificación de suscripción (GET) */
app.get('/webhook', (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  } catch {
    return res.sendStatus(403);
  }
});

/** Util: asegurar firma X-Hub (Meta) */
function verifyMetaSignature(rawBody, signatureHeader) {
  try {
    if (!signatureHeader) return false;
    // Soportar múltiples secrets (WhatsApp e Instagram pueden usar secrets distintos)
    const secrets = [META_APP_SECRET, process.env.META_APP_SECRET_2].filter(Boolean);
    if (!secrets.length) return false;
    for (const secret of secrets) {
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(rawBody, 'utf8');
      const expected = 'sha256=' + hmac.digest('hex');
      if (crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected))) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** Helper: extraer texto y media de un mensaje entrante de Cloud API */
function extractIncomingMessage(m) {
  // Texto (orden de preferencia para mostrar/guardar)
  const interactiveTitle =
    m?.interactive?.button_reply?.title ||
    m?.interactive?.list_reply?.title ||
    null;
  const interactiveId =
    m?.interactive?.button_reply?.id ||
    m?.interactive?.list_reply?.id ||
    null;
  const buttonText = m?.button?.text || null;
  const plainText = m?.text?.body || null;

  // Media típico
  const media =
    m.image    ? { kind: 'image',    obj: m.image    } :
    m.audio    ? { kind: 'audio',    obj: m.audio    } :
    m.video    ? { kind: 'video',    obj: m.video    } :
    m.document ? { kind: 'document', obj: m.document } :
    m.sticker  ? { kind: 'sticker',  obj: m.sticker  } :
    null;

  const location = m.location || null;
  const contacts = Array.isArray(m.contacts) ? m.contacts : null;

  // Caption / filename si aplica
  const mediaCaption =
    media?.obj?.caption ||
    media?.obj?.filename ||
    null;

  const textForDB =
    interactiveTitle ||
    buttonText ||
    mediaCaption ||
    plainText ||
    '';

  // Armar campos de media para DB
  let mediaFields = null;

  if (media) {
    // Algunos payloads no traen file_size/mime; intentamos mapear lo que haya
    const fileSize = Number(
      media.obj?.file_size ||
      media.obj?.sha256_file_size ||
      0
    ) || null;

    let mime = media.obj?.mime_type || null;
    // Stickers casi siempre son webp; si no viene mime, forzamos
    if (media.kind === 'sticker' && !mime) mime = 'image/webp';

    // Extras útiles por tipo
    const extras = {};
    if (media.kind === 'document' && media.obj?.filename) extras.filename = media.obj.filename;
    if (media.kind === 'audio') {
      if (media.obj?.voice === true || media.obj?.ptt === true) extras.is_voice = true; // por si llega voice/ptt
      if (media.obj?.waveform) extras.waveform = media.obj.waveform;
    }

    mediaFields = {
      media_type: media.kind,                   // image|audio|video|document|sticker
      media_id: media.obj?.id || null,          // id para descargar vía Graph
      media_mime: mime,                         // mime si vino (o default en sticker)
      media_size: fileSize,                     // bytes (si viene)
      media_caption: mediaCaption || null,      // caption/filename
      media_extra: Object.keys(extras).length ? JSON.stringify(extras) : null
    };
  } else if (location) {
    mediaFields = {
      media_type: 'location',
      media_id: null,
      media_mime: null,
      media_size: null,
      media_caption: null,
      media_extra: JSON.stringify({
        latitude: location.latitude,
        longitude: location.longitude,
        name: location.name || null,
        address: location.address || null,
        url: location.url || null
      })
    };
  } else if (contacts) {
    mediaFields = {
      media_type: 'contacts',
      media_id: null,
      media_mime: null,
      media_size: null,
      media_caption: null,
      media_extra: JSON.stringify({ contacts })
    };
  } else if (interactiveId) {
    // Guardar el id de la opción pulsada (útil para analytics)
    mediaFields = {
      media_type: 'interactive',
      media_id: null,
      media_mime: null,
      media_size: null,
      media_caption: interactiveTitle || null,
      media_extra: JSON.stringify({ reply_id: interactiveId })
    };
  }

  return { textForDB, mediaFields };
}

/** POST Webhook (entradas y estados) */
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const rawBody = req.body?.toString('utf8') || '';
    const signatureHeader = req.headers['x-hub-signature-256'];

    if (!verifyMetaSignature(rawBody, signatureHeader)) {
      logger.warn({
        hasSignature: !!signatureHeader,
        signaturePreview: signatureHeader?.substring(0, 20),
        bodyLength: rawBody?.length,
        bodyPreview: rawBody?.substring(0, 100),
        hasAppSecret: !!META_APP_SECRET,
        contentType: req.headers['content-type']
      }, 'Firma Meta inválida');
      return res.sendStatus(403);
    }

    const body = rawBody ? JSON.parse(rawBody) : {};

    // 🌐 MULTICANAL: Detectar de qué canal viene el mensaje
    const channel = ChannelDetector.detectChannel(body, req.headers);
    logger.info({ channel, object: body.object }, '🌐 Canal detectado');

    const entries = Array.isArray(body.entry) ? body.entry : [];
    if (!entries.length) return res.sendStatus(200);

    for (const entry of entries) {
      // 🌐 MULTICANAL: Extraer mensajes según la estructura del canal
      let messages = [];
      let statuses = [];
      let contactsFromWebhook = [];

      // Echo messages de Instagram/Messenger (mensajes enviados desde la app nativa)
      let echoMessages = [];

      if (channel === 'instagram' || channel === 'messenger') {
        // Instagram y Messenger usan entry.messaging[]
        const messagingEvents = Array.isArray(entry.messaging) ? entry.messaging : [];
        for (const evt of messagingEvents) {
          if (evt.message?.is_echo) {
            // Echo = mensaje enviado por nuestra página desde la app nativa
            echoMessages.push(evt);
          } else if (evt.message || evt.postback) {
            messages.push(evt);
          }
        }
        // Instagram/Messenger no envían statuses en el mismo formato
      } else {
        // WhatsApp usa entry.changes[].value.messages[]
        const changes = Array.isArray(entry.changes) ? entry.changes : [];
        for (const change of changes) {
          const value = change?.value || {};
          messages = messages.concat(value.messages || []);
          statuses = statuses.concat(value.statuses || []);
          contactsFromWebhook = contactsFromWebhook.concat(value.contacts || []);
        }
      }

      /* ===================== MENSAJES ENTRANTES ===================== */
        for (const m of messages) {
          try {
            // 🌐 MULTICANAL: Normalizar mensaje según el canal
            const normalized = ChannelDetector.normalizeMessage(m, channel);
            const from = normalized.userId;
            const waMsgId = normalized.messageId;
            const textForDB = normalized.text;

            // Extraer nombre del contacto
            // WhatsApp: viene en value.contacts
            // Instagram/Messenger: se obtiene via Graph API
            let contactName = null;
            if (channel === 'whatsapp') {
              contactName = contactsFromWebhook[0]?.profile?.name || null;
            } else if (channel === 'instagram' || channel === 'messenger') {
              contactName = await fetchInstagramProfile(from);
            }

            // Construir mediaFields desde el mensaje normalizado
            let mediaFields = null;
            if (normalized.mediaType) {
              mediaFields = {
                media_type: normalized.mediaType,
                media_id: normalized.mediaId,
                media_mime: normalized.metadata?.mimeType || null,
                media_size: normalized.metadata?.fileSize || null,
                media_caption: textForDB || null,
                media_extra: Object.keys(normalized.metadata || {}).length
                  ? JSON.stringify(normalized.metadata)
                  : null
              };
            }

            // Buscar/crear sesión activa (por phone + channel)
            const [rows] = await pool.query(
              `SELECT id, chatbot_enabled, channel, name
                 FROM chat_sessions
                WHERE phone=? AND channel=? AND status='OPEN'
                ORDER BY id DESC LIMIT 1`,
              [from, channel]
            );

            let sessionId, sessionChatbotEnabled = false;
            if (rows.length) {
              sessionId = rows[0].id;
              sessionChatbotEnabled = !!rows[0].chatbot_enabled;
              // Actualizar nombre del contacto si no estaba o cambió
              if (contactName && rows[0].name !== contactName) {
                await pool.query('UPDATE chat_sessions SET name = ? WHERE id = ?', [contactName, sessionId]);
              }
            } else {
              const token = randomToken(24);
              const baseEnable = CHATBOT_AUTO_ENABLE_NEW_SESSIONS || chatbotGlobalEnabled;
              // En modo prueba: habilitar bot para teléfonos de prueba (aunque global esté off)
              // En modo normal: usar configuración global
              const isTestMode = chatbotTestPhones.size > 0;
              const enableForNew = isTestMode
                ? chatbotTestPhones.has(from)  // Test mode: bot ON solo para test phones
                : baseEnable;

              // 🐛 DEBUG LOG TEMPORAL para nueva sesión
              logger.info({
                phone: from,
                channel,
                CHATBOT_AUTO_ENABLE_NEW_SESSIONS,
                chatbotGlobalEnabled,
                testMode: chatbotTestPhones.size > 0,
                isTestPhone: chatbotTestPhones.has(from),
                enableForNew,
              }, '🆕 DEBUG: Creando nueva sesión');

              // Guardar metadata del canal
              const channelMetadata = normalized.metadata ? JSON.stringify(normalized.metadata) : null;

              const [ins] = await pool.query(
                `INSERT INTO chat_sessions (token, phone, name, status, chatbot_enabled, chatbot_mode, channel, channel_metadata)
                 VALUES (?,?,?, 'OPEN', ?, ?, ?, ?)`,
                [token, from, contactName, enableForNew, enableForNew ? 'automatic' : 'manual', channel, channelMetadata]
              );
              sessionId = ins.insertId;
              sessionChatbotEnabled = enableForNew;
            }

            // Insertar mensaje en DB (texto + media si hay) y capturar insertId
            let dbMessageId = null;
            try {
              if (mediaFields) {
                // Asegurar mime default en sticker por si no viene
                if (mediaFields.media_type === 'sticker' && !mediaFields.media_mime) {
                  mediaFields.media_mime = 'image/webp';
                }

                const [ins] = await pool.query(
                  `INSERT INTO chat_messages
                     (session_id, direction, text, wa_jid, wa_msg_id, status, channel,
                      media_type, media_id, media_mime, media_size, media_caption, media_extra)
                   VALUES (?,?,?,?,?,?,?,
                           ?,?,?,?,?,?)`,
                  [
                    sessionId, 'in', textForDB || '', from, waMsgId, 'delivered', channel,
                    mediaFields.media_type,
                    mediaFields.media_id,
                    mediaFields.media_mime,
                    mediaFields.media_size,
                    mediaFields.media_caption,
                    mediaFields.media_extra
                  ]
                );
                dbMessageId = ins.insertId;
              } else {
                const [ins] = await pool.query(
                  `INSERT INTO chat_messages
                     (session_id, direction, text, wa_jid, wa_msg_id, status, channel)
                   VALUES (?,?,?,?,?,?,?)`,
                  [sessionId, 'in', textForDB || '', from, waMsgId, 'delivered', channel]
                );
                dbMessageId = ins.insertId;
              }
            } catch (e) {
              // Evita crash si llega duplicado (unique por wa_msg_id)
              logger.error({ e, waMsgId }, 'Error insert chat_messages');
            }

            // Normalizar objeto media para el frontend (SSE)
            let mediaExtraParsed = null;
            if (mediaFields?.media_extra) {
              try {
                mediaExtraParsed = typeof mediaFields.media_extra === 'string'
                  ? JSON.parse(mediaFields.media_extra)
                  : mediaFields.media_extra;
              } catch (e) {
                mediaExtraParsed = null;
              }
            }

            const mediaForSSE = mediaFields ? {
              type:    mediaFields.media_type,  // image|audio|video|document|sticker|location|contacts|reaction|flow_reply|order
              id:      mediaFields.media_id,    // -> /api/chat/media
              mime:    mediaFields.media_mime,
              caption: mediaFields.media_caption,
              extra:   mediaExtraParsed         // Datos adicionales (coordenadas, contactos, etc.)
            } : null;

            // Emitir a la UI
            ssePush(sessionId, {
              type: 'message',
              direction: 'in',
              text: textForDB,
              media: mediaForSSE,
              mediaId: mediaFields?.media_id || null, // por si tu FE lo usa directo
              dbId: dbMessageId,
              at: Date.now()
            });

            // Emitir por Socket.IO
            if (global.io) {
              const msgPayload = {
                type: 'message',
                direction: 'in',
                text: textForDB,
                phone: from,
                sessionId,
                media: mediaForSSE,
                mediaId: mediaFields?.media_id || null,
                msgId: waMsgId,
                dbId: dbMessageId,
                status: 'received',
                timestamp: Date.now()
              };
              global.io.of('/chat').to(`session_${sessionId}`).emit('new_message', msgPayload);
              global.io.of('/chat').to('dashboard_all').emit('new_message', msgPayload);
            }

            logger.info(`📨 IN ${from}: ${String(textForDB).substring(0, 160)}`);

            // Notificar inbox (último mensaje y contadores)
            try {
              const [[meta]] = await pool.query(
                `SELECT 
                   s.id, s.phone, s.name,
                   (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id=s.id AND m.direction='in' AND m.status!='read') AS unreadCount
                 FROM chat_sessions s WHERE s.id=? LIMIT 1`,
                [sessionId]
              );
              inboxPush({
                type: 'conversation_update',
                sessionId,
                phone: from,
                lastText: textForDB,
                lastAt: Date.now(),
                unreadCount: Number(meta?.unreadCount || 0)
              });
              
              // Emitir evento adicional para refrescar lista completa
              inboxPush({
                type: 'new_message',
                sessionId,
                phone: from,
                timestamp: Date.now()
              });
            } catch (e) { logger.error({ e }, 'inboxPush conv update'); }

            // Acciones por respuesta interactiva (plantillas con botones)
            // DESACTIVADO: Ahora usa ConversationEngine unificado
            let interactiveId = null;
            try {
              interactiveId = m?.interactive?.button_reply?.id || m?.interactive?.list_reply?.id || null;
              if (interactiveId) {
                logger.info({ interactiveId, sessionId }, '🔴 Sistema botones DESACTIVADO - usará ConversationEngine');
                // await handleTemplateButtonAction(interactiveId, { sessionId, phone: from, text: textForDB, interactive: m.interactive });
              }
            } catch (e) { logger.error({ e }, 'interactive action error'); }

            // 🆕 LEGACY detectIntent ELIMINADO - Ahora usa MessageClassifier en Visual Flow Engine
            // La clasificación de intents se hace en chatbot/chatbot.js con el MessageClassifier

            // (Opcional) Orchestrator
            let handledByOrchestrator = false;
            if (ORCH_ENABLED && ORCH_BOOT_MODE !== 'off') {
              try {
                const match = await findIncomingTrigger({ phone: from, text: textForDB });
                if (match) {
                  handledByOrchestrator = true;
                  startFlowRun({
                    flowId: match.flow_id,
                    versionId: match.version_id,
                    triggerType: 'incoming_message',
                    context: { sessionId, phone: from, text: textForDB, waMsgId }
                  }).catch((e) => logger.error({ e }, 'startFlowRun error'));
                }
              } catch (e) {
                logger.error({ e }, 'trigger match error');
              }
            }

            // Chatbot (manual/assisted/automatic) si corresponde
            // MODIFICADO: También procesar si hay interactiveId (botones de plantillas)
            // Si hay teléfonos de prueba configurados, solo activar bot para esos números
            const isTestMode = chatbotTestPhones.size > 0;
            const isTestPhone = isTestMode && chatbotTestPhones.has(from);
            const botEnabledForThis = isTestMode
              ? isTestPhone  // Test mode: bot siempre activo para test phones (aunque global esté off)
              : (chatbotGlobalEnabled || sessionChatbotEnabled);
            const shouldRunBot = Boolean(
              (textForDB || interactiveId) && botEnabledForThis && (!handledByOrchestrator || ORCH_BOOT_MODE === 'tee')
            );
            
            // 🐛 DEBUG LOGS TEMPORALES
            logger.info({
              textForDB: textForDB?.slice(0, 50),
              chatbotGlobalEnabled,
              sessionChatbotEnabled,
              handledByOrchestrator,
              shouldRunBot,
              sessionId,
              phone: from
            }, '🤖 DEBUG: Evaluando si ejecutar chatbot');
            
            if (shouldRunBot) {
              logger.info({ 
                sessionId, 
                phone: from, 
                text: textForDB?.slice(0, 50),
                buttonId: interactiveId
              }, '🤖 EJECUTANDO chatbot unificado');
              handleChatbotMessage({
                sessionId,
                phone: from,
                text: textForDB,
                buttonId: interactiveId,
                waMsgId
              }).catch((e) => logger.error({ e }, 'chatbot handler error'));
            } else {
              logger.info({ 
                reason: 'shouldRunBot = false',
                textForDB: !!textForDB,
                chatbotGlobalEnabled,
                sessionChatbotEnabled,
                handledByOrchestrator 
              }, '🤖 NO ejecutando chatbot');
            }
          } catch (e) {
            logger.error({ e }, 'webhook message handler');
          }
        }

        /* ===================== ECHO MESSAGES (enviados desde app nativa IG/Messenger) ===================== */
        for (const echo of echoMessages) {
          try {
            const recipientId = echo.recipient?.id; // El usuario al que le enviamos
            const msgText = echo.message?.text || '';
            const msgId = echo.message?.mid || `echo_${Date.now()}`;

            // Extraer media de attachments (fotos, videos, audio enviados desde la app)
            let echoMediaType = null;
            let echoMediaId = null;
            if (echo.message?.attachments?.length) {
              const att = echo.message.attachments[0];
              if (att.type === 'image' || att.type === 'video' || att.type === 'audio' || att.type === 'file') {
                echoMediaType = att.type === 'file' ? 'document' : att.type;
                echoMediaId = att.payload?.url || null;
              }
            }

            // Descartar solo si no tiene ni texto ni media
            if (!recipientId || (!msgText && !echoMediaType)) continue;

            // Buscar sesión abierta para este usuario
            const [sessRows] = await pool.query(
              `SELECT id FROM chat_sessions WHERE phone=? AND channel=? AND status='OPEN' ORDER BY id DESC LIMIT 1`,
              [recipientId, channel]
            );

            if (!sessRows.length) {
              logger.debug({ recipientId, channel }, '🔄 Echo message: no open session found, skipping');
              continue;
            }

            const echoSessionId = sessRows[0].id;

            // Verificar que no esté duplicado (ya enviado desde nuestro panel)
            const [existing] = await pool.query(
              `SELECT id FROM chat_messages WHERE wa_msg_id=? LIMIT 1`,
              [msgId]
            );
            if (existing.length) {
              logger.debug({ mid: msgId }, '🔄 Echo message already in DB, skipping');
              continue;
            }

            // Insertar como mensaje saliente (con media si aplica)
            let echoDbId;
            if (echoMediaType && echoMediaId) {
              const [ins] = await pool.query(
                `INSERT INTO chat_messages (session_id, direction, text, wa_jid, wa_msg_id, status, channel,
                  media_type, media_id, media_caption)
                 VALUES (?, 'out', ?, ?, ?, 'sent', ?, ?, ?, ?)`,
                [echoSessionId, msgText || '', recipientId, msgId, channel,
                 echoMediaType, echoMediaId, msgText || null]
              );
              echoDbId = ins.insertId;
            } else {
              const [ins] = await pool.query(
                `INSERT INTO chat_messages (session_id, direction, text, wa_jid, wa_msg_id, status, channel)
                 VALUES (?, 'out', ?, ?, ?, 'sent', ?)`,
                [echoSessionId, msgText, recipientId, msgId, channel]
              );
              echoDbId = ins.insertId;
            }

            logger.info({ sessionId: echoSessionId, mid: msgId, dbId: echoDbId, channel, mediaType: echoMediaType }, '📤 Echo message saved as outgoing');

            // Construir payload de media para notificación
            const echoMediaForNotif = echoMediaType ? { type: echoMediaType, id: echoMediaId } : null;

            // Notificar al panel via SSE
            ssePush(echoSessionId, {
              type: 'message',
              direction: 'out',
              text: msgText,
              media: echoMediaForNotif,
              msgId,
              dbId: echoDbId,
              status: 'sent',
              at: Date.now()
            });

            // Notificar via Socket.IO (tiempo real en el panel)
            if (global.io) {
              const echoPayload = {
                type: 'message',
                direction: 'out',
                text: msgText,
                phone: recipientId,
                sessionId: echoSessionId,
                media: echoMediaForNotif,
                mediaId: echoMediaId,
                msgId,
                dbId: echoDbId,
                status: 'sent',
                timestamp: Date.now()
              };
              global.io.of('/chat').to(`session_${echoSessionId}`).emit('new_message', echoPayload);
              global.io.of('/chat').to('dashboard_all').emit('new_message', echoPayload);
            }

            inboxPush({ type: 'update', sessionId: echoSessionId });
          } catch (e) {
            logger.error({ e }, 'webhook echo message handler');
          }
        }

        /* ===================== ESTADOS DE MENSAJES SALIENTES ===================== */
        for (const s of statuses) {
          try {
            const waMsgId = s.id;
            const status = s.status; // sent, delivered, read, failed, deleted, (played para audio)
            let updateField = null;
            if (status === 'delivered') updateField = 'delivered_at = CURRENT_TIMESTAMP';
            if (status === 'read')      updateField = 'read_at = CURRENT_TIMESTAMP';
            // Nota: 'played' existe para audios/ptt; no afecta delivered_at/read_at

            if (status) {
              if (updateField) {
                await pool.query(
                  `UPDATE chat_messages SET status=?, ${updateField} WHERE wa_msg_id=?`,
                  [status, waMsgId]
                );
              } else {
                await pool.query(
                  `UPDATE chat_messages SET status=? WHERE wa_msg_id=?`,
                  [status, waMsgId]
                );
              }
            }

            // Obtener sessionId y notificar SSE
            const [[row]] = await pool.query(
              `SELECT session_id FROM chat_messages WHERE wa_msg_id=? LIMIT 1`,
              [waMsgId]
            );
            if (row?.session_id) {
              ssePush(row.session_id, {
                type: 'receipt',
                msgId: waMsgId,
                status,
                timestamp: Date.now()
              });

              // Emitir por Socket.IO
              if (global.io) {
                const statusPayload = {
                  msgId: waMsgId,
                  sessionId: row.session_id,
                  status,
                  timestamp: Date.now()
                };
                global.io.of('/chat').to(`session_${row.session_id}`).emit('message_status_update', statusPayload);
                global.io.of('/chat').to('dashboard_all').emit('message_status_update', statusPayload);
              }
            }
          } catch (e) {
            logger.error({ e }, 'webhook status handler');
          }
        }
    }

    return res.sendStatus(200);
  } catch (e) {
    logger.error({ e }, 'POST /webhook');
    return res.sendStatus(500);
  }
});



// === META helpers para media ===
async function getMediaUrlFromMeta(mediaId) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` } });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `Meta get media url error (${r.status})`);
  return { url: j.url, mime: j.mime_type || null };
}
async function pipeMediaFromMeta(mediaUrl, res) {
  const r2 = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` } });
  if (!r2.ok) {
    const j = await r2.json().catch(() => ({}));
    throw new Error(j?.error?.message || `Meta download error (${r2.status})`);
  }
  const ct = r2.headers.get('content-type') || 'application/octet-stream';
  const len = r2.headers.get('content-length');
  res.setHeader('Content-Type', ct);
  if (len) res.setHeader('Content-Length', len);
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');

  const nodeStream = Readable.fromWeb(r2.body);
  nodeStream.on('error', (err) => { try { res.destroy(err); } catch {} });
  nodeStream.pipe(res);
}






/* ========= Parsers para el resto de rutas ========= */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ========= API Routes ========= */

// FAQ ingest (guardar snippet pregunta/respuesta)
app.post('/api/faq/ingest', async (req, res) => {
  try {
    const { title, q, a, tags } = req.body || {};
    if (!q || !a) return res.status(400).json({ ok: false, error: 'Faltan q/a' });
    const { id } = faqStore.add({ title, q, a, tags: Array.isArray(tags) ? tags : [] });
    res.json({ ok: true, id });
  } catch (e) {
    logger.error({ e }, 'POST /api/faq/ingest');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// FAQ search (debug/uso en UI)
app.get('/api/faq/search', async (req, res) => {
  try {
    const q = String(req.query.q || '');
    const k = Math.min(Number(req.query.k) || 5, 20);
    if (!q) return res.json({ ok: true, matches: [] });
    const matches = faqStore.search(q, k);
    res.json({ ok: true, matches });
  } catch (e) {
    logger.error({ e }, 'GET /api/faq/search');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Get profile picture (Cloud API no expone foto de contacto)
app.get('/api/chat/profile-pic', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ ok: false, error: 'Falta phone' });
    res.json({ ok: true, photoUrl: null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});










// Create/link session (sin presencia ni business profile)
app.post('/api/chat/session', async (req, res) => {
  try {
    const { phone, name } = req.body || {};
    const norm = normalizePhoneCL(phone);
    if (!/^\d{11}$/.test(norm) || !norm.startsWith('569')) {
      return res.status(400).json({ ok: false, error: 'Número CL inválido (formato: 569XXXXXXXX)' });
    }

    // Check existing session
    const [rows] = await pool.query(
      `SELECT id, token, is_business, business_name FROM chat_sessions WHERE phone=? AND status='OPEN' ORDER BY id DESC LIMIT 1`,
      [norm]
    );
    let sessionId, token, isBusiness = false, businessName = null;
    if (rows.length) {
      sessionId = rows[0].id;
      token = rows[0].token;
      isBusiness = rows[0].is_business;
      businessName = rows[0].business_name;
    } else {
      token = randomToken(24);
      const [ins] = await pool.query(
        `INSERT INTO chat_sessions (token, phone, name, status) VALUES (?,?,?, 'OPEN')`,
        [token, norm, name || null]
      );
      sessionId = ins.insertId;
    }

    res.json({ 
      ok: true, 
      sessionId,
      token,
      photoUrl: null,
      isBusiness,
      businessName,
      businessProfile: null,
      status: null
    });
  } catch (e) {
    logger.error({ e }, 'POST /api/chat/session');
    res.status(500).json({ ok: false, error: 'Error creando sesión' });
  }
});

// Get history
// Get history (con media normalizado)
app.get('/api/chat/history', async (req, res) => {
  try {
    const sessionId = Number(req.query.sessionId);
    const token = String(req.query.token || '');
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const beforeId = req.query.beforeId ? Number(req.query.beforeId) : null;

    if (!sessionId || !token) {
      return res.status(400).json({ ok: false, error: 'Faltan sessionId/token' });
    }

    // Validar sesión
    const [ses] = await db.execute(
      'SELECT id, phone FROM chat_sessions WHERE id = ? AND token = ? LIMIT 1',
      [sessionId, token]
    );
    if (!ses.length) return res.status(403).json({ ok: false, error: 'Sesión inválida' });

    // 🧠 Traer también campos de media
    let sql = `
      SELECT 
        id,
        direction,
        text,
        status,
        wa_msg_id,
        UNIX_TIMESTAMP(created_at)*1000 AS at,
        UNIX_TIMESTAMP(delivered_at)*1000 AS deliveredAt,
        UNIX_TIMESTAMP(read_at)*1000 AS readAt,
        media_type,
        media_id,
        media_mime,
        media_size,
        media_caption,
        media_extra
      FROM chat_messages
      WHERE session_id = ? ${beforeId ? 'AND id < ?' : ''}
      ORDER BY id DESC
      LIMIT ?
    `;
    const params = beforeId ? [sessionId, beforeId, limit] : [sessionId, limit];
    const [rows] = await db.execute(sql, params);

    rows.reverse();

    // Normaliza "media" para el frontend
    const items = rows.map(r => {
      let extra = null;
      if (r.media_extra) {
        try { extra = typeof r.media_extra === 'string' ? JSON.parse(r.media_extra) : r.media_extra; }
        catch { extra = null; }
      }
      return {
        id: r.id,
        direction: r.direction,
        text: r.text,
        status: r.status,
        waMsgId: r.wa_msg_id,
        at: r.at,
        deliveredAt: r.deliveredAt,
        readAt: r.readAt,
        media: r.media_type ? {
          type: r.media_type,       // image|audio|video|document|sticker|location|contacts|interactive
          id: r.media_id,           // si existe: úsalo con /api/chat/media
          mime: r.media_mime,
          caption: r.media_caption,
          size: r.media_size,
          extra                     // objetos de location/contacts/voice flags, etc.
        } : null
      };
    });

    const nextBeforeId = rows.length ? rows[0].id : beforeId;
    const hasMore = rows.length === limit;

    res.json({ ok: true, items, nextBeforeId, hasMore });
  } catch (e) {
    console.error('history error', e);
    res.status(500).json({ ok: false, error: 'history_failed', detail: e.code || e.message });
  }
});

// === POST: enviar media vía Cloud API ===
// Body esperado (JSON):
// {
//   "sessionId": 123,
//   "token": "abcd",
//   "type": "image|video|audio|document|sticker",
//   // UNA de estas rutas:
//   "mediaId": "META_MEDIA_ID",
//   "link": "https://...",
//   "dataUrl": "data:image/jpeg;base64,...",
//   "bytesB64": "base64SinEncabezado", "filename": "foto.jpg", "mime": "image/jpeg",
//   // opcionales:
//   "caption": "texto opcional",
//   "filename": "archivo.pdf" // para document
// }

// SSE stream
app.get('/api/chat/stream', async (req, res) => {
  try {
    const sessionId = Number(req.query.sessionId);
    const token = String(req.query.token || '');
    if (!sessionId || !token) return res.status(400).end();

    const [rows] = await pool.query(
      `SELECT phone FROM chat_sessions WHERE id=? AND token=? AND status='OPEN'`,
      [sessionId, token]
    );
    if (!rows.length) return res.status(401).end();

    // CORS headers for SSE
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write('\n');

    if (!subscribers.has(sessionId)) subscribers.set(sessionId, new Set());
    subscribers.get(sessionId).add(res);

    // Initial status (siempre conectado con Cloud API)
    res.write(`data: ${JSON.stringify({ type: 'status', connected: true })}\n\n`);

    // Heartbeat
    const iv = setInterval(() => res.write('event: ping\ndata: {}\n\n'), 25000);

    req.on('close', () => {
      clearInterval(iv);
      subscribers.get(sessionId)?.delete(res);
    });
  } catch {
    res.status(500).end();
  }
});

// Send message via Cloud API
const sendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
});

// Listar plantillas disponibles en la WABA
app.get('/api/chat/templates', async (req, res) => {
  try {
    const q = String(req.query.q || '').toLowerCase().trim();
    const status = String(req.query.status || '').trim();       // APPROVED | REJECTED | PENDING | PAUSED etc.
    const category = String(req.query.category || '').trim();   // MARKETING | UTILITY/TRANSACTIONAL | AUTHENTICATION/OTP
    const lang = String(req.query.lang || '').trim();           // es, es_CL, en_US, etc.
    const limit = Math.min(Number(req.query.limit) || 200, 5000);
    const includeComponents = String(req.query.with || '').split(',').includes('components');

    const items = await listWabaTemplates({ limit, includeComponents });

    // Filtros locales (Graph no soporta filtros de búsqueda en ese edge)
    const filtered = items.filter(t => {
      if (status && String(t.status).toUpperCase() !== status.toUpperCase()) return false;
      if (category && String(t.category).toUpperCase() !== category.toUpperCase()) return false;
      if (lang && String(t.language).toLowerCase() !== lang.toLowerCase()) return false;
      if (q && !String(t.name).toLowerCase().includes(q)) return false;
      return true;
    });

    // Respuesta compacta
    const result = filtered.map(t => ({
      name: t.name,
      language: t.language,
      status: t.status,
      category: t.category,
      ...(includeComponents ? { components: t.components || [] } : {})
    }));

    res.json({ ok: true, count: result.length, items: result });
  } catch (e) {
    logger.error({ e }, 'GET /api/chat/templates');
    res.status(400).json({ ok: false, error: e.message });
  }
});

// === SEND MEDIA (JSON o multipart: guarda storage_url cuando usas link) ===
// IMPORTANTE: usa upload.single('file') para multipart/form-data
// ============================
// POST /api/chat/send-media
// ============================
app.post('/api/chat/send-media', sendLimiter, upload.single('file'), async (req, res) => {
  const startedAt = Date.now();

  // Log inicial (sin binarios)
  logger.info({
    path: '/api/chat/send-media',
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent']
    },
    hasFile: !!req.file,
    bodyKeys: Object.keys(req.body || {})
  }, '📩 REQUEST /send-media');

  try {
    // Body (sirve para multipart y JSON)
    const body = req.body || {};

    const sessionId = Number(body.sessionId);
    const token     = String(body.token || '');
    const type      = String(body.type || '').toLowerCase();

    const mediaIdIn = body.mediaId ? String(body.mediaId) : undefined;
    const linkIn    = body.link ? String(body.link) : undefined;
    const dataUrl   = body.dataUrl ? String(body.dataUrl) : undefined;
    const bytesB64  = body.bytesB64 ? String(body.bytesB64) : undefined;

    const caption   = body.caption ? String(body.caption) : undefined;
    let filename    = body.filename ? String(body.filename) : undefined;
    let mime        = body.mime ? String(body.mime) : undefined;

    logger.info({ sessionId, hasToken: !!token, type, mediaIdIn, linkIn, hasDataUrl: !!dataUrl, hasBytesB64: !!bytesB64, hasFile: !!req.file }, '🔎 Parámetros normales');

    if (!sessionId || !token) {
      logger.warn('❌ Faltan sessionId/token');
      return res.status(400).json({ ok: false, error: 'Faltan sessionId/token' });
    }

    const VALID_TYPES = new Set(['image','video','audio','document','sticker']);
    if (!VALID_TYPES.has(type)) {
      logger.warn({ type }, '❌ Tipo no soportado');
      return res.status(400).json({ ok: false, error: 'Tipo no soportado' });
    }

    // Sesión -> phone
    const [[ses]] = await pool.query(
      `SELECT id, phone FROM chat_sessions WHERE id=? AND token=? AND status='OPEN' LIMIT 1`,
      [sessionId, token]
    );
    if (!ses) {
      logger.warn({ sessionId }, '❌ Sesión inválida');
      return res.status(401).json({ ok: false, error: 'Sesión inválida' });
    }
    const phone = ses.phone;

    // Helpers locales
    const guessMimeFromExt = (name = '') => {
      const ext = String(name).split('.').pop()?.toLowerCase();
      if (!ext) return null;
      const map = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
        gif: 'image/gif', svg: 'image/svg+xml',
        mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska',
        mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/opus',
        pdf: 'application/pdf', doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        csv: 'text/csv', txt: 'text/plain', zip: 'application/zip'
      };
      return map[ext] || null;
    };

    const parseDataUrl = (du) => {
      const m = String(du || '').match(/^data:([^;]+);base64,(.+)$/i);
      if (!m) return null;
      return { mime: m[1], b64: m[2] };
    };

    // Resolver fuente
    let using  = null;  // 'mediaId' | 'link' | 'upload'
    let mediaId = null;
    let link    = null;

    if (mediaIdIn) {
      using = 'mediaId';
      mediaId = mediaIdIn;

    } else if (linkIn) {
      using = 'link';
      link = linkIn;

    } else if (req.file) {
      using = 'upload';
      mime = mime || req.file.mimetype || (filename && guessMimeFromExt(filename)) || 'application/octet-stream';
      filename = filename || req.file.originalname || 'upload.bin';

      if (type === 'sticker' && mime !== 'image/webp') {
        logger.warn({ mime }, '❌ Sticker debe ser image/webp');
        return res.status(400).json({ ok: false, error: 'Sticker debe ser image/webp' });
      }

      logger.info({ filename, mime, size: req.file.size }, '⬆️ Subiendo media (archivo)');
      mediaId = await uploadMedia(req.file.buffer, filename, mime);

    } else if (dataUrl || bytesB64) {
      using = 'upload';
      let b64;
      if (dataUrl) {
        const parsed = parseDataUrl(dataUrl);
        if (!parsed) {
          logger.warn('❌ dataUrl inválido');
          return res.status(400).json({ ok: false, error: 'dataUrl inválido' });
        }
        mime = mime || parsed.mime || 'application/octet-stream';
        b64  = parsed.b64;
        if (!filename) {
          const ext = (mime && mime.split('/')[1]) ? mime.split('/')[1] : 'bin';
          filename = `upload.${ext}`;
        }
      } else {
        b64  = bytesB64;
        mime = mime || (filename && guessMimeFromExt(filename)) || 'application/octet-stream';
        if (!filename) filename = 'upload.bin';
      }

      if (type === 'sticker' && mime !== 'image/webp') {
        logger.warn({ mime }, '❌ Sticker debe ser image/webp');
        return res.status(400).json({ ok: false, error: 'Sticker debe ser image/webp' });
      }

      const buf = Buffer.from(b64, 'base64');
      logger.info({ filename, mime, size: buf.length }, '⬆️ Subiendo media (base64)');
      mediaId = await uploadMedia(buf, filename, mime);

    } else {
      logger.warn('❌ Debes enviar mediaId, link, file, dataUrl o bytesB64');
      return res.status(400).json({ ok: false, error: 'Debes enviar mediaId, link, file (multipart), dataUrl o bytesB64' });
    }

    // Enviar a WhatsApp (mediaId o link)
    logger.info({ using, type, phone, mediaId, link, caption, filename }, '🚀 Enviando mensaje de media a WhatsApp');
    const waMsgId = await sendMediaViaCloudAPI(phone, {
      type,
      mediaId,
      link,
      caption,
      filename
    });

    // Persistencia (guardar storage_url si vino link)
    if (!mime) mime = filename ? (guessMimeFromExt(filename) || null) : null;
    const mediaExtra = {
      via: using,
      filename: filename || null,
      ...(using === 'link' && link ? { storage_url: link } : {})
    };

    const [ins] = await pool.query(
      `INSERT INTO chat_messages 
        (session_id, direction, text, wa_jid, wa_msg_id, status,
         media_type, media_id, media_mime, media_size, media_caption, media_extra)
       VALUES (?,?,?,?,?,? , ?,?,?,?,?,?)`,
      [
        sessionId, 'out', caption || '', phone, waMsgId, 'sent',
        type, mediaId, mime, null, caption || null, JSON.stringify(mediaExtra)
      ]
    );

    logger.info({
      messageId: ins.insertId,
      waMsgId,
      ms: Date.now() - startedAt
    }, '✅ /send-media OK');

    return res.json({
      ok: true,
      msgId: waMsgId,
      messageId: ins.insertId,
      using,
      mediaId: mediaId || null,
      link: link || null
    });

  } catch (e) {
    logger.error({ err: e.message }, '🔥 /send-media FAIL');
    return res.status(400).json({ ok: false, error: e.message });
  }
});



app.post('/api/chat/send', sendLimiter, async (req, res) => {
  try {
    let { sessionId, token, text, to, message } = req.body || {};

    // Soporte para nuevo formato del frontend: { to, message }
    if (!sessionId && to) {
      // Primero buscar exacto (Instagram/Messenger usan IDs, no teléfonos)
      let [sessionRows] = await pool.query(
        `SELECT id, token FROM chat_sessions WHERE phone=? AND status='OPEN' ORDER BY id DESC LIMIT 1`,
        [String(to)]
      );
      // Si no encontró, intentar con normalización chilena (WhatsApp)
      if (!sessionRows.length) {
        const normalizedPhone = normalizePhoneCL(to);
        [sessionRows] = await pool.query(
          `SELECT id, token FROM chat_sessions WHERE phone=? AND status='OPEN' ORDER BY id DESC LIMIT 1`,
          [normalizedPhone]
        );
      }

      if (!sessionRows.length) {
        return res.status(404).json({ ok: false, error: 'Conversación no encontrada' });
      }

      sessionId = sessionRows[0].id;
      token = sessionRows[0].token;
    }

    // Convertir "message" a "text"
    if (!text && message) {
      text = message;
    }

    if (!sessionId || !token || !text) {
      return res.status(400).json({ ok: false, error: 'Faltan campos' });
    }

    // Validate session
    const [rows] = await pool.query(
      `SELECT phone, channel FROM chat_sessions WHERE id=? AND token=? AND status='OPEN'`,
      [sessionId, token]
    );
    if (!rows.length) return res.status(401).json({ ok: false, error: 'Sesión inválida' });

    const phone = rows[0].phone;
    const sessionChannel = rows[0].channel || 'whatsapp';

    // Enviar mensaje según el canal de la sesión
    let waMsgId;
    if (sessionChannel === 'whatsapp') {
      waMsgId = await sendTextViaCloudAPI(phone, String(text));
    } else {
      waMsgId = await channelAdapters.sendMessage(sessionChannel, phone, String(text));
    }

    // Insert with status 'sent' (Cloud API actualizará por webhook)
    const [result] = await pool.query(
      `INSERT INTO chat_messages (session_id, direction, text, wa_jid, wa_msg_id, status, channel) VALUES (?,?,?,?,?,?,?)`,
      [sessionId, 'out', String(text), phone, waMsgId, 'sent', sessionChannel]
    );

    // 🤖 Cuando agente humano envía mensaje, cambiar a modo manual
    await pool.query(
      `UPDATE chat_sessions SET chatbot_mode = 'manual' WHERE id = ?`,
      [sessionId]
    );

    const messageId = result.insertId;

    // Enviar por SSE
    ssePush(sessionId, {
      type: 'message',
      direction: 'out',
      text,
      msgId: waMsgId,
      dbId: messageId,
      status: 'sent',
      at: Date.now()
    });

    // Emitir por Socket.IO
    if (global.io) {
      const outPayload = {
        type: 'message',
        direction: 'out',
        text,
        phone: to,
        sessionId,
        msgId: waMsgId,
        dbId: messageId,
        status: 'sent',
        timestamp: Date.now()
      };
      global.io.of('/chat').to(`session_${sessionId}`).emit('new_message', outPayload);
      global.io.of('/chat').to('dashboard_all').emit('new_message', outPayload);
    }

    res.json({ ok: true, msgId: waMsgId, messageId });
  } catch (e) {
    logger.error({ e }, 'POST /api/chat/send');
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ========================================
// ENDPOINT DE SIMULACIÓN - Chat Tester
// ========================================
// Este endpoint simula un mensaje entrante como si llegara de WhatsApp/Instagram
// Útil para probar el chatbot completo sin necesidad de credenciales reales
// NOTA: La función handleChatbotMessage se inyecta después de createChatbot()
let simulateMessageHandler = null;

app.post('/api/chat/simulate', express.json(), async (req, res) => {
  try {
    const { phone, message } = req.body || {};

    if (!phone || !message) {
      return res.status(400).json({ ok: false, error: 'Se requieren phone y message' });
    }

    const normalizedPhone = phone.replace(/[^\d+]/g, ''); // Limpiar formato
    const text = String(message).trim();

    logger.info({ phone: normalizedPhone, text: text.slice(0, 50) }, '🧪 SIMULACIÓN: Mensaje entrante');

    // 🌐 Simulador usa canal 'tester'
    const channel = 'tester';

    // Buscar o crear sesión (igual que en webhook, pero con channel='tester')
    const [rows] = await pool.query(
      `SELECT id, chatbot_enabled FROM chat_sessions WHERE phone=? AND channel=? AND status='OPEN' ORDER BY id DESC LIMIT 1`,
      [normalizedPhone, channel]
    );

    let sessionId, sessionChatbotEnabled = false;
    if (rows.length) {
      sessionId = rows[0].id;
      sessionChatbotEnabled = !!rows[0].chatbot_enabled;
    } else {
      // Crear nueva sesión con chatbot habilitado por defecto
      const token = crypto.randomBytes(12).toString('hex');
      const enableForNew = CHATBOT_AUTO_ENABLE_NEW_SESSIONS || chatbotGlobalEnabled;

      logger.info({ phone: normalizedPhone, channel, enableForNew }, '🧪 SIMULACIÓN: Creando nueva sesión');

      const [ins] = await pool.query(
        `INSERT INTO chat_sessions (token, phone, name, status, chatbot_enabled, chatbot_mode, channel) VALUES (?,?,?, 'OPEN', ?, ?, ?)`,
        [token, normalizedPhone, null, enableForNew, enableForNew ? 'automatic' : 'manual', channel]
      );
      sessionId = ins.insertId;
      sessionChatbotEnabled = enableForNew;
    }

    // Insertar mensaje en BD (simular como mensaje entrante)
    const simulatedWaMsgId = `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const [msgResult] = await pool.query(
      `INSERT INTO chat_messages (session_id, direction, text, wa_jid, wa_msg_id, status, channel) VALUES (?,?,?,?,?,?,?)`,
      [sessionId, 'in', text, normalizedPhone, simulatedWaMsgId, 'delivered', channel]
    );
    const dbMessageId = msgResult.insertId;

    // Emitir por SSE (para que se vea en el panel si está abierto)
    ssePush(sessionId, {
      type: 'message',
      direction: 'in',
      text,
      msgId: simulatedWaMsgId,
      dbId: dbMessageId,
      status: 'delivered',
      at: Date.now()
    });

    // Emitir por Socket.IO
    if (global.io) {
      const simPayload = {
        type: 'message',
        direction: 'in',
        text,
        phone: phone,
        sessionId,
        msgId: simulatedWaMsgId,
        dbId: dbMessageId,
        status: 'delivered',
        timestamp: Date.now()
      };
      global.io.of('/chat').to(`session_${sessionId}`).emit('new_message', simPayload);
      global.io.of('/chat').to('dashboard_all').emit('new_message', simPayload);
    }

    // ========================================
    // EJECUTAR CHATBOT (Visual Flow Engine)
    // ========================================
    let responses = [];
    let flowExecuted = false;
    let flowName = null;

    if (chatbotGlobalEnabled && sessionChatbotEnabled && simulateMessageHandler) {
      try {
        logger.info({ sessionId, phone: normalizedPhone }, '🧪 SIMULACIÓN: Ejecutando chatbot');

        // Ejecutar chatbot (igual que en webhook)
        await simulateMessageHandler({
          sessionId,
          phone: normalizedPhone,
          text,
          buttonId: null
        });

        // Esperar un poco para que el chatbot procese y guarde las respuestas
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Obtener las últimas respuestas del bot de esta sesión
        const [botMessages] = await pool.query(
          `SELECT text FROM chat_messages
           WHERE session_id = ? AND direction = 'out' AND id > ?
           ORDER BY id ASC LIMIT 10`,
          [sessionId, dbMessageId]
        );

        responses = botMessages.map(m => m.text);
        flowExecuted = responses.length > 0;

        logger.info({ sessionId, responseCount: responses.length }, '🧪 SIMULACIÓN: Chatbot ejecutado');
      } catch (e) {
        logger.error({ e }, '🧪 SIMULACIÓN: Error ejecutando chatbot');
      }
    } else {
      logger.info({ sessionId, chatbotGlobalEnabled, sessionChatbotEnabled, hasHandler: !!simulateMessageHandler }, '🧪 SIMULACIÓN: Chatbot deshabilitado o no inicializado');
    }

    // Retornar resultado
    return res.json({
      ok: true,
      sessionId,
      messageId: dbMessageId,
      responses,
      flowExecuted,
      flowName,
      message: responses.length > 0 ? null : 'Mensaje recibido (chatbot no habilitado o sin respuestas)'
    });

  } catch (e) {
    logger.error({ e }, '🧪 SIMULACIÓN: Error en /api/chat/simulate');
    return res.status(500).json({ ok: false, error: e.message });
  }
});


// Enviar plantilla (HSM) vía Cloud API
app.post('/api/chat/send-template', sendLimiter, express.json(), async (req, res) => {
  const startedAt = Date.now();
  const {
    sessionId, token,
    templateName, languageCode,
    components, bodyParams, headerText,
    debug // opcional
  } = req.body || {};

  const qDebug = req.query.debug === '1' || String(debug) === 'true';
  const log = logger.child({
    op: 'send-template-endpoint',
    sessionId, templateName, languageCode, qDebug
  });

  try {
    if (!sessionId || !token || !templateName || !languageCode) {
      return res.status(400).json({ ok: false, error: 'Faltan campos requeridos' });
    }

    const [[ses]] = await pool.query(
      `SELECT id, phone FROM chat_sessions WHERE id=? AND token=? AND status='OPEN' LIMIT 1`,
      [Number(sessionId), String(token)]
    );
    if (!ses) return res.status(401).json({ ok: false, error: 'Sesión inválida' });

    const phone = ses.phone;

    // Auto-activar modo automático cuando se envía plantilla (lógica: si envías plantilla = quieres respuestas automáticas)
    await pool.query(`UPDATE chat_sessions SET chatbot_mode = 'automatic' WHERE id = ?`, [Number(sessionId)]);
    
    // 🔄 IMPORTANTE: También resetear estado de escalamiento y contexto (nueva conversación = reset completo)
    // Intentar resetear campos de escalamiento y contexto si existen (defensivo)
    try {
      await pool.query(`
        UPDATE chat_sessions 
        SET escalation_status = 'NONE',
            escalation_reason = NULL,
            escalated_at = NULL,
            conversation_context = NULL,
            last_bot_question = NULL,
            awaiting_response_type = NULL
        WHERE id = ?
      `, [Number(sessionId)]);
      log.info({ sessionId }, '🔄 Estado de escalamiento y contexto reseteados por nueva plantilla');
    } catch (e) {
      // Si los campos no existen aún, continuar sin error
      log.debug({ error: e.message?.substring(0, 100) }, '🔄 Campos de escalamiento/contexto no existen aún - continuando');
    }
    
    // IMPORTANTE: También actualizar en memoria para que el chatbot lo vea inmediatamente
    setSessionMode(Number(sessionId), 'automatic');
    
    log.info({ sessionId, templateName }, '🤖 Sesión activada en modo automático y escalamiento reseteado (plantilla enviada)');

    // Construcción simplificada si no mandan components nativo
    let comps = Array.isArray(components) ? components : null;
    if (!comps) {
      const c = [];
      if (headerText) {
        c.push({ type: 'header', parameters: [{ type: 'text', text: String(headerText) }] });
      }
      if (Array.isArray(bodyParams) && bodyParams.length) {
        c.push({ type: 'body', parameters: bodyParams.map(v => ({ type: 'text', text: String(v) })) });
      }
      comps = c;
    }

    // Enviar
    const waMsgId = await sendTemplateViaCloudAPI(phone, String(templateName), String(languageCode), comps);

    // Persistencia mejorada (resumen con parámetros)
    let summary = `[TEMPLATE:${templateName} ${languageCode}]`;

    // Si hay bodyParams (formato simplificado)
    if (Array.isArray(bodyParams) && bodyParams.length) {
      summary += ` body=${JSON.stringify(bodyParams).slice(0, 400)}`;
    }
    // Si hay components nativos, extraer parámetros para mostrar
    else if (Array.isArray(comps) && comps.length) {
      const params = [];
      for (const comp of comps) {
        if (comp.parameters && Array.isArray(comp.parameters)) {
          for (const p of comp.parameters) {
            if (p.text) params.push(p.text);
          }
        }
      }
      if (params.length) {
        summary += ` params=${JSON.stringify(params).slice(0, 400)}`;
      }
    }

    const [result] = await pool.query(
      `INSERT INTO chat_messages (session_id, direction, text, wa_jid, wa_msg_id, status, is_ai_generated)
       VALUES (?,?,?,?,?,?,?)`,
      [Number(sessionId), 'out', summary, phone, waMsgId, 'sent', 0]
    );

    const messageId = result.insertId;

    ssePush(Number(sessionId), {
      type: 'message',
      direction: 'out',
      text: summary,
      msgId: waMsgId,
      dbId: messageId,
      status: 'sent',
      isAI: false,
      template: { name: templateName, languageCode, components: comps },
      at: Date.now()
    });

    const took = Date.now() - startedAt;
    log.info({ waMsgId, messageId, took }, 'send-template OK');
    
    // 🆕 GUARDAR CONTEXTO DEL PEDIDO si es plantilla notificacion_entrega
    if (templateName === 'notificacion_entrega') {
      try {
        // Buscar el código de seguimiento en los components
        let codigoSeguimiento = null;
        
        if (comps && Array.isArray(comps)) {
          for (const comp of comps) {
            if (comp.type === 'button' && comp.parameters && Array.isArray(comp.parameters)) {
              for (const param of comp.parameters) {
                if (param.type === 'text' && param.text) {
                  // Asumimos que es el código de seguimiento si tiene formato XX-XX-XXXX-XX
                  const text = String(param.text);
                  if (text.includes('-')) {
                    codigoSeguimiento = text;
                    break;
                  }
                }
              }
            }
          }
        }
        
        if (codigoSeguimiento) {
          // Extraer num_orden del codigo (formato: 12345-20-2025-aB)
          const parts = codigoSeguimiento.split('-');
          const numOrden = parts[0];
          
          if (numOrden && /^\d+$/.test(numOrden)) {
            // Guardar contexto del pedido (expira en 48 horas)
            await pool.query(
              `UPDATE chat_sessions 
               SET current_order_context = ?,
                   order_context_expires = DATE_ADD(NOW(), INTERVAL 48 HOUR)
               WHERE id = ?`,
              [numOrden, Number(sessionId)]
            );
            
            log.info({ sessionId, numOrden, codigoSeguimiento }, '📦 Contexto de pedido guardado desde frontend');
          }
        }
      } catch (contextError) {
        log.warn({ error: contextError.message }, '⚠️ Error guardando contexto del pedido');
      }
    }
    
    res.json({ ok: true, msgId: waMsgId, messageId, tookMs: took });

  } catch (e) {
    const took = Date.now() - startedAt;

    // Si pidieron debug, devolver variantes de idioma para ese template
    if (qDebug && templateName) {
      let variants = [];
      try { variants = await getTemplateVariants(String(templateName)); } catch (ee) {}
      logger.error({ error: e.message, variants, took }, 'send-template FAIL (debug)');
      return res.status(400).json({
        ok: false,
        error: e.message,
        debug: {
          templateName,
          requestedLanguage: languageCode,
          availableVariants: variants, // [{language,status,category}]
          tookMs: took
        }
      });
    }

    logger.error({ error: e.message, took }, 'send-template FAIL');
    res.status(400).json({ ok: false, error: e.message, tookMs: took });
  }
});

// Endpoint simple para probar plantillas (sin sesión requerida)
app.post('/api/templates/test', sendLimiter, express.json(), async (req, res) => {
  const { templateName, languageCode, phone, parameters, headerParams, buttonParams } = req.body || {};

  try {
    if (!templateName || !languageCode || !phone) {
      return res.status(400).json({
        ok: false,
        error: 'Campos requeridos: templateName, languageCode, phone'
      });
    }

    // Normalizar teléfono (agregar código de país si no lo tiene)
    let normalizedPhone = String(phone).replace(/\D/g, '');
    if (!normalizedPhone.startsWith('56') && normalizedPhone.length === 9) {
      normalizedPhone = '56' + normalizedPhone;
    }

    // Construir componentes
    const components = [];

    // Header params (si existen)
    if (Array.isArray(headerParams) && headerParams.length > 0) {
      components.push({
        type: 'header',
        parameters: headerParams.map(p => ({ type: 'text', text: String(p) }))
      });
    }

    // Body params (si existen)
    if (Array.isArray(parameters) && parameters.length > 0) {
      components.push({
        type: 'body',
        parameters: parameters.map(p => ({ type: 'text', text: String(p) }))
      });
    }

    // Button params (si existen)
    if (Array.isArray(buttonParams) && buttonParams.length > 0) {
      buttonParams.forEach((param, idx) => {
        components.push({
          type: 'button',
          sub_type: 'url',
          index: idx,
          parameters: [{ type: 'text', text: String(param) }]
        });
      });
    }

    logger.info({ templateName, languageCode, phone: normalizedPhone, components }, '🧪 Probando plantilla');

    const waMsgId = await sendTemplateViaCloudAPI(normalizedPhone, templateName, languageCode, components);

    logger.info({ waMsgId, templateName }, '✅ Plantilla de prueba enviada');

    res.json({
      ok: true,
      waMsgId,
      message: `Plantilla "${templateName}" enviada a ${normalizedPhone}`,
      sentTo: normalizedPhone
    });

  } catch (e) {
    logger.error({ error: e.message, templateName, phone }, '❌ Error enviando plantilla de prueba');
    res.status(400).json({ ok: false, error: e.message });
  }
});


/* ========= Chatbot control (API) -> Rutas movidas a chatbot/chatbot.js ========= */

// Chatbot endpoints movidos a módulo dedicado (chatbot/chatbot.js)

/* ========= Chatbot handler moved to ./chatbot/chatbot.js ========= */

/* ========= Intent Detection & Routing (Professional v1) ========= */
// 🆕 LEGACY detectIntent ELIMINADO
// La clasificación de intents ahora la maneja MessageClassifier en chatbot/message-classifier.js
// Las reglas de intent están en la tabla classifier_rules de la BD

async function signAndPostAction(url, payload) {
  const target = url || ACTIONS_HOOK_URL;
  if (!target) throw new Error('No hay URL configurada para call_http');
  const body = JSON.stringify(payload || {});
  const headers = { 'Content-Type': 'application/json' };
  if (ACTIONS_HOOK_SECRET) {
    const hmac = crypto.createHmac('sha256', ACTIONS_HOOK_SECRET);
    hmac.update(body);
    headers['X-Webhook-Signature'] = hmac.digest('hex');
  }
  const r = await fetch(target, { method: 'POST', headers, body });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  if (!r.ok) throw new Error(json?.error || `call_http error ${r.status}`);
  return json || { ok: true };
}

async function applyRouteAction(route, { sessionId, phone, text, interactive }) {
  const type = route.action_type;
  const config = route.action_json && (typeof route.action_json === 'string' ? JSON.parse(route.action_json) : route.action_json) || {};
  if (type === 'set_mode') {
    const mode = config.mode || 'manual';
    await pool.query(`UPDATE chat_sessions SET chatbot_mode=? WHERE id=?`, [mode, Number(sessionId)]);
    sessionModes.set(Number(sessionId), mode);
    ssePush(Number(sessionId), { type: 'mode_changed', mode, at: Date.now() });
    if (mode === 'manual') {
      ssePush(Number(sessionId), { type: 'agent_required', reason: 'route_set_manual', at: Date.now() });
      // Emitir escalamiento por Socket.IO
      if (global.io) {
        const escPayload = {
          sessionId,
          phone,
          reason: 'route_set_manual',
          timestamp: Date.now()
        };
        global.io.of('/chat').to(`session_${sessionId}`).emit('escalation', escPayload);
        global.io.of('/chat').to('dashboard_all').emit('escalation', escPayload);
      }
    }
    return { ok: true };
  }
  if (type === 'launch_flow') {
    if (!ORCH_ENABLED) return { ok: false, error: 'orchestrator_disabled' };
    const flowId = Number(config.flow_id || 0);
    let versionId = Number(config.version_id || 0);
    if (!versionId && flowId) {
      const [[v]] = await pool.query(`SELECT id FROM flow_versions WHERE flow_id=? AND is_active=1 ORDER BY id DESC LIMIT 1`, [flowId]);
      versionId = v?.id || 0;
    }
    if (!flowId || !versionId) return { ok: false, error: 'invalid_flow' };
    const ctx = { sessionId, phone, text, interactive };
    const runId = await startFlowRun({ flowId, versionId, triggerType: 'intent', context: ctx });
    return { ok: true, runId };
  }
  if (type === 'send_text') {
    const body = String(config.text || text || '');
    const waMsgId = await sendTextViaCloudAPI(phone, body);
    await pool.query(
      `INSERT INTO chat_messages (session_id, direction, text, wa_jid, wa_msg_id, status, is_ai_generated) VALUES (?,?,?,?,?,?,?)`,
      [sessionId, 'out', body, phone, waMsgId, 'sent', 0]
    );
    ssePush(Number(sessionId), { type: 'message', direction: 'out', text: body, msgId: waMsgId, status: 'sent', at: Date.now() });
    return { ok: true };
  }
  if (type === 'call_http') {
    const url = config.url || ACTIONS_HOOK_URL;
    const payload = { action: 'intent_route', route: { id: route.id, intent: route.intent_name }, context: { sessionId, phone, text, interactive } };
    const r = await signAndPostAction(url, payload);
    return { ok: true, response: r };
  }
  return { ok: false, error: 'unknown_action' };
}

// 🆕 LEGACY routeByIntent ELIMINADO - Ya no se usa
// El routing por intent ahora se hace en Visual Flow Engine con triggers de tipo 'intent'

async function handleTemplateButtonAction(replyId, ctx) {
  // 1. Intentar sistema antiguo (template_button_actions)
  const [[oldSystemRow]] = await pool.query(`SELECT * FROM template_button_actions WHERE reply_id=? AND active=1 LIMIT 1`, [String(replyId)]);
  if (oldSystemRow) {
    try {
      return await applyRouteAction(oldSystemRow, ctx);
    } catch (e) {
      logger.error({ e, replyId }, 'handleTemplateButtonAction old system error');
    }
  }

  // 2. Nuevo sistema: buscar en conversation_flows
  try {
    return await handleConversationFlow(replyId, ctx);
  } catch (e) {
    logger.error({ e, replyId }, 'handleConversationFlow error');
    return null;
  }
}

async function handleConversationFlow(buttonId, ctx) {
  const { sessionId, phone, text, interactive } = ctx;
  
  // Encontrar la plantilla más reciente enviada en esta sesión
  const [templateRows] = await pool.query(`
    SELECT content FROM chat_messages 
    WHERE session_id=? AND from_client=0 AND content LIKE '%[TEMPLATE:%' 
    ORDER BY id DESC LIMIT 1
  `, [sessionId]);
  
  let templateName = null;
  if (templateRows.length > 0) {
    // Extraer nombre de plantilla de "[TEMPLATE:nombre_template es]"
    const match = templateRows[0].content.match(/\[TEMPLATE:(\w+)/);
    if (match) {
      templateName = match[1];
    }
  }
  
  if (!templateName) {
    logger.warn({ buttonId, sessionId }, 'No se pudo determinar plantilla para botón presionado');
    return null;
  }

  // Buscar flujo que coincida con el botón presionado
  const buttonText = interactive?.button_reply?.title || text || buttonId;
  
  // SOLO SISTEMA NUEVO: conversation_flows
  const [flows] = await pool.query(`
    SELECT * FROM conversation_flows 
    WHERE template_name=? AND is_active=1 
    ORDER BY step_number, trigger_priority DESC
  `, [templateName]);
  
  let matchedFlow = null;
  const messageLower = buttonText.toLowerCase();
  
  let bestMatch = null;
  let bestMatchScore = 0;
  
  for (const flow of flows) {
    try {
      const keywords = JSON.parse(flow.trigger_keywords || '[]');
      let matchScore = 0;
      let hasMatch = false;
      
      logger.info({
        flowId: flow.id,
        stepName: flow.step_name,
        keywords: keywords,
        buttonId: buttonId,
        buttonText: buttonText,
        messageLower: messageLower
      }, `🔍 Evaluando flujo: "${flow.step_name}"`);
      
      for (const keyword of keywords) {
        if (keyword === buttonId) {
          // Coincidencia exacta por ID del botón = máxima prioridad
          matchScore = 100;
          hasMatch = true;
          logger.info({ keyword, buttonId, matchScore }, '✅ MATCH EXACTO por buttonId');
          break;
        } else if (keyword.toLowerCase() === messageLower) {
          // Coincidencia exacta del texto = alta prioridad
          matchScore = 90;
          hasMatch = true;
          logger.info({ keyword, messageLower, matchScore }, '✅ MATCH EXACTO por texto');
        } else if (keyword.toLowerCase() === buttonText.toLowerCase()) {
          // Coincidencia exacta del botón = alta prioridad  
          matchScore = 90;
          hasMatch = true;
          logger.info({ keyword, buttonText, matchScore }, '✅ MATCH EXACTO por buttonText');
        } else if (messageLower.includes(keyword.toLowerCase()) && keyword.length > 3) {
          // Coincidencia parcial con keyword largo = media prioridad
          matchScore = Math.max(matchScore, 70);
          hasMatch = true;
          logger.info({ keyword, messageLower, matchScore }, '✅ MATCH PARCIAL');
        } else if (keyword === '*') {
          // Wildcard = baja prioridad (solo si no hay otros matches)
          matchScore = Math.max(matchScore, 10);
          hasMatch = true;
          logger.info({ keyword, matchScore }, '✅ MATCH WILDCARD');
        } else {
          logger.info({ keyword, buttonId, buttonText, messageLower }, '❌ NO MATCH');
        }
      }
      
      // Seleccionar el mejor match
      if (hasMatch && matchScore > bestMatchScore) {
        bestMatchScore = matchScore;
        bestMatch = flow;
        logger.info({ 
          flowId: flow.id, 
          stepName: flow.step_name,
          newBestScore: matchScore 
        }, '🏆 NUEVO MEJOR MATCH');
      }
      
    } catch (e) {
      logger.error({ e, flowId: flow.id }, 'Error parsing trigger_keywords');
    }
  }
  
  matchedFlow = bestMatch;
  
  if (!matchedFlow) {
    logger.info({ 
      templateName, 
      buttonText, 
      buttonId, 
      flowsChecked: flows.length
    }, 'No se encontró flujo configurado para botón presionado');
    return null;
  }

  // Ejecutar flujo encontrado
  logger.info({ 
    flowId: matchedFlow.id,
    stepName: matchedFlow.step_name,
    templateName,
    buttonText,
    buttonId,
    responseType: matchedFlow.response_type,
    matchScore: bestMatchScore
  }, `✅ Ejecutando flujo conversacional (match score: ${bestMatchScore})`);

  // Enviar respuesta del flujo
  await sendTextMessage(phone, matchedFlow.response_text);
  
  // Registrar en conversation_sessions si existe la tabla
  try {
    await pool.query(`
      INSERT IGNORE INTO conversation_sessions (session_id, template_name, current_step_id, conversation_state, started_at, last_interaction_at)
      VALUES (?, ?, ?, 'active', NOW(), NOW())
      ON DUPLICATE KEY UPDATE 
        current_step_id=VALUES(current_step_id),
        last_interaction_at=NOW(),
        messages_in_flow=messages_in_flow+1
    `, [sessionId, templateName, matchedFlow.id]);
  } catch (e) {
    logger.warn({ e }, 'Error registrando en conversation_sessions (tabla puede no existir)');
  }
  
  return {
    matched: true,
    flow: matchedFlow,
    template: templateName,
    response: matchedFlow.response_text
  };
}

/* ========= Orchestrator Engine (MVP) ========= */
const flowRunSubscribers = new Map(); // runId -> Set(res)
const runningRuns = new Map(); // runId -> { cancelled: boolean }

function orchSsePush(runId, payload) {
  const set = flowRunSubscribers.get(Number(runId));
  if (!set) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) res.write(data);
}

async function persistRunEvent(runId, level, nodeId, eventType, payload) {
  try {
    await pool.query(
      `INSERT INTO flow_run_events (run_id, level, node_id, event_type, payload) VALUES (?,?,?,?,?)`,
      [runId, level || 'INFO', nodeId || null, eventType, JSON.stringify(payload || null)]
    );
  } catch (e) {
    logger.error({ e }, 'persistRunEvent error');
  }
}

function resolveTemplate(str, ctx) {
  return String(str || '').replace(/\$\{([^}]+)\}/g, (_, expr) => {
    try {
      const path = expr.trim().split('.');
      let val = ctx;
      for (const key of path) val = val?.[key];
      return val == null ? '' : String(val);
    } catch {
      return '';
    }
  });
}

async function executeFlowDefinition({ runId, definition, context }) {
  const byId = new Map();
  for (const n of definition.nodes || []) byId.set(n.id, n);
  const edges = definition.edges || [];

  function nextOf(nodeId, outcome) {
    const outs = edges.filter(e => e.source === nodeId);
    if (!outs.length) return null;
    if (outcome != null) {
      // Buscar por condición de edge
      const match = outs.find(e => (e?.data?.condition ?? null) === outcome);
      if (match) return match.target;
    }
    return outs[0].target;
  }

  let currentId = (definition.nodes || []).find(n => n.type === 'start')?.id;
  if (!currentId && (definition.nodes || []).length) currentId = definition.nodes[0].id;

  await persistRunEvent(runId, 'INFO', null, 'START', { context });
  orchSsePush(runId, { type: 'run', state: 'START', at: Date.now() });

  while (currentId && runningRuns.get(runId)?.cancelled !== true) {
    const node = byId.get(currentId);
    if (!node) break;
    const nodeId = node.id;
    await persistRunEvent(runId, 'INFO', nodeId, 'ENTER', { node });
    orchSsePush(runId, { type: 'node', phase: 'enter', nodeId, at: Date.now() });

    try {
      switch (node.type) {
        case 'start': {
          // No-op
          break;
        }
        case 'if': {
          const data = node.data || {};
          const sourceVal = data.source === 'var' ? context.vars?.[data.varName] : context.text;
          const value = String(sourceVal || '');
          const needle = String(data.value || '');
          let result = false;
          if (data.exprType === 'contains') result = value.toLowerCase().includes(needle.toLowerCase());
          else if (data.exprType === 'startsWith') result = value.toLowerCase().startsWith(needle.toLowerCase());
          else if (data.exprType === 'equals') result = value.toLowerCase() === needle.toLowerCase();
          else if (data.exprType === 'regex') {
            try { result = new RegExp(needle, 'i').test(value); } catch { result = false; }
          }
          if (data.negate) result = !result;
          await persistRunEvent(runId, 'INFO', nodeId, 'LOG', { ifResult: result });
          orchSsePush(runId, { type: 'node', phase: 'result', nodeId, result, at: Date.now() });
          currentId = nextOf(nodeId, result === true ? 'true' : 'false');
          continue;
        }
        case 'setVar': {
          const data = node.data || {};
          context.vars = context.vars || {};
          const assignments = data.assignments || {};
          for (const [k, v] of Object.entries(assignments)) {
            context.vars[k] = resolveTemplate(v, { input: { text: context.text }, vars: context.vars, context });
          }
          await persistRunEvent(runId, 'INFO', nodeId, 'LOG', { vars: context.vars });
          break;
        }
        case 'sendText': {
          const data = node.data || {};
          const text = resolveTemplate(data.textTemplate || '', { input: { text: context.text }, vars: context.vars, context });
          const waMsgId = await sendTextViaCloudAPI(context.phone, text);
          await pool.query(
            `INSERT INTO chat_messages (session_id, direction, text, wa_jid, wa_msg_id, status) VALUES (?,?,?,?,?,?)`,
            [context.sessionId, 'out', text, context.phone, waMsgId, 'sent']
          );
          ssePush(context.sessionId, { type: 'message', direction: 'out', text, msgId: waMsgId, status: 'sent', at: Date.now() });
          await persistRunEvent(runId, 'INFO', nodeId, 'LOG', { sent: true, waMsgId });
          break;
        }
        case 'delay': {
          const data = node.data || {};
          const ms = Math.min(Number(data.ms || 0), 5 * 60 * 1000);
          await new Promise((resolve) => setTimeout(resolve, ms));
          break;
        }
        case 'end': {
          currentId = null;
          break;
        }
        default: {
          await persistRunEvent(runId, 'WARN', nodeId, 'LOG', { unsupportedNodeType: node.type });
        }
      }
    } catch (e) {
      await persistRunEvent(runId, 'ERROR', nodeId, 'ERROR', { message: e.message });
      await pool.query(`UPDATE flow_runs SET status='FAILED', finished_at=CURRENT_TIMESTAMP WHERE id=?`, [runId]);
      orchSsePush(runId, { type: 'run', state: 'FAILED', error: e.message, at: Date.now() });
      return;
    }

    await persistRunEvent(runId, 'INFO', nodeId, 'EXIT', {});
    orchSsePush(runId, { type: 'node', phase: 'exit', nodeId, at: Date.now() });
    if (currentId) currentId = nextOf(nodeId);
  }

  const wasCancelled = runningRuns.get(runId)?.cancelled === true;
  await pool.query(
    `UPDATE flow_runs SET status=?, finished_at=CURRENT_TIMESTAMP WHERE id=?`,
    [wasCancelled ? 'CANCELLED' : 'COMPLETED', runId]
  );
  await persistRunEvent(runId, 'INFO', null, wasCancelled ? 'CANCEL' : 'END', {});
  orchSsePush(runId, { type: 'run', state: wasCancelled ? 'CANCELLED' : 'COMPLETED', at: Date.now() });
}

async function startFlowRun({ flowId, versionId, triggerType, context }) {
  const [ins] = await pool.query(
    `INSERT INTO flow_runs (flow_id, version_id, trigger_type, status, context_json) VALUES (?,?,?,?,?)`,
    [flowId, versionId, triggerType, 'RUNNING', JSON.stringify(context)]
  );
  const runId = ins.insertId;
  runningRuns.set(runId, { cancelled: false });

  // Load definition
  const [[ver]] = await pool.query(`SELECT definition FROM flow_versions WHERE id=?`, [versionId]);
  const definition = ver?.definition ? (typeof ver.definition === 'string' ? JSON.parse(ver.definition) : ver.definition) : { nodes: [], edges: [] };

  executeFlowDefinition({ runId, definition, context }).catch((e) => logger.error({ e }, 'executeFlowDefinition'));
  return runId;
}

async function findIncomingTrigger({ phone, text }) {
  const [rows] = await pool.query(`
    SELECT ft.id as trigger_id, ft.flow_id, fv.id as version_id, ft.match_json, ft.priority
    FROM flow_triggers ft
    JOIN flows f ON f.id = ft.flow_id AND f.status != 'ARCHIVED'
    JOIN flow_versions fv ON fv.flow_id = f.id AND fv.is_active = 1
    WHERE ft.active = 1 AND ft.type = 'incoming_message'
    ORDER BY ft.priority ASC, ft.id ASC
  `);

  const normalizedText = String(text || '').toLowerCase();
  for (const r of rows) {
    const match = r.match_json ? (typeof r.match_json === 'string' ? JSON.parse(r.match_json) : r.match_json) : {};
    if (match?.phone && String(match.phone) !== String(phone)) continue;
    let ok = false;
    if (!match || Object.keys(match).length === 0 || match.always) ok = true;
    if (!ok && match.contains) ok = normalizedText.includes(String(match.contains).toLowerCase());
    if (!ok && match.startsWith) ok = normalizedText.startsWith(String(match.startsWith).toLowerCase());
    if (!ok && match.equals) ok = normalizedText === String(match.equals).toLowerCase();
    if (!ok && match.regex) {
      try { ok = new RegExp(match.regex, 'i').test(normalizedText); } catch { ok = false; }
    }
    if (ok) return r;
  }
  return null;
}

/* ========= Orchestrator Routes ========= */
const flowsRouter = express.Router();
flowsRouter.use(panelAuth);

flowsRouter.get('/', async (req, res) => {
  const [flows] = await pool.query(`
    SELECT f.*, (SELECT COUNT(1) FROM flow_versions v WHERE v.flow_id=f.id AND v.is_active=1) as active_versions
    FROM flows f ORDER BY f.updated_at DESC
  `);
  res.json({ ok: true, items: flows });
});

flowsRouter.post('/', async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'Falta name' });
  const [ins] = await pool.query(`INSERT INTO flows (name, status) VALUES (?, 'DRAFT')`, [name]);
  res.json({ ok: true, id: ins.insertId });
});

flowsRouter.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, status } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'id inválido' });
  const fields = [];
  const vals = [];
  if (name) { fields.push('name=?'); vals.push(name); }
  if (status) { fields.push('status=?'); vals.push(status); }
  if (!fields.length) return res.json({ ok: true });
  vals.push(id);
  await pool.query(`UPDATE flows SET ${fields.join(', ')} WHERE id=?`, vals);
  res.json({ ok: true });
});

flowsRouter.post('/:id/versions', async (req, res) => {
  const flowId = Number(req.params.id);
  const { definition } = req.body || {};
  if (!flowId || !definition) return res.status(400).json({ ok: false, error: 'Faltan campos' });
  const [ins] = await pool.query(`INSERT INTO flow_versions (flow_id, definition, is_active) VALUES (?,?,0)`, [flowId, JSON.stringify(definition)]);
  res.json({ ok: true, versionId: ins.insertId });
});

flowsRouter.get('/:id/versions', async (req, res) => {
  const flowId = Number(req.params.id);
  const [rows] = await pool.query(`SELECT id, is_active, created_at FROM flow_versions WHERE flow_id=? ORDER BY id DESC`, [flowId]);
  res.json({ ok: true, items: rows });
});

// Obtener una versión específica (incluye definition)
flowsRouter.get('/:id/versions/:versionId', async (req, res) => {
  const flowId = Number(req.params.id);
  const versionId = Number(req.params.versionId);
  const [[row]] = await pool.query(`SELECT id, is_active, created_at, definition FROM flow_versions WHERE id=? AND flow_id=? LIMIT 1`, [versionId, flowId]);
  if (!row) return res.status(404).json({ ok: false, error: 'No existe versión' });
  res.json({ ok: true, item: row });
});

// Obtener la versión activa (si existe)
flowsRouter.get('/:id/active', async (req, res) => {
  const flowId = Number(req.params.id);
  const [[row]] = await pool.query(`SELECT id, is_active, created_at, definition FROM flow_versions WHERE flow_id=? AND is_active=1 ORDER BY id DESC LIMIT 1`, [flowId]);
  res.json({ ok: true, item: row || null });
});

flowsRouter.post('/:id/activate/:versionId', async (req, res) => {
  const flowId = Number(req.params.id);
  const versionId = Number(req.params.versionId);
  await pool.query(`UPDATE flow_versions SET is_active = CASE WHEN id=? THEN 1 ELSE 0 END WHERE flow_id=?`, [versionId, flowId]);
  await pool.query(`UPDATE flows SET status='ACTIVE' WHERE id=?`, [flowId]);
  res.json({ ok: true });
});

flowsRouter.get('/:id/triggers', async (req, res) => {
  const flowId = Number(req.params.id);
  const [rows] = await pool.query(`SELECT * FROM flow_triggers WHERE flow_id=? ORDER BY priority ASC, id ASC`, [flowId]);
  res.json({ ok: true, items: rows });
});

flowsRouter.post('/:id/triggers', async (req, res) => {
  const flowId = Number(req.params.id);
  const { id, type, match, active = true, priority = 100 } = req.body || {};
  if (!type) return res.status(400).json({ ok: false, error: 'Falta type' });
  if (id) {
    await pool.query(`UPDATE flow_triggers SET type=?, match_json=?, active=?, priority=? WHERE id=? AND flow_id=?`,
      [type, JSON.stringify(match || {}), active ? 1 : 0, Number(priority), Number(id), flowId]);
    return res.json({ ok: true, id });
  } else {
    const [ins] = await pool.query(`INSERT INTO flow_triggers (flow_id, type, match_json, active, priority) VALUES (?,?,?,?,?)`,
      [flowId, type, JSON.stringify(match || {}), active ? 1 : 0, Number(priority)]);
    return res.json({ ok: true, id: ins.insertId });
  }
});

flowsRouter.delete('/triggers/:triggerId', async (req, res) => {
  const triggerId = Number(req.params.triggerId);
  await pool.query(`DELETE FROM flow_triggers WHERE id=?`, [triggerId]);
  res.json({ ok: true });
});

app.use('/api/flows', flowsRouter);

const runtimeRouter = express.Router();

runtimeRouter.post('/run', panelAuth, async (req, res) => {
  const { flowId, versionId, context } = req.body || {};
  if (!flowId) return res.status(400).json({ ok: false, error: 'Falta flowId' });
  let verId = Number(versionId);
  if (!verId) {
    const [[v]] = await pool.query(`SELECT id FROM flow_versions WHERE flow_id=? AND is_active=1 ORDER BY id DESC LIMIT 1`, [flowId]);
    if (!v) return res.status(400).json({ ok: false, error: 'No hay versión activa' });
    verId = v.id;
  }
  const runId = await startFlowRun({ flowId: Number(flowId), versionId: verId, triggerType: 'manual', context: context || {} });
  res.json({ ok: true, runId });
});

runtimeRouter.post('/cancel', panelAuth, async (req, res) => {
  const { runId } = req.body || {};
  if (!runId) return res.status(400).json({ ok: false, error: 'Falta runId' });
  runningRuns.set(Number(runId), { cancelled: true });
  res.json({ ok: true });
});

runtimeRouter.get('/runs', panelAuth, async (req, res) => {
  const { flowId, status } = req.query || {};
  const where = [];
  const args = [];
  if (flowId) { where.push('flow_id=?'); args.push(Number(flowId)); }
  if (status) { where.push('status=?'); args.push(String(status)); }
  const sql = `SELECT * FROM flow_runs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 200`;
  const [rows] = await pool.query(sql, args);
  res.json({ ok: true, items: rows });
});

runtimeRouter.get('/stream', async (req, res) => {
  try {
    const runId = Number(req.query.runId);
    if (!runId) return res.status(400).end();

    // CORS headers (reusar allowedOrigins si aplica)
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write('\n');

    if (!flowRunSubscribers.has(runId)) flowRunSubscribers.set(runId, new Set());
    flowRunSubscribers.get(runId).add(res);

    const iv = setInterval(() => res.write('event: ping\ndata: {}\n\n'), 25000);
    req.on('close', () => {
      clearInterval(iv);
      flowRunSubscribers.get(runId)?.delete(res);
    });
  } catch {
    res.status(500).end();
  }
});

app.use('/api/flow-runtime', runtimeRouter);

/* ========= Admin: Intent & Template Button Actions ========= */
const adminRouter = express.Router();
adminRouter.use(panelAuth);

// Intent routes CRUD (mínimo)
adminRouter.get('/intent-routes', async (req, res) => {
  const [rows] = await pool.query(`SELECT * FROM intent_routes ORDER BY intent_name ASC, priority ASC, id ASC`);
  res.json({ ok: true, items: rows });
});

adminRouter.post('/intent-routes', express.json(), async (req, res) => {
  const { id, intent_name, action_type, action_json, active = true, priority = 100 } = req.body || {};
  if (!intent_name || !action_type) return res.status(400).json({ ok: false, error: 'Faltan campos' });
  if (id) {
    await pool.query(`UPDATE intent_routes SET intent_name=?, action_type=?, action_json=?, active=?, priority=? WHERE id=?`,
      [intent_name, action_type, JSON.stringify(action_json || {}), active ? 1 : 0, Number(priority), Number(id)]);
    return res.json({ ok: true, id });
  } else {
    const [ins] = await pool.query(`INSERT INTO intent_routes (intent_name, action_type, action_json, active, priority) VALUES (?,?,?,?,?)`,
      [intent_name, action_type, JSON.stringify(action_json || {}), active ? 1 : 0, Number(priority)]);
    return res.json({ ok: true, id: ins.insertId });
  }
});

adminRouter.delete('/intent-routes/:id', async (req, res) => {
  const id = Number(req.params.id);
  await pool.query(`DELETE FROM intent_routes WHERE id=?`, [id]);
  res.json({ ok: true });
});

// Template button actions CRUD (mínimo)
adminRouter.get('/template-button-actions', async (req, res) => {
  const [rows] = await pool.query(`SELECT * FROM template_button_actions ORDER BY id DESC`);
  res.json({ ok: true, items: rows });
});

adminRouter.post('/template-button-actions', express.json(), async (req, res) => {
  const { id, reply_id, action_type, action_json, active = true } = req.body || {};
  if (!reply_id || !action_type) return res.status(400).json({ ok: false, error: 'Faltan campos' });
  if (id) {
    await pool.query(`UPDATE template_button_actions SET reply_id=?, action_type=?, action_json=?, active=? WHERE id=?`,
      [reply_id, action_type, JSON.stringify(action_json || {}), active ? 1 : 0, Number(id)]);
    return res.json({ ok: true, id });
  } else {
    const [ins] = await pool.query(`INSERT INTO template_button_actions (reply_id, action_type, action_json, active) VALUES (?,?,?,?)`,
      [reply_id, action_type, JSON.stringify(action_json || {}), active ? 1 : 0]);
    return res.json({ ok: true, id: ins.insertId });
  }
});

adminRouter.delete('/template-button-actions/:id', async (req, res) => {
  const id = Number(req.params.id);
  await pool.query(`DELETE FROM template_button_actions WHERE id=?`, [id]);
  res.json({ ok: true });
});

app.use('/api/admin', adminRouter);

/* ========= Admin: Knowledge Base (RAG) ========= */
const kbRouter = express.Router();
kbRouter.use(panelAuth);

// Upsert simple (texto plano): trocea por doble salto de línea y embebe
kbRouter.post('/kb/upsert', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const { source, title, content, intent = null, tags = [] } = req.body || {};
    if (!RAG_ENABLED) return res.status(400).json({ ok: false, error: 'RAG disabled' });
    if (!title || !content) return res.status(400).json({ ok: false, error: 'Faltan campos' });

    const parts = String(content).split(/\n\n+/).map(s => s.trim()).filter(Boolean);
    let inserted = 0;
    for (let i = 0; i < parts.length; i++) {
      const chunk = parts[i];
      // Embedding
      const emb = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY || ''}` },
        body: JSON.stringify({ model: OPENAI_EMBEDDINGS_MODEL, input: chunk })
      }).then(r => r.json());
      const vector = emb?.data?.[0]?.embedding || null;
      await pool.query(
        `INSERT INTO kb_chunks (source, title, intent, tags, chunk_index, content, embedding)
         VALUES (?,?,?,?,?,?,?)`,
        [source || null, title, intent, JSON.stringify(tags || []), i, chunk, JSON.stringify(vector)]
      );
      inserted++;
    }
    res.json({ ok: true, inserted });
  } catch (e) {
    logger.error({ e }, 'kb upsert');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Búsqueda por similitud (coseno) en Node
kbRouter.get('/kb/search', async (req, res) => {
  try {
    if (!RAG_ENABLED) return res.status(400).json({ ok: false, error: 'RAG disabled' });
    const q = String(req.query.q || '');
    const intent = req.query.intent ? String(req.query.intent) : null;
    if (!q) return res.status(400).json({ ok: false, error: 'Falta q' });
    // Embed query
    const emb = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY || ''}` },
      body: JSON.stringify({ model: OPENAI_EMBEDDINGS_MODEL, input: q })
    }).then(r => r.json());
    const qVec = emb?.data?.[0]?.embedding || [];

    // Traer candidatos (simple: todo o por intent)
    const [rows] = await pool.query(
      intent ? `SELECT id, title, intent, tags, chunk_index, content, embedding FROM kb_chunks WHERE intent=?` :
               `SELECT id, title, intent, tags, chunk_index, content, embedding FROM kb_chunks`,
      intent ? [intent] : []
    );

    function dot(a,b){ let s=0; for(let i=0;i<Math.min(a.length,b.length);i++) s+=a[i]*b[i]; return s; }
    function norm(a){ return Math.sqrt(dot(a,a)) || 1; }
    function cosine(a,b){ return dot(a,b)/(norm(a)*norm(b)); }

    const scored = rows.map(r => {
      let v = [];
      try { v = JSON.parse(r.embedding || '[]'); } catch {}
      return { ...r, score: cosine(qVec, v) };
    }).sort((x,y) => y.score - x.score).slice(0, RAG_TOP_K);

    res.json({ ok: true, items: scored });
  } catch (e) {
    logger.error({ e }, 'kb search');
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.use('/api/admin', kbRouter);

/* ========= API: Conversation Flows ========= */
const conversationFlowsAPI = require('./api/conversation-flows')(pool);
app.use('/api/conversation-flows', conversationFlowsAPI);

// API V2 para flujos multi-rama
const conversationFlowsV2API = require('./api/conversation-flows-v2');
app.use('/api/conversation-flows-v2', conversationFlowsV2API(pool));

// API Config V2 para el editor/debugger
const conversationFlowsConfigV2API = require('./api/conversation-flows-config-v2');
app.use('/api/conversation-flows-config-v2', conversationFlowsConfigV2API(pool));

/* ========= API: Message Classifier ========= */
const messageClassifier = new MessageClassifier(pool);
const classifierRoutes = require('./api/classifier-routes');
app.use('/api/classifier', classifierRoutes(pool, messageClassifier));

/* ========= API: Visual Flows (Flow Builder) ========= */
// NOTA: El endpoint principal /api/visual-flows-live se registra más abajo
// después de createChatbot() para tener acceso a reloadVisualFlows
// Ver línea ~4443

/* ========= API: Flow Execution Logs ========= */
const flowLogsRoutes = require('./api/flow-logs-routes');
app.use('/api/flow-logs', flowLogsRoutes(pool));

/* ========= API: Lead Management ========= */
const leadsRoutes = require('./api/leads-routes');
app.use('/api/leads', leadsRoutes(pool));

/* ========= API: Flow Analytics ========= */
const flowAnalyticsRoutes = require('./api/flow-analytics-routes');
app.use('/api/flow-analytics', flowAnalyticsRoutes(pool));

/* ========= API: Flow Monitor (Tiempo Real) ========= */
const flowMonitorRoutes = require('./api/flow-monitor-routes')(pool);
app.use('/api/flow-monitor', flowMonitorRoutes.router);

/* ========= API: Agents & Departments ========= */
const agentsRoutes = require('./api/agents-routes');
app.use('/api/agents', panelAuth, supervisorOnly, agentsRoutes(pool));

const departmentsRoutes = require('./api/departments-routes');
app.use('/api/departments', panelAuth, departmentsRoutes(pool, supervisorOnly));

const assignmentRoutes = require('./api/assignment-routes');
app.use('/api/chat', panelAuth, assignmentRoutes(pool));

const externalApiRoutes = require('./api/external-api-routes');
app.use('/api/external', panelAuth, externalApiRoutes(pool, sendTextViaCloudAPI));

/* ========= API: Learning System (Q&A pairs, precios) ========= */
const learningRoutes = require('./api/learning-routes');
app.use('/api/learning', panelAuth, supervisorOnly, learningRoutes(pool, conversationLearner, openaiClient));

// Chequeo de presencia (no disponible en Cloud API)
app.get('/api/chat/check-presence', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ ok: false, error: 'Falta phone' });
    res.json({ ok: true, presence: 'unavailable', lastSeen: null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Obtener lista de conversaciones
app.get('/api/chat/conversations', async (req, res) => {
  try {
    const { filter, departmentId } = req.query;
    const agentId = req.agent?.id;
    const agentRole = req.agent?.role;
    const agentDeptId = req.agent?.departmentId;

    let whereExtra = '';
    const params = [];

    if (filter === 'mine' && agentId > 0) {
      // Agente real: solo sus chats asignados
      whereExtra = ' AND s.assigned_agent_id = ?';
      params.push(agentId);
    } else if (filter === 'mine' && agentRole === 'supervisor') {
      // Supervisor: chats asignados a algún agente (atendidos)
      whereExtra = ' AND s.assigned_agent_id IS NOT NULL';
    } else if (filter === 'department') {
      const deptId = departmentId || agentDeptId;
      if (deptId) {
        whereExtra = ' AND s.assigned_department_id = ?';
        params.push(deptId);
      } else {
        // Admin sin departamento: chats que tienen departamento asignado
        whereExtra = ' AND s.assigned_department_id IS NOT NULL';
      }
    } else if (filter === 'unassigned') {
      // Sin asignar = sin agente Y sin departamento
      whereExtra = ' AND s.assigned_agent_id IS NULL AND s.assigned_department_id IS NULL';
    } else if (filter === 'all') {
      // supervisor ve todo, agente normal ve su depto + propios
      if (agentRole !== 'supervisor' && agentId > 0) {
        whereExtra = ' AND (s.assigned_agent_id = ? OR s.assigned_department_id = ?)';
        params.push(agentId, agentDeptId || 0);
      }
    }
    // sin filter: supervisor ve todo, agente ve lo accesible
    if (!filter && agentRole !== 'supervisor' && agentId > 0) {
      whereExtra = ' AND (s.assigned_agent_id = ? OR s.assigned_department_id = ? OR s.assigned_agent_id IS NULL)';
      params.push(agentId, agentDeptId || 0);
    }

    const [conversations] = await pool.query(`
      SELECT
        s.id,
        s.phone,
        s.name,
        s.token,
        s.profile_pic_url,
        s.is_business,
        s.business_name,
        s.status,
        s.created_at,
        s.assigned_agent_id,
        s.assigned_department_id,
        s.assignment_type,
        s.channel,
        a.name as agent_name,
        a.avatar_color as agent_color,
        d.display_name as department_name,
        d.color as department_color,
        (SELECT text FROM chat_messages
         WHERE session_id = s.id
         ORDER BY id DESC LIMIT 1) as last_message,
        (SELECT created_at FROM chat_messages
         WHERE session_id = s.id
         ORDER BY id DESC LIMIT 1) as last_message_time,
        (SELECT direction FROM chat_messages
         WHERE session_id = s.id
         ORDER BY id DESC LIMIT 1) as last_message_direction,
        (SELECT COUNT(*) FROM chat_messages
         WHERE session_id = s.id
         AND direction = 'in'
         AND status != 'read') as unread_count,
        CASE
          WHEN (SELECT COUNT(*) FROM chat_messages WHERE session_id = s.id AND direction = 'in') > 0
          THEN TIMESTAMPDIFF(HOUR,
               (SELECT MAX(created_at) FROM chat_messages
                WHERE session_id = s.id AND direction = 'in'),
               NOW()
             )
          ELSE NULL
        END as hours_since_last_message,
        (SELECT MAX(created_at) FROM chat_messages
         WHERE session_id = s.id AND direction = 'in') as last_client_message_at,
        cc.category,
        cc.assigned_at as categorized_at,
        cc.assigned_by as categorized_by
      FROM chat_sessions s
      LEFT JOIN chat_categories cc ON s.id = cc.session_id
      LEFT JOIN agents a ON s.assigned_agent_id = a.id
      LEFT JOIN departments d ON s.assigned_department_id = d.id
      WHERE s.status = 'OPEN' ${whereExtra}
      ORDER BY last_message_time DESC
    `, params);

    const conversationsWithSessionId = conversations.map(conv => ({
      ...conv,
      sessionId: conv.id,
      session_id: conv.id,
      contact_name: conv.name,
      escalation_status: conv.status
    }));

    res.json({ ok: true, conversations: conversationsWithSessionId });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// SSE de Inbox (panelAuth)
app.get('/api/chat/inbox-stream', (req, res) => {
  try {
    // CORS opcional
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write('\n');
    inboxSubscribers.add(res);
    res.write(`data: ${JSON.stringify({ type: 'status', ok: true })}\n\n`);
    const iv = setInterval(() => res.write('event: ping\ndata: {}\n\n'), 25000);
    req.on('close', () => { clearInterval(iv); inboxSubscribers.delete(res); });
  } catch { res.status(500).end(); }
});

// Marcar vistos en panel (no cambia read_at/status, solo panel_seen_at)
app.post('/api/chat/panel-seen', async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ ok: false, error: 'Falta sessionId' });
    await pool.query(`
      UPDATE chat_messages 
      SET panel_seen_at = CURRENT_TIMESTAMP
      WHERE session_id = ? AND direction = 'in' AND panel_seen_at IS NULL
    `, [Number(sessionId)]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Marcar mensajes como leídos (actualiza status a 'read')
app.post('/api/chat/mark-read', async (req, res) => {
  try {
    let { sessionId, phone } = req.body || {};

    // Si se proporciona phone en lugar de sessionId, buscar el sessionId
    if (!sessionId && phone) {
      const normalizedPhone = normalizePhoneCL(phone);
      const [sessionRows] = await pool.query(
        `SELECT id FROM chat_sessions WHERE phone=? AND status='OPEN' ORDER BY id DESC LIMIT 1`,
        [normalizedPhone]
      );

      if (!sessionRows.length) {
        return res.status(404).json({ ok: false, error: 'Conversación no encontrada' });
      }

      sessionId = sessionRows[0].id;
    }

    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'Falta sessionId o phone' });
    }

    // Marcar mensajes entrantes como leídos
    await pool.query(`
      UPDATE chat_messages
      SET status = 'read', read_at = CURRENT_TIMESTAMP
      WHERE session_id = ? AND direction = 'in' AND status != 'read'
    `, [Number(sessionId)]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Eliminar una conversación completa (sesión + mensajes via CASCADE)
app.delete('/api/chat/conversations/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const agentRole = req.agent?.role;
    if (agentRole !== 'supervisor') {
      return res.status(403).json({ ok: false, error: 'Solo supervisores pueden eliminar conversaciones' });
    }
    const [[session]] = await pool.query('SELECT id, phone FROM chat_sessions WHERE id=?', [sessionId]);
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Conversación no encontrada' });
    }
    // Extraer pares Q&A ANTES de eliminar (para que el sistema aprenda)
    try {
      await conversationLearner.extractFromSession(session.id);
    } catch (err) {
      logger.error({ err, sessionId: session.id }, 'Learning: error extrayendo pares antes de eliminar');
    }

    await pool.query('DELETE FROM chat_sessions WHERE id=?', [session.id]);
    // Limpiar estado en memoria del chatbot (sessionModes + visualFlowEngine.sessionStates)
    if (typeof clearSessionState === 'function') {
      clearSessionState(session.id, session.phone);
    }
    logger.info({ sessionId: session.id, phone: session.phone, deletedBy: req.agent?.username }, 'Conversación eliminada');
    res.json({ ok: true, deleted: { sessionId: session.id, phone: session.phone } });
  } catch (e) {
    logger.error({ e }, 'DELETE /api/chat/conversations/:sessionId error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Obtener información de una conversación específica por número de teléfono
app.get('/api/chat/conversations/:phone', async (req, res) => {
  try {
    const rawPhone = req.params.phone;
    const phone = normalizePhoneCL(rawPhone); // Asumiendo que normalizePhoneCL es apropiado para este contexto

    if (!phone) {
      return res.status(400).json({ ok: false, error: 'Número de teléfono inválido' });
    }

    // Encontrar el ID de sesión para el número de teléfono dado
    const [sessionRows] = await pool.query(
      `SELECT id FROM chat_sessions WHERE phone=? AND status='OPEN' ORDER BY id DESC LIMIT 1`,
      [phone]
    );

    if (!sessionRows.length) {
      return res.status(404).json({ ok: false, error: 'Conversación no encontrada o no activa' });
    }

    const sessionId = sessionRows[0].id;

    // Obtener el conteo de mensajes no leídos
    const [unreadRows] = await pool.query(
      `SELECT COUNT(*) as unreadCount FROM chat_messages WHERE session_id = ? AND direction = 'in' AND status != 'read'`,
      [sessionId]
    );
    const unreadCount = unreadRows[0].unreadCount;

    // Obtener el último mensaje y su hora
    const [lastMessageRows] = await pool.query(
      `SELECT text, created_at FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`,
      [sessionId]
    );

    let lastMessage = null;
    let lastMessageTime = null;

    if (lastMessageRows.length) {
      lastMessage = lastMessageRows[0].text;
      lastMessageTime = lastMessageRows[0].created_at.toISOString(); // Convertir a formato ISO string
    }

    // Obtener todos los mensajes de la conversación
    const [messagesRows] = await pool.query(
      `SELECT id, direction, text, created_at, status, wa_msg_id, is_ai_generated,
              media_type, media_id, media_mime, media_caption, media_extra
       FROM chat_messages
       WHERE session_id = ?
       ORDER BY created_at ASC`,
      [sessionId]
    );

    // Formatear mensajes para el frontend
    const messages = messagesRows.map(msg => {
      // Parsear media_extra si existe
      let mediaExtra = null;
      if (msg.media_extra) {
        try {
          mediaExtra = typeof msg.media_extra === 'string'
            ? JSON.parse(msg.media_extra)
            : msg.media_extra;
        } catch (e) {
          mediaExtra = null;
        }
      }

      return {
        id: msg.id,
        direction: msg.direction === 'in' ? 'incoming' : 'outgoing',
        body: msg.text,
        content: msg.text,
        created_at: msg.created_at.toISOString(),
        status: msg.status,
        waMsgId: msg.wa_msg_id,
        is_bot: msg.is_ai_generated === 1,
        mediaType: msg.media_type,
        mediaId: msg.media_id,
        mediaMime: msg.media_mime,
        mediaCaption: msg.media_caption,
        mediaExtra: mediaExtra
      };
    });

    res.json({
      ok: true,
      unreadCount,
      lastMessage,
      lastMessageTime,
      messages
    });

  } catch (e) {
    logger.error({ e }, 'Error en /api/chat/conversations/:phone');
    res.status(500).json({ ok: false, error: 'Error al obtener información de la conversación' });
  }
});

/* ========= Admin ========= */
app.get('/status', panelAuth, async (req, res) => {
  try {
    const [[{ total = 0 } = {}]] = await pool.query(`SELECT COUNT(*) total FROM chat_sessions WHERE status='OPEN'`);
    res.json({ connected: true, attempts: 0, openSessions: total, presenceCache: 0 });
  } catch {
    res.json({ connected: true, attempts: 0 });
  }
});

// Home
app.get('/', (req, res) => res.json({ ok: true, service: 'WhatsApp Cloud API Backend' }));

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

/* ========= BROADCAST API ========= */
let broadcastQueue = null;

// Inicializar broadcast queue cuando el pool esté disponible
const initBroadcastQueue = () => {
  if (!broadcastQueue && pool) {
    broadcastQueue = new BroadcastQueue(pool);
  }
  return broadcastQueue;
};

// Listar broadcasts
app.get('/api/broadcasts', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, name, target_type, schedule_type, status,
             total_recipients, sent_count, failed_count,
             created_at, scheduled_at, sent_at, completed_at
      FROM broadcasts
      ORDER BY created_at DESC
      LIMIT 50
    `);
    res.json({ ok: true, data: rows });
  } catch (err) {
    logger.error({ err }, 'Error listing broadcasts');
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Obtener estadísticas de un broadcast
app.get('/api/broadcasts/:id', async (req, res) => {
  try {
    const bq = initBroadcastQueue();
    const stats = await bq.getBroadcastStats(parseInt(req.params.id));
    if (!stats) {
      return res.status(404).json({ ok: false, error: 'Broadcast not found' });
    }
    res.json({ ok: true, data: stats });
  } catch (err) {
    logger.error({ err }, 'Error getting broadcast stats');
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Crear nuevo broadcast
app.post('/api/broadcasts', express.json(), async (req, res) => {
  try {
    const { name, message, targetType, targetConfig, scheduleType, scheduledAt } = req.body;

    if (!name || !message || !targetType) {
      return res.status(400).json({ ok: false, error: 'Missing required fields: name, message, targetType' });
    }

    const bq = initBroadcastQueue();
    const broadcastId = await bq.createBroadcast({
      name,
      message,
      targetType,
      targetConfig: targetConfig || {},
      scheduleType: scheduleType || 'immediate',
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      createdBy: null
    });

    res.json({ ok: true, data: { id: broadcastId } });
  } catch (err) {
    logger.error({ err }, 'Error creating broadcast');
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Obtener estadísticas de colas
app.get('/api/queues/stats', async (req, res) => {
  try {
    const stats = await queueService.getAllStats();
    res.json({ ok: true, data: stats });
  } catch (err) {
    logger.error({ err }, 'Error getting queue stats');
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Listar tags disponibles
app.get('/api/tags', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT td.*, COUNT(ct.id) as contact_count
      FROM tag_definitions td
      LEFT JOIN contact_tags ct ON ct.tag = td.tag
      GROUP BY td.id
      ORDER BY td.label
    `);
    res.json({ ok: true, data: rows });
  } catch (err) {
    logger.error({ err }, 'Error listing tags');
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Crear tag
app.post('/api/tags', express.json(), async (req, res) => {
  try {
    const { tag, label, color, description } = req.body;
    if (!tag || !label) {
      return res.status(400).json({ ok: false, error: 'Missing required fields: tag, label' });
    }

    await pool.query(`
      INSERT INTO tag_definitions (tag, label, color, description)
      VALUES (?, ?, ?, ?)
    `, [tag, label, color || '#6B7280', description || '']);

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'Error creating tag');
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ========= Process Signals ========= */
process.on('SIGTERM', async () => { 
  logger.info('👋 SIGTERM'); 
  process.exit(0); 
});

process.on('SIGINT', async () => { 
  logger.info('👋 SIGINT');  
  process.exit(0); 
});

/* ========= FAQ ADMIN API - ENDPOINTS PARA PANEL DE ADMINISTRACIÓN ========= */

// Listar todas las FAQ (para el panel)
app.get('/api/faq/list', async (req, res) => {
  try {
    // Obtener todas las FAQ de la base de datos
    const allFAQ = await faqStore.getAll();
    
    res.json({ 
      ok: true, 
      data: allFAQ 
    });
  } catch (e) {
    logger.error({ e }, 'GET /api/faq/list error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Actualizar FAQ existente
app.put('/api/faq/update/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, q, a, tags, active = true } = req.body || {};
    
    if (!q || !a) {
      return res.status(400).json({ ok: false, error: 'Faltan q/a' });
    }
    
    // Actualizar en la base de datos
    await faqStore.update(id, { title, q, a, tags, active });
    
    res.json({ 
      ok: true, 
      message: 'FAQ actualizada correctamente' 
    });
  } catch (e) {
    logger.error({ e }, 'PUT /api/faq/update error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Eliminar FAQ
app.delete('/api/faq/delete/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    // Eliminar de la base de datos
    await faqStore.remove(id);
    
    res.json({ 
      ok: true, 
      message: 'FAQ eliminada correctamente' 
    });
  } catch (e) {
    logger.error({ e }, 'DELETE /api/faq/delete error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Exportar FAQ
app.get('/api/faq/export', async (req, res) => {
  try {
    const allFAQ = faqStore.docs || [];
    
    // Formatear para exportación
    const exportData = allFAQ.map(faq => ({
      id: faq.id,
      title: faq.title,
      q: faq.q,
      a: faq.a,
      tags: faq.tags || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
    
    res.json({ 
      ok: true, 
      data: exportData 
    });
  } catch (e) {
    logger.error({ e }, 'GET /api/faq/export error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Importar FAQ
app.post('/api/faq/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No se proporcionó archivo' });
    }
    
    const content = req.file.buffer.toString('utf8');
    const data = JSON.parse(content);
    
    if (!Array.isArray(data)) {
      return res.status(400).json({ ok: false, error: 'Formato de archivo inválido' });
    }
    
    let imported = 0;
    
    for (const item of data) {
      if (item.q && item.a) {
        const { id } = faqStore.add({
          title: item.title || null,
          q: item.q,
          a: item.a,
          tags: Array.isArray(item.tags) ? item.tags : []
        });
        imported++;
      }
    }
    
    res.json({ 
      ok: true, 
      message: `Se importaron ${imported} preguntas correctamente` 
    });
  } catch (e) {
    logger.error({ e }, 'POST /api/faq/import error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Crear backup
app.post('/api/faq/backup', async (req, res) => {
  try {
    const allFAQ = await faqStore.getAll();
    
    // Crear directorio de backup si no existe
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const filename = `faq-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(backupDir, filename);
    
    // Guardar backup
    fs.writeFileSync(filepath, JSON.stringify(allFAQ, null, 2), 'utf8');
    
    res.json({ 
      ok: true, 
      message: 'Backup creado correctamente',
      filename: filename
    });
  } catch (e) {
    logger.error({ e }, 'POST /api/faq/backup error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Obtener estadísticas
app.get('/api/faq/stats', async (req, res) => {
  try {
    const stats = await faqStore.getStats();
    
    res.json({
      ok: true,
      data: stats
    });
  } catch (e) {
    logger.error({ e }, 'GET /api/faq/stats error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Eliminar todas las FAQ
app.delete('/api/faq/delete', async (req, res) => {
  try {
    // Limpiar todas las FAQ de la base de datos
    await pool.query('DELETE FROM faq_entries');
    
    // Recargar el cache
    await faqStore.loadFromDatabase();
    
    res.json({ 
      ok: true, 
      message: 'Todas las FAQ han sido eliminadas' 
    });
  } catch (e) {
    logger.error({ e }, 'DELETE /api/faq/delete error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ========= Chatbot Configuration Endpoints ========= */

// Obtener configuración del chatbot
app.get('/api/chatbot/config', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM chatbot_config ORDER BY id DESC LIMIT 1');
    
    if (rows.length === 0) {
      // Si no existe configuración, devolver valores por defecto
      const defaultConfig = {
        bot_enabled: false,
        auto_mode: false,
        ai_model: 'gpt-4o-mini',
        ai_temperature: 0.7,
        ai_max_tokens: 150,
        response_timeout: 10000,
        personality_settings: {
          tone: 'professional',
          style: 'helpful',
          language: 'spanish',
          company_name: 'Respaldos Chile',
          business_type: 'logistics',
          active_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
          work_hour_start: '09:00',
          work_hour_end: '18:00',
          rag_enabled: false,
          auto_categorization_enabled: true,
          min_confidence: 75
        },
        welcome_message: '¡Hola! Soy el asistente virtual de Respaldos Chile. ¿En qué puedo ayudarte hoy?',
        fallback_message: 'Gracias por tu mensaje. Un representante te atenderá pronto.'
      };
      return res.json({ ok: true, config: defaultConfig });
    }
    
    const config = rows[0];
    
    // Parsear JSON fields
    if (config.personality_settings && typeof config.personality_settings === 'string') {
      try {
        config.personality_settings = JSON.parse(config.personality_settings);
      } catch (e) {
        config.personality_settings = {};
      }
    }
    
    res.json({ ok: true, config });
  } catch (e) {
    logger.error({ e }, 'GET /api/chatbot/config error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Actualizar configuración del chatbot
app.put('/api/chatbot/config', async (req, res) => {
  try {
    const {
      bot_enabled,
      auto_mode,
      ai_model,
      ai_temperature,
      ai_max_tokens,
      response_timeout,
      personality_settings,
      welcome_message,
      fallback_message,
      active_days,
      work_hour_start,
      work_hour_end,
      rag_enabled,
      auto_categorization_enabled,
      min_confidence
    } = req.body;
    
    // Validaciones
    if (ai_temperature !== undefined && (ai_temperature < 0 || ai_temperature > 1)) {
      return res.status(400).json({ ok: false, error: 'ai_temperature debe estar entre 0 y 1' });
    }
    
    if (ai_max_tokens !== undefined && (ai_max_tokens < 1 || ai_max_tokens > 4000)) {
      return res.status(400).json({ ok: false, error: 'ai_max_tokens debe estar entre 1 y 4000' });
    }
    
    // Verificar si existe configuración
    const [existing] = await pool.query('SELECT id FROM chatbot_config LIMIT 1');
    
    // Crear configuración extendida que incluye todos los campos
    const extendedSettings = {
      ...(personality_settings || {}),
      active_days: active_days || ['mon', 'tue', 'wed', 'thu', 'fri'],
      work_hour_start: work_hour_start || '09:00',
      work_hour_end: work_hour_end || '18:00',
      rag_enabled: rag_enabled || false,
      auto_categorization_enabled: auto_categorization_enabled !== false,
      min_confidence: min_confidence || 75
    };

    if (existing.length === 0) {
      // Insertar nueva configuración
      await pool.query(`
        INSERT INTO chatbot_config (
          bot_enabled, auto_mode, ai_model, ai_temperature, ai_max_tokens,
          response_timeout, personality_settings, welcome_message, fallback_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        bot_enabled, auto_mode, ai_model, ai_temperature, ai_max_tokens,
        response_timeout, JSON.stringify(extendedSettings), welcome_message, fallback_message
      ]);
    } else {
      // Actualizar configuración existente
      await pool.query(`
        UPDATE chatbot_config SET
          bot_enabled = ?, auto_mode = ?, ai_model = ?, ai_temperature = ?,
          ai_max_tokens = ?, response_timeout = ?, personality_settings = ?,
          welcome_message = ?, fallback_message = ?
        WHERE id = ?
      `, [
        bot_enabled, auto_mode, ai_model, ai_temperature, ai_max_tokens,
        response_timeout, JSON.stringify(extendedSettings), welcome_message, 
        fallback_message, existing[0].id
      ]);
    }
    
    // Actualizar variables globales si es necesario
    if (bot_enabled !== undefined) {
      chatbotGlobalEnabled = bot_enabled;
    }
    
    res.json({ ok: true, message: 'Configuración actualizada correctamente' });
  } catch (e) {
    logger.error({ e }, 'PUT /api/chatbot/config error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Gestionar teléfonos de prueba del chatbot (runtime, sin reiniciar)
app.get('/api/chatbot/test-phones', (req, res) => {
  res.json({ ok: true, phones: Array.from(chatbotTestPhones), testMode: chatbotTestPhones.size > 0 });
});

app.put('/api/chatbot/test-phones', express.json(), (req, res) => {
  const { phones } = req.body || {};
  if (!Array.isArray(phones)) {
    return res.status(400).json({ ok: false, error: 'phones debe ser un array de strings' });
  }
  chatbotTestPhones.clear();
  phones.filter(p => typeof p === 'string' && p.trim()).forEach(p => chatbotTestPhones.add(p.trim()));
  logger.info({ phones: Array.from(chatbotTestPhones) }, 'Teléfonos de prueba actualizados');
  res.json({ ok: true, phones: Array.from(chatbotTestPhones), testMode: chatbotTestPhones.size > 0 });
});

// Listar intenciones del chatbot
app.get('/api/chatbot/intentions', async (req, res) => {
  try {
    const [intentions] = await pool.query(`
      SELECT id, name, display_name, description, keywords, examples, 
             priority, response_template, requires_human, active,
             created_at, updated_at
      FROM chatbot_intentions 
      ORDER BY priority DESC, name ASC
    `);
    
    // Parsear campos JSON
    intentions.forEach(intention => {
      if (intention.keywords && typeof intention.keywords === 'string') {
        try {
          intention.keywords = JSON.parse(intention.keywords);
        } catch (e) {
          intention.keywords = [];
        }
      }
      if (intention.examples && typeof intention.examples === 'string') {
        try {
          intention.examples = JSON.parse(intention.examples);
        } catch (e) {
          intention.examples = [];
        }
      }
    });
    
    res.json({ ok: true, data: intentions });
  } catch (e) {
    logger.error({ e }, 'GET /api/chatbot/intentions error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Crear nueva intención
app.post('/api/chatbot/intentions', async (req, res) => {
  try {
    const {
      name,
      display_name,
      description,
      keywords,
      examples,
      priority,
      response_template,
      requires_human,
      active
    } = req.body;
    
    if (!name || !display_name) {
      return res.status(400).json({ ok: false, error: 'name y display_name son obligatorios' });
    }
    
    // Verificar que el nombre sea único
    const [existing] = await pool.query('SELECT id FROM chatbot_intentions WHERE name = ?', [name]);
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, error: 'Ya existe una intención con ese nombre' });
    }
    
    const [result] = await pool.query(`
      INSERT INTO chatbot_intentions (
        name, display_name, description, keywords, examples, priority,
        response_template, requires_human, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name, display_name, description, JSON.stringify(keywords || []),
      JSON.stringify(examples || []), priority || 0, response_template,
      requires_human || false, active !== false
    ]);
    
    res.json({ 
      ok: true, 
      message: 'Intención creada correctamente',
      id: result.insertId
    });
  } catch (e) {
    logger.error({ e }, 'POST /api/chatbot/intentions error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Actualizar intención
app.put('/api/chatbot/intentions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      display_name,
      description,
      keywords,
      examples,
      priority,
      response_template,
      requires_human,
      active
    } = req.body;
    
    // Verificar que la intención existe
    const [existing] = await pool.query('SELECT id FROM chatbot_intentions WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ ok: false, error: 'Intención no encontrada' });
    }
    
    // Si se cambia el nombre, verificar que sea único
    if (name) {
      const [nameCheck] = await pool.query('SELECT id FROM chatbot_intentions WHERE name = ? AND id != ?', [name, id]);
      if (nameCheck.length > 0) {
        return res.status(400).json({ ok: false, error: 'Ya existe una intención con ese nombre' });
      }
    }
    
    await pool.query(`
      UPDATE chatbot_intentions SET
        name = COALESCE(?, name),
        display_name = COALESCE(?, display_name),
        description = COALESCE(?, description),
        keywords = COALESCE(?, keywords),
        examples = COALESCE(?, examples),
        priority = COALESCE(?, priority),
        response_template = COALESCE(?, response_template),
        requires_human = COALESCE(?, requires_human),
        active = COALESCE(?, active)
      WHERE id = ?
    `, [
      name, display_name, description, 
      keywords ? JSON.stringify(keywords) : null,
      examples ? JSON.stringify(examples) : null,
      priority, response_template, requires_human, active, id
    ]);
    
    res.json({ ok: true, message: 'Intención actualizada correctamente' });
  } catch (e) {
    logger.error({ e }, 'PUT /api/chatbot/intentions error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Eliminar intención
app.delete('/api/chatbot/intentions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await pool.query('DELETE FROM chatbot_intentions WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: 'Intención no encontrada' });
    }
    
    res.json({ ok: true, message: 'Intención eliminada correctamente' });
  } catch (e) {
    logger.error({ e }, 'DELETE /api/chatbot/intentions error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Probar el chatbot con un mensaje
app.post('/api/chatbot/test', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ ok: false, error: 'message es obligatorio' });
    }
    
    // Obtener configuración del chatbot
    const [configRows] = await pool.query('SELECT * FROM chatbot_config ORDER BY id DESC LIMIT 1');
    if (configRows.length === 0 || !configRows[0].bot_enabled) {
      return res.json({ 
        ok: true, 
        response: 'El chatbot está deshabilitado',
        intention: null,
        confidence: 0
      });
    }
    
    const config = configRows[0];
    
    // Obtener intenciones activas
    const [intentions] = await pool.query(`
      SELECT name, display_name, keywords, examples, response_template, requires_human
      FROM chatbot_intentions 
      WHERE active = TRUE 
      ORDER BY priority DESC
    `);
    
    // Detectar intención (implementación simple basada en palabras clave)
    let detectedIntention = null;
    let confidence = 0;
    const messageLower = message.toLowerCase();
    
    for (const intention of intentions) {
      let keywords = [];
      if (intention.keywords && typeof intention.keywords === 'string') {
        try {
          keywords = JSON.parse(intention.keywords);
        } catch (e) {
          keywords = [];
        }
      } else if (Array.isArray(intention.keywords)) {
        keywords = intention.keywords;
      }
      
      const matchCount = keywords.filter(keyword => 
        messageLower.includes(keyword.toLowerCase())
      ).length;
      
      if (matchCount > 0) {
        const currentConfidence = matchCount / keywords.length;
        if (currentConfidence > confidence) {
          confidence = currentConfidence;
          detectedIntention = intention;
        }
      }
    }
    
    let response = config.fallback_message;
    let requiresHuman = false;
    
    if (detectedIntention && confidence > 0.3) {
      response = detectedIntention.response_template || config.fallback_message;
      requiresHuman = detectedIntention.requires_human;
    }
    
    // Guardar log de la prueba
    await pool.query(`
      INSERT INTO chatbot_intention_logs 
      (phone_number, message_text, detected_intention, confidence_score, response_sent, ai_model_used)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      'TEST', message, detectedIntention?.name || null, confidence, response, config.ai_model
    ]);
    
    res.json({ 
      ok: true, 
      response,
      intention: detectedIntention?.name || null,
      confidence: Math.round(confidence * 100) / 100,
      requires_human: requiresHuman
    });
  } catch (e) {
    logger.error({ e }, 'POST /api/chatbot/test error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Obtener estadísticas del chatbot
app.get('/api/chatbot/stats', async (req, res) => {
  try {
    // Estadísticas básicas
    const [configStats] = await pool.query('SELECT bot_enabled, auto_mode FROM chatbot_config ORDER BY id DESC LIMIT 1');
    const [intentionStats] = await pool.query('SELECT COUNT(*) as total_intentions, SUM(active) as active_intentions FROM chatbot_intentions');
    
    // Estadísticas de logs (último mes)
    const [logStats] = await pool.query(`
      SELECT 
        COUNT(*) as total_interactions,
        COUNT(DISTINCT phone_number) as unique_users,
        AVG(confidence_score) as avg_confidence,
        COUNT(CASE WHEN confidence_score >= 0.7 THEN 1 END) as high_confidence_detections
      FROM chatbot_intention_logs 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `);
    
    // Top intenciones detectadas
    const [topIntentions] = await pool.query(`
      SELECT 
        detected_intention,
        COUNT(*) as count,
        AVG(confidence_score) as avg_confidence
      FROM chatbot_intention_logs 
      WHERE detected_intention IS NOT NULL 
        AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY detected_intention 
      ORDER BY count DESC 
      LIMIT 5
    `);
    
    res.json({ 
      ok: true, 
      data: {
        config: configStats[0] || { bot_enabled: false, auto_mode: false },
        intentions: intentionStats[0] || { total_intentions: 0, active_intentions: 0 },
        interactions: logStats[0] || { total_interactions: 0, unique_users: 0, avg_confidence: 0, high_confidence_detections: 0 },
        top_intentions: topIntentions || []
      }
    });
  } catch (e) {
    logger.error({ e }, 'GET /api/chatbot/stats error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ========= Categorías Endpoints ========= */

// Obtener todas las categorías disponibles
app.get('/api/chat/categories', async (req, res) => {
  try {
    const [categories] = await pool.query(`
      SELECT id, name, display_name, icon, color, active
      FROM category_definitions 
      WHERE active = TRUE 
      ORDER BY id ASC
    `);
    
    res.json({ 
      ok: true, 
      categories: categories 
    });
  } catch (e) {
    logger.error({ e }, 'GET /api/chat/categories error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Asignar categoría a una conversación
app.post('/api/chat/categorize', async (req, res) => {
  try {
    const { sessionId, token, category, notes } = req.body || {};
    
    if (!sessionId || !token || !category) {
      return res.status(400).json({ ok: false, error: 'Faltan sessionId, token o category' });
    }

    // Validar sesión (igual que los otros endpoints de chat)
    const [rows] = await pool.query(
      `SELECT id, phone FROM chat_sessions WHERE id=? AND token=? AND status='OPEN'`,
      [Number(sessionId), String(token)]
    );
    if (!rows.length) return res.status(401).json({ ok: false, error: 'Sesión inválida' });
    
    // Verificar que la categoría existe
    const [categoryExists] = await pool.query(
      'SELECT id FROM category_definitions WHERE name = ? AND active = TRUE',
      [category]
    );
    
    if (!categoryExists.length) {
      return res.status(400).json({ ok: false, error: 'Categoría no válida' });
    }
    
    // Verificar que la sesión existe
    const [sessionExists] = await pool.query(
      'SELECT id FROM chat_sessions WHERE id = ?',
      [Number(sessionId)]
    );
    
    if (!sessionExists.length) {
      return res.status(404).json({ ok: false, error: 'Sesión no encontrada' });
    }
    
    // Mantener UNA fila por sesión para evitar duplicados al unir
    await pool.query('DELETE FROM chat_categories WHERE session_id = ?', [Number(sessionId)]);
    await pool.query(
      `INSERT INTO chat_categories (session_id, category, assigned_by, notes)
       VALUES (?, ?, ?, ?)`,
      [Number(sessionId), category, req.user || 'system', notes || null]
    );
    
    // Emitir evento al stream global
    inboxPush({
      type: 'conversation_categorized',
      sessionId: Number(sessionId),
      category: category,
      timestamp: Date.now()
    });
    
    res.json({ 
      ok: true, 
      sessionId: Number(sessionId),
      category: category,
      message: 'Categoría asignada correctamente'
    });
  } catch (e) {
    logger.error({ e }, 'POST /api/chat/categorize error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Obtener conversaciones por categoría
app.get('/api/chat/conversations-by-category', async (req, res) => {
  try {
    const { category, sessionId, token } = req.query || {};
    
    if (!category || !sessionId || !token) {
      return res.status(400).json({ ok: false, error: 'Faltan parámetros category, sessionId o token' });
    }

    // Validar sesión (igual que los otros endpoints de chat)
    const [rows] = await pool.query(
      `SELECT id FROM chat_sessions WHERE id=? AND token=? AND status='OPEN'`,
      [Number(sessionId), String(token)]
    );
    if (!rows.length) return res.status(401).json({ ok: false, error: 'Sesión inválida' });
    
    const [conversations] = await pool.query(`
      SELECT 
        s.id,
        s.phone,
        s.name,
        s.created_at,
        s.status,
        cc.category,
        cc.assigned_at AS categorized_at,
        cc.assigned_by,
        (SELECT COUNT(*) FROM chat_messages m 
          WHERE m.session_id = s.id AND m.direction = 'in' AND m.status != 'read') AS unread_count,
        (SELECT text FROM chat_messages m 
          WHERE m.session_id = s.id 
          ORDER BY id DESC LIMIT 1) AS last_message,
        (SELECT created_at FROM chat_messages m 
          WHERE m.session_id = s.id 
          ORDER BY id DESC LIMIT 1) AS last_message_time,
        CASE 
          WHEN (SELECT COUNT(*) FROM chat_messages mi WHERE mi.session_id = s.id AND mi.direction = 'in') > 0 
          THEN TIMESTAMPDIFF(HOUR, 
                (SELECT MAX(created_at) FROM chat_messages 
                 WHERE session_id = s.id AND direction = 'in'), 
                NOW())
          ELSE NULL
        END AS hours_since_last_message
      FROM chat_sessions s
      LEFT JOIN chat_categories cc ON s.id = cc.session_id
      WHERE cc.category = ? AND s.status = 'OPEN'
      ORDER BY last_message_time DESC
    `, [category]);
    
    res.json({ 
      ok: true, 
      conversations: conversations,
      category: category
    });
  } catch (e) {
    logger.error({ e }, 'GET /api/chat/conversations-by-category error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Obtener información básica del cliente
app.get('/api/client-basic-info', async (req, res) => {
  try {
    const { phone, sessionId, token } = req.query || {};
    
    if (!phone || !sessionId || !token) {
      return res.status(400).json({ ok: false, error: 'Faltan parámetros phone, sessionId o token' });
    }

    // Validar sesión (igual que los otros endpoints de chat)
    const [rows] = await pool.query(
      `SELECT id FROM chat_sessions WHERE id=? AND token=? AND status='OPEN'`,
      [Number(sessionId), String(token)]
    );
    if (!rows.length) return res.status(401).json({ ok: false, error: 'Sesión inválida' });
    
    // Normalizar teléfono
    const normalizedPhone = phone.replace(/[^0-9]/g, '');
    
    // Buscar en la base de datos local (clientes, pedidos, etc.)
    // Aquí puedes integrar con tu API local existente
    
    // Por ahora, devolvemos información básica de la sesión
    const [sessionInfo] = await pool.query(`
      SELECT 
        s.id,
        s.phone,
        s.name,
        s.created_at,
        cc.category,
        cc.assigned_at as categorized_at,
        (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) as total_messages,
        (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id AND m.direction = 'in') as messages_received,
        (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id AND m.direction = 'out') as messages_sent
      FROM chat_sessions s
      LEFT JOIN chat_categories cc ON s.id = cc.session_id
      WHERE s.phone = ? AND s.status = 'OPEN'
      ORDER BY s.id DESC
      LIMIT 1
    `, [normalizedPhone]);
    
    if (!sessionInfo.length) {
      return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    }
    
    const client = sessionInfo[0];
    
    // Obtener timeline de actividad reciente
    const [timeline] = await pool.query(`
      SELECT 
        'message' as type,
        direction,
        text,
        created_at,
        status
      FROM chat_messages 
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `, [client.id]);
    
    res.json({ 
      ok: true, 
      client: {
        id: client.id,
        phone: client.phone,
        name: client.name,
        category: client.category,
        categorized_at: client.categorized_at,
        total_messages: client.total_messages,
        messages_received: client.messages_received,
        messages_sent: client.messages_sent,
        created_at: client.created_at
      },
      timeline: timeline
    });
  } catch (e) {
    logger.error({ e }, 'GET /api/client-basic-info error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Obtener estadísticas de categorías
app.get('/api/chat/category-stats', async (req, res) => {
  try {
    const { sessionId, token } = req.query || {};
    
    if (!sessionId || !token) {
      return res.status(400).json({ ok: false, error: 'Faltan parámetros sessionId o token' });
    }

    // Validar sesión (igual que los otros endpoints de chat)
    const [rows] = await pool.query(
      `SELECT id FROM chat_sessions WHERE id=? AND token=? AND status='OPEN'`,
      [Number(sessionId), String(token)]
    );
    if (!rows.length) return res.status(401).json({ ok: false, error: 'Sesión inválida' });
    const [stats] = await pool.query(`
      SELECT 
        cd.name,
        cd.display_name,
        cd.icon,
        cd.color,
        COUNT(cc.session_id) as conversation_count,
        COUNT(CASE WHEN s.last_message_at > DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 END) as active_last_hour,
        COUNT(CASE WHEN s.last_message_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as active_last_24h
      FROM category_definitions cd
      LEFT JOIN chat_categories cc ON cd.name = cc.category
      LEFT JOIN chat_sessions s ON cc.session_id = s.id AND s.status = 'OPEN'
      WHERE cd.active = TRUE
      GROUP BY cd.id, cd.name, cd.display_name, cd.icon, cd.color
      ORDER BY conversation_count DESC
    `);
    
    res.json({ 
      ok: true, 
      stats: stats 
    });
  } catch (e) {
    logger.error({ e }, 'GET /api/chat/category-stats error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ========= Template Responses API (DESACTIVADO - SOLO USAR CONVERSATION_FLOWS) ========= */
// DESACTIVADO: Usar conversation-flows-config-v2 en su lugar
/*
app.get('/api/chat/template-responses', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, template_name, trigger_keywords, response_message, 
             is_active, priority, context_duration_hours, created_at, updated_at 
      FROM template_responses 
      ORDER BY template_name ASC, priority DESC
    `);
    
    const responses = rows.map(row => ({
      ...row,
      trigger_keywords: typeof row.trigger_keywords === 'string' 
        ? JSON.parse(row.trigger_keywords) 
        : row.trigger_keywords
    }));
    
    res.json({ ok: true, responses });
  } catch (e) {
    logger.error({ e }, 'GET /api/chat/template-responses error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Crear nueva configuración de respuesta automática
app.post('/api/chat/template-responses', express.json(), async (req, res) => {
  try {
    const { template_name, trigger_keywords, response_message, is_active = true, priority = 1, context_duration_hours = 72 } = req.body;
    
    if (!template_name || !trigger_keywords || !response_message) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Campos requeridos: template_name, trigger_keywords, response_message' 
      });
    }
    
    // Validar que trigger_keywords sea array
    if (!Array.isArray(trigger_keywords) || trigger_keywords.length === 0) {
      return res.status(400).json({ 
        ok: false, 
        error: 'trigger_keywords debe ser un array no vacío' 
      });
    }
    
    const [result] = await pool.query(`
      INSERT INTO template_responses (template_name, trigger_keywords, response_message, is_active, priority, context_duration_hours) 
      VALUES (?, ?, ?, ?, ?, ?)
    `, [template_name, JSON.stringify(trigger_keywords), response_message, is_active, priority, context_duration_hours]);
    
    logger.info({ 
      id: result.insertId, 
      template_name, 
      keywordCount: trigger_keywords.length 
    }, '✅ Nueva configuración de template response creada');
    
    res.json({ 
      ok: true, 
      id: result.insertId,
      template_name,
      trigger_keywords,
      response_message,
      is_active,
      priority,
      context_duration_hours
    });
  } catch (e) {
    logger.error({ e, body: req.body }, 'POST /api/chat/template-responses error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Actualizar configuración existente
app.put('/api/chat/template-responses/:id', express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const { template_name, trigger_keywords, response_message, is_active, priority, context_duration_hours } = req.body;
    
    if (!template_name || !trigger_keywords || !response_message) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Campos requeridos: template_name, trigger_keywords, response_message' 
      });
    }
    
    // Validar que trigger_keywords sea array
    if (!Array.isArray(trigger_keywords) || trigger_keywords.length === 0) {
      return res.status(400).json({ 
        ok: false, 
        error: 'trigger_keywords debe ser un array no vacío' 
      });
    }
    
    const [result] = await pool.query(`
      UPDATE template_responses 
      SET template_name = ?, trigger_keywords = ?, response_message = ?, 
          is_active = ?, priority = ?, context_duration_hours = ?, updated_at = NOW()
      WHERE id = ?
    `, [template_name, JSON.stringify(trigger_keywords), response_message, 
        is_active !== undefined ? is_active : true, 
        priority !== undefined ? priority : 1,
        context_duration_hours !== undefined ? context_duration_hours : 72,
        id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: 'Configuración no encontrada' });
    }
    
    logger.info({ 
      id, 
      template_name, 
      keywordCount: trigger_keywords.length 
    }, '✅ Configuración de template response actualizada');
    
    res.json({ ok: true, id: Number(id), updated: true });
  } catch (e) {
    logger.error({ e, params: req.params, body: req.body }, 'PUT /api/chat/template-responses error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Eliminar configuración
app.delete('/api/chat/template-responses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await pool.query('DELETE FROM template_responses WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: 'Configuración no encontrada' });
    }
    
    logger.info({ id }, '🗑️ Configuración de template response eliminada');
    
    res.json({ ok: true, id: Number(id), deleted: true });
  } catch (e) {
    logger.error({ e, params: req.params }, 'DELETE /api/chat/template-responses error');
    res.status(500).json({ ok: false, error: e.message });
  }
});
*/

// Obtener plantillas disponibles (desde el registro de mensajes)
app.get('/api/chat/template-names', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT DISTINCT 
        CASE 
          WHEN cm.text LIKE '%notificacion_entrega%' THEN 'notificacion_entrega'
          WHEN cm.text LIKE '%confirmacion_de_entrega%' THEN 'confirmacion_de_entrega'
          WHEN cm.text LIKE '%recordatorio_pago%' THEN 'recordatorio_pago'
          ELSE 'other'
        END as template_name,
        COUNT(*) as usage_count
      FROM chat_messages cm 
      WHERE cm.direction = 'out' 
        AND (cm.text LIKE '%plantilla%' OR cm.text LIKE '%template%')
        AND cm.created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY template_name
      HAVING template_name != 'other'
      ORDER BY usage_count DESC
    `);
    
    // Agregar plantillas predefinidas si no están en uso
    const predefined = [
      { template_name: 'notificacion_entrega', usage_count: 0 },
      { template_name: 'confirmacion_de_entrega', usage_count: 0 },
      { template_name: 'recordatorio_pago', usage_count: 0 }
    ];
    
    const existing = rows.map(r => r.template_name);
    const templates = [
      ...rows,
      ...predefined.filter(p => !existing.includes(p.template_name))
    ];
    
    res.json({ ok: true, templates });
  } catch (e) {
    logger.error({ e }, 'GET /api/chat/template-names error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ========= Cargar configuración inicial ========= */
async function loadInitialChatbotConfig() {
  try {
    const [rows] = await pool.query('SELECT bot_enabled FROM chatbot_config ORDER BY id DESC LIMIT 1');
    if (rows.length > 0) {
      chatbotGlobalEnabled = !!rows[0].bot_enabled;
      logger.info(`🤖 Chatbot global enabled: ${chatbotGlobalEnabled}`);
    } else {
      logger.info('🤖 No se encontró configuración de chatbot, usando valor por defecto (desactivado)');
      chatbotGlobalEnabled = false;
    }
  } catch (e) {
    logger.error({ e }, '❌ Error cargando configuración inicial del chatbot');
  }
}

/* ========= Endpoint para reset de escalamiento ========= */
// Endpoint para que agentes humanos reseteen el estado de escalamiento
app.post('/api/chat/reset-escalation', express.json(), async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ 
        ok: false, 
        error: 'sessionId es requerido' 
      });
    }
    
    await pool.query(`
      UPDATE chat_sessions 
      SET escalation_status = 'RESOLVED',
          escalation_reason = NULL,
          escalated_at = NULL
      WHERE id = ?
    `, [sessionId]);
    
    logger.info({ sessionId }, '🔄 Estado de escalamiento reseteado por agente');

    // Hook: extraer pares Q&A para el sistema de aprendizaje
    conversationLearner.extractFromSession(sessionId).catch(err => {
      logger.error({ err, sessionId }, 'Learning: error extrayendo pares al resolver');
    });

    res.json({
      ok: true,
      message: 'Estado de escalamiento reseteado correctamente'
    });
    
  } catch (e) {
    logger.error({ error: e.message }, '❌ Error reseteando estado de escalamiento');
    res.status(500).json({ 
      ok: false, 
      error: 'Error interno del servidor' 
    });
  }
});

/* ========= Start Server ========= */
const { registerRoutes, handleChatbotMessage, setSessionMode, clearSessionState, reloadVisualFlows } = createChatbot({
  pool,
  logger,
  ssePush,
  sendTextViaCloudAPI,
  sendInteractiveButtons,
  sendInteractiveList,
  sendTypingIndicator,
  emitFlowEvent: flowMonitorRoutes.emitFlowEvent,
  autoAssignDepartment,
  knowledgeRetriever
});
registerRoutes(app, panelAuth);

// Inyectar el handler de chatbot en el endpoint de simulación
simulateMessageHandler = handleChatbotMessage;

// Actualizar la ruta de visual flows para incluir la función de reload
// Esto permite que al activar/desactivar un flujo, se recargue en memoria
const visualFlowsRoutesWithReload = require('./api/flows-routes');
app.use('/api/visual-flows-live', visualFlowsRoutesWithReload(pool, reloadVisualFlows));
app.use('/api/visual-flows', visualFlowsRoutesWithReload(pool, reloadVisualFlows)); // Alias sin -live

/* ========= Socket.IO Setup ========= */
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.size === 0) return callback(null, true);
      if (allowedOrigins.has(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Exponer io globalmente para uso en otros módulos
global.io = io;

// Namespace para chat (múltiples operadores viendo mismas conversaciones)
const chatNamespace = io.of('/chat');

// Autenticación de sockets
chatNamespace.use(async (socket, next) => {
  const { sessionId, token, dashboardToken } = socket.handshake.auth;

  // Modo dashboard: un solo socket para todo el panel
  if (dashboardToken) {
    // 1) Intentar JWT (nuevo sistema de agentes)
    try {
      const payload = verifyJWT(dashboardToken);
      socket.isDashboard = true;
      socket.agentId = payload.id;
      socket.agentRole = payload.role;
      socket.agentName = payload.name;
      socket.departmentId = payload.departmentId;
      return next();
    } catch {}

    // 2) Fallback: Basic auth token (legacy)
    try {
      const decoded = Buffer.from(dashboardToken, 'base64').toString();
      if (decoded.includes(':')) {
        socket.isDashboard = true;
        socket.agentId = 0;
        socket.agentRole = 'supervisor';
        socket.agentName = 'Admin';
        socket.departmentId = null;
        return next();
      }
    } catch {}
    return next(new Error('Invalid dashboard token'));
  }

  // Modo sesión individual (compatibilidad)
  if (!sessionId || !token) {
    return next(new Error('Authentication error'));
  }

  try {
    const [rows] = await pool.query(
      'SELECT phone FROM chat_sessions WHERE id=? AND token=? AND status="OPEN"',
      [sessionId, token]
    );

    if (!rows.length) {
      return next(new Error('Invalid session'));
    }

    socket.sessionId = Number(sessionId);
    socket.phone = rows[0].phone;
    next();
  } catch (e) {
    next(new Error('Database error'));
  }
});

// Presencia de agentes en tiempo real
const agentPresence = new Map(); // agentId -> { socketId, name, connectedAt }
global.agentPresence = agentPresence;

chatNamespace.on('connection', (socket) => {
  // Modo dashboard: un solo socket recibe TODO
  if (socket.isDashboard) {
    socket.join('dashboard_all');

    // Room del agente específico
    if (socket.agentId) {
      socket.join(`agent_${socket.agentId}`);
    }

    // Room del departamento del agente
    if (socket.departmentId) {
      socket.join(`department_${socket.departmentId}`);
    }

    // Supervisores se unen a todos los rooms de departamento
    if (socket.agentRole === 'supervisor') {
      pool.query('SELECT id FROM departments WHERE active=TRUE').then(([depts]) => {
        depts.forEach(d => socket.join(`department_${d.id}`));
      }).catch(() => {});
    }

    // Registrar presencia
    if (socket.agentId) {
      agentPresence.set(socket.agentId, { socketId: socket.id, name: socket.agentName, connectedAt: Date.now() });
      chatNamespace.to('dashboard_all').emit('agent_status_change', {
        agentId: socket.agentId, agentName: socket.agentName, status: 'online', timestamp: Date.now()
      });
    }

    logger.info({ socketId: socket.id, agentId: socket.agentId, role: socket.agentRole }, 'Dashboard socket conectado');

    socket.on('disconnect', () => {
      if (socket.agentId) {
        agentPresence.delete(socket.agentId);
        chatNamespace.to('dashboard_all').emit('agent_status_change', {
          agentId: socket.agentId, agentName: socket.agentName, status: 'offline', timestamp: Date.now()
        });
      }
      logger.info({ socketId: socket.id, agentId: socket.agentId }, 'Dashboard socket desconectado');
    });
    return;
  }

  // Modo sesión individual (compatibilidad)
  const { sessionId, phone } = socket;

  logger.info({ sessionId, phone, socketId: socket.id }, 'Socket conectado');

  // Unirse a room de la conversación
  socket.join(`session_${sessionId}`);

  // Notificar a otros operadores que alguien se unió
  socket.to(`session_${sessionId}`).emit('operator_joined', {
    socketId: socket.id,
    timestamp: Date.now()
  });

  // Evento: Operador está escribiendo
  socket.on('typing_start', () => {
    socket.to(`session_${sessionId}`).emit('operator_typing', {
      socketId: socket.id,
      typing: true
    });
  });

  socket.on('typing_stop', () => {
    socket.to(`session_${sessionId}`).emit('operator_typing', {
      socketId: socket.id,
      typing: false
    });
  });

  // Desconexión
  socket.on('disconnect', () => {
    logger.info({ sessionId, socketId: socket.id }, 'Socket desconectado');
    socket.to(`session_${sessionId}`).emit('operator_left', {
      socketId: socket.id,
      timestamp: Date.now()
    });
  });
});

// Namespace para monitor de flujos
const monitorNamespace = io.of('/monitor');

monitorNamespace.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, 'Monitor conectado');

  // Unirse a room global de monitor
  socket.join('flow_monitor');

  socket.on('disconnect', () => {
    logger.info({ socketId: socket.id }, 'Monitor desconectado');
  });
});

httpServer.listen(PORT, async () => {
  logger.info(`HTTP listo en http://0.0.0.0:${PORT}`);
  logger.info('✅ Socket.IO inicializado con namespaces /chat y /monitor');
  try {
    await ensureSchema();
    logger.info('✅ Schema verificado/creado correctamente');

    // Cargar configuración inicial del chatbot
    await loadInitialChatbotConfig();

    // Cargar reglas del clasificador
    await messageClassifier.loadRules().catch(e => {
      logger.warn({ e }, '⚠️ No se pudieron cargar reglas del clasificador (tabla puede no existir)');
    });

    // Inicializar sistema de colas (Redis + Bull MQ)
    const queuesInitialized = await queueService.initialize().catch(e => {
      logger.warn({ e }, '⚠️ Sistema de colas no disponible (Redis puede no estar corriendo)');
      return false;
    });
    if (queuesInitialized) {
      logger.info('✅ Sistema de colas inicializado (Redis + Bull MQ)');
    }

    // Jobs periodicos del sistema de aprendizaje
    if (String(process.env.LEARNING_ENABLED || 'false').toLowerCase() === 'true') {
      // Generar embeddings para pares aprobados (cada 5 min)
      setInterval(() => {
        conversationLearner.generateEmbeddings().catch(err => {
          logger.error({ err }, 'Learning: error en job de embeddings');
        });
      }, 5 * 60 * 1000);

      // Extraer pares de sesiones inactivas (cada 10 min)
      setInterval(() => {
        conversationLearner.extractInactiveSessions().catch(err => {
          logger.error({ err }, 'Learning: error en job de extraccion por inactividad');
        });
      }, 10 * 60 * 1000);

      logger.info('✅ Sistema de aprendizaje IA activado (embeddings c/5 min, extraccion c/10 min)');
    }

  } catch (e) {
    logger.error({ e }, '❌ Error en ensureSchema - El servidor puede no funcionar correctamente');
  }
  logger.info('✅ Cloud API listo. Configura el webhook de Meta hacia /webhook');
});


