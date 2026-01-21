/**
 * Queue Service - Servicio centralizado de colas con Bull MQ
 *
 * Maneja diferentes tipos de trabajos:
 * - broadcast: Envíos masivos de WhatsApp
 * - scheduled-message: Mensajes programados
 * - webhook: Llamadas a webhooks externos
 * - ai-summary: Generación de resúmenes con IA
 */

const { Queue, Worker, QueueEvents } = require('bullmq');
const { getRedisConfig, isRedisAvailable } = require('./redis-connection');

class QueueService {
  constructor() {
    this.queues = {};
    this.workers = {};
    this.events = {};
    this.isInitialized = false;
    this.redisConfig = getRedisConfig();
  }

  /**
   * Inicializa el servicio de colas
   * @returns {Promise<boolean>} true si se inicializó correctamente
   */
  async initialize() {
    if (this.isInitialized) return true;

    const redisOk = await isRedisAvailable();
    if (!redisOk) {
      console.warn('[QueueService] Redis not available, queues disabled');
      return false;
    }

    // Crear colas principales
    this.createQueue('broadcast', { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
    this.createQueue('scheduled-message', { attempts: 2, backoff: { type: 'fixed', delay: 10000 } });
    this.createQueue('webhook', { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
    this.createQueue('ai-summary', { attempts: 2, backoff: { type: 'fixed', delay: 30000 } });

    this.isInitialized = true;
    console.log('[QueueService] Initialized with queues:', Object.keys(this.queues).join(', '));
    return true;
  }

  /**
   * Crea una cola con configuración por defecto
   * @param {string} name - Nombre de la cola
   * @param {Object} defaultJobOptions - Opciones por defecto para trabajos
   */
  createQueue(name, defaultJobOptions = {}) {
    if (this.queues[name]) {
      console.warn(`[QueueService] Queue ${name} already exists`);
      return this.queues[name];
    }

    this.queues[name] = new Queue(name, {
      connection: this.redisConfig,
      defaultJobOptions: {
        removeOnComplete: { count: 100 }, // Mantener últimos 100 completados
        removeOnFail: { count: 500 },     // Mantener últimos 500 fallidos
        ...defaultJobOptions
      }
    });

    // Crear eventos para monitoreo
    this.events[name] = new QueueEvents(name, { connection: this.redisConfig });

    this.events[name].on('completed', ({ jobId, returnvalue }) => {
      console.log(`[Queue:${name}] Job ${jobId} completed`);
    });

    this.events[name].on('failed', ({ jobId, failedReason }) => {
      console.error(`[Queue:${name}] Job ${jobId} failed: ${failedReason}`);
    });

    return this.queues[name];
  }

  /**
   * Registra un worker para procesar trabajos de una cola
   * @param {string} queueName - Nombre de la cola
   * @param {Function} processor - Función que procesa el trabajo
   * @param {Object} options - Opciones del worker
   */
  registerWorker(queueName, processor, options = {}) {
    if (!this.queues[queueName]) {
      console.error(`[QueueService] Queue ${queueName} does not exist`);
      return null;
    }

    const worker = new Worker(queueName, processor, {
      connection: this.redisConfig,
      concurrency: options.concurrency || 5,
      ...options
    });

    worker.on('completed', (job) => {
      console.log(`[Worker:${queueName}] Completed job ${job.id}`);
    });

    worker.on('failed', (job, err) => {
      console.error(`[Worker:${queueName}] Failed job ${job?.id}: ${err.message}`);
    });

    worker.on('error', (err) => {
      console.error(`[Worker:${queueName}] Error: ${err.message}`);
    });

    this.workers[queueName] = worker;
    console.log(`[QueueService] Worker registered for queue: ${queueName}`);
    return worker;
  }

  /**
   * Agrega un trabajo a una cola
   * @param {string} queueName - Nombre de la cola
   * @param {string} jobName - Nombre del trabajo
   * @param {Object} data - Datos del trabajo
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Job>}
   */
  async addJob(queueName, jobName, data, options = {}) {
    if (!this.queues[queueName]) {
      throw new Error(`Queue ${queueName} does not exist`);
    }

    const job = await this.queues[queueName].add(jobName, data, options);
    console.log(`[QueueService] Added job ${job.id} to ${queueName}`);
    return job;
  }

  /**
   * Programa un trabajo para ejecución futura
   * @param {string} queueName - Nombre de la cola
   * @param {string} jobName - Nombre del trabajo
   * @param {Object} data - Datos del trabajo
   * @param {Date|number} delay - Fecha o milisegundos de delay
   * @returns {Promise<Job>}
   */
  async scheduleJob(queueName, jobName, data, delay) {
    const delayMs = delay instanceof Date
      ? delay.getTime() - Date.now()
      : delay;

    if (delayMs < 0) {
      throw new Error('Scheduled time must be in the future');
    }

    return this.addJob(queueName, jobName, data, { delay: delayMs });
  }

  /**
   * Obtiene estadísticas de una cola
   * @param {string} queueName - Nombre de la cola
   * @returns {Promise<Object>}
   */
  async getQueueStats(queueName) {
    if (!this.queues[queueName]) {
      throw new Error(`Queue ${queueName} does not exist`);
    }

    const queue = this.queues[queueName];
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount()
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Obtiene estadísticas de todas las colas
   * @returns {Promise<Object>}
   */
  async getAllStats() {
    const stats = {};
    for (const name of Object.keys(this.queues)) {
      stats[name] = await this.getQueueStats(name);
    }
    return stats;
  }

  /**
   * Pausa una cola
   * @param {string} queueName - Nombre de la cola
   */
  async pauseQueue(queueName) {
    if (this.queues[queueName]) {
      await this.queues[queueName].pause();
      console.log(`[QueueService] Queue ${queueName} paused`);
    }
  }

  /**
   * Reanuda una cola
   * @param {string} queueName - Nombre de la cola
   */
  async resumeQueue(queueName) {
    if (this.queues[queueName]) {
      await this.queues[queueName].resume();
      console.log(`[QueueService] Queue ${queueName} resumed`);
    }
  }

  /**
   * Cierra todas las conexiones
   */
  async shutdown() {
    console.log('[QueueService] Shutting down...');

    // Cerrar workers primero
    for (const [name, worker] of Object.entries(this.workers)) {
      await worker.close();
      console.log(`[QueueService] Worker ${name} closed`);
    }

    // Cerrar eventos
    for (const [name, events] of Object.entries(this.events)) {
      await events.close();
    }

    // Cerrar colas
    for (const [name, queue] of Object.entries(this.queues)) {
      await queue.close();
      console.log(`[QueueService] Queue ${name} closed`);
    }

    this.isInitialized = false;
    console.log('[QueueService] Shutdown complete');
  }
}

// Singleton
const queueService = new QueueService();

module.exports = queueService;
