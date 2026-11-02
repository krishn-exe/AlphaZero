const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const emailService = require('../services/emailService');

// Basic email regex for quick validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/subscribe
const subscribe = async (req, res) => {
  try {
    const { email, phone, districtId } = req.body;

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    let districtName = null;
    if (districtId) {
      const district = await prisma.district.findUnique({
        where: { id: parseInt(districtId, 10) },
      });
      if (!district) {
        return res.status(400).json({ error: 'Invalid districtId' });
      }
      districtName = district.name;
    }

    const subscriber = await prisma.subscriber.create({
      data: {
        email,
        phone: phone || null,
        districtId: districtId ? parseInt(districtId, 10) : null,
      },
    });

    // Fire and forget the confirmation email (don't await it so we return 201 faster)
    emailService.sendConfirmationEmail(email, districtName).catch((err) => {
      console.error('Non-fatal: Failed to send confirmation email', err);
    });

    res.status(201).json(subscriber);
  } catch (error) {
    console.error('Error creating subscriber:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/subscribe/count
const getSubscriberCount = async (req, res) => {
  try {
    const count = await prisma.subscriber.count();
    res.json({ count });
  } catch (error) {
    console.error('Error fetching subscriber count:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getSubscribers = async (req, res) => {
  try {
    const subscribers = await prisma.subscriber.findMany({
      orderBy: { subscribedAt: 'desc' },
      include: {
        district: {
          select: { name: true, state: true }
        }
      }
    });
    res.json(subscribers);
  } catch (error) {
    console.error('Error fetching subscribers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  subscribe,
  getSubscriberCount,
  getSubscribers,
};
