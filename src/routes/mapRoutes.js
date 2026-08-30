const express = require('express');
const router = express.Router();
const checkApiOrAdmin = require('../middleware/checkApiOrAdmin');
const {
  getNationalHeatmap,
  getTopRiskDistricts,
  getRiskStats,
  getDistrictDetail,
  updateDistrictRisk,
  getDistrictCities,
  updateCityRisk,
} = require('../controllers/mapController');

// Public reads — frontend hits these, no auth needed
router.get('/national', getNationalHeatmap);
router.get('/top-risk', getTopRiskDistricts);
router.get('/stats', getRiskStats);
router.get('/district/:id', getDistrictDetail);
router.get('/district/:id/cities', getDistrictCities);

// Writes — AIML pipeline or Admin dashboard, guarded by combined middleware
router.put('/district/:id/risk', checkApiOrAdmin, updateDistrictRisk);
router.put('/city/:id/risk', checkApiOrAdmin, updateCityRisk);

module.exports = router;
