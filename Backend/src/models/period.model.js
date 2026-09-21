const pool = require('../DB/config');

/**
 * Get all periods
 * GET /api/periods
 */
const getAllPeriods = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM periods ORDER BY start_time'
    );
    return res.status(200).json(rows);
  } catch (error) {
    console.error('[ERROR] Failed to fetch periods:', error.message);
    return res.status(500).json({ message: 'Failed to fetch periods' });
  }
};

/**
 * Create a new period
 * POST /api/periods
 * Body: { period_name, start_time, end_time }
 * start_time and end_time format: "09:00"
 */
const createPeriod = async (req, res) => {
  try {
    const { period_name, start_time, end_time } = req.body;

    if (!period_name || !start_time || !end_time) {
      return res.status(400).json({ message: 'period_name, start_time, and end_time are required' });
    }

    // Validate time format HH:MM
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(start_time) || !timeRegex.test(end_time)) {
      return res.status(400).json({ message: 'Time format must be HH:MM (e.g., 09:00)' });
    }

    const { rows } = await pool.query(
      'INSERT INTO periods (period_id, period_name, start_time, end_time) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING *',
      [period_name, start_time, end_time]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error('[ERROR] Failed to create period:', error.message);
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ message: 'Period with this time range already exists' });
    }
    return res.status(500).json({ message: 'Failed to create period' });
  }
};

/**
 * Update a period
 * PUT /api/periods/:period_id
 * Body: { period_name, start_time, end_time }
 */
const updatePeriod = async (req, res) => {
  try {
    const { period_id } = req.params;
    const { period_name, start_time, end_time } = req.body;

    if (!period_name || !start_time || !end_time) {
      return res.status(400).json({ message: 'period_name, start_time, and end_time are required' });
    }

    // Validate time format
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(start_time) || !timeRegex.test(end_time)) {
      return res.status(400).json({ message: 'Time format must be HH:MM (e.g., 09:00)' });
    }

    const { rows } = await pool.query(
      'UPDATE periods SET period_name = $1, start_time = $2, end_time = $3 WHERE period_id = $4 RETURNING *',
      [period_name, start_time, end_time, period_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Period not found' });
    }

    return res.status(200).json(rows[0]);
  } catch (error) {
    console.error('[ERROR] Failed to update period:', error.message);
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Period with this time range already exists' });
    }
    return res.status(500).json({ message: 'Failed to update period' });
  }
};

/**
 * Delete a period
 * DELETE /api/periods/:period_id
 */
const deletePeriod = async (req, res) => {
  try {
    const { period_id } = req.params;

    // Check if any sessions reference this period
    const sessionCheck = await pool.query(
      'SELECT COUNT(*) as count FROM sessions WHERE period_id = $1',
      [period_id]
    );

    if (parseInt(sessionCheck.rows[0].count) > 0) {
      return res.status(409).json({ message: 'Cannot delete period that has sessions' });
    }

    const result = await pool.query(
      'DELETE FROM periods WHERE period_id = $1',
      [period_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Period not found' });
    }

    return res.status(204).send();
  } catch (error) {
    console.error('[ERROR] Failed to delete period:', error.message);
    return res.status(500).json({ message: 'Failed to delete period' });
  }
};

module.exports = {
  getAllPeriods,
  createPeriod,
  updatePeriod,
  deletePeriod,
};
