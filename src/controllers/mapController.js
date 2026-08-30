const prisma = require('../config/db');
const emailService = require('../services/emailService');

/**
 * Maps a numeric risk score to a severity band.
 * Keep this logic in one place so the frontend always gets a consistent
 * color-coding contract, regardless of how the score was computed, and
 * regardless of whether it's a District or a City row.
 */
function getRiskLevel(score) {
  if (score >= 75) return 'severe';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

/**
 * GET /api/map/national
 * Returns all districts as a GeoJSON FeatureCollection so the frontend
 * can drop it straight into Leaflet/Mapbox as a choropleth layer.
 * NOTE: every district here is DEMO data except Aizawl/Shillong's own
 * district-level row (their real data lives one level down, on their City).
 */
async function getNationalHeatmap(req, res) {
  try {
    const districts = await prisma.district.findMany();

    const features = districts.map((d) => ({
      type: 'Feature',
      geometry: JSON.parse(d.boundaryGeoJson),
      properties: {
        id: d.id,
        name: d.name,
        state: d.state,
        riskScore: d.riskScore,
        riskLevel: d.riskLevel,
        rainfall: d.rainfall,
        confidence: d.confidence,
        computedAt: d.computedAt,
        lastUpdated: d.lastUpdated,
      },
    }));

    res.json({
      type: 'FeatureCollection',
      features,
    });
  } catch (err) {
    console.error('getNationalHeatmap error:', err);
    res.status(500).json({ error: 'Failed to load heatmap data' });
  }
}

/**
 * GET /api/map/district/:id
 * Single district detail — used when a user clicks/zooms into one district.
 */
async function getDistrictDetail(req, res) {
  try {
    const { id } = req.params;
    const district = await prisma.district.findUnique({
      where: { id: Number(id) },
    });

    if (!district) {
      return res.status(404).json({ error: 'District not found' });
    }

    res.json({
      ...district,
      boundaryGeoJson: JSON.parse(district.boundaryGeoJson),
    });
  } catch (err) {
    console.error('getDistrictDetail error:', err);
    res.status(500).json({ error: 'Failed to load district data' });
  }
}

/**
 * PUT /api/map/district/:id/risk
 * Lets AIML push an updated risk score. Protected by checkApiKey middleware.
 * Body: { riskScore: number (0-100, required), confidence?: number (0-1), computedAt?: ISO string }
 */
async function updateDistrictRisk(req, res) {
  try {
    const { id } = req.params;
    const { riskScore, confidence, computedAt, rainfall } = req.body;

    if (typeof riskScore !== 'number' || riskScore < 0 || riskScore > 100) {
      return res.status(400).json({ error: 'riskScore must be a number between 0 and 100' });
    }
    if (confidence !== undefined && (typeof confidence !== 'number' || confidence < 0 || confidence > 1)) {
      return res.status(400).json({ error: 'confidence must be a number between 0 and 1' });
    }

    // Fetch previous risk level to detect escalation
    const previousDistrict = await prisma.district.findUnique({
      where: { id: Number(id) },
    });

    if (!previousDistrict) {
      return res.status(404).json({ error: 'District not found' });
    }

    const newRiskLevel = getRiskLevel(riskScore);

    const updated = await prisma.district.update({
      where: { id: Number(id) },
      data: {
        riskScore,
        riskLevel: newRiskLevel,
        rainfall: rainfall !== undefined ? rainfall : undefined,
        confidence: confidence ?? undefined,
        computedAt: computedAt ? new Date(computedAt) : undefined,
      },
    });

    // Stretch Goal: Send real-time alert if risk escalated to high or severe
    const isEscalation = (newRiskLevel === 'high' || newRiskLevel === 'severe') &&
                         (previousDistrict.riskLevel !== 'high' && previousDistrict.riskLevel !== 'severe');

    if (isEscalation) {
      // Find all subscribers for this district OR all NER (districtId = null)
      const subscribers = await prisma.subscriber.findMany({
        where: {
          OR: [
            { districtId: Number(id) },
            { districtId: null }
          ]
        },
        select: { email: true }
      });

      if (subscribers.length > 0) {
        const emails = subscribers.map(s => s.email);
        // Fire and forget
        emailService.sendRiskAlertEmail(emails, updated.name, newRiskLevel).catch(err => {
            console.error('Non-fatal: Failed to send risk alerts', err);
        });
      }
    }

    res.json(updated);
  } catch (err) {
    console.error('updateDistrictRisk error:', err);
    res.status(500).json({ error: 'Failed to update risk score' });
  }
}

/**
 * GET /api/map/district/:id/cities
 * Returns city-level detail under a district, as a GeoJSON FeatureCollection.
 * Most districts will return an empty features array — that's expected,
 * only Aizawl and Shillong currently have city rows. Frontend should just
 * stay at district view when this comes back empty.
 */
async function getDistrictCities(req, res) {
  try {
    const { id } = req.params;
    const cities = await prisma.city.findMany({
      where: { districtId: Number(id) },
    });

    const features = cities.map((c) => ({
      type: 'Feature',
      geometry: JSON.parse(c.boundaryGeoJson),
      properties: {
        id: c.id,
        districtId: c.districtId,
        name: c.name,
        riskScore: c.riskScore,
        riskLevel: c.riskLevel,
        rainfall: c.rainfall,
        confidence: c.confidence,
        computedAt: c.computedAt,
        lastUpdated: c.lastUpdated,
      },
    }));

    res.json({
      type: 'FeatureCollection',
      features,
    });
  } catch (err) {
    console.error('getDistrictCities error:', err);
    res.status(500).json({ error: 'Failed to load city data' });
  }
}

/**
 * PUT /api/map/city/:id/risk
 * Real entry point for AIML's DL model output on the two pilot cities.
 * Same contract as the district PUT. Protected by checkApiKey middleware.
 */
async function updateCityRisk(req, res) {
  try {
    const { id } = req.params;
    const { riskScore, confidence, computedAt, rainfall } = req.body;

    if (typeof riskScore !== 'number' || riskScore < 0 || riskScore > 100) {
      return res.status(400).json({ error: 'riskScore must be a number between 0 and 100' });
    }
    if (confidence !== undefined && (typeof confidence !== 'number' || confidence < 0 || confidence > 1)) {
      return res.status(400).json({ error: 'confidence must be a number between 0 and 1' });
    }

    const previousCity = await prisma.city.findUnique({
      where: { id: Number(id) },
      include: { district: true } // Need district name for the email
    });

    if (!previousCity) {
      return res.status(404).json({ error: 'City not found' });
    }

    const newRiskLevel = getRiskLevel(riskScore);

    const updated = await prisma.city.update({
      where: { id: Number(id) },
      data: {
        riskScore,
        riskLevel: newRiskLevel,
        rainfall: rainfall !== undefined ? rainfall : undefined,
        confidence: confidence ?? undefined,
        computedAt: computedAt ? new Date(computedAt) : undefined,
      },
    });

    // Check escalation
    const isEscalation = (newRiskLevel === 'high' || newRiskLevel === 'severe') &&
                         (previousCity.riskLevel !== 'high' && previousCity.riskLevel !== 'severe');

    if (isEscalation) {
      // Find all subscribers for this city's parent district OR all NER (districtId = null)
      const subscribers = await prisma.subscriber.findMany({
        where: {
          OR: [
            { districtId: previousCity.districtId },
            { districtId: null }
          ]
        },
        select: { email: true }
      });

      if (subscribers.length > 0) {
        const emails = subscribers.map(s => s.email);
        const locationName = `${updated.name} (in ${previousCity.district.name} district)`;
        // Fire and forget
        emailService.sendRiskAlertEmail(emails, locationName, newRiskLevel).catch(err => {
            console.error('Non-fatal: Failed to send risk alerts', err);
        });
      }
    }

    res.json(updated);
  } catch (err) {
    console.error('updateCityRisk error:', err);
    res.status(500).json({ error: 'Failed to update city risk score' });
  }
}

async function getTopRiskDistricts(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 5, 50);
    const districts = await prisma.district.findMany({
      orderBy: { riskScore: 'desc' },
      take: limit,
      select: {
        id: true, name: true, state: true,
        riskScore: true, riskLevel: true, computedAt: true,
      },
    });
    res.json(districts);
  } catch (err) {
    console.error('getTopRiskDistricts error:', err);
    res.status(500).json({ error: 'Failed to load top-risk districts' });
  }
}

