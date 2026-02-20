const { Worker } = require('bullmq');
const axios = require('axios');
const WebSocket = require('ws');
const dotenv = require('dotenv');
const pool = require('../DB/config');

dotenv.config();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL;
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:3000';

/**
 * Send image to ML service via WebSocket for face recognition
 * @param {string} imageBase64 - Base64 encoded image
 * @returns {Promise<object>} ML service response
 */
async function recognizeViaWebSocket(imageBase64) {
	return new Promise((resolve, reject) => {
		try {
			// Convert http/https URL to ws/wss
			const wsUrl = ML_SERVICE_URL.replace(/^http/, 'ws') + '/ws/recognize';
			console.log(`[WORKER] Connecting to WebSocket: ${wsUrl}`);
			
			const ws = new WebSocket(wsUrl, {
				perMessageDeflate: false
			});
			let responded = false;
			let messagesSent = false;
			
			const timeout = setTimeout(() => {
				if (!responded) {
					responded = true;
					console.error('[WORKER] WebSocket timeout - no response received');
					ws.terminate();
					reject(new Error('WebSocket request timeout'));
				}
			}, 30000); // 30 second timeout
			
			ws.on('open', () => {
				console.log('[WORKER] WebSocket connected, sending recognition request');
				try {
					const message = JSON.stringify({
						type: 'recognize',
						image: imageBase64
					});
					console.log(`[WORKER] Sending message size: ${message.length} bytes`);
					ws.send(message, (err) => {
						if (err) {
							console.error(`[WORKER] Failed to send message: ${err.message}`);
							if (!responded) {
								responded = true;
								clearTimeout(timeout);
								ws.terminate();
								reject(err);
							}
						} else {
							console.log('[WORKER] Message sent successfully, waiting for response...');
							messagesSent = true;
						}
					});
				} catch (sendErr) {
					console.error(`[WORKER] Error sending message: ${sendErr.message}`);
					if (!responded) {
						responded = true;
						clearTimeout(timeout);
						ws.terminate();
						reject(sendErr);
					}
				}
			});
			
			ws.on('message', (data) => {
				if (responded) return;
				
				console.log(`[WORKER] Received message (${data.length} bytes): ${data.toString().substring(0, 100)}...`);
				
				try {
					const message = JSON.parse(data);
					
					if (message.type === 'result') {
						console.log('[WORKER] Received result from ML service');
						responded = true;
						clearTimeout(timeout);
						ws.terminate();
						resolve(message);
					} else if (message.type === 'error') {
						console.error(`[WORKER] ML service error: ${message.message}`);
						responded = true;
						clearTimeout(timeout);
						ws.terminate();
						reject(new Error(message.message || 'ML service error'));
					} else {
						console.log(`[WORKER] Received unknown message type: ${message.type}`);
					}
				} catch (parseErr) {
					console.error(`[WORKER] Failed to parse response: ${parseErr.message}`);
				}
			});
			
			ws.on('error', (error) => {
				console.error(`[WORKER] WebSocket error: ${error.message}`);
				if (!responded) {
					responded = true;
					clearTimeout(timeout);
					reject(new Error(`WebSocket error: ${error.message}`));
				}
			});
			
			ws.on('close', (code, reason) => {
				console.log(`[WORKER] WebSocket closed - code: ${code}, reason: ${reason}, messagesSent: ${messagesSent}`);
				if (!responded) {
					responded = true;
					clearTimeout(timeout);
					reject(new Error(`WebSocket closed unexpectedly - code: ${code}, messagesSent: ${messagesSent}`));
				}
			});
		} catch (error) {
			console.error(`[WORKER] WebSocket setup error: ${error.message}`);
			reject(error);
		}
	});
}

