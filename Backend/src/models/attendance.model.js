const pool = require('../DB/config');

/**
 * Record an attendance event
 */
const recordAttendanceEvent = async (req, res) => {
	try {
		const { emp_id, cam_id, site_id, action, similarity_score, liveness_passed } = req.body;

		if (!emp_id || !cam_id || !action) {
			return res.status(400).json({ 
				message: 'Missing required fields: emp_id, cam_id, action' 
			});
		}

		const normalizedAction = action.toUpperCase();
		if (!['IN', 'OUT'].includes(normalizedAction)) {
			return res.status(400).json({ 
				message: 'Action must be IN or OUT' 
			});
		}

		let resolvedSiteId = site_id || null;
		if (!resolvedSiteId) {
			const siteQuery = 'SELECT site_id FROM cameras WHERE cam_id = $1';
			const siteResult = await pool.query(siteQuery, [cam_id]);
			if (!siteResult.rows.length || !siteResult.rows[0].site_id) {
				return res.status(400).json({
					message: 'site_id is required or must be resolvable from cam_id'
				});
			}
			resolvedSiteId = siteResult.rows[0].site_id;
		}

		const lastEventQuery = `
			SELECT site_id, action
			FROM attendance_events
			WHERE emp_id = $1
			ORDER BY event_time DESC
			LIMIT 1;
		`;
		const { rows: lastRows } = await pool.query(lastEventQuery, [emp_id]);
		const lastEvent = lastRows.length ? lastRows[0] : null;

		if (!lastEvent) {
			if (normalizedAction !== 'IN') {
				return res.status(400).json({
					message: 'First event must be IN'
				});
			}
		} else if (lastEvent.action === 'OUT') {
			if (normalizedAction !== 'IN') {
				return res.status(400).json({
					message: 'Last action is OUT. Next action must be IN'
				});
			}
		} else if (lastEvent.action === 'IN') {
			if (lastEvent.site_id === resolvedSiteId) {
				if (normalizedAction !== 'OUT') {
					return res.status(400).json({
						message: 'Last action is IN at this site. Next action must be OUT'
					});
				}
			} else {
				return res.status(400).json({
					message: 'Must record OUT at current site before IN at a different site'
				});
			}
		}

		const query = `
			INSERT INTO attendance_events (
				id, emp_id, cam_id, site_id, event_time, action, 
				similarity_score, liveness_passed, created_at
			)
			VALUES (
				gen_random_uuid(), $1, $2, $3, NOW(), $4, $5, $6, NOW()
			)
			RETURNING id, emp_id, cam_id, site_id, event_time, action, 
					  similarity_score, liveness_passed, created_at;
		`;

		const { rows } = await pool.query(query, [
			emp_id,
			cam_id,
			resolvedSiteId,
			normalizedAction,
			similarity_score || null,
			liveness_passed || null
		]);

		return res.status(201).json(rows[0]);
	} catch (error) {
		console.error('[ERROR] Failed to record attendance event:', error.message);
		return res.status(500).json({ message: 'Failed to record attendance event' });
	}
};

/**
 * Get attendance events with filters
 */
const getAttendanceEvents = async (req, res) => {
	try {
		const { emp_id, cam_id, site_id, action, start_date, end_date, limit = 100 } = req.query;

		let query = `
			SELECT id, emp_id, cam_id, site_id, event_time, action, 
				   similarity_score, liveness_passed, created_at
			FROM attendance_events
			WHERE 1=1
		`;

		const params = [];
		let paramCount = 1;

		if (emp_id) {
			query += ` AND emp_id = $${paramCount++}`;
			params.push(emp_id);
		}

		if (cam_id) {
			query += ` AND cam_id = $${paramCount++}`;
			params.push(cam_id);
		}

		if (site_id) {
			query += ` AND site_id = $${paramCount++}`;
			params.push(site_id);
		}

		if (action) {
			query += ` AND action = $${paramCount++}`;
			params.push(action.toUpperCase());
		}

		if (start_date) {
			query += ` AND event_time >= $${paramCount++}`;
			params.push(start_date);
		}

		if (end_date) {
			query += ` AND event_time <= $${paramCount++}`;
			params.push(end_date);
		}

		query += ` ORDER BY event_time DESC LIMIT $${paramCount}`;
		params.push(parseInt(limit));

		const { rows } = await pool.query(query, params);

		return res.status(200).json(rows);
	} catch (error) {
		console.error('[ERROR] Failed to fetch attendance events:', error.message);
		return res.status(500).json({ message: 'Failed to fetch attendance events' });
	}
};

/**
 * Get attendance events for an employee
 */
const getEmployeeAttendance = async (req, res) => {
	try {
		const { emp_id } = req.params;
		const { start_date, end_date, limit = 50 } = req.query;

		let query = `
			SELECT ae.id, ae.emp_id, ae.cam_id, ae.site_id, ae.event_time, 
				   ae.action, ae.similarity_score, ae.liveness_passed, ae.created_at,
				   e.name as employee_name,
				   c.camera_label, c.site_name
			FROM attendance_events ae
			JOIN employees e ON ae.emp_id = e.emp_id
			LEFT JOIN cameras c ON ae.cam_id = c.cam_id
			WHERE ae.emp_id = $1
		`;

		const params = [emp_id];
		let paramCount = 2;

		if (start_date) {
			query += ` AND ae.event_time >= $${paramCount++}`;
			params.push(start_date);
		}

		if (end_date) {
			query += ` AND ae.event_time <= $${paramCount++}`;
			params.push(end_date);
		}

		query += ` ORDER BY ae.event_time DESC LIMIT $${paramCount}`;
		params.push(parseInt(limit));

		const { rows } = await pool.query(query, params);

		if (!rows.length) {
			return res.status(404).json({ message: 'No attendance records found' });
		}

		return res.status(200).json(rows);
	} catch (error) {
		console.error('[ERROR] Failed to fetch employee attendance:', error.message);
		return res.status(500).json({ message: 'Failed to fetch attendance records' });
	}
};

/**
 * Get today's attendance summary
 */
const getTodayAttendanceSummary = async (req, res) => {
	try {
		const { site_id } = req.query;

		let query = `
			SELECT 
				ae.emp_id,
				e.name,
				c.camera_label,
				c.site_name,
				MIN(CASE WHEN ae.action = 'IN' THEN ae.event_time END) as check_in_time,
				MAX(CASE WHEN ae.action = 'OUT' THEN ae.event_time END) as check_out_time,
				COUNT(*) as event_count
			FROM attendance_events ae
			JOIN employees e ON ae.emp_id = e.emp_id
			LEFT JOIN cameras c ON ae.cam_id = c.cam_id
			WHERE DATE(ae.event_time) = CURRENT_DATE
		`;

		const params = [];
		let paramCount = 1;

		if (site_id) {
			query += ` AND ae.site_id = $${paramCount++}`;
			params.push(site_id);
		}

		query += ` GROUP BY ae.emp_id, e.name, c.camera_label, c.site_name
				   ORDER BY MIN(CASE WHEN ae.action = 'IN' THEN ae.event_time END) DESC`;

		const { rows } = await pool.query(query, params);

		return res.status(200).json(rows);
	} catch (error) {
		console.error('[ERROR] Failed to get attendance summary:', error.message);
		return res.status(500).json({ message: 'Failed to get attendance summary' });
	}
};

module.exports = {
	recordAttendanceEvent,
	getAttendanceEvents,
	getEmployeeAttendance,
	getTodayAttendanceSummary
};
