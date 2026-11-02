const prisma = require('../config/db');
const emailService = require('../services/emailService');

/**
 * Maps a numeric risk score to a severity band.
 * Keep this logic in one place so the frontend always gets a consistent
 * color-coding contract.
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
 * Lets Admin dashboard or authorized caller push an updated risk score.
 * Body: { riskScore: number (0-100, required), computedAt?: ISO string, rainfall?: number }
 */
async function updateDistrictRisk(req, res) {
  try {
    const { id } = req.params;
    const { riskScore, computedAt, rainfall } = req.body;

    if (typeof riskScore !== 'number' || riskScore < 0 || riskScore > 100) {
      return res.status(400).json({ error: 'riskScore must be a number between 0 and 100' });
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
        computedAt: computedAt ? new Date(computedAt) : undefined,
      },
    });

    // Alert if risk escalated to high or severe
    const isEscalation =
      (newRiskLevel === 'high' || newRiskLevel === 'severe') &&
      previousDistrict.riskLevel !== 'high' &&
      previousDistrict.riskLevel !== 'severe';

    if (isEscalation) {
      // Find all subscribers for this district OR all NER (districtId = null)
      const subscribers = await prisma.subscriber.findMany({
        where: {
          OR: [{ districtId: Number(id) }, { districtId: null }],
        },
        select: { email: true },
      });

      if (subscribers.length > 0) {
        const emails = subscribers.map((s) => s.email);
        emailService.sendRiskAlertEmail(emails, updated.name, newRiskLevel).catch((err) => {
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

async function getTopRiskDistricts(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 5, 50);
    const districts = await prisma.district.findMany({
      orderBy: { riskScore: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        state: true,
        riskScore: true,
        riskLevel: true,
        computedAt: true,
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
    grouped.forEach((g) => {
      stats[g.riskLevel] = g._count.riskLevel;
    });
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
      where: { id: parseInt(districtId, 10) },
    });

    if (!district) {
      return res.status(404).json({ error: 'District not found' });
    }

    const subscribers = await prisma.subscriber.findMany({
      where: {
        OR: [{ districtId: district.id }, { districtId: null }],
      },
      select: { email: true },
    });

    if (subscribers.length > 0) {
      const emails = subscribers.map((s) => s.email);
      emailService.sendRiskAlertEmail(emails, district.name, riskLevel).catch((err) => {
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
  getRiskLevel,
  triggerManualAlert,
};
