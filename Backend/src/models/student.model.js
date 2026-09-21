const pool = require('../DB/config');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

/**
 * Get all students
 * GET /api/students?name=&enrolled=
 */
const getAllStudents = async (req, res) => {
  try {
    const { name, enrolled } = req.query;

    let query = 'SELECT student_id, name, milvus_id, enrolled_at FROM students WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (name) {
      query += ` AND name ILIKE $${paramCount++}`;
      params.push(`%${name}%`);
    }

    if (enrolled === 'false') {
      query += ' AND milvus_id IS NULL';
    } else if (enrolled === 'true') {
      query += ' AND milvus_id IS NOT NULL';
    }

    query += ' ORDER BY name';

    const { rows } = await pool.query(query, params);
    return res.status(200).json(rows);
  } catch (error) {
    console.error('[ERROR] Failed to fetch students:', error.message);
    return res.status(500).json({ message: 'Failed to fetch students' });
  }
};

/**
 * Get student by ID
 * GET /api/students/:student_id
 */
const getStudentById = async (req, res) => {
  try {
    const { student_id } = req.params;

    const { rows } = await pool.query(
      'SELECT student_id, name, milvus_id, enrolled_at FROM students WHERE student_id = $1',
      [student_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Student not found' });
    }

    return res.status(200).json(rows[0]);
  } catch (error) {
    console.error('[ERROR] Failed to fetch student:', error.message);
    return res.status(500).json({ message: 'Failed to fetch student' });
  }
};

/**
 * Create a new student (without face enrollment)
 * POST /api/students
 * Body: { student_id, name }
 */
const createStudent = async (req, res) => {
  try {
    const { student_id, name } = req.body;

    if (!student_id || !name) {
      return res.status(400).json({ message: 'student_id and name are required' });
    }

    // Validate student_id is 12-digit numeric string
    if (!/^\d{12}$/.test(student_id)) {
      return res.status(400).json({ message: 'student_id must be a 12-digit numeric string' });
    }

    const { rows } = await pool.query(
      'INSERT INTO students (student_id, name, milvus_id, enrolled_at) VALUES ($1, $2, NULL, NOW()) RETURNING student_id, name, milvus_id, enrolled_at',
      [student_id, name]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error('[ERROR] Failed to create student:', error.message);
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ message: 'Student ID already exists' });
    }
    return res.status(500).json({ message: 'Failed to create student' });
  }
};

/**
 * Delete a student
 * DELETE /api/students/:student_id
 */
const deleteStudent = async (req, res) => {
  try {
    const { student_id } = req.params;

    // Check if student has attendance records
    const { rows: attendanceCheck } = await pool.query(
      'SELECT COUNT(*) as count FROM attendance_records WHERE student_id = $1',
      [student_id]
    );

    if (parseInt(attendanceCheck[0].count) > 0) {
      return res.status(409).json({
        message: 'Cannot delete student with existing attendance records',
        error: 'Student has attendance history in one or more sessions'
      });
    }

    const result = await pool.query(
      'DELETE FROM students WHERE student_id = $1',
      [student_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Student not found' });
    }

    return res.status(204).send();
  } catch (error) {
    console.error('[ERROR] Failed to delete student:', error.message);
    return res.status(500).json({ message: 'Failed to delete student' });
  }
};

/**
 * Enroll student with face recognition
 * POST /api/enroll
 * Multipart form data: student_id, name, files (3-5 images)
 */
const enrollStudent = async (req, res) => {
  const filesToCleanup = (req.files || []).map((file) => file.path);

  try {
    const { student_id, name } = req.body;

    if (!student_id || !name) {
      return res.status(400).json({ message: 'student_id and name are required' });
    }

    // Validate student_id format
    if (!/^\d{12}$/.test(student_id)) {
      return res.status(400).json({ message: 'student_id must be a 12-digit numeric string' });
    }

    if (!req.files || req.files.length < 3) {
      return res.status(400).json({ message: 'At least 3 image files are required for enrollment' });
    }

    if (req.files.length > 5) {
      return res.status(400).json({ message: 'Maximum 5 images allowed for enrollment' });
    }

    // Call ML service for enrollment
    const form = new FormData();
    form.append('name', name);
    form.append('emp_id', student_id); // ML service uses emp_id field

    req.files.forEach((file) => {
      try {
        const buffer = fs.readFileSync(file.path);
        console.log(`[DEBUG] File ${file.originalname} size: ${buffer.length}`);
        if (buffer.length === 937 || buffer.length < 2000) {
          console.log(`[DEBUG] First 100 bytes of ${file.originalname}: ${buffer.slice(0, 100).toString('utf8')}`);
          console.log(`[DEBUG] Hex of first 20 bytes: ${buffer.slice(0, 20).toString('hex')}`);
        }
      } catch (err) {
        console.error('Debug read error:', err);
      }
      form.append('files', fs.createReadStream(file.path), file.originalname);
    });

    const { data: mlData } = await axios.post(`${ML_SERVICE_URL}/enroll`, form, {
      headers: form.getHeaders(),
      timeout: 30000,
    });

    if (!mlData || !mlData.success) {
      const errorMsg = mlData?.message || 'ML service enrollment failed';
      return res.status(400).json({ message: errorMsg });
    }

    const milvus_id = mlData.person_id;
    if (!milvus_id) {
      return res.status(500).json({ message: 'ML service did not return person_id' });
    }

    // Insert or update student in database
    const { rows } = await pool.query(`
      INSERT INTO students (student_id, name, milvus_id, enrolled_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (student_id)
      DO UPDATE SET name = $2, milvus_id = $3, enrolled_at = NOW()
      RETURNING student_id, name, milvus_id, enrolled_at
    `, [student_id, name, milvus_id]);

    console.log(`[ENROLL] Student ${student_id} (${name}) enrolled with milvus_id ${milvus_id}`);

    return res.status(201).json({
      success: true,
      message: `Student ${name} enrolled successfully`,
      student: rows[0]
    });
  } catch (error) {
    const status = error.response?.status || 500;
    const detail = error.response?.data || { message: 'Enrollment failed' };
    console.error('[ERROR] Enrollment error:', error.message);
    return res.status(status).json(detail);
  } finally {
    // Cleanup temporary files
    filesToCleanup.forEach((filePath) => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error(`[CLEANUP] Failed to delete ${filePath}:`, err.message);
      }
    });
  }
};

