const crypto = require('crypto');

/**
 * Generates a cryptographically secure 6-digit numeric OTP.
 * @returns {string} 6-digit OTP string
 */
function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Hashes an OTP using SHA-256 for secure storage in the database.
 * @param {string} otp 
 * @returns {string} Hex-encoded SHA-256 digest
 */
function hashOtp(otp) {
  if (!otp) return null;
  return crypto.createHash('sha256').update(String(otp).trim()).digest('hex');
}

/**
 * Verifies if an input OTP matches the stored hash in timing-safe fashion.
 * @param {string} inputOtp 
 * @param {string} storedHash 
 * @returns {boolean} True if matched
 */
function verifyOtp(inputOtp, storedHash) {
  if (!inputOtp || !storedHash) return false;
  const inputHash = hashOtp(inputOtp);
  try {
    const bufA = Buffer.from(inputHash, 'hex');
    const bufB = Buffer.from(storedHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Generates a 32-byte secure random hex token for temporary settings access.
 * @returns {string} 64-char hex string
 */
function generateSettingsToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  generateOtp,
  hashOtp,
  verifyOtp,
  generateSettingsToken,
};
