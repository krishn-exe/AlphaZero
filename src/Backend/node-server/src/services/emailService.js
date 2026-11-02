const { getOtpEmailHtml } = require('../templates/otpEmailTemplate');
const { getWelcomeEmailHtml } = require('../templates/welcomeEmailTemplate');

let nodemailer = null;
let transporter = null;

/**
 * Returns a configured nodemailer transporter or null if credentials or package are missing.
 */
function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    return null;
  }

  if (!nodemailer) {
    try {
      nodemailer = require('nodemailer');
    } catch {
      console.warn('[emailService] nodemailer package not found. Run npm install in backend.');
      return null;
    }
  }

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  const config = host === 'smtp.gmail.com'
    ? {
        service: 'gmail',
        auth: { user, pass },
      }
    : {
        host,
        port,
        secure,
        auth: { user, pass },
      };

  transporter = nodemailer.createTransport(config);
  return transporter;
}

const FROM_EMAIL = process.env.SMTP_FROM || process.env.SMTP_USER || 'alerts@bhurakshak.in';
const BRAND_SENDER = `Bhu Rakshak Alerts <${FROM_EMAIL}>`;

/**
 * Sends a 6-digit OTP verification email using responsive HTML template via SMTP.
 * 
 * @param {string} email
 * @param {string} otp
 * @param {boolean} [isExistingUser=false]
 */
async function sendOtpEmail(email, otp, isExistingUser = false) {
  const mailer = getTransporter();

  if (!mailer) {
    console.warn(`[emailService] SMTP not configured. Simulated OTP for ${email}: ${otp}`);
    return { messageId: 'simulated-otp-id' };
  }

  try {
    const subject = isExistingUser
      ? `${otp} is your Bhu Rakshak alert login code`
      : `${otp} is your Bhu Rakshak verification code`;

    const html = getOtpEmailHtml({
      otp,
      expiresMinutes: 15,
      isExistingUser,
    });

    const info = await mailer.sendMail({
      from: BRAND_SENDER,
      to: email,
      subject,
      html,
    });

    console.log(`[emailService] OTP email sent to ${email}. Message ID: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error('[emailService] Failed to send OTP email via SMTP:', err);
    throw err;
  }
}

/**
 * Sends a branded welcome/confirmation email upon successful OTP verification via SMTP.
 * 
 * @param {string} email
 * @param {string} districtName
 * @param {boolean} pushEnabled
 */
async function sendConfirmationEmail(email, districtName, pushEnabled = false) {
  const mailer = getTransporter();

  if (!mailer) {
    console.warn(`[emailService] SMTP not configured. Skipping confirmation email to ${email}.`);
    return { messageId: 'simulated-welcome-id' };
  }

  try {
    const html = getWelcomeEmailHtml({
      email,
      districtName,
      pushEnabled,
    });

    const info = await mailer.sendMail({
      from: BRAND_SENDER,
      to: email,
      subject: '✓ Subscription Confirmed: Bhu Rakshak Landslide Alerts',
      html,
    });

    console.log(`[emailService] Confirmation email sent to ${email}. Message ID: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error('[emailService] Error sending confirmation email via SMTP:', err);
  }
}

/**
 * Sends a risk escalation alert to an array of emails via SMTP.
 */
async function sendRiskAlertEmail(emails, locationName, newRiskLevel) {
  const mailer = getTransporter();

  if (!mailer) {
    console.warn('[emailService] SMTP not configured. Skipping risk alert emails.');
    return;
  }

  if (!emails || emails.length === 0) return;

  try {
    const subjectPrefix = newRiskLevel === 'severe' ? '🚨 SEVERE ALERT' : '⚠️ HIGH RISK ALERT';

    const info = await mailer.sendMail({
      from: BRAND_SENDER,
      to: FROM_EMAIL,
      bcc: emails,
      subject: `${subjectPrefix}: Landslide Risk in ${locationName}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #003b3b; margin-top: 0;">Landslide Risk Update</h2>
          <p>The landslide risk level for <strong>${locationName}</strong> has been elevated to <strong><span style="color:#dc2626; text-transform:uppercase;">${newRiskLevel}</span></strong>.</p>
          <p>Please exercise caution and follow instructions from local disaster authorities.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #64748b; margin: 0;">You are receiving this because you subscribed to alerts on Bhu Rakshak.</p>
        </div>
      `,
    });

    console.log(`[emailService] Sent risk alert to ${emails.length} subscribers. Message ID: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error('[emailService] Failed to send risk alert email via SMTP:', err);
  }
}

module.exports = {
  sendOtpEmail,
  sendConfirmationEmail,
  sendRiskAlertEmail,
};
