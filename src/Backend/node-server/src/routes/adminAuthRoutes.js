const express = require('express');
const router = express.Router();
const { login } = require('../controllers/adminAuthController');
const { triggerManualAlert } = require('../controllers/mapController');
const checkAdminAuth = require('../middleware/checkAdminAuth');

// POST /api/admin/login
router.post('/login', login);

// POST /api/admin/alert (Alias for manual alert trigger from Admin Dashboard)
router.post('/alert', checkAdminAuth, triggerManualAlert);

module.exports = router;
