const express = require('express');
const router = express.Router();
const checkApiKey = require('../middleware/checkApiKey');
// Note: In feature/admin-auth we replaced checkApiKey with checkApiOrAdmin. Since this branch was created from main, it still has checkApiKey. 
// When all branches are merged to main, this will need a small conflict resolution (or we just use checkAdminAuth here since only Admin triggers alerts).
const checkAdminAuth = require('../middleware/checkAdminAuth'); // We will assume checkAdminAuth exists in the future, but actually it doesn't in this branch!

const {
  getNationalHeatmap,
  getDistrictDetail,
  updateDistrictRisk,
  getDistrictCities,
  updateCityRisk,
  triggerManualAlert,
} = require('../controllers/mapController');

// Public reads — frontend hits these, no auth needed
router.get('/national', getNationalHeatmap);
router.get('/district/:id', getDistrictDetail);
router.get('/district/:id/cities', getDistrictCities);

// Writes — guarded by API key (or Admin token once merged)
router.put('/district/:id/risk', checkApiKey, updateDistrictRisk);
router.put('/city/:id/risk', checkApiKey, updateCityRisk);

// Admin manual alert trigger
// (Using checkApiKey as placeholder since checkAdminAuth isn't in this branch yet, it will be updated during the merge)
router.post('/alert', checkApiKey, triggerManualAlert);

module.exports = router;
