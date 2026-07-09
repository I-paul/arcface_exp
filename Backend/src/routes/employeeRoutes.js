const express = require('express');
const {
	enrollEmployee,
	reEnrollEmployee,
	recognizeFace,
	getJobStatus,
	getAllEmployees,
	getEmployeeById,
	deleteEmployee,
	getSystemHealth,
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
const uploadDisk = multer({ dest: tempDir });
const uploadMemory = multer({ storage: multer.memoryStorage() });

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
router.post('/enroll', uploadDisk.array('files', 5), enrollEmployee);
router.post('/re-enroll', uploadDisk.array('files', 20), reEnrollEmployee);
router.post('/recognize', uploadMemory.single('file'), recognizeFace);

// ====== JOB STATUS & HEALTH ======
router.get('/job/:jobId', getJobStatus);
router.get('/health', getSystemHealth);

// ====== ATTENDANCE EVENTS ======
router.post('/attendance', recordAttendanceEvent);
router.get('/attendance', getAttendanceEvents);
router.get('/attendance/employee/:emp_id', getEmployeeAttendance);
router.get('/attendance/summary/today', getTodayAttendanceSummary);

module.exports = router;