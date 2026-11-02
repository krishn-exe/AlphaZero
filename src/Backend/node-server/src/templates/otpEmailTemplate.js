/**
 * Generates responsive, branded HTML email for OTP verification.
 * 
 * @param {Object} options
 * @param {string} options.otp - 6-digit verification code
 * @param {number} [options.expiresMinutes=15] - Expiration duration in minutes
 * @param {boolean} [options.isExistingUser=false] - True if code is to access existing settings
 * @returns {string} HTML string
 */
function getOtpEmailHtml({ otp, expiresMinutes = 15, isExistingUser = false }) {
  const heading = isExistingUser ? 'Manage Your Alert Preferences' : 'Verify Your Email Address';
  const description = isExistingUser
    ? 'Use the verification code below to log in and manage your Bhu Rakshak alert settings.'
    : 'Thank you for subscribing to Bhu Rakshak Landslide Early Warnings. Enter the code below to complete your verification:';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bhu Rakshak Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f1f5f9; padding: 40px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 540px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06); border: 1px solid #e2e8f0;">
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #003b3b; padding: 28px 32px; text-align: left;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <div style="font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em;">
                      <span style="color: #22C55E; margin-right: 6px;">▲</span> Bhu Rakshak
                    </div>
                    <div style="font-size: 12px; color: #94a3b8; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em;">
                      Landslide Early Warning & Risk Monitoring • NER
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Content Body -->
          <tr>
            <td style="padding: 36px 32px 28px 32px;">
              <h1 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 12px 0;">
                ${heading}
              </h1>
              <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
                ${description}
              </p>

              <!-- OTP Code Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 24px 0;">
                <tr>
                  <td align="center" style="background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 20px 16px;">
                    <div style="font-size: 32px; font-weight: 800; letter-spacing: 0.35em; color: #003b3b; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; margin-left: 0.35em;">
                      ${otp}
                    </div>
                    <div style="font-size: 12px; color: #64748b; margin-top: 8px;">
                      Expires in <strong>${expiresMinutes} minutes</strong>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin: 0 0 8px 0;">
                🔒 If you did not request this verification code, no further action is required. This unverified request will automatically expire.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; font-size: 11px; line-height: 1.5; color: #94a3b8; text-align: center;">
              This is an automated safety alert notification from the Bhu Rakshak AI landslide monitoring network for the Northeast Region of India.<br/>
              Please do not reply directly to this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = {
  getOtpEmailHtml,
};
