const { Queue } = require('bullmq');

const faceQueue = new Queue('face-recognition', {
	connection: {
		host: 'redis',
		port: 6379,
	},
	defaultJobOptions: {
		attempts: 2,
		backoff: { type: 'fixed', delay: 2000 },
		removeOnComplete: true,
		removeOnFail: false,
	},
});

module.exports = faceQueue;
