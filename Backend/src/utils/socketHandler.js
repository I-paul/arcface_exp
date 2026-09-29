const axios = require('axios');
const WebSocket = require('ws');
const pool = require('../DB/config');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const ML_WS_URL = ML_SERVICE_URL.replace(/^http/, 'ws') + '/ws/recognize';

/**
 * Socket.IO handler for real-time face recognition
 * @param {Server} io - Socket.IO server instance
 */
module.exports = function socketHandler(io) {
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
          cam_id: camera_id,
          frame_id: mlResponse.frame_id || data.frame_id || null,
          faces: Array.isArray(mlResponse.faces) ? mlResponse.faces : [],
        };

        // Resolve names for each detected face (test recognition mode for webcam testing)
        if (Array.isArray(response.faces)) {
          await Promise.all(response.faces.map(async (face) => {
            const studentId = face.roll_number || face.person_id || null;
            if (!studentId) {
              face.name = face.name || 'Unknown';
              return;
            }

            try {
              const query = 'SELECT name, student_id FROM students WHERE student_id = $1 LIMIT 1';
              const { rows } = await pool.query(query, [String(studentId)]);
              if (rows.length) {
                const student = rows[0];
                face.name = student.name;
                face.student_id = student.student_id;
                console.log(`[Socket.IO] Test recognition: detected student ${student.student_id} (${student.name})`);
              } else {
                face.name = face.name || 'Unknown';
              }
            } catch (lookupErr) {
              console.error('[Socket.IO] Student lookup error:', lookupErr.message);
              face.name = face.name || 'Unknown';
            }
          }));
        }

        // Emit result back to the requesting client and broadcast
        socket.emit('recognition-result', response);
        io.emit('face-recognition-result', response);

      } catch (error) {
        console.error('[Socket.IO] Recognition error:', error.message);
        const errorMessage = error.response?.data?.detail || error.message || 'Recognition failed';
        const errPayload = {
          cam_id: data?.camera_id || 'unknown',
          error: errorMessage
        };
        socket.emit('recognition-error', errPayload);
      }
    });

    /**
     * Camera room subscription — clients join a room to receive only
     * frames and recognition results for the camera they're watching.
     */
    socket.on('watch-camera', (cam_id) => {
      // Leave all previous camera rooms
      for (const room of socket.rooms) {
        if (room.startsWith('cam:')) socket.leave(room);
      }
      if (cam_id) {
        socket.join(`cam:${cam_id}`);
        console.log(`[Socket.IO] ${socket.id} watching cam:${cam_id}`);
      }
    });

    /**
     * Session room subscription — clients join to receive live attendance updates.
     */
    socket.on('watch-session', (session_id) => {
      for (const room of socket.rooms) {
        if (room.startsWith('session:')) socket.leave(room);
      }
      if (session_id) {
        socket.join(`session:${session_id}`);
        console.log(`[Socket.IO] ${socket.id} watching session:${session_id}`);
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
