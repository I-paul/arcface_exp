const express = require('express');
const router = express.Router();
const {
  getAllStudents,
  getStudentById,
  createStudent,
  deleteStudent,
} = require('../models/student.model');

router.get('/', getAllStudents);
router.get('/:student_id', getStudentById);
router.post('/', createStudent);
router.delete('/:student_id', deleteStudent);

module.exports = router;
