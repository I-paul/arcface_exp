const pool = require('../DB/config');
const sessionCache = require('../utils/sessionCache');

/**
 * Book a new session
 * POST /api/sessions
 * Body: { period_id, room_id, session_date, booked_by, student_ids: [] }
 */
const bookSession = async (req, res) => {
  const client = await pool.connect();

  try {
    const { period_id, room_id, session_date, booked_by, student_ids } = req.body;

    if (!period_id || !room_id || !session_date || !student_ids || !Array.isArray(student_ids)) {
      return res.status(400).json({ message: 'period_id, room_id, session_date, and student_ids array are required' });
    }

    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(session_date)) {
      return res.status(400).json({ message: 'session_date must be in YYYY-MM-DD format' });
    }

    await client.query('BEGIN');

    // Validate period exists
    const periodCheck = await client.query(
      'SELECT period_id FROM periods WHERE period_id = $1',
      [period_id]
    );
    if (periodCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Period not found' });
    }

    // Validate room exists
    const roomCheck = await client.query(
      'SELECT room_id FROM rooms WHERE room_id = $1',
      [room_id]
    );
    if (roomCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Room not found' });
    }

    // Validate room has an active camera
    const cameraCheck = await client.query(
      'SELECT cam_id FROM cameras WHERE room_id = $1 AND is_active = TRUE',
      [room_id]
    );
    if (cameraCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Room does not have an active camera' });
    }

    // Check for existing session
    const existingSession = await client.query(
      'SELECT session_id FROM sessions WHERE period_id = $1 AND room_id = $2 AND session_date = $3',
      [period_id, room_id, session_date]
    );
    if (existingSession.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Session already exists for this period, room, and date' });
    }

    // Create session
    const { rows: sessionRows } = await client.query(
      'INSERT INTO sessions (session_id, period_id, room_id, session_date, status, booked_by, created_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW()) RETURNING *',
      [period_id, room_id, session_date, 'SCHEDULED', booked_by]
    );

    const session = sessionRows[0];

    // Create attendance records for all students
    let recordCount = 0;
    for (const student_id of student_ids) {
      const result = await client.query(`
        INSERT INTO attendance_records (id, session_id, student_id, status, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, 'ABSENT', NOW(), NOW())
        ON CONFLICT (session_id, student_id) DO NOTHING
      `, [session.session_id, student_id]);
      recordCount += result.rowCount;
    }

    await client.query('COMMIT');

    console.log(`[SESSION] Booked session ${session.session_id} with ${recordCount} students`);

    return res.status(201).json({
      session,
      attendance_records_created: recordCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[ERROR] Failed to book session:', error.message);
    return res.status(500).json({ message: 'Failed to book session' });
  } finally {
    client.release();
  }
};

/**
 * Get today's sessions
 * GET /api/sessions/today
 */
const getTodaySessions = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        s.session_id, s.status, s.booked_by, s.actual_start, s.actual_end,
        p.period_name, p.start_time, p.end_time,
        r.room_name,
        COUNT(ar.id) as total_students,
        COUNT(CASE WHEN ar.status = 'PRESENT' THEN 1 END) as present_count
      FROM sessions s
      JOIN periods p ON s.period_id = p.period_id
      JOIN rooms r ON s.room_id = r.room_id
      LEFT JOIN attendance_records ar ON s.session_id = ar.session_id
      WHERE s.session_date = CURRENT_DATE::text
      GROUP BY s.session_id, p.period_name, p.start_time, p.end_time, r.room_name, s.status, s.booked_by, s.actual_start, s.actual_end
      ORDER BY p.start_time
    `);

    return res.status(200).json(rows);
  } catch (error) {
    console.error('[ERROR] Failed to fetch today\'s sessions:', error.message);
    return res.status(500).json({ message: 'Failed to fetch sessions' });
  }
};

/**
 * Get session by ID with full attendance roster
 * GET /api/sessions/:session_id
 */
const getSessionById = async (req, res) => {
  try {
    const { session_id } = req.params;

    // Get session details
    const sessionQuery = await pool.query(`
      SELECT
        s.session_id, s.status, s.booked_by, s.actual_start, s.actual_end, s.session_date,
        p.period_name, p.start_time, p.end_time,
        r.room_name, r.room_id
      FROM sessions s
      JOIN periods p ON s.period_id = p.period_id
      JOIN rooms r ON s.room_id = r.room_id
      WHERE s.session_id = $1
    `, [session_id]);

    if (sessionQuery.rows.length === 0) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const session = sessionQuery.rows[0];

    // Get attendance roster
    const rosterQuery = await pool.query(`
      SELECT
        ar.student_id, st.name, ar.status, ar.detected_at,
        ar.similarity_score, ar.manually_marked
      FROM attendance_records ar
      JOIN students st ON ar.student_id = st.student_id
      WHERE ar.session_id = $1
      ORDER BY st.name
    `, [session_id]);

    return res.status(200).json({
      session,
      roster: rosterQuery.rows
    });
  } catch (error) {
    console.error('[ERROR] Failed to fetch session:', error.message);
    return res.status(500).json({ message: 'Failed to fetch session' });
  }
};

/**
 * Start a session
 * POST /api/sessions/:session_id/start
 */
const startSession = async (req, res) => {
  try {
    const { session_id } = req.params;

    const { rows } = await pool.query(
      'UPDATE sessions SET status = $1, actual_start = NOW() WHERE session_id = $2 AND status = $3 RETURNING *',
      ['ACTIVE', session_id, 'SCHEDULED']
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: 'Session not found or already started/completed' });
    }

    // Immediately refresh session cache to avoid 30s delay
    await sessionCache.refresh();

    console.log(`[SESSION] Started session ${session_id}`);
    return res.status(200).json(rows[0]);
  } catch (error) {
    console.error('[ERROR] Failed to start session:', error.message);
    return res.status(500).json({ message: 'Failed to start session' });
  }
};

/**
 * End a session
 * POST /api/sessions/:session_id/end
 */
const endSession = async (req, res) => {
  try {
    const { session_id } = req.params;

    const { rows } = await pool.query(
      'UPDATE sessions SET status = $1, actual_end = NOW() WHERE session_id = $2 AND status = $3 RETURNING *',
      ['COMPLETED', session_id, 'ACTIVE']
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: 'Session not found or not active' });
    }

    // Immediately refresh session cache to stop ML routing
    await sessionCache.refresh();

    console.log(`[SESSION] Ended session ${session_id}`);
    return res.status(200).json(rows[0]);
  } catch (error) {
    console.error('[ERROR] Failed to end session:', error.message);
    return res.status(500).json({ message: 'Failed to end session' });
  }
};

/**
 * Cancel a session
 * POST /api/sessions/:session_id/cancel
 */
const cancelSession = async (req, res) => {
  try {
    const { session_id } = req.params;

    const { rows } = await pool.query(
      'UPDATE sessions SET status = $1 WHERE session_id = $2 AND status = $3 RETURNING *',
      ['CANCELLED', session_id, 'SCHEDULED']
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: 'Session not found or cannot be cancelled (only scheduled sessions can be cancelled)' });
    }

    console.log(`[SESSION] Cancelled session ${session_id}`);
    return res.status(200).json(rows[0]);
  } catch (error) {
    console.error('[ERROR] Failed to cancel session:', error.message);
    return res.status(500).json({ message: 'Failed to cancel session' });
  }
};

/**
 * Manually mark attendance
 * PUT /api/sessions/:session_id/attendance/:student_id
 * Body: { status: "PRESENT" | "ABSENT" }
 */
const manualMarkAttendance = async (req, res) => {
  try {
    const { session_id, student_id } = req.params;
    const { status } = req.body;

    if (!status || !['PRESENT', 'ABSENT'].includes(status)) {
      return res.status(400).json({ message: 'status must be PRESENT or ABSENT' });
    }

    const { rows } = await pool.query(
      'UPDATE attendance_records SET status = $1, manually_marked = TRUE, updated_at = NOW() WHERE session_id = $2 AND student_id = $3 RETURNING *',
      [status, session_id, student_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    console.log(`[SESSION] Manually marked ${student_id} as ${status} in session ${session_id}`);
    return res.status(200).json(rows[0]);
  } catch (error) {
    console.error('[ERROR] Failed to mark attendance:', error.message);
    return res.status(500).json({ message: 'Failed to mark attendance' });
  }
};

module.exports = {
  bookSession,
  getTodaySessions,
  getSessionById,
  startSession,
  endSession,
  cancelSession,
  manualMarkAttendance,
};
