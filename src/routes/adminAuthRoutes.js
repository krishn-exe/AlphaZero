const express = require('express');
const router = express.Router();
const { login } = require('../controllers/adminAuthController');

// POST /api/admin/login
router.post('/login', login);

module.exports = router;
