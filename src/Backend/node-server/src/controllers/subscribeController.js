const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const emailService = require('../services/emailService');
const {
  generateOtp,
  hashOtp,
  verifyOtp: checkOtpHash,
  generateSettingsToken,
} = require('../services/otpService');

// Basic email regex for quick validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Helper to resolve district by ID or name
 */
async function resolveDistrict(districtIdentifier) {
  if (!districtIdentifier) return null;
  const parsed = parseInt(districtIdentifier, 10);
  if (!isNaN(parsed)) {
    const district = await prisma.district.findUnique({ where: { id: parsed } });
    if (district) return district;
  }
  // Try finding by name (case-insensitive)
  if (typeof districtIdentifier === 'string' && districtIdentifier.trim()) {
    const trimmed = districtIdentifier.trim();
    let district = await prisma.district.findFirst({
      where: {
        name: {
          equals: trimmed,
          mode: 'insensitive',
        },
      },
    });
    if (!district) {
      district = await prisma.district.findFirst({
        where: {
          name: {
            contains: trimmed,
            mode: 'insensitive',
          },
        },
      });
    }
    if (district) return district;
  }
  return null;
}
function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7).trim();
}

/**
 * Helper to validate settings session
 */
async function authenticateSettingsSession(req) {
  const token = extractBearerToken(req);
  if (!token) return null;

  const subscriber = await prisma.subscriber.findFirst({
    where: {
      settingsToken: token,
      tokenExpiresAt: { gt: new Date() },
    },
    include: {
      district: true,
    },
  });

  return subscriber;
}

// POST /api/subscribe
const subscribe = async (req, res) => {
  try {
    const { email, districtId, district: districtInput, pushEnabled, fcmToken } = req.body;

    if (!email || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Verify district if provided (by ID or name)
    const resolvedDistrict = await resolveDistrict(districtId || districtInput);
    const parsedDistrictId = resolvedDistrict ? resolvedDistrict.id : null;

    const existingSubscriber = await prisma.subscriber.findUnique({
      where: { email: normalizedEmail },
    });

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15-minute expiry

    if (existingSubscriber) {
      if (!existingSubscriber.emailVerified) {
        // Edge case: User backed out of verification earlier or refilled the form before verification.
        // Overwrite unverified record with new preferences and fresh OTP.
        await prisma.subscriber.update({
          where: { id: existingSubscriber.id },
          data: {
            districtId: parsedDistrictId,
            pushEnabled: Boolean(pushEnabled),
            fcmToken: fcmToken || null,
            otpHash,
            otpExpiresAt,
          },
        });

        await emailService.sendOtpEmail(normalizedEmail, otp, false);

        return res.status(200).json({
          status: 'otp_sent',
          message: 'Verification code sent to your email.',
          email: normalizedEmail,
          isExisting: false,
        });
      } else {
        // User is already verified and exists in system.
        // Send OTP so they can access their user settings panel.
        await prisma.subscriber.update({
          where: { id: existingSubscriber.id },
          data: {
            otpHash,
            otpExpiresAt,
          },
        });

        await emailService.sendOtpEmail(normalizedEmail, otp, true);

        return res.status(200).json({
          status: 'existing_user_otp_sent',
          message: 'Verification code sent to access your alert settings.',
          email: normalizedEmail,
          isExisting: true,
        });
      }
    }

    // New subscriber creation (unverified)
    await prisma.subscriber.create({
      data: {
        email: normalizedEmail,
        emailVerified: false,
        districtId: parsedDistrictId,
        pushEnabled: Boolean(pushEnabled),
        fcmToken: fcmToken || null,
        otpHash,
        otpExpiresAt,
      },
    });

    await emailService.sendOtpEmail(normalizedEmail, otp, false);

    return res.status(201).json({
      status: 'otp_sent',
      message: 'Verification code sent to your email.',
      email: normalizedEmail,
      isExisting: false,
    });
  } catch (error) {
    console.error('[subscribeController] Error in subscribe:', error);
    return res.status(500).json({ error: 'Internal server error while processing subscription.' });
  }
};

// POST /api/subscribe/verify-otp
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and 6-digit OTP code are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const subscriber = await prisma.subscriber.findUnique({
      where: { email: normalizedEmail },
      include: { district: true },
    });

    if (!subscriber) {
      return res.status(404).json({ error: 'No subscription request found for this email.' });
    }

    if (!subscriber.otpHash || !subscriber.otpExpiresAt) {
      return res.status(400).json({ error: 'No pending verification code found. Please request a new code.' });
    }

    if (new Date() > subscriber.otpExpiresAt) {
      return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
    }

    const isValid = checkOtpHash(otp, subscriber.otpHash);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code. Please check and try again.' });
    }

    // Generate 1-hour session token for settings access
    const settingsToken = generateSettingsToken();
    const tokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const wasUnverified = !subscriber.emailVerified;

    const updated = await prisma.subscriber.update({
      where: { id: subscriber.id },
      data: {
        emailVerified: true,
        otpHash: null,
        otpExpiresAt: null,
        settingsToken,
        tokenExpiresAt,
      },
      include: {
        district: true,
      },
    });

    const districtName = updated.district ? updated.district.name : null;
    const isAizawl = districtName && /aizawl/i.test(districtName);

    // If new subscriber, send welcome email
    if (wasUnverified) {
      emailService.sendConfirmationEmail(updated.email, districtName, updated.pushEnabled).catch((err) => {
        console.error('[subscribeController] Non-fatal: Failed to send welcome email', err);
      });
    }

    // Hardcoded Alert: If user entered Aizawl as their district, immediately dispatch the urgent landslide warning
    if (isAizawl) {
      console.log(`[subscribeController] Aizawl district verified for ${updated.email}. Dispatching urgent landslide warning email...`);
      emailService.sendAizawlUrgentAlertEmail(updated.email).catch((err) => {
        console.error('[subscribeController] Non-fatal: Failed to send Aizawl urgent alert email', err);
      });
    }

    return res.status(200).json({
      status: 'verified',
      isNewUser: wasUnverified,
      settingsToken,
      subscriber: {
        email: updated.email,
        districtId: updated.districtId,
        districtName: updated.district ? updated.district.name : null,
        emailEnabled: updated.emailEnabled,
        pushEnabled: updated.pushEnabled,
      },
    });
  } catch (error) {
    console.error('[subscribeController] Error in verifyOtp:', error);
    return res.status(500).json({ error: 'Internal server error verifying code.' });
  }
};

