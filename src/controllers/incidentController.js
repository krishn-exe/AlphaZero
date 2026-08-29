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

module.exports = {
  createIncident,
  getIncidents,
  getIncidentById,
  updateIncidentStatus,
};
