const express = require('express');
const {
	createEmployee,
	getAllEmployees,
	getEmployeeById,
	updateEmployee,
	deleteEmployee,
} = require('../models/employee.model');
<<<<<<< Updated upstream
=======
const multer = require('multer');

// Use memory storage for temporary files (auto-cleaned, no persistence needed)
const upload = multer({ 
	storage: multer.memoryStorage(),
	limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
});
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes

const router = express.Router();


// Employee routes
router.post('/employee', createEmployee);
router.get('/employee', getAllEmployees);
router.get('/employee/:id', getEmployeeById);
router.put('/employee/:id', updateEmployee);
router.delete('/employee/:id', deleteEmployee);

<<<<<<< Updated upstream
=======
// Face endpoints
// Use .fields() to handle both 'files' and 'name' in multipart form data
router.post('/enroll', upload.fields([{ name: 'files', maxCount: 5 }]), enrollFace);
router.post('/recognize', upload.single('file'), recognizeFace);

>>>>>>> Stashed changes
module.exports = router;