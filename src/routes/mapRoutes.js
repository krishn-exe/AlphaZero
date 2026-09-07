const express = require('express');
const router = express.Router();
const checkApiOrAdmin = require('../middleware/checkApiOrAdmin');
const checkAdminAuth = require('../middleware/checkAdminAuth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });


const {
  getNationalHeatmap,
  getTopRiskDistricts,
  getRiskStats,
  getDistrictDetail,
  updateDistrictRisk,
  getDistrictCities,
  updateCityRisk,
  triggerManualAlert,
  receiveNationalPredictions,
  getRiskData,
} = require('../controllers/mapController');

// Public reads — frontend hits these, no auth needed
router.get('/national', getNationalHeatmap);
router.get('/top-risk', getTopRiskDistricts);
router.get('/stats', getRiskStats);
router.get('/district/:id', getDistrictDetail);
router.get('/district/:id/cities', getDistrictCities);

// Writes — guarded by combined middleware (AIML pipeline or Admin dashboard)
router.post('/national', upload.single('data'), receiveNationalPredictions);
router.put('/district/:id/risk', checkApiOrAdmin, updateDistrictRisk);
router.put('/city/:id/risk', checkApiOrAdmin, updateCityRisk);

// Admin manual alert trigger (Dashboard only)
router.post('/alert', checkAdminAuth, triggerManualAlert);

module.exports = router;
