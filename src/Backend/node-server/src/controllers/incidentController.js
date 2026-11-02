const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// POST /api/incidents
const createIncident = async (req, res) => {
  try {
    const { description, category, latitude, longitude } = req.body;

    if (!description || !category || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Missing required fields: description, category, latitude, longitude' });
    }

    const incident = await prisma.incident.create({
      data: {
        description,
        category,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      },
    });

    res.status(201).json(incident);
  } catch (error) {
    console.error('Error creating incident:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/incidents
const getIncidents = async (req, res) => {
  try {
    const incidents = await prisma.incident.findMany();

    // Format as GeoJSON FeatureCollection to match heatmap
    const featureCollection = {
      type: 'FeatureCollection',
      features: incidents.map((inc) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [inc.longitude, inc.latitude], // GeoJSON is [lng, lat]
        },
        properties: {
          id: inc.id,
          description: inc.description,
          category: inc.category,
          status: inc.status,
          reportedAt: inc.reportedAt,
          photoUrl: inc.photoUrl,
        },
      })),
    };

    res.json(featureCollection);
  } catch (error) {
    console.error('Error fetching incidents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/incidents/:id
const getIncidentById = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid incident ID' });
    }

    const incident = await prisma.incident.findUnique({
      where: { id },
    });

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    res.json(incident);
  } catch (error) {
    console.error('Error fetching incident:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// PATCH /api/incidents/:id/status
const updateIncidentStatus = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid incident ID' });
    }

    const { status } = req.body;
    if (!status || !['pending', 'verified', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be pending, verified, or resolved.' });
    }

    const incident = await prisma.incident.update({
      where: { id },
      data: { status },
    });

    res.json(incident);
  } catch (error) {
    console.error('Error updating incident status:', error);
    if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Incident not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = deg => (deg * Math.PI) / 180;
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GET /api/incidents/recent
const getRecentIncidents = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 100);
    const incidents = await prisma.incident.findMany({
      orderBy: { reportedAt: 'desc' },
      take: limit,
    });
    res.json(incidents);
  } catch (err) {
    console.error('getRecentIncidents error:', err);
    res.status(500).json({ error: 'Failed to load recent incidents' });
  }
};

// GET /api/incidents/nearby
const getNearbyIncidents = async (req, res) => {
  try {
    const { lat, lng, radiusKm } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng query params are required' });
    }
    const radius = Number(radiusKm) || 10;
    const userLat = Number(lat);
    const userLng = Number(lng);

    const allIncidents = await prisma.incident.findMany();
    const nearby = allIncidents
      .map(inc => ({
        ...inc,
        distanceKm: distanceKm(userLat, userLng, inc.latitude, inc.longitude),
      }))
      .filter(inc => inc.distanceKm <= radius)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    res.json(nearby);
  } catch (err) {
    console.error('getNearbyIncidents error:', err);
    res.status(500).json({ error: 'Failed to load nearby incidents' });
  }
};

module.exports = {
  createIncident,
  getIncidents,
  getIncidentById,
  updateIncidentStatus,
  getRecentIncidents,
  getNearbyIncidents,
};
