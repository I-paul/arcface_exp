const express = require('express');
const router = express.Router();
const {
  getAllCameras,
  createCamera,
  updateCamera,
  deleteCamera,
} = require('../models/camera.model');

router.get('/', getAllCameras);
router.post('/', createCamera);
router.put('/:cam_id', updateCamera);
router.delete('/:cam_id', deleteCamera);

module.exports = router;
