const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  subscribe,
  verifyOtp,
  resendOtp,
  getSettings,
  updateSettings,
  deleteAccount,
  getSubscriberCount,
} = require('../controllers/subscribeController');

// Rate limiting for subscription and OTP dispatch
const subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Max 15 requests per 15 mins per IP
  message: { error: 'Too many subscription requests from this IP, please try again shortly.' },
});

// Strict rate limiting on OTP verification attempts (prevents brute forcing 6-digit codes)
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Max 20 attempts
  message: { error: 'Too many verification attempts. Please request a new code or try again later.' },
});

// POST /api/subscribe (Initiate subscription or settings OTP)
router.post('/', subscribeLimiter, subscribe);

// POST /api/subscribe/verify-otp (Verify 6-digit code)
router.post('/verify-otp', verifyLimiter, verifyOtp);

// POST /api/subscribe/resend-otp (Resend code)
router.post('/resend-otp', subscribeLimiter, resendOtp);

// Settings management (Protected by Bearer settingsToken)
router.get('/settings', getSettings);
router.patch('/settings', updateSettings);
router.delete('/settings', deleteAccount);

// GET /api/subscribe/count (Public, verified subscribers count)
router.get('/count', getSubscriberCount);

module.exports = router;
