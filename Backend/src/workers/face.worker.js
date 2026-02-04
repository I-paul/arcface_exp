const { Worker } = require('bullmq');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const dotenv = require('dotenv');

dotenv.config();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

new Worker(
	'face-recognition',
	async (job) => {
		const { imagePath, originalName } = job.data;

		const form = new FormData();
		form.append('file', fs.createReadStream(imagePath), originalName);

		const { data } = await axios.post(`${ML_SERVICE_URL}/recognize`, form, {
			headers: form.getHeaders(),
			timeout: 20000,
		});

		if (fs.existsSync(imagePath)) {
			fs.unlinkSync(imagePath);
		}

		return data;
	},
	{
		concurrency: 3,
		connection: {
			host: process.env.REDIS_HOST || 'localhost',
			port: process.env.REDIS_PORT || 6379,
		},
	}
);