/**
 * Re-enroll student with new face images
 * POST /api/re-enroll
 * Multipart form data: student_id, files (3-20 images)
 */
const reEnrollStudent = async (req, res) => {
  const filesToCleanup = (req.files || []).map((file) => file.path);

  try {
    const { student_id } = req.body;

    if (!student_id) {
      return res.status(400).json({ message: 'student_id is required' });
    }

    if (!req.files || req.files.length < 3) {
      return res.status(400).json({ message: 'At least 3 image files are required for re-enrollment' });
    }

    if (req.files.length > 20) {
      return res.status(400).json({ message: 'Maximum 20 images allowed for re-enrollment' });
    }

    // Verify student exists
    const studentCheck = await pool.query(
      'SELECT name FROM students WHERE student_id = $1',
      [student_id]
    );

    if (studentCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const name = studentCheck.rows[0].name;

    // Call ML service for re-enrollment
    const form = new FormData();
    form.append('emp_id', student_id);

    req.files.forEach((file) => {
      form.append('files', fs.createReadStream(file.path), file.originalname);
    });

    const { data: mlData } = await axios.post(`${ML_SERVICE_URL}/re-enroll`, form, {
      headers: form.getHeaders(),
      timeout: 30000,
    });

    if (!mlData || !mlData.success) {
      const errorMsg = mlData?.message || 'ML service re-enrollment failed';
      return res.status(400).json({ message: errorMsg });
    }

    const milvus_id = mlData.person_id;
    if (!milvus_id) {
      return res.status(500).json({ message: 'ML service did not return person_id' });
    }

    // Update student milvus_id
    const { rows } = await pool.query(
      'UPDATE students SET milvus_id = $1, enrolled_at = NOW() WHERE student_id = $2 RETURNING student_id, name, milvus_id, enrolled_at',
      [milvus_id, student_id]
    );

    console.log(`[RE-ENROLL] Student ${student_id} (${name}) re-enrolled with milvus_id ${milvus_id}`);

    return res.status(200).json({
      success: true,
      message: `Student ${name} re-enrolled successfully`,
      student: rows[0]
    });
  } catch (error) {
    const status = error.response?.status || 500;
    const detail = error.response?.data || { message: 'Re-enrollment failed' };
    console.error('[ERROR] Re-enrollment error:', error.message);
    return res.status(status).json(detail);
  } finally {
    filesToCleanup.forEach((filePath) => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error(`[CLEANUP] Failed to delete ${filePath}:`, err.message);
      }
    });
  }
};

module.exports = {
  getAllStudents,
  getStudentById,
  createStudent,
  deleteStudent,
  enrollStudent,
  reEnrollStudent,
};
