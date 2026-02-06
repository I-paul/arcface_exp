const { Queue } = require('bullmq');
const dotenv = require('dotenv');

dotenv.config();

const faceQueue = new Queue('face-recognition', {
	connection: {
		host: process.env.REDIS_HOST ,
		port: process.env.REDIS_PORT ,
	},
	defaultJobOptions: {
		attempts: 2,
		backoff: { type: 'fixed', delay: 2000 },
		removeOnComplete: true,
		removeOnFail: false,
	},
});

module.exports = faceQueue;
