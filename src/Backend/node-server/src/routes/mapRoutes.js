const express = require('express');
const router = express.Router();
const multer = require('multer');

const {
  receivePredictions,
  triggerManualAggregation,
  getLatestFinalCsv,
  getSchedulerStatusEndpoint,
} = require('../controllers/predictionController');
const {
  getNationalHeatmap,
  getTopRiskDistricts,
  getRiskStats,
  getDistrictDetail,
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

// Aggregation operations & final output
router.post('/aggregate', triggerManualAggregation);
router.post('/aggregate-predictions', triggerManualAggregation);
router.get('/final', getLatestFinalCsv);
router.get('/final-predictions', getLatestFinalCsv);
router.get('/status', getSchedulerStatusEndpoint);

module.exports = router;
