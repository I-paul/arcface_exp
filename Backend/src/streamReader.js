const IORedis = require('ioredis');
const { getSession } = require('./utils/sessionCache');

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const STREAM_KEY = process.env.STREAM_KEY || 'camera_ingestor:stream';
const GROUP = 'backend_stream_group';
const CONSUMER = 'backend_consumer_1';
const BLOCK_MS = 100; // Reduced from 2000ms — eliminates 2s lag

let client = null;
let frameCounter = 0;

/**
 * Ensure consumer group exists
 */
async function ensureGroup(redisClient) {
  try {
    await redisClient.xgroup('CREATE', STREAM_KEY, GROUP, '$', 'MKSTREAM');
    console.log(`[StreamReader] Created consumer group: ${GROUP}`);
  } catch (err) {
    if (!String(err).includes('BUSYGROUP')) {
      throw err;
    }
    console.log(`[StreamReader] Consumer group already exists: ${GROUP}`);
  }
}

/**
 * Start the stream reader
 * @param {object} io - Socket.IO server instance
 * @param {object} cameraStreamManager - CameraStreamManager instance
 */
async function startStreamReader(io, cameraStreamManager) {
  client = new IORedis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    lazyConnect: true
  });

  await client.connect();
  await ensureGroup(client);

  console.log(`[StreamReader] Started. Reading from Redis stream: ${STREAM_KEY}`);
  console.log(`[StreamReader] Group: ${GROUP}, Consumer: ${CONSUMER}, Block: ${BLOCK_MS}ms`);

  while (true) {
    try {
      const resp = await client.xreadgroup(
        'GROUP', GROUP, CONSUMER,
        'BLOCK', BLOCK_MS,
        'COUNT', 5,
        'STREAMS', STREAM_KEY, '>'
      );

      if (!resp) continue;

      for (const [, messages] of resp) {
        for (const [streamMsgId, fields] of messages) {
          const data = {};
          for (let i = 0; i < fields.length; i += 2) {
            data[fields[i]] = fields[i + 1];
          }

          const cam_id = data.cam_id;
          const imageBase64 = data.imageBase64;
          const requestTime = data.requestTime;

          if (!cam_id || !imageBase64) {
            console.warn('[StreamReader] Missing cam_id or imageBase64, skipping message');
            continue;
          }

          const frameId = ++frameCounter;

          // PATH 1 — Display: emit frame immediately to all frontend clients
          io.emit('camera-frame', {
            cam_id,
            frame_id: frameId,
            imageBase64,
            requestTime
          });

          // PATH 2 — ML: only if there is an active session for this camera
          const sessionInfo = getSession(cam_id);
          if (sessionInfo) {
            cameraStreamManager.send(cam_id, frameId, imageBase64);
          }

          // ACK and delete from stream
          try {
            await client.xack(STREAM_KEY, GROUP, streamMsgId);
            await client.xdel(STREAM_KEY, streamMsgId);
          } catch (ackErr) {
            console.error('[StreamReader] ACK error:', ackErr.message);
          }
        }
      }
    } catch (err) {
      console.error('[StreamReader] Read error:', err.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

/**
 * Get the Redis client instance
 * @returns {object} - IORedis client
 */
function getRedisClient() {
  return client;
}

module.exports = { startStreamReader, getRedisClient };
