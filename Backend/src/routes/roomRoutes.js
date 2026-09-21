const express = require('express');
const router = express.Router();
const {
  getAllRooms,
  createRoom,
  updateRoom,
  deleteRoom,
} = require('../models/room.model');

router.get('/', getAllRooms);
router.post('/', createRoom);
router.put('/:room_id', updateRoom);
router.delete('/:room_id', deleteRoom);

module.exports = router;
