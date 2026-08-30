const express = require('express');
const router = express.Router();
const checkApiKey = require('../middleware/checkApiKey');
const rateLimit = require('express-rate-limit');
const {
  createIncident,
  getIncidents,
  getIncidentById,
  updateIncidentStatus,
} = require('../controllers/incidentController');

// Rate limiting for public incident submission (max 5 requests per 15 minutes per IP)
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many incidents reported from this IP, please try again after 15 minutes' },
});

// Public read endpoints
router.get('/', getIncidents);
router.get('/:id', getIncidentById);

// Public write endpoints (rate-limited to prevent spam)
router.post('/', submitLimiter, createIncident);

// Protected admin endpoints
router.patch('/:id/status', checkApiKey, updateIncidentStatus);

module.exports = router;
