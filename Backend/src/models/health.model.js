const pool = require('../DB/config');
const axios = require('axios');
const IORedis = require('ioredis');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

// Shared Redis client for health checks
let redisClient = null;

function getRedisClient() {
  if (!redisClient) {
    redisClient = new IORedis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      lazyConnect: true,
      retryStrategy: () => null, // Don't retry on health check
    });
  }
  return redisClient;
}

/**
 * Get system health
 * GET /api/health
 */
const getSystemHealth = async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      postgres: { status: 'disconnected', details: null },
      redis: { status: 'disconnected', details: null },
      ml: { status: 'offline', gpu_available: false, milvus_connected: false }
    }
  };

  // 1. PostgreSQL check
  try {
    await pool.query('SELECT 1');
    health.services.postgres.status = 'connected';
  } catch (err) {
    health.status = 'unhealthy';
    health.services.postgres.details = err.message;
  }

  // 2. Redis check
  try {
    const redis = getRedisClient();
    if (redis.status !== 'ready') {
      await redis.connect();
    }
    await redis.ping();
    health.services.redis.status = 'connected';
  } catch (err) {
    health.status = 'unhealthy';
    health.services.redis.details = err.message;
  }

  // 3. ML Service check
  try {
    const mlRes = await axios.get(`${ML_SERVICE_URL}/health`, { timeout: 3000 });
    if (mlRes.data) {
      health.services.ml = {
        status: mlRes.data.status || 'healthy',
        gpu_available: mlRes.data.gpu_available || false,
        milvus_connected: mlRes.data.milvus_connected || false
      };
    }
  } catch (err) {
    health.status = 'unhealthy';
    health.services.ml.details = `ML Service unreachable: ${err.message}`;
  }

  return res.status(200).json(health);
};

module.exports = {
  getSystemHealth,
};
