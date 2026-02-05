const pool = require('../DB/config');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const faceQueue = require('../queues/face.queue');
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';


const REQUIRED_FIELDS = ['first_name', 'last_name', 'email'];
const UPDATABLE_FIELDS = [
	'first_name',
	'last_name',
	'email',
	'phone',
	'date_of_birth',
	'gender',
	'hire_date',
	'job_title',
	'salary',
	'is_active',
];

/**
 * Call ML service /enroll endpoint.
 */
const enrollFace = async (req, res) => {
	const filesToCleanup = (req.files || []).map((file) => file.path);
	try {
		const { name } = req.body;
		if (!name) {
			return res.status(400).json({ message: 'Name is required for enrollment' });
		}
		if (!req.files || !req.files.length) {
			return res.status(400).json({ message: 'At least one image file is required' });
		}

		const form = new FormData();
		form.append('name', name);
		req.files.forEach((file) => {
			form.append('files', fs.createReadStream(file.path), file.originalname);
		});

		const { data } = await axios.post(`${ML_SERVICE_URL}/enroll`, form, {
			headers: form.getHeaders(),
			timeout: 30000,
		});

		return res.status(200).json({
			success: true,
			message: data.message || `Enrolled ${name} successfully`,
			person_id: data.person_id || null,
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
 * Queue-based face recognition - adds job to queue and returns job ID for status tracking.
 */
const recognizeFace = async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ message: 'Image file is required' });
		}

		// Add job to queue
		const job = await faceQueue.add('recognize-face', {
			imagePath: req.file.path,
			originalName: req.file.originalname,
			requestTime: new Date().toISOString(),
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
		// Cleanup temp file on error
		try {
			if (req.file && fs.existsSync(req.file.path)) {
				fs.unlinkSync(req.file.path);
				console.log(`[CLEANUP] Deleted temp file after queue error: ${req.file.path}`);
			}
		} catch (cleanupErr) {
			console.error('[CLEANUP] Failed to delete temp file:', cleanupErr.message);
		}

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
 * Create a new employee with image and face encoding registration.
 */
const createEmployee = async (req, res) => {
	try {
		console.log('[INFO] Received request to create employee:', req.body);
		const missing = REQUIRED_FIELDS.filter((field) => !req.body[field]);
		if (missing.length) {
			return res.status(400).json({ message: `Missing required fields: ${missing.join(', ')}` });
		}
		const {
			first_name,
			last_name,
			email,
			phone,
			date_of_birth,
			gender,
			hire_date,
			job_title,
			salary,
			is_active,
		} = req.body;

		// Face enrollment now handled via /api/enroll endpoint; proceed with DB insert only.

		// Only insert into database if face enrollment succeeds
		const insertQuery = `
			INSERT INTO employee (
				first_name, last_name, email, phone, date_of_birth, gender,
				hire_date, job_title, salary, is_active
			)
			VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_DATE), $8, $9, COALESCE($10, TRUE))
			RETURNING *;
		`;

		const values = [
			first_name,
			last_name,
			email,
			phone || null,
			date_of_birth || null,
			gender || null,
			hire_date || null,
			job_title || null,
			salary || null,
			is_active,
		];
		
		const { rows } = await pool.query(insertQuery, values);
		const employee = rows[0];

		return res.status(201).json(employee);
	} catch (error) {
		console.error('Error creating employee:', error);
		return res.status(500).json({ message: 'Internal server error' });
	}
};

/**
 * Get all employees.
 */
const getAllEmployees = async (_req, res) => {
	try {
		const { rows } = await pool.query('SELECT * FROM employee ORDER BY employee_id;');
		return res.status(200).json(rows);
	} catch (error) {
		console.error('Error fetching employees:', error);
		return res.status(500).json({ message: 'Internal server error' });
	}
};

/**
 * Get employee by ID.
 */
const getEmployeeById = async (req, res) => {
	try {
		const { id } = req.params;
		const employeeId = Number(id);

		if (!Number.isInteger(employeeId)) {
			return res.status(400).json({ message: 'Employee id must be an integer' });
		}

		const { rows } = await pool.query('SELECT * FROM employee WHERE employee_id = $1;', [
			employeeId,
		]);

		if (!rows.length) {
			return res.status(404).json({ message: 'Employee not found' });
		}

		return res.status(200).json(rows[0]);
	} catch (error) {
		console.error('Error fetching employee:', error);
		return res.status(500).json({ message: 'Internal server error' });
	}
};

/**
 * Update employee by ID.
 */
const updateEmployee = async (req, res) => {
	try {
		const { id } = req.params;
		const employeeId = Number(id);

		if (!Number.isInteger(employeeId)) {
			return res.status(400).json({ message: 'Employee id must be an integer' });
		}

		const entries = Object.entries(req.body).filter(([key]) => UPDATABLE_FIELDS.includes(key));

		if (!entries.length) {
			return res.status(400).json({ message: 'No valid fields provided for update' });
		}

		const setClauses = entries.map(([key], index) => `${key} = $${index + 1}`);
		const values = entries.map(([, value]) => value);

		const updateQuery = `
			UPDATE employee
			SET ${setClauses.join(', ')}, updated_at = NOW()
			WHERE employee_id = $${entries.length + 1}
			RETURNING *;
		`;

		const { rows } = await pool.query(updateQuery, [...values, employeeId]);

		if (!rows.length) {
			return res.status(404).json({ message: 'Employee not found' });
		}

		return res.status(200).json(rows[0]);
	} catch (error) {
		console.error('Error updating employee:', error);
		return res.status(500).json({ message: 'Internal server error' });
	}
};

/**
 * Delete employee by ID.
 */
const deleteEmployee = async (req, res) => {
	try {
		const { id } = req.params;
		const employeeId = Number(id);

		if (!Number.isInteger(employeeId)) {
			return res.status(400).json({ message: 'Employee id must be an integer' });
		}

		const { rowCount } = await pool.query('DELETE FROM employee WHERE employee_id = $1;', [
			employeeId,
		]);

		if (rowCount === 0) {
			return res.status(404).json({ message: 'Employee not found' });
		}
		else{
			console.log(`Employee with ID ${employeeId} deleted successfully.`);
		}
		return res.status(204).send();
	} catch (error) {
		console.error('Error deleting employee:', error);
		return res.status(500).json({ message: 'Internal server error' });
	}
};

module.exports = {
	createEmployee,
	getAllEmployees,
	getEmployeeById,
	updateEmployee,
	deleteEmployee,
	enrollFace,
	recognizeFace,
	getJobStatus,
};