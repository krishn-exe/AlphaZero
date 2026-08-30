const express = require('express');
const router = express.Router();
const checkApiKey = require('../middleware/checkApiKey');
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

// Writes — only AIML's pipeline should hit these, guarded by shared API key
router.put('/district/:id/risk', checkApiKey, updateDistrictRisk);
router.put('/city/:id/risk', checkApiKey, updateCityRisk);

module.exports = router;
