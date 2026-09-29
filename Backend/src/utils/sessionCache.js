const pool = require('../DB/config');

let cache = new Map(); // cam_id (UUID) → { session_id, actual_start (Date) }

/**
 * Refresh the active session cache from database
 */
async function refresh() {
  try {
    const { rows } = await pool.query(`
      SELECT s.session_id, s.actual_start, c.cam_id
      FROM sessions s
      JOIN rooms r ON s.room_id = r.room_id
      JOIN cameras c ON r.room_id = c.room_id
      WHERE s.status = 'ACTIVE'
        AND s.session_date = CURRENT_DATE::text
        AND c.is_active = TRUE
    `);

    const newCache = new Map();
    for (const row of rows) {
      if (!row.actual_start) continue;
      newCache.set(row.cam_id, {
        session_id: row.session_id,
        actual_start: new Date(row.actual_start),
      });
    }

    cache = newCache;
    console.log(`[SessionCache] Refreshed: ${cache.size} active sessions`);
  } catch (err) {
    console.error('[SessionCache] Refresh error:', err.message);
  }
}

/**
 * Get active session for a camera
 * @param {string} cam_id - Camera UUID
 * @returns {object|null} - { session_id, actual_start } or null
 */
function getSession(cam_id) {
  return cache.get(cam_id) || null;
}

/**
 * Start auto-refresh on an interval
 * @param {number} intervalMs - Refresh interval in milliseconds (default 30000)
 */
function startAutoRefresh(intervalMs = 30000) {
  refresh(); // Immediate first load
  setInterval(refresh, intervalMs);
  console.log(`[SessionCache] Auto-refresh started (interval: ${intervalMs}ms)`);
}

module.exports = { getSession, refresh, startAutoRefresh };
