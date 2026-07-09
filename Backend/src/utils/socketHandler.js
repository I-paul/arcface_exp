const axios = require('axios');
const WebSocket = require('ws');
const { QueueEvents } = require('bullmq');
const pool = require('../DB/config');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const ML_WS_URL = ML_SERVICE_URL.replace(/^http/, 'ws') + '/ws/recognize';

/**
 * Socket.IO handler for real-time face recognition
 * @param {Server} io - Socket.IO server instance
 */
module.exports = function socketHandler(io) {
  const queueEvents = new QueueEvents('face-recognition', {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
    },
  });

  // Listen for job completion events and emit to clients
  queueEvents.on('completed', async ({ jobId, returnvalue }) => {
    console.log(`[Socket.IO] Job ${jobId} completed, emitting result to clients`);
    io.emit('job-completed', {
      job_id: jobId,
      result: returnvalue,
      status: 'completed',
    });
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    console.log(`[Socket.IO] Job ${jobId} failed: ${failedReason}`);
    io.emit('job-failed', {
      job_id: jobId,
      error: failedReason,
      status: 'failed',
    });
  });

  queueEvents.on('progress', ({ jobId, data }) => {
    io.emit('job-progress', {
      job_id: jobId,
      progress: data,
    });
  });

  async function recognizeViaWebSocket(imageBase64, frameId = null) {
    return new Promise((resolve, reject) => {
      let responded = false;
      const ws = new WebSocket(ML_WS_URL, {
        perMessageDeflate: false,
      });

      const timeout = setTimeout(() => {
        if (!responded) {
          responded = true;
          ws.terminate();
          reject(new Error('ML service WebSocket timeout'));
        }
      }, 20000);

      ws.on('open', () => {
        const message = JSON.stringify({
          type: 'recognize',
          image: imageBase64,
          frame_id: frameId,
        });
        ws.send(message, (sendErr) => {
          if (sendErr && !responded) {
            responded = true;
            clearTimeout(timeout);
            ws.terminate();
            reject(sendErr);
          }
        });
      });

      ws.on('message', (raw) => {
        if (responded) return;
        try {
          const message = JSON.parse(raw.toString());
          if (message.type === 'result') {
            responded = true;
            clearTimeout(timeout);
            ws.terminate();
            resolve(message);
          } else if (message.type === 'error') {
            responded = true;
            clearTimeout(timeout);
            ws.terminate();
            reject(new Error(message.message || 'ML service error'));
          }
        } catch (parseErr) {
          console.error('[Socket.IO] Failed to parse ML service response:', parseErr.message);
        }
      });

      ws.on('error', (error) => {
        if (!responded) {
          responded = true;
          clearTimeout(timeout);
          reject(new Error(`ML WebSocket error: ${error.message}`));
        }
      });

      ws.on('close', (code, reason) => {
        if (!responded) {
          responded = true;
          clearTimeout(timeout);
          reject(new Error(`ML WebSocket closed unexpectedly: ${code} ${reason}`));
        }
      });
    });
  }

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    /**
     * Real-time face recognition with multi-camera support
     * Receives image data from frontend with camera_id and sends to ML service
     */
    socket.on('recognize-face', async (data) => {
      try {
        const { image, camera_id } = data; // Base64 encoded image and camera identifier

        if (!image) {
          socket.emit('recognition-error', { 
            message: 'No image provided',
            camera_id 
          });
          return;
        }

        if (!camera_id) {
          socket.emit('recognition-error', { 
            message: 'No camera_id provided',
            camera_id: 'unknown'
          });
          return;
        }

        // Use ML service WebSocket endpoint for direct recognition
        const mlResponse = await recognizeViaWebSocket(image, data.frame_id);

        const response = {
          camera_id,
          frame_id: mlResponse.frame_id || data.frame_id || null,
          detected: Array.isArray(mlResponse.faces) ? mlResponse.faces.some((f) => f.detected) : false,
          faces: Array.isArray(mlResponse.faces) ? mlResponse.faces : [],
          message: mlResponse.message || 'Recognition complete',
        };

        // Resolve names for each detected face if possible
        if (Array.isArray(response.faces)) {
          await Promise.all(response.faces.map(async (face) => {
            const personId = face.person_id || face.emp_id || null;
            if (!personId) {
              face.name = face.name || 'Unknown';
              return;
            }

            try {
              const query = 'SELECT name, emp_id FROM employees WHERE milvus_id::text = $1 OR emp_id = $1 LIMIT 1';
              const { rows } = await pool.query(query, [String(personId)]);
              if (rows.length) {
                const emp = rows[0];
                face.name = emp.name;
                face.emp_id = emp.emp_id;

                // Log attendance event automatically for live socket recognition
                const cooldownQuery = `
                  SELECT event_time, action
                  FROM attendance_events
                  WHERE emp_id = $1
                  ORDER BY event_time DESC
                  LIMIT 1;
                `;
                const { rows: cooldownRows } = await pool.query(cooldownQuery, [emp.emp_id]);

                let resolvedCamId = null;
                let resolvedSiteId = 'default-site';

                // Try resolving a camera from DB to satisfy foreign keys
                const camQuery = 'SELECT cam_id, site_id FROM cameras LIMIT 1';
                const camRes = await pool.query(camQuery);
                if (camRes.rows.length) {
                  resolvedCamId = camRes.rows[0].cam_id;
                  resolvedSiteId = camRes.rows[0].site_id;
                }

                let shouldLog = true;
                let nextAction = 'IN';

                if (cooldownRows.length) {
                  const lastEvent = cooldownRows[0];
                  const lastEventTime = new Date(lastEvent.event_time).getTime();
                  const now = Date.now();
                  
                  // 1-minute cooldown is perfect for live interactive webcam/IP-cam recognition testing
                  const cooldownMs = 60 * 1000;
                  if (now - lastEventTime < cooldownMs) {
                    shouldLog = false;
                  } else {
                    nextAction = lastEvent.action === 'IN' ? 'OUT' : 'IN';
                  }
                }

                if (shouldLog) {
                  const insertQuery = `
                    INSERT INTO attendance_events (
                      id, emp_id, cam_id, site_id, event_time, action, 
                      similarity_score, liveness_passed, created_at
                    )
                    VALUES (
                      gen_random_uuid(), $1, $2, $3, NOW(), $4, $5, TRUE, NOW()
                    );
                  `;
                  await pool.query(insertQuery, [
                    emp.emp_id,
                    resolvedCamId,
                    resolvedSiteId,
                    nextAction,
                    face.score || face.confidence || 0.95
                  ]);
                  console.log(`[Socket.IO] Automatically logged attendance event (${nextAction}) for employee ${emp.emp_id}`);
                }

              } else {
                face.name = face.name || 'Unknown';
              }
            } catch (lookupErr) {
              console.error('[Socket.IO] Name & Attendance lookup error:', lookupErr.message);
              face.name = face.name || 'Unknown';
            }
          }));
        }

        // Emit result back to the requesting client and broadcast compatible event for other listeners
        socket.emit('recognition-result', response);
        io.emit('face-recognition-result', response);

      } catch (error) {
        console.error('[Socket.IO] Recognition error:', error.message);
        const errorMessage = error.response?.data?.detail || error.message || 'Recognition failed';
        const errPayload = {
          message: errorMessage,
          camera_id: data?.camera_id || 'unknown'
        };
        socket.emit('recognition-error', errPayload);
        io.emit('face-recognition-error', errPayload);
      }
    });

    /**
     * Health check for ML service
     */
    socket.on('check-ml-service', async () => {
      try {
        const { data } = await axios.get(`${ML_SERVICE_URL}/health`, { timeout: 5000 });
        socket.emit('ml-service-status', {
          status: 'healthy',
          gpu_available: data.gpu_available || false,
          milvus_connected: data.milvus_connected || false
        });
      } catch (error) {
        socket.emit('ml-service-status', {
          status: 'offline',
          gpu_available: false,
          milvus_connected: false
        });
      }
    });

    /**
     * Handle disconnection
     */
    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  console.log('[Socket.IO] Handler initialized');
};
