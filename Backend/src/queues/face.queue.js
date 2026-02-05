const { Queue } = require('bullmq');
const dotenv = require('dotenv');

dotenv.config();

const faceQueue = new Queue('face-recognition', {
	connection: {
		host: process.env.REDIS_HOST || 'localhost',
		port: process.env.REDIS_PORT || 6379,
	},
	defaultJobOptions: {
		attempts: 2,
		backoff: { type: 'fixed', delay: 2000 },
		removeOnComplete: true,
		removeOnFail: false,
	},
});

module.exports = faceQueue;
