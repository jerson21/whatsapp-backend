/**
 * Redis Connection Manager
 * Centraliza la conexión a Redis para Bull MQ y otros servicios
 */

const Redis = require('ioredis');

let redisConnection = null;

/**
 * Obtiene o crea la conexión a Redis
 * @returns {Redis} Instancia de Redis
 */
function getRedisConnection() {
  if (!redisConnection) {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);

    redisConnection = new Redis({
      host,
      port,
      maxRetriesPerRequest: null, // Requerido por BullMQ
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (times > 10) {
          console.error('[Redis] Max retries reached, giving up');
          return null;
        }
        const delay = Math.min(times * 200, 2000);
        console.log(`[Redis] Retry ${times}, waiting ${delay}ms`);
        return delay;
      }
    });

    redisConnection.on('connect', () => {
      console.log(`[Redis] Connected to ${host}:${port}`);
    });

    redisConnection.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });

    redisConnection.on('close', () => {
      console.log('[Redis] Connection closed');
    });
  }

  return redisConnection;
}

/**
 * Obtiene configuración de conexión para BullMQ
 * @returns {Object} Configuración de conexión
 */
function getRedisConfig() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    maxRetriesPerRequest: null
  };
}

/**
 * Cierra la conexión a Redis
 */
async function closeRedisConnection() {
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
    console.log('[Redis] Connection closed gracefully');
  }
}

/**
 * Verifica si Redis está disponible
 * @returns {Promise<boolean>}
 */
async function isRedisAvailable() {
  try {
    const conn = getRedisConnection();
    const result = await conn.ping();
    return result === 'PONG';
  } catch (err) {
    console.error('[Redis] Not available:', err.message);
    return false;
  }
}

module.exports = {
  getRedisConnection,
  getRedisConfig,
  closeRedisConnection,
  isRedisAvailable
};
