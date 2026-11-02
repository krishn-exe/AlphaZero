const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

let cleanupInterval = null;

/**
 * Deletes unverified subscribers that have exceeded their 15-minute verification window,
 * and clears expired temporary settings session tokens.
 * @returns {Promise<number>} Count of purged unverified records
 */
async function purgeExpiredUnverifiedSubscribers() {
  try {
    const now = new Date();

    // Delete unverified subscribers whose OTP expiration has passed
    const result = await prisma.subscriber.deleteMany({
      where: {
        emailVerified: false,
        OR: [
          { otpExpiresAt: { lt: now } },
          { otpExpiresAt: null },
        ],
      },
    });

    // Clear expired settings session tokens for verified users
    await prisma.subscriber.updateMany({
      where: {
        tokenExpiresAt: { lt: now },
      },
      data: {
        settingsToken: null,
        tokenExpiresAt: null,
      },
    });

    if (result.count > 0) {
      console.log(`[cleanupScheduler] Purged ${result.count} expired unverified subscriber(s).`);
    }

    return result.count;
  } catch (error) {
    console.error('[cleanupScheduler] Error purging expired subscribers:', error);
    return 0;
  }
}

/**
 * Starts the background cleanup scheduler. Runs every 2 minutes.
 */
function startCleanupScheduler(intervalMs = 2 * 60 * 1000) {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }

  // Run initial pass on startup
  purgeExpiredUnverifiedSubscribers().catch((err) => {
    console.error('[cleanupScheduler] Initial cleanup run failed:', err);
  });

  cleanupInterval = setInterval(() => {
    purgeExpiredUnverifiedSubscribers().catch((err) => {
      console.error('[cleanupScheduler] Periodic cleanup run failed:', err);
    });
  }, intervalMs);

  console.log(`[cleanupScheduler] Started: running every ${Math.round(intervalMs / 1000)} seconds.`);
}

/**
 * Stops the cleanup scheduler.
 */
function stopCleanupScheduler() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('[cleanupScheduler] Stopped.');
  }
}

module.exports = {
  purgeExpiredUnverifiedSubscribers,
  startCleanupScheduler,
  stopCleanupScheduler,
};
