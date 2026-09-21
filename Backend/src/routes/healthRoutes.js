const express = require('express');
const router = express.Router();
const { getSystemHealth } = require('../models/health.model');

router.get('/', getSystemHealth);

module.exports = router;
