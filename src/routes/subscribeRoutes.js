const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  subscribe,
  getSubscriberCount,
} = require('../controllers/subscribeController');

// Rate limiting for subscription to prevent spam
const subscribeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 subscriptions per windowMs
  message: { error: 'Too many subscriptions from this IP, please try again after an hour' },
});

// POST /api/subscribe
router.post('/', subscribeLimiter, subscribe);

// GET /api/subscribe/count
router.get('/count', getSubscriberCount);

module.exports = router;
