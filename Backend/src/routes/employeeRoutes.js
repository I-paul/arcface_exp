const express = require('express');
const {
	createEmployee,
	getAllEmployees,
	getEmployeeById,
	updateEmployee,
	deleteEmployee,
	enrollFace,
	recognizeFace,
} = require('../models/employee.model');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const router = express.Router();


// Employee routes
router.post('/employee', createEmployee);
router.get('/employee', getAllEmployees);
router.get('/employee/:id', getEmployeeById);
router.put('/employee/:id', updateEmployee);
router.delete('/employee/:id', deleteEmployee);

// Face endpoints
router.post('/enroll', upload.array('files', 5), enrollFace);
router.post('/recognize', upload.single('file'), recognizeFace);

module.exports = router;