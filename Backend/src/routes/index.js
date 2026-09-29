const express = require('express');
const multer = require('multer');
const os = require('os');
const path = require('path');

const { enrollStudent, reEnrollStudent } = require('../models/student.model');

// Use OS temp directory for temporary file storage
const tempDir = path.join(os.tmpdir(), 'face-recognition-temp');
const uploadDisk = multer({ dest: tempDir });

const router = express.Router();

// Mount sub-routers
router.use('/rooms', require('./roomRoutes'));
router.use('/cameras', require('./cameraRoutes'));
router.use('/periods', require('./periodRoutes'));
router.use('/students', require('./studentRoutes'));
router.use('/sessions', require('./sessionRoutes'));
router.use('/health', require('./healthRoutes'));

// Enrollment endpoints (use disk multer for temp files)
router.post('/enroll', uploadDisk.array('files', 5), enrollStudent);
router.post('/re-enroll', uploadDisk.array('files', 20), reEnrollStudent);

// Proxy snapshot from IP Webcam for CORS-free enrollment
// Restricted to private-network IPs to prevent SSRF
router.get('/proxy-snapshot', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Only http/https URLs are allowed' });
    }
    const host = parsed.hostname;
    const isPrivate = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|localhost$)/.test(host);
    if (!isPrivate) {
      return res.status(403).json({ error: 'Only private network addresses are allowed' });
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`IP Webcam returned status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.send(buffer);
  } catch (err) {
    if (err.code === 'ERR_INVALID_URL') {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
    console.error('Failed to proxy snapshot:', err.message);
    res.status(500).json({ error: 'Failed to fetch snapshot from IP Webcam' });
  }
});

module.exports = router;
