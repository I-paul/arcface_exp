const pool = require('../DB/config');
const { randomUUID } = require('crypto');

/**
 * Get all cameras
 */
const getAllCameras = async (req, res) => {
	try {
		const query = `
			SELECT cam_id, site_id, site_name, camera_label, created_at
			FROM cameras
			ORDER BY created_at DESC;
		`;
		const { rows } = await pool.query(query);
		return res.status(200).json(rows);
	} catch (error) {
		console.error('[ERROR] Failed to fetch cameras:', error.message);
		return res.status(500).json({ message: 'Failed to fetch cameras' });
	}
};

/**
 * Get camera by ID
 */
const getCameraById = async (req, res) => {
	try {
		const { cam_id } = req.params;
		const query = `
			SELECT cam_id, site_id, site_name, camera_label, created_at
			FROM cameras
			WHERE cam_id = $1;
		`;
		const { rows } = await pool.query(query, [cam_id]);

		if (!rows.length) {
			return res.status(404).json({ message: 'Camera not found' });
		}

		return res.status(200).json(rows[0]);
	} catch (error) {
		console.error('[ERROR] Failed to fetch camera:', error.message);
		return res.status(500).json({ message: 'Failed to fetch camera' });
	}
};

/**
 * Create new camera
 */
const createCamera = async (req, res) => {
	try {
		const { site_id, site_name, camera_label } = req.body;

		if (!site_id || !camera_label) {
			return res.status(400).json({ 
				message: 'Missing required fields: site_id and camera_label' 
			});
		}

		const query = `
			INSERT INTO cameras (cam_id, site_id, site_name, camera_label, created_at)
			VALUES ($1, $2, $3, $4, NOW())
			RETURNING cam_id, site_id, site_name, camera_label, created_at;
		`;

		const cam_id = randomUUID();
		const { rows } = await pool.query(query, [cam_id, site_id, site_name || null, camera_label]);

		return res.status(201).json(rows[0]);
	} catch (error) {
		console.error('[ERROR] Failed to create camera:', error.message);
		return res.status(500).json({ message: 'Failed to create camera' });
	}
};

/**
 * Register camera (edge agent first boot)
 * Returns only cam_id
 */
const registerCamera = async (req, res) => {
	try {
		const { site_id, site_name, camera_label } = req.body;

		if (!site_id || !camera_label) {
			return res.status(400).json({
				message: 'Missing required fields: site_id and camera_label'
			});
		}

		const query = `
			INSERT INTO cameras (cam_id, site_id, site_name, camera_label, created_at)
			VALUES ($1, $2, $3, $4, NOW())
			RETURNING cam_id;
		`;

		const cam_id = randomUUID();
		const { rows } = await pool.query(query, [cam_id, site_id, site_name || null, camera_label]);

		return res.status(201).json({ cam_id: rows[0].cam_id });
	} catch (error) {
		console.error('[ERROR] Failed to register camera:', error.message);
		return res.status(500).json({ message: 'Failed to register camera' });
	}
};

/**
 * Update camera
 */
const updateCamera = async (req, res) => {
	try {
		const { cam_id } = req.params;
		const { site_id, site_name, camera_label } = req.body;

		// Check if camera exists
		const checkQuery = 'SELECT cam_id FROM cameras WHERE cam_id = $1;';
		const checkResult = await pool.query(checkQuery, [cam_id]);

		if (!checkResult.rows.length) {
			return res.status(404).json({ message: 'Camera not found' });
		}

		// Build update query dynamically
		const updateFields = [];
		const values = [];
		let paramCount = 1;

		if (site_id !== undefined) {
			updateFields.push(`site_id = $${paramCount++}`);
			values.push(site_id);
		}
		if (site_name !== undefined) {
			updateFields.push(`site_name = $${paramCount++}`);
			values.push(site_name);
		}
		if (camera_label !== undefined) {
			updateFields.push(`camera_label = $${paramCount++}`);
			values.push(camera_label);
		}

		if (!updateFields.length) {
			return res.status(400).json({ message: 'No fields to update' });
		}

		values.push(cam_id); // Add cam_id as last parameter

		const updateQuery = `
			UPDATE cameras
			SET ${updateFields.join(', ')}
			WHERE cam_id = $${paramCount}
			RETURNING cam_id, site_id, site_name, camera_label, created_at;
		`;

		const { rows } = await pool.query(updateQuery, values);

		return res.status(200).json(rows[0]);
	} catch (error) {
		console.error('[ERROR] Failed to update camera:', error.message);
		return res.status(500).json({ message: 'Failed to update camera' });
	}
};

/**
 * Delete camera
 */
const deleteCamera = async (req, res) => {
	try {
		const { cam_id } = req.params;

		const query = 'DELETE FROM cameras WHERE cam_id = $1;';
		const result = await pool.query(query, [cam_id]);

		if (result.rowCount === 0) {
			return res.status(404).json({ message: 'Camera not found' });
		}

		return res.status(204).send();
	} catch (error) {
		console.error('[ERROR] Failed to delete camera:', error.message);
		return res.status(500).json({ message: 'Failed to delete camera' });
	}
};

module.exports = {
	getAllCameras,
	getCameraById,
	createCamera,
	registerCamera,
	updateCamera,
	deleteCamera
};
