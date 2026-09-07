const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  subscribe,
  getSubscriberCount,
  getSubscribers,
} = require('../controllers/subscribeController');

// Rate limiting for subscription to prevent spam
const subscribeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 subscriptions per windowMs
  message: { error: 'Too many subscriptions from this IP, please try again after an hour' },
});

const checkAdminAuth = require('../middleware/checkAdminAuth');

// POST /api/subscribe
router.post('/', subscribeLimiter, subscribe);

// GET /api/subscribe/count (Public, used by frontend footer/stats)
router.get('/count', getSubscriberCount);

// GET /api/subscribe (Admin only, lists all subscribers)
router.get('/', checkAdminAuth, getSubscribers);

module.exports = router;
