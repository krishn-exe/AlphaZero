const express = require('express');
const router = express.Router();
const multer = require('multer');

const checkApiOrAdmin = require('../middleware/checkApiOrAdmin');
const checkAdminAuth = require('../middleware/checkAdminAuth');
const { receivePredictions } = require('../controllers/predictionController');
const {
  getNationalHeatmap,
  getTopRiskDistricts,
  getRiskStats,
  getDistrictDetail,
  updateDistrictRisk,
  triggerManualAlert,
} = require('../controllers/mapController');

// Multer memory storage: uploads are validated in-memory before persisting
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// Public reads — frontend hits these
router.get('/national', getNationalHeatmap);
router.get('/top-risk', getTopRiskDistricts);
router.get('/stats', getRiskStats);
router.get('/district/:id', getDistrictDetail);

// AIML Predictions Upload — receives 3-column CSV on IST schedule
router.post('/national', upload.any(), receivePredictions);
router.post('/predictions', upload.any(), receivePredictions);

// Admin manual overrides & alerts
router.put('/district/:id/risk', checkApiOrAdmin, updateDistrictRisk);
router.post('/alert', checkAdminAuth, triggerManualAlert);

module.exports = router;
