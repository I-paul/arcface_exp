const pool = require('../DB/config');

/**
 * Get all rooms
 * GET /api/rooms
 */
const getAllRooms = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT room_id, room_name, default_students, created_at FROM rooms ORDER BY room_name'
    );
    return res.status(200).json(rows);
  } catch (error) {
    console.error('[ERROR] Failed to fetch rooms:', error.message);
    return res.status(500).json({ message: 'Failed to fetch rooms' });
  }
};

/**
 * Create a new room
 * POST /api/rooms
 * Body: { room_name, default_students }
 */
const createRoom = async (req, res) => {
  try {
    const { room_name, default_students } = req.body;
    const defaultStudentsArr = default_students || [];

    if (!room_name) {
      return res.status(400).json({ message: 'room_name is required' });
    }

    const { rows } = await pool.query(
      'INSERT INTO rooms (room_id, room_name, default_students, created_at) VALUES (gen_random_uuid(), $1, $2, NOW()) RETURNING *',
      [room_name, defaultStudentsArr]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error('[ERROR] Failed to create room:', error.message);
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ message: 'Room name already exists' });
    }
    return res.status(500).json({ message: 'Failed to create room' });
  }
};

/**
 * Update a room
 * PUT /api/rooms/:room_id
 * Body: { room_name, default_students }
 */
const updateRoom = async (req, res) => {
  try {
    const { room_id } = req.params;
    const { room_name, default_students } = req.body;
    const defaultStudentsArr = default_students || [];

    if (!room_name) {
      return res.status(400).json({ message: 'room_name is required' });
    }

    const { rows } = await pool.query(
      'UPDATE rooms SET room_name = $1, default_students = $2 WHERE room_id = $3 RETURNING *',
      [room_name, defaultStudentsArr, room_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Room not found' });
    }

    return res.status(200).json(rows[0]);
  } catch (error) {
    console.error('[ERROR] Failed to update room:', error.message);
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Room name already exists' });
    }
    return res.status(500).json({ message: 'Failed to update room' });
  }
};

/**
 * Delete a room
 * DELETE /api/rooms/:room_id
 */
const deleteRoom = async (req, res) => {
  try {
    const { room_id } = req.params;

    const result = await pool.query(
      'DELETE FROM rooms WHERE room_id = $1',
      [room_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Room not found' });
    }

    return res.status(204).send();
  } catch (error) {
    console.error('[ERROR] Failed to delete room:', error.message);
    return res.status(500).json({ message: 'Failed to delete room' });
  }
};

module.exports = {
  getAllRooms,
  createRoom,
  updateRoom,
  deleteRoom,
};