const worker = new Worker(
	'face-recognition',
	async (job) => {
		console.log(`[WORKER] Processing job ${job.id}...`);
		const startTime = Date.now();
		
		const { imageBase64, originalName, imagePath, cam_id, site_id } = job.data;

		try {
			// Update progress
			await job.updateProgress(10);

			// Validate image data
			if (!imageBase64) {
				if (imagePath) {
					throw new Error(`Image file not found: ${imagePath}`);
				} else {
					throw new Error('No image data provided');
				}
			}

			await job.updateProgress(30);

			// Send to ML service via WebSocket
			console.log(`[WORKER] Sending image to ML service via WebSocket: ${ML_SERVICE_URL}/ws/recognize`);
			const mlResponse = await recognizeViaWebSocket(imageBase64);

			await job.updateProgress(50);

			// Initialize response object with bare minimum
			const response = {
				detected: mlResponse?.is_recognized || false,
				name: null,
				emp_id: null,
				confidence: mlResponse?.confidence || 0,
				message: mlResponse?.message || 'Recognition complete'
			};

			// If not recognized, return early
			if (!response.detected || !mlResponse?.person_id) {
				await job.updateProgress(100);
				return response;
			}

			// EMPLOYEE LOOKUP: Resolve name from milvus_id (keep as string for precision)
			try {
				const milvusId = mlResponse.person_id;  // Keep as string - no parseInt!
				
				const query = 'SELECT emp_id, name FROM employees WHERE milvus_id = $1';
				const { rows } = await pool.query(query, [milvusId]);
				
				if (!rows.length) {
					console.warn(`[WORKER] No employee found for milvus_id: ${milvusId}`);
					response.message = 'Face recognized but employee not found in database';
					await job.updateProgress(100);
					return response;
				}

				response.name = rows[0].name;
				response.emp_id = rows[0].emp_id;

				await job.updateProgress(60);

			// ATTENDANCE LOGIC: Let the attendance endpoint handle all validation
			try {
				// Determine action based on last event (simple logic - endpoint will validate)
				const lastEventQuery = `
					SELECT action
					FROM attendance_events
					WHERE emp_id = $1
					ORDER BY event_time DESC
					LIMIT 1;
				`;
				const { rows: lastEventRows } = await pool.query(lastEventQuery, [response.emp_id]);
				const lastEvent = lastEventRows.length ? lastEventRows[0] : null;

				// Simple action determination - endpoint will do full validation
				const action = (!lastEvent || lastEvent.action === 'OUT') ? 'IN' : 'OUT';

				const attendancePayload = {
					emp_id: response.emp_id,
					cam_id: cam_id || null,
					site_id: site_id || null,
					action,
					similarity_score: mlResponse.confidence || null,
					liveness_passed: mlResponse.liveness?.is_live || null
				};

				await axios.post(`${BACKEND_URL}/api/attendance`, attendancePayload);
				console.log(`[WORKER] Attendance recorded: ${response.name} ${action}`);
			} catch (attendanceErr) {
				const statusCode = attendanceErr.response?.status;
				const errorMessage = attendanceErr.response?.data?.message || attendanceErr.message;

				// Handle different error types
				if (statusCode === 429) {
					// Cooldown - not an error, just log it
					console.log(`[WORKER] Attendance cooldown: ${errorMessage}`);
				} else if (statusCode === 400) {
					// Validation error - log but don't fail the recognition
					console.warn(`[WORKER] Attendance validation: ${errorMessage}`);
				} else {
					// Server error (500) or other - FAIL the job
					console.error(`[WORKER] Attendance error: ${errorMessage}`);
					throw new Error(`Failed to record attendance: ${errorMessage}`);
				}
			}
			} catch (lookupErr) {
				console.error(`[WORKER] Employee lookup error: ${lookupErr.message}`);
				throw new Error(`Failed to lookup employee: ${lookupErr.message}`);
			}

			await job.updateProgress(100);
			return response;
		} catch (error) {
			const errorMessage = error.response?.data?.detail || error.message || 'Recognition failed';
			console.error(`[WORKER] Job ${job.id} failed: ${errorMessage}`);
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
	if (result.detected && result.name) {
		console.log(`[WORKER] ✓ ${result.name} (${(result.confidence * 100).toFixed(1)}%)`);
	}
});

worker.on('failed', (job, err) => {
	console.error(`[WORKER] ✗ Job ${job?.id}: ${err.message}`);
});

worker.on('error', (err) => {
	console.error(`[WORKER] Error: ${err.message}`);
});

worker.on('ready', () => {
	console.log('[WORKER] Ready');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
	console.log('[WORKER] SIGTERM received, shutting down...');
	await worker.close();
	process.exit(0);
});

process.on('SIGINT', async () => {
	console.log('[WORKER] SIGINT received, shutting down...');
	await worker.close();
	process.exit(0);
});

console.log('[WORKER] Face recognition worker started');
console.log(`[WORKER] Redis: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
console.log(`[WORKER] ML Service: ${ML_SERVICE_URL}`);
console.log(`[WORKER] Backend URL: ${BACKEND_URL}`);
console.log(`[WORKER] Concurrency: 3`);
