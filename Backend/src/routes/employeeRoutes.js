const express = require('express');
const {
	enrollEmployee,
	recognizeFace,
	getJobStatus,
	getAllEmployees,
	getEmployeeById,
	deleteEmployee,
} = require('../models/employee.model');
const {
	getAllCameras,
	getCameraById,
	createCamera,
	registerCamera,
	updateCamera,
	deleteCamera,
} = require('../models/camera.model');
const {
	recordAttendanceEvent,
	getAttendanceEvents,
	getEmployeeAttendance,
	getTodayAttendanceSummary,
} = require('../models/attendance.model');
const multer = require('multer');
const os = require('os');
const path = require('path');

// Use OS temp directory for temporary file storage
const tempDir = path.join(os.tmpdir(), 'face-recognition-temp');
const upload = multer({ dest: tempDir });

const router = express.Router();

// ====== CAMERA ROUTES ======
router.get('/cameras', getAllCameras);
router.get('/cameras/:cam_id', getCameraById);
router.post('/cameras', createCamera);
router.post('/register', registerCamera);
router.put('/cameras/:cam_id', updateCamera);
router.delete('/cameras/:cam_id', deleteCamera);

// ====== EMPLOYEE ROUTES ======
router.get('/employees', getAllEmployees);
router.get('/employees/:emp_id', getEmployeeById);
router.delete('/employees/:emp_id', deleteEmployee);

// ====== FACE RECOGNITION & ENROLLMENT ======
router.post('/enroll', upload.array('files', 5), enrollEmployee);
router.post('/recognize', upload.single('file'), recognizeFace);

// ====== JOB STATUS ======
router.get('/job/:jobId', getJobStatus);

// ====== ATTENDANCE EVENTS ======
router.post('/attendance', recordAttendanceEvent);
router.get('/attendance', getAttendanceEvents);
router.get('/attendance/employee/:emp_id', getEmployeeAttendance);
router.get('/attendance/summary/today', getTodayAttendanceSummary);

module.exports = router;