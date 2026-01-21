/**
 * Queue System - Exporta todos los componentes de colas
 */

const queueService = require('./queue-service');
const BroadcastQueue = require('./broadcast-queue');
const { getRedisConnection, isRedisAvailable, closeRedisConnection } = require('./redis-connection');

module.exports = {
  queueService,
  BroadcastQueue,
  getRedisConnection,
  isRedisAvailable,
  closeRedisConnection
};
