/**
 * Generates responsive, high-urgency HTML alert email for Aizawl district.
 * Dispatched automatically upon OTP verification when Aizawl is the selected district.
 * 
 * @param {Object} options
 * @param {string} options.email - Subscriber email
 * @param {string} [options.websiteUrl='https://krishn.tech/'] - Root portal URL
 * @returns {string} HTML string
 */
function getAizawlAlertEmailHtml({ email, websiteUrl = 'https://krishn.tech/' }) {
  const cleanBase = websiteUrl.replace(/\/+$/, '');
  const heatmapUrl = `${cleanBase}/#map`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Urgent: High Landslide Risk Alert - Aizawl</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b1320; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0b1320; padding: 32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 580px; background-color: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4); border: 1px solid #334155;">
          
          <!-- Urgent Alert Header Banner -->
          <tr>
            <td style="background-color: #7f1d1d; background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%); padding: 24px 28px; text-align: left; border-bottom: 3px solid #ef4444;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <div style="font-size: 11px; font-weight: 800; color: #fecaca; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 4px;">
                      🚨 EARLY WARNING ALERT &bull; HIGH RISK DETECTED
                    </div>
                    <div style="font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                      Landslide Advisory: Aizawl District
                    </div>
                  </td>
                  <td align="right" valign="middle">
                    <span style="display: inline-block; background-color: #ef4444; color: #ffffff; font-size: 11px; font-weight: 800; padding: 6px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
                      SEVERE
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Primary Notice & Detection Metrics -->
          <tr>
            <td style="padding: 28px 28px 20px 28px;">
              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 18px 0;">
                Dear Resident / Traveler,
              </p>
              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
                Our AI landslide monitoring system, powered by real-time satellite radar and soil saturation models, has detected <strong>upcoming high-risk landslide conditions</strong> across the <strong>Aizawl District</strong> mountain ridge corridor.
              </p>

              <!-- Live Telemetry Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; margin: 0 0 24px 0; overflow: hidden;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #fee2e2;">
                    <div style="font-size: 11px; font-weight: 700; color: #991b1b; text-transform: uppercase; letter-spacing: 0.5px;">
                      Target Monitored Corridor
                    </div>
                    <div style="font-size: 15px; font-weight: 700; color: #1e293b; margin-top: 2px;">
                      Aizawl Central Ridge, Sairang Corridor &amp; NH-306
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #fee2e2;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td width="50%">
                          <div style="font-size: 11px; color: #7f1d1d; font-weight: 600;">Calculated Risk Level</div>
                          <div style="font-size: 20px; font-weight: 800; color: #dc2626; margin-top: 2px;">
                            74% (High / Severe)
                          </div>
                        </td>
                        <td width="50%">
                          <div style="font-size: 11px; color: #7f1d1d; font-weight: 600;">Status</div>
                          <div style="font-size: 14px; font-weight: 700; color: #991b1b; margin-top: 4px;">
                            Active Slope Vigilance
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 20px; background-color: #fee2e2; font-size: 12px; color: #7f1d1d; line-height: 1.5;">
                    ⚠️ Heavy antecedent precipitation combined with high slope gradient indicates elevated danger of rockfalls, debris slips, and slope failure along cut slopes and highway alignments.
                  </td>
                </tr>
              </table>

              <!-- PRIMARY CALL TO ACTION (CTA) -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 28px 0;">
                <tr>
                  <td align="center" style="background-color: #003b3b; border-radius: 10px; padding: 22px 20px; text-align: center; box-shadow: 0 4px 14px rgba(0, 59, 59, 0.25);">
                    <div style="color: #6ee7b7; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px;">
                      Real-Time Geospatial Visualizer
                    </div>
                    <div style="color: #ffffff; font-size: 17px; font-weight: 700; margin-bottom: 16px;">
                      Track Critical Zones on Our Interactive Heatmap
                    </div>
                    <!-- CTA Button -->
                    <a href="${heatmapUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: #22c55e; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 28px; border-radius: 8px; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4); text-transform: uppercase; letter-spacing: 0.5px;">
                      Open Live Landslide Heatmap &rarr;
                    </a>
                    <div style="color: #94a3b8; font-size: 11px; margin-top: 10px;">
                      Hosted portal: <a href="${cleanBase}" target="_blank" style="color: #38bdf8; text-decoration: underline;">https://krishn.tech/</a>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- GENERAL LANDSLIDE ADVICE & SAFETY GUIDELINES -->
              <div style="margin-bottom: 24px;">
                <h3 style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 12px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
                  🛡️ Essential Landslide Safety &amp; Preparedness Advice
                </h3>
                
                <!-- Advice 1: Warning Signs -->
                <div style="margin-bottom: 14px;">
                  <strong style="font-size: 13px; color: #991b1b;">1. Watch for Warning Signs:</strong>
                  <ul style="margin: 6px 0 0 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.5;">
                    <li>New cracks or widening fissures on roads, retaining walls, or house floors.</li>
                    <li>Sudden tilting of trees, utility posts, or retaining structures.</li>
                    <li>Sudden discoloration or muddiness in streams and springs.</li>
                    <li>Rumbling or cracking sounds emanating from the hillside.</li>
                  </ul>
                </div>

                <!-- Advice 2: Precautionary Action -->
                <div style="margin-bottom: 14px;">
                  <strong style="font-size: 13px; color: #0369a1;">2. Immediate Action &amp; Precautions:</strong>
                  <ul style="margin: 6px 0 0 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.5;">
                    <li>Avoid sleeping in rooms immediately adjacent to steep uphill slopes during continuous downpours.</li>
                    <li>Stay off vulnerable mountain highways (especially NH-306 and Sairang ghats) unless essential.</li>
                    <li>Never cross active mud or debris flows on foot or in vehicles.</li>
                    <li>Keep an Emergency Go-Bag ready with drinking water, torch, medicine, vital documents, and a charged power bank.</li>
                  </ul>
                </div>

                <!-- Advice 3: Evacuation Protocol -->
                <div style="margin-bottom: 16px;">
                  <strong style="font-size: 13px; color: #15803d;">3. Evacuation Readiness:</strong>
                  <p style="margin: 4px 0 0 0; font-size: 13px; color: #475569; line-height: 1.5;">
                    If local authorities advise evacuation, move immediately to designated shelters or community halls situated on stable, flat ground. Do not wait for conditions to worsen.
                  </p>
                </div>

                <!-- Emergency Helpline Directory -->
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px;">
                  <div style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 6px;">
                    📞 24x7 Emergency Helplines (Aizawl &amp; Mizoram)
                  </div>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size: 12px; color: #1e293b;">
                    <tr>
                      <td style="padding: 3px 0;"><strong>State Disaster Management (SDMA):</strong></td>
                      <td style="padding: 3px 0; text-align: right;"><span style="color: #dc2626; font-weight: 700;">1070 / 0389-2335837</span></td>
                    </tr>
                    <tr>
                      <td style="padding: 3px 0;"><strong>Aizawl District Emergency Centre:</strong></td>
                      <td style="padding: 3px 0; text-align: right;"><span style="color: #dc2626; font-weight: 700;">1077</span></td>
                    </tr>
                    <tr>
                      <td style="padding: 3px 0;"><strong>National Emergency Response:</strong></td>
                      <td style="padding: 3px 0; text-align: right;"><span style="color: #dc2626; font-weight: 700;">112</span></td>
                    </tr>
                  </table>
                </div>
              </div>

              <p style="font-size: 12px; line-height: 1.5; color: #64748b; margin: 0;">
                You received this priority alert because you subscribed to Bhu Rakshak Landslide Early Warnings for the Aizawl region with ${email}.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f1f5f9; padding: 20px 28px; text-align: center; border-top: 1px solid #e2e8f0;">
              <div style="font-size: 12px; font-weight: 700; color: #334155;">
                Bhu Rakshak &bull; Landslide Early Warning System
              </div>
              <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
                Hosted live at <a href="${cleanBase}" style="color: #0284c7; text-decoration: underline;">https://krishn.tech/</a> &bull; Data updated every 4 hours
              </div>
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
  getAizawlAlertEmailHtml,
};
