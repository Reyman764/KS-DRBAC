const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { generalDashboard } = require('../controllers/protectedController');

router.get('/dashboard', protect, generalDashboard);

module.exports = router;
