const { Worker } = require('bullmq');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const dotenv = require('dotenv');

dotenv.config();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ;

const worker = new Worker(
	'face-recognition',
	async (job) => {
		console.log(`[WORKER] Processing job ${job.id}...`);
		const startTime = Date.now();
		
		const { imagePath, originalName } = job.data;

		try {
			// Update progress
			await job.updateProgress(10);

			// Check if file exists
			if (!fs.existsSync(imagePath)) {
				throw new Error(`Image file not found: ${imagePath}`);
			}

			// Create form data
			const form = new FormData();
			form.append('file', fs.createReadStream(imagePath), originalName);

			await job.updateProgress(30);

			// Send to ML service
			console.log(`[WORKER] Sending image to ML service: ${ML_SERVICE_URL}/recognize`);
			const { data } = await axios.post(`${ML_SERVICE_URL}/recognize`, form, {
				headers: form.getHeaders(),
				timeout: 20000,
			});

			await job.updateProgress(80);

			// Cleanup temp file
			if (fs.existsSync(imagePath)) {
				fs.unlinkSync(imagePath);
				console.log(`[WORKER] Cleaned up temp file: ${imagePath}`);
			}

			await job.updateProgress(100);

			const duration = Date.now() - startTime;
			console.log(`[WORKER] Job ${job.id} completed in ${duration}ms`);
			console.log(`[WORKER] Result:`, data);

			return data;
		} catch (error) {
			// Cleanup temp file on error
			if (imagePath && fs.existsSync(imagePath)) {
				try {
					fs.unlinkSync(imagePath);
					console.log(`[WORKER] Cleaned up temp file after error: ${imagePath}`);
				} catch (cleanupErr) {
					console.error(`[WORKER] Failed to cleanup file: ${cleanupErr.message}`);
				}
			}

			const errorMessage = error.response?.data?.detail || error.message || 'Recognition failed';
			console.error(`[WORKER] Job ${job.id} failed:`, errorMessage);
			throw new Error(errorMessage);
		}
	},
	{
		concurrency: 3,
		connection: {
			host: process.env.REDIS_HOST || 'localhost',
			port: process.env.REDIS_PORT || 6379,
		},
	}
);

// Event handlers for monitoring
worker.on('completed', (job, result) => {
	console.log(`[WORKER] ✅ Job ${job.id} completed successfully`);
	console.log(`[WORKER] Recognition result: ${result.is_recognized ? result.name : 'Unknown'} (confidence: ${result.confidence})`);
});

worker.on('failed', (job, err) => {
	console.error(`[WORKER] ❌ Job ${job?.id} failed with error: ${err.message}`);
	if (job) {
		console.error(`[WORKER] Attempts: ${job.attemptsMade}/${job.opts.attempts}`);
	}
});

worker.on('error', (err) => {
	console.error('[WORKER] Worker error:', err.message);
});

worker.on('ready', () => {
	console.log('[WORKER] 🚀 Face recognition worker is ready and waiting for jobs');
});

worker.on('active', (job) => {
	console.log(`[WORKER] 🔄 Processing job ${job.id}...`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
	console.log('[WORKER] SIGTERM received, closing worker gracefully...');
	await worker.close();
	process.exit(0);
});

process.on('SIGINT', async () => {
	console.log('[WORKER] SIGINT received, closing worker gracefully...');
	await worker.close();
	process.exit(0);
});

console.log('[WORKER] Face recognition worker started');
console.log(`[WORKER] Redis: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
console.log(`[WORKER] ML Service: ${ML_SERVICE_URL}`);
console.log(`[WORKER] Concurrency: 3`);
