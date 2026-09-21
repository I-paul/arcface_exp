const pool = require('../DB/config');

/**
 * Get all cameras with room information
 * GET /api/cameras
 */
const getAllCameras = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.cam_id, c.room_id, r.room_name, c.rtsp_url, c.is_active, c.created_at
      FROM cameras c
      JOIN rooms r ON c.room_id = r.room_id
      ORDER BY r.room_name
    `);
    return res.status(200).json(rows);
  } catch (error) {
    console.error('[ERROR] Failed to fetch cameras:', error.message);
    return res.status(500).json({ message: 'Failed to fetch cameras' });
  }
};

/**
 * Create a new camera
 * POST /api/cameras
 * Body: { room_id, rtsp_url }
 */
const createCamera = async (req, res) => {
  try {
    const { room_id, rtsp_url } = req.body;

    if (!room_id || !rtsp_url) {
      return res.status(400).json({ message: 'room_id and rtsp_url are required' });
    }

    // Validate room exists
    const roomCheck = await pool.query(
      'SELECT room_id FROM rooms WHERE room_id = $1',
      [room_id]
    );

    if (roomCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if room already has a camera
    const cameraCheck = await pool.query(
      'SELECT cam_id FROM cameras WHERE room_id = $1',
      [room_id]
    );

    if (cameraCheck.rows.length > 0) {
      return res.status(409).json({ message: 'Room already has a camera' });
    }

    const { rows } = await pool.query(
      'INSERT INTO cameras (cam_id, room_id, rtsp_url, is_active, created_at) VALUES (gen_random_uuid(), $1, $2, TRUE, NOW()) RETURNING *',
      [room_id, rtsp_url]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error('[ERROR] Failed to create camera:', error.message);
    return res.status(500).json({ message: 'Failed to create camera' });
  }
};

/**
 * Update a camera
 * PUT /api/cameras/:cam_id
 * Body: { rtsp_url, is_active }
 */
const updateCamera = async (req, res) => {
  try {
    const { cam_id } = req.params;
    const { rtsp_url, is_active } = req.body;

    if (rtsp_url === undefined && is_active === undefined) {
      return res.status(400).json({ message: 'rtsp_url or is_active is required' });
    }

    const { rows } = await pool.query(
      'UPDATE cameras SET rtsp_url = $1, is_active = $2 WHERE cam_id = $3 RETURNING *',
      [rtsp_url, is_active, cam_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Camera not found' });
    }

    return res.status(200).json(rows[0]);
  } catch (error) {
    console.error('[ERROR] Failed to update camera:', error.message);
    return res.status(500).json({ message: 'Failed to update camera' });
  }
};

/**
 * Delete a camera
 * DELETE /api/cameras/:cam_id
 */
const deleteCamera = async (req, res) => {
  try {
    const { cam_id } = req.params;

    const result = await pool.query(
      'DELETE FROM cameras WHERE cam_id = $1',
      [cam_id]
    );

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
  createCamera,
  updateCamera,
  deleteCamera,
};
