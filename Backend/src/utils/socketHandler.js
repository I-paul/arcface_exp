const axios = require('axios');
const FormData = require('form-data');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const MIN_RECOGNITION_INTERVAL_MS = 250; // ~4 FPS throttle

/**
 * Socket.IO handler for real-time face recognition and enrollment
 * @param {Server} io - Socket.IO server instance
 */
module.exports = function socketHandler(io) {
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

        // Convert base64 to buffer
        const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        // Create form data for FastAPI
        const form = new FormData();
        form.append('file', buffer, {
          filename: 'frame.jpg',
          contentType: 'image/jpeg'
        });
        form.append('session_id', socket.id);

        // Send to ML service
        const { data: result } = await axios.post(
          `${ML_SERVICE_URL}/recognize`,
          form,
          {
            headers: form.getHeaders(),
            timeout: 10000
          }
        );

        // Emit result back to client with camera_id
        socket.emit('recognition-result', {
          camera_id,
          name: result.name || null,
          confidence: result.confidence || 0,
          is_recognized: result.is_recognized || false,
          message: result.message || 'Recognition complete'
        });

      } catch (error) {
        console.error('[Socket.IO] Recognition error:', error.message);
        const errorMessage = error.response?.data?.detail || 'Recognition failed';
        socket.emit('recognition-error', { 
          message: errorMessage,
          camera_id: data?.camera_id || 'unknown'
        });
      }
    });

    /**
     * Face enrollment - capture frame
     * Collects multiple frames for enrollment
     */
    socket.on('enroll-capture', async (data) => {
      try {
        const { image, name, frameIndex, totalFrames } = data;

        if (!image || !name) {
          socket.emit('enrollment-error', { message: 'Image and name are required' });
          return;
        }

        // Store frame temporarily in socket session
        if (!socket.enrollmentData) {
          socket.enrollmentData = {
            name: name,
            frames: []
          };
        }

        socket.enrollmentData.frames.push(image);

        // Emit progress
        socket.emit('enrollment-progress', {
          captured: socket.enrollmentData.frames.length,
          total: totalFrames || 5,
          message: `Captured frame ${frameIndex + 1}`
        });

      } catch (error) {
        console.error('[Socket.IO] Enrollment capture error:', error.message);
        socket.emit('enrollment-error', { message: 'Failed to capture frame' });
      }
    });

    /**
     * Submit enrollment after all frames captured
     */
    socket.on('enroll-submit', async (data) => {
      try {
        const { name, images } = data; // images is array of base64 encoded images

        if (!name || !images || images.length < 3) {
          socket.emit('enrollment-error', { 
            message: 'At least 3 images are required for enrollment' 
          });
          return;
        }

        // Create form data with multiple files
        const form = new FormData();
        form.append('name', name);

        images.forEach((image, index) => {
          const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          form.append('files', buffer, {
            filename: `capture-${index}.jpg`,
            contentType: 'image/jpeg'
          });
        });

        // Send to ML service
        const { data: result } = await axios.post(
          `${ML_SERVICE_URL}/enroll`,
          form,
          {
            headers: form.getHeaders(),
            timeout: 30000
          }
        );

        // Clear enrollment data
        socket.enrollmentData = null;

        // Emit success
        socket.emit('enrollment-success', {
          success: true,
          message: result.message || `Successfully enrolled ${name}`,
          person_id: result.person_id || null
        });

      } catch (error) {
        console.error('[Socket.IO] Enrollment submit error:', error.message);
        const errorMessage = error.response?.data?.detail || 'Enrollment failed';
        socket.emit('enrollment-error', { message: errorMessage });
        socket.enrollmentData = null;
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
      // Clean up enrollment data if any
      if (socket.enrollmentData) {
        socket.enrollmentData = null;
      }
    });
  });

  console.log('[Socket.IO] Handler initialized');
};
