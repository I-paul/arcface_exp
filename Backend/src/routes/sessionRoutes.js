const express = require('express');
const router = express.Router();
const {
  bookSession,
  getTodaySessions,
  getSessionById,
  startSession,
  endSession,
  cancelSession,
  manualMarkAttendance,
} = require('../models/session.model');

router.get('/today', getTodaySessions);
router.get('/:session_id', getSessionById);
router.post('/', bookSession);
router.post('/:session_id/start', startSession);
router.post('/:session_id/end', endSession);
router.post('/:session_id/cancel', cancelSession);
router.put('/:session_id/attendance/:student_id', manualMarkAttendance);

module.exports = router;