// POST /api/subscribe/resend-otp
const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const subscriber = await prisma.subscriber.findUnique({
      where: { email: normalizedEmail },
    });

    if (!subscriber) {
      return res.status(404).json({ error: 'Subscriber record not found.' });
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.subscriber.update({
      where: { id: subscriber.id },
      data: {
        otpHash,
        otpExpiresAt,
      },
    });

    await emailService.sendOtpEmail(normalizedEmail, otp, subscriber.emailVerified);

    return res.status(200).json({
      status: 'otp_resent',
      message: 'A new verification code has been dispatched.',
      email: normalizedEmail,
    });
  } catch (error) {
    console.error('[subscribeController] Error in resendOtp:', error);
    return res.status(500).json({ error: 'Internal server error resending code.' });
  }
};

// GET /api/subscribe/settings
const getSettings = async (req, res) => {
  try {
    const subscriber = await authenticateSettingsSession(req);
    if (!subscriber) {
      return res.status(401).json({ error: 'Session expired or invalid authorization token.' });
    }

    return res.status(200).json({
      email: subscriber.email,
      districtId: subscriber.districtId,
      districtName: subscriber.district ? subscriber.district.name : null,
      emailEnabled: subscriber.emailEnabled,
      pushEnabled: subscriber.pushEnabled,
    });
  } catch (error) {
    console.error('[subscribeController] Error fetching settings:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

// PATCH /api/subscribe/settings
const updateSettings = async (req, res) => {
  try {
    const subscriber = await authenticateSettingsSession(req);
    if (!subscriber) {
      return res.status(401).json({ error: 'Session expired or invalid authorization token.' });
    }

    const { emailEnabled, pushEnabled, districtId, district: districtInput, fcmToken } = req.body;

    const dataToUpdate = {};

    if (typeof emailEnabled === 'boolean') {
      dataToUpdate.emailEnabled = emailEnabled;
    }

    if (typeof pushEnabled === 'boolean') {
      dataToUpdate.pushEnabled = pushEnabled;
      if (!pushEnabled) {
        dataToUpdate.fcmToken = null; // Clear token when push is turned off
      }
    }

    if (fcmToken !== undefined) {
      dataToUpdate.fcmToken = fcmToken;
    }

    const targetDistrictInput = districtId !== undefined ? districtId : districtInput;
    if (targetDistrictInput !== undefined) {
      if (targetDistrictInput === null || targetDistrictInput === '') {
        dataToUpdate.districtId = null;
      } else {
        const resolved = await resolveDistrict(targetDistrictInput);
        dataToUpdate.districtId = resolved ? resolved.id : null;
      }
    }

    const updated = await prisma.subscriber.update({
      where: { id: subscriber.id },
      data: dataToUpdate,
      include: { district: true },
    });

    const updatedDistrictName = updated.district ? updated.district.name : null;
    if (updatedDistrictName && /aizawl/i.test(updatedDistrictName)) {
      emailService.sendAizawlUrgentAlertEmail(updated.email).catch((err) => {
        console.error('[subscribeController] Non-fatal: Failed to send Aizawl alert on settings update', err);
      });
    }

    return res.status(200).json({
      message: 'Preferences successfully updated.',
      subscriber: {
        email: updated.email,
        districtId: updated.districtId,
        districtName: updated.district ? updated.district.name : null,
        emailEnabled: updated.emailEnabled,
        pushEnabled: updated.pushEnabled,
      },
    });
  } catch (error) {
    console.error('[subscribeController] Error updating settings:', error);
    return res.status(500).json({ error: 'Internal server error updating settings.' });
  }
};

// DELETE /api/subscribe/settings
const deleteAccount = async (req, res) => {
  try {
    const subscriber = await authenticateSettingsSession(req);
    if (!subscriber) {
      return res.status(401).json({ error: 'Session expired or invalid authorization token.' });
    }

    await prisma.subscriber.delete({
      where: { id: subscriber.id },
    });

    return res.status(200).json({
      message: 'Successfully unsubscribed and permanently deleted your alert account.',
    });
  } catch (error) {
    console.error('[subscribeController] Error deleting subscriber:', error);
    return res.status(500).json({ error: 'Internal server error deleting account.' });
  }
};

// GET /api/subscribe/count
const getSubscriberCount = async (req, res) => {
  try {
    // Only count active, verified subscribers
    const count = await prisma.subscriber.count({
      where: { emailVerified: true },
    });
    return res.json({ count });
  } catch (error) {
    console.error('[subscribeController] Error fetching subscriber count:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

module.exports = {
  subscribe,
  verifyOtp,
  resendOtp,
  getSettings,
  updateSettings,
  deleteAccount,
  getSubscriberCount,
};
