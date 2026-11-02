/**
 * Generates responsive, branded HTML email for subscription confirmation.
 * 
 * @param {Object} options
 * @param {string} options.email - Subscriber's email address
 * @param {string} [options.districtName] - Monitored district name, or null for all NER
 * @param {boolean} [options.pushEnabled=false] - Whether browser push is activated
 * @returns {string} HTML string
 */
function getWelcomeEmailHtml({ email, districtName, pushEnabled = false }) {
  const scope = districtName ? `the <strong>${districtName}</strong> district` : `all Northeast India (NER) districts`;
  const pushBadge = pushEnabled
    ? '<span style="color: #16a34a; font-weight: 600;">● Active</span>'
    : '<span style="color: #64748b;">Not configured</span>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscription Confirmed - Bhu Rakshak</title>
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
              <div style="font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em;">
                <span style="color: #22C55E; margin-right: 6px;">▲</span> Bhu Rakshak
              </div>
              <div style="font-size: 12px; color: #94a3b8; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em;">
                Landslide Early Warning & Risk Monitoring • NER
              </div>
            </td>
          </tr>
          
          <!-- Content Body -->
          <tr>
            <td style="padding: 36px 32px 28px 32px;">
              <div style="display: inline-block; background-color: #dcfce7; color: #15803d; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">
                ✓ Verified & Subscribed
              </div>
              <h1 style="font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 12px 0;">
                You are now subscribed to Landslide Alerts
              </h1>
              <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
                You will receive real-time notifications for ${scope} whenever our AI predictive model detects heightened or severe landslide risk.
              </p>

              <!-- Preference Summary Table -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin: 0 0 24px 0;">
                <tr>
                  <td style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; font-weight: 500;">
                    Subscriber Email
                  </td>
                  <td style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a; font-weight: 600; text-align: right;">
                    ${email}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; font-weight: 500;">
                    Monitored Region
                  </td>
                  <td style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a; font-weight: 600; text-align: right;">
                    ${districtName || 'All NER Districts'}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; font-weight: 500;">
                    Email Alerts
                  </td>
                  <td style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-align: right;">
                    <span style="color: #16a34a; font-weight: 600;">● Active</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 14px 18px; font-size: 13px; color: #64748b; font-weight: 500;">
                    Web Push Notifications
                  </td>
                  <td style="padding: 14px 18px; font-size: 13px; text-align: right;">
                    ${pushBadge}
                  </td>
                </tr>
              </table>

              <!-- Information box -->
              <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 14px 16px; border-radius: 4px; font-size: 12px; line-height: 1.5; color: #1e40af; margin-bottom: 20px;">
                <strong>How it works:</strong> Our predictive models recalculate terrain and rainfall saturation every 4 hours (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 IST). Alerts are automatically dispatched when risk thresholds are exceeded.
              </div>

              <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin: 0;">
                You can adjust your notifications, switch your monitored district, or unsubscribe at any time by entering your email on the Bhu Rakshak alert card.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; font-size: 11px; line-height: 1.5; color: #94a3b8; text-align: center;">
              Bhu Rakshak AI Landslide Monitoring Initiative • Northeast Region, India<br/>
              To stop receiving these notifications, you can unsubscribe via the website portal at any time.
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
  getWelcomeEmailHtml,
};
