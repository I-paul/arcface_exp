const pool = require('../DB/config');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const faceQueue = require('../queues/face.queue');
const ML_SERVICE_URL = process.env.ML_SERVICE_URL;


/**
 * ENROLLMENT: Call ML service /enroll endpoint to register a new employee.
 * This uploads face images to the ML service which returns a person_id (milvus_id).
 * The employee is then stored in the database with the milvus_id linked to the vector DB.
 */
const enrollEmployee = async (req, res) => {
	const filesToCleanup = (req.files || []).map((file) => file.path);
	try {
		const { emp_id, name } = req.body;
		
		if (!emp_id) {
			return res.status(400).json({ message: 'emp_id is required for enrollment' });
		}
		if (!name) {
			return res.status(400).json({ message: 'name is required for enrollment' });
		}
		if (!req.files || !req.files.length) {
			return res.status(400).json({ message: 'At least one image file is required' });
		}

		// Check if employee already exists
		const checkQuery = 'SELECT emp_id FROM employees WHERE emp_id = $1';
		const checkResult = await pool.query(checkQuery, [emp_id]);

		if (checkResult.rows.length > 0) {
			return res.status(400).json({ message: 'Employee already enrolled with this ID' });
		}

		// Send to ML service for enrollment
		const form = new FormData();
		form.append('name', name);
		req.files.forEach((file) => {
			form.append('files', fs.createReadStream(file.path), file.originalname);
		});

		const { data: mlData } = await axios.post(`${ML_SERVICE_URL}/enroll`, form, {
			headers: form.getHeaders(),
			timeout: 30000,
		});

		// Extract milvus_id from ML service response
		const milvus_id = mlData.person_id;
		if (!milvus_id) {
			return res.status(500).json({ message: 'ML service did not return person_id' });
		}

		// Store in database
		const insertQuery = `
			INSERT INTO employees (emp_id, name, milvus_id)
			VALUES ($1, $2, $3)
			RETURNING emp_id, name, milvus_id;
		`;

		const { rows } = await pool.query(insertQuery, [emp_id, name, milvus_id]);

		console.log(`[ENROLL] Employee ${emp_id} (${name}) enrolled with milvus_id ${milvus_id}`);

		return res.status(201).json({
			success: true,
			message: `Employee ${name} enrolled successfully`,
			employee: rows[0]
		});
	} catch (error) {
		const status = error.response?.status || 500;
		const detail = error.response?.data || { message: 'Enrollment failed' };
		console.error('[ERROR] Enrollment error:', detail);
		return res.status(status).json(detail);
	} finally {
		filesToCleanup.forEach((filePath) => {
			try {
				if (fs.existsSync(filePath)) {
					fs.unlinkSync(filePath);
					console.log(`[CLEANUP] Deleted temp file: ${filePath}`);
				}
			} catch (err) {
				console.error(`[CLEANUP] Failed to delete ${filePath}:`, err.message);
			}
		});
	}
};

/**
 * RECOGNITION: Queue-based face recognition - adds job to queue and returns job ID for status tracking.
 * The job is processed asynchronously and results are emitted via WebSocket.
 */
const recognizeFace = async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ message: 'Image file is required' });
		}

		const { cam_id, site_id } = req.body;

		const imageBase64 = req.file.buffer.toString('base64');

		// Add job to queue
		const job = await faceQueue.add('recognize-face', {
			imageBase64,
			originalName: req.file.originalname || 'frame.jpg',
			requestTime: new Date().toISOString(),
			cam_id: cam_id || null,
			site_id: site_id || null,
		});

		console.log(`[QUEUE] Job ${job.id} added to face recognition queue`);

		// Return job ID immediately for client to track
		return res.status(202).json({
			message: 'Face recognition job queued',
			job_id: job.id,
			status: 'queued',
			status_url: `/api/job/${job.id}`,
		});
	} catch (error) {
		console.error('[ERROR] Failed to queue recognition job:', error.message);
		return res.status(500).json({ message: 'Failed to queue recognition job' });
	}
};

/**
 * Get job status and result by job ID.
 */
const getJobStatus = async (req, res) => {
	try {
		const { jobId } = req.params;

		if (!jobId) {
			return res.status(400).json({ message: 'Job ID is required' });
		}

		const job = await faceQueue.getJob(jobId);

		if (!job) {
			return res.status(404).json({ message: 'Job not found' });
		}

		const state = await job.getState();
		const progress = job.progress;

		const response = {
			job_id: job.id,
			status: state,
			progress: progress,
			created_at: new Date(job.timestamp).toISOString(),
		};

		// If job is completed, include result
		if (state === 'completed') {
			response.result = job.returnvalue;
			response.completed_at = new Date(job.finishedOn).toISOString();
		}

		// If job failed, include error
		if (state === 'failed') {
			response.error = job.failedReason;
			response.failed_at = new Date(job.finishedOn).toISOString();
		}

		return res.status(200).json(response);
	} catch (error) {
		console.error('[ERROR] Failed to get job status:', error.message);
		return res.status(500).json({ message: 'Failed to retrieve job status' });
	}
};

/**
 * Get all enrolled employees
 */
const getAllEmployees = async (req, res) => {
	try {
		const query = `
			SELECT emp_id, name, milvus_id
			FROM employees
			ORDER BY emp_id;
		`;
		const { rows } = await pool.query(query);
		return res.status(200).json(rows);
	} catch (error) {
		console.error('[ERROR] Failed to fetch employees:', error.message);
		return res.status(500).json({ message: 'Failed to fetch employees' });
	}
};

/**
 * Get employee by emp_id
 */
const getEmployeeById = async (req, res) => {
	try {
		const { emp_id } = req.params;
		const query = `
			SELECT emp_id, name, milvus_id
			FROM employees
			WHERE emp_id = $1;
		`;
		const { rows } = await pool.query(query, [emp_id]);

		if (!rows.length) {
			return res.status(404).json({ message: 'Employee not found' });
		}

		return res.status(200).json(rows[0]);
	} catch (error) {
		console.error('[ERROR] Failed to fetch employee:', error.message);
		return res.status(500).json({ message: 'Failed to fetch employee' });
	}
};

/**
 * Delete employee by emp_id
 */
const deleteEmployee = async (req, res) => {
	try {
		const { emp_id } = req.params;
		const query = 'DELETE FROM employees WHERE emp_id = $1;';
		const result = await pool.query(query, [emp_id]);

		if (result.rowCount === 0) {
			return res.status(404).json({ message: 'Employee not found' });
		}

		console.log(`[DELETE] Employee ${emp_id} deleted successfully`);
		return res.status(204).send();
	} catch (error) {
		console.error('[ERROR] Failed to delete employee:', error.message);
		return res.status(500).json({ message: 'Failed to delete employee' });
	}
};

module.exports = {
	enrollEmployee,
	recognizeFace,
	getJobStatus,
	getAllEmployees,
	getEmployeeById,
	deleteEmployee,
};