async function getRiskStats(req, res) {
  try {
    const grouped = await prisma.district.groupBy({
      by: ['riskLevel'],
      _count: { riskLevel: true },
    });

    const stats = { low: 0, medium: 0, high: 0, severe: 0 };
    grouped.forEach(g => { stats[g.riskLevel] = g._count.riskLevel; });
    stats.total = stats.low + stats.medium + stats.high + stats.severe;

    res.json(stats);
  } catch (err) {
    console.error('getRiskStats error:', err);
    res.status(500).json({ error: 'Failed to load risk stats' });
  }
}

async function triggerManualAlert(req, res) {
  try {
    const { districtId, riskLevel } = req.body;
    if (!districtId || !riskLevel) {
      return res.status(400).json({ error: 'districtId and riskLevel are required' });
    }

    const district = await prisma.district.findUnique({
      where: { id: parseInt(districtId, 10) }
    });

    if (!district) {
      return res.status(404).json({ error: 'District not found' });
    }

    const subscribers = await prisma.subscriber.findMany({
      where: {
        OR: [
          { districtId: district.id },
          { districtId: null }
        ]
      },
      select: { email: true }
    });

    if (subscribers.length > 0) {
      const emails = subscribers.map(s => s.email);
      emailService.sendRiskAlertEmail(emails, district.name, riskLevel).catch(err => {
        console.error('Non-fatal: Failed to send manual risk alerts', err);
      });
    }

    res.json({ success: true, alertedCount: subscribers.length });
  } catch (err) {
    console.error('triggerManualAlert error:', err);
    res.status(500).json({ error: 'Failed to trigger manual alert' });
  }
}

module.exports = {
  getNationalHeatmap,
  getTopRiskDistricts,
  getRiskStats,
  getDistrictDetail,
  updateDistrictRisk,
  getDistrictCities,
  updateCityRisk,
  getRiskLevel,
  triggerManualAlert,
};
