const prisma = require('../config/db');

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
 * GET /api/map/top-risk
 * Top N highest risk districts across the region.
 */
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

/**
 * GET /api/map/stats
 * Aggregated counts of districts per risk level.
 */
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

module.exports = {
  getNationalHeatmap,
  getTopRiskDistricts,
  getRiskStats,
  getDistrictDetail,
  getRiskLevel,
};
