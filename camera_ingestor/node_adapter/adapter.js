const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379;
const STREAM_KEY = process.env.STREAM_KEY || 'camera_ingestor:stream';
const GROUP = process.env.STREAM_GROUP || 'camera_ingestor_group';
const CONSUMER = process.env.STREAM_CONSUMER || 'adapter_consumer_1';

const connection = { host: REDIS_HOST, port: REDIS_PORT };
const client = new IORedis(connection);
const queue = new Queue('face-recognition', { connection });

async function ensureGroup() {
  try {
    await client.xgroup('CREATE', STREAM_KEY, GROUP, '$', 'MKSTREAM');
    console.log('Created stream group', GROUP);
  } catch (err) {
    if (!String(err).includes('BUSYGROUP')) {
      console.error('Failed to create group', err);
    } else {
      console.log('Group already exists');
    }
  }
}

async function run() {
  await ensureGroup();
  console.log('Adapter started, reading from stream', STREAM_KEY);

  while (true) {
    try {
      // Block for 2s
      const resp = await client.xreadgroup('GROUP', GROUP, CONSUMER, 'BLOCK', 2000, 'COUNT', 10, 'STREAMS', STREAM_KEY, '>');
      if (!resp) continue;

      for (const [streamName, messages] of resp) {
        for (const [id, fields] of messages) {
          // fields is an array like [key1, val1, key2, val2]
          const data = {};
          for (let i = 0; i < fields.length; i += 2) {
            data[fields[i]] = fields[i + 1];
          }

          try {
            // Build job payload matching backend expectation
            const payload = {
              imageBase64: data.imageBase64,
              originalName: data.originalName || 'frame.jpg',
              requestTime: data.requestTime,
              cam_id: data.cam_id || null,
              site_id: data.site_id || null,
            };

            // Add to bullmq queue
            const job = await queue.add('recognize-face', payload);
            console.log(`Added job ${job.id} from stream id ${id}`);

            // Acknowledge message
            await client.xack(STREAM_KEY, GROUP, id);
            await client.xdel(STREAM_KEY, id);
          } catch (err) {
            console.error('Failed to process message', id, err);
          }
        }
      }
    } catch (err) {
      console.error('Adapter error', err);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

run().catch((err) => {
  console.error('Adapter fatal', err);
  process.exit(1);
});
