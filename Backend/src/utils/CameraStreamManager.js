const WebSocket = require('ws');
const pool = require('../DB/config');
const { getSession } = require('./sessionCache');

const ML_WS_BASE = (process.env.ML_SERVICE_URL || 'http://localhost:8000')
  .replace(/^http/, 'ws') + '/ws/recognize';
const GRACE_MINUTES = parseInt(process.env.GRACE_PERIOD_MINUTES || '15');
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

class CameraStreamManager {
  constructor(io) {
    this.io = io;
    // Map<cam_id, { ws, status: 'connecting'|'open'|'closed', busy: bool, reconnectAttempts: int, currentFrameId }>
    this.connections = new Map();
    console.log('[CameraStreamManager] Initialized');
  }

  /**
   * Called by streamReader for every frame from Redis.
   * @param {string} cam_id - UUID from cameras table
   * @param {number} frame_id - Monotonic integer
   * @param {string} imageBase64 - JPEG base64 string
   */
  send(cam_id, frame_id, imageBase64) {
    const conn = this._getOrCreate(cam_id);

    // Backpressure: if already processing a frame, drop this one for ML
    if (conn.busy) return;
    if (conn.status !== 'open') return;

    conn.busy = true;
    conn.currentFrameId = frame_id;
    conn.ws.send(JSON.stringify({
      type: 'recognize',
      image: imageBase64,
      frame_id,
    }), (err) => {
      if (err) {
        console.error(`[CSM] Send error cam=${cam_id}: ${err.message}`);
        conn.busy = false;
      }
    });
  }

  _getOrCreate(cam_id) {
    if (!this.connections.has(cam_id)) {
      this._initConnection(cam_id);
    }
    return this.connections.get(cam_id);
  }

  _initConnection(cam_id) {
    const conn = {
      ws: null,
      status: 'connecting',
      busy: false,
      reconnectAttempts: 0,
      currentFrameId: null
    };
    this.connections.set(cam_id, conn);
    this._connect(cam_id, conn);
  }

  _connect(cam_id, conn) {
    // Pass cam_id as query param so ML service uses it as session key
    const url = `${ML_WS_BASE}?cam_id=${encodeURIComponent(cam_id)}`;
    const ws = new WebSocket(url, { perMessageDeflate: false });
    conn.ws = ws;
    conn.status = 'connecting';

    ws.on('open', () => {
      conn.status = 'open';
      conn.reconnectAttempts = 0;
      console.log(`[CSM] WS open for cam=${cam_id}`);
    });

    ws.on('message', (raw) => {
      conn.busy = false; // Ready for next frame
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.faces !== undefined) {
          this._handleResult(cam_id, msg.frame_id ?? conn.currentFrameId, msg.faces);
        }
      } catch (e) {
        console.error(`[CSM] Parse error cam=${cam_id}: ${e.message}`);
      }
    });

    ws.on('close', () => {
      conn.status = 'closed';
      conn.busy = false;
      this._scheduleReconnect(cam_id, conn);
    });

    ws.on('error', (err) => {
      console.error(`[CSM] WS error cam=${cam_id}: ${err.message}`);
      conn.busy = false;
    });
  }

  async _handleResult(cam_id, frame_id, faces) {
    // Get the current active session for this camera from the in-memory cache
    const sessionInfo = getSession(cam_id);

    // Step 1: Name lookup + emit face-recognition-result to frontend regardless
    const resolvedFaces = await Promise.all(faces.map(async (face) => {
      if (!face.roll_number) {
        return {
          bbox: face.bbox,
          student_id: null,
          name: 'Unknown',
          confidence: face.confidence
        };
      }

      try {
        const { rows } = await pool.query(
          'SELECT name FROM students WHERE student_id = $1',
          [face.roll_number]
        );
        return {
          bbox: face.bbox,
          student_id: face.roll_number,
          name: rows.length ? rows[0].name : 'Unknown',
          confidence: face.confidence,
        };
      } catch {
        return {
          bbox: face.bbox,
          student_id: face.roll_number,
          name: 'Unknown',
          confidence: face.confidence
        };
      }
    }));

    // Emit to frontend for canvas overlay (no imageBase64 — already sent via camera-frame)
    this.io.emit('face-recognition-result', {
      cam_id,
      frame_id,
      faces: resolvedFaces
    });

    // Step 2: Mark attendance if a session is active
    if (!sessionInfo) return;

    const { session_id, actual_start } = sessionInfo;
    const now = new Date();
    const graceDeadline = new Date(actual_start.getTime() + GRACE_MINUTES * 60 * 1000);
    const withinGrace = now <= graceDeadline;

    for (const face of resolvedFaces) {
      if (!face.student_id || !withinGrace) continue;

      // Only flip ABSENT → PRESENT; never overwrite manually_marked records
      try {
        const result = await pool.query(`
          UPDATE attendance_records
          SET status = 'PRESENT',
              detected_at = NOW(),
              similarity_score = $1,
              updated_at = NOW()
          WHERE session_id = $2
            AND student_id = $3
            AND status = 'ABSENT'
            AND manually_marked = FALSE
        `, [face.confidence, session_id, face.student_id]);

        if (result.rowCount > 0) {
          // Emit real-time attendance update so live roster updates
          this.io.emit('session-attendance-update', {
            session_id,
            student_id: face.student_id,
            name: face.name,
            status: 'PRESENT',
            detected_at: now.toISOString(),
          });

          console.log(`[CSM] Marked ${face.student_id} PRESENT in session ${session_id}`);
        }
      } catch (err) {
        console.error(`[CSM] Attendance mark error:`, err.message);
      }
    }
  }

  _scheduleReconnect(cam_id, conn) {
    conn.reconnectAttempts++;
    const delay = Math.min(
      RECONNECT_BASE_MS * (2 ** (conn.reconnectAttempts - 1)),
      RECONNECT_MAX_MS
    );
    console.log(`[CSM] Reconnecting cam=${cam_id} in ${delay}ms (attempt ${conn.reconnectAttempts})`);
    setTimeout(() => {
      if (this.connections.has(cam_id)) {
        this._connect(cam_id, this.connections.get(cam_id));
      }
    }, delay);
  }

  closeAll() {
    console.log('[CSM] Closing all WebSocket connections...');
    for (const [cam_id, conn] of this.connections) {
      if (conn.ws) {
        conn.ws.terminate();
      }
    }
    this.connections.clear();
  }
}

module.exports = CameraStreamManager;
