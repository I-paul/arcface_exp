const express = require('express');
const router = express.Router();
const {
  getAllPeriods,
  createPeriod,
  updatePeriod,
  deletePeriod,
} = require('../models/period.model');

router.get('/', getAllPeriods);
router.post('/', createPeriod);
router.put('/:period_id', updatePeriod);
router.delete('/:period_id', deletePeriod);

module.exports = router;
