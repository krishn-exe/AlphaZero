const { Resend } = require('resend');

// Only instantiate if the key exists, to avoid crashing the server on boot
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Use a verified domain or the default resend onboarding email for testing
const FROM_EMAIL = 'onboarding@resend.dev'; 

/**
 * Sends a welcome/confirmation email upon subscription.
 */
async function sendConfirmationEmail(email, districtName) {
  if (!resend) {
    console.warn('RESEND_API_KEY is not set. Skipping confirmation email.');
    return;
  }

  try {
    const scope = districtName ? `the ${districtName} district` : `all NER districts`;
    
    const { data, error } = await resend.emails.send({
      from: `SIH Landslide Alerts <${FROM_EMAIL}>`,
      to: email,
      subject: 'Subscription Confirmed: Landslide Alerts',
      text: `Hello,\n\nYou have successfully subscribed to landslide risk alerts for ${scope}. We will notify you if the risk level escalates to High or Severe.\n\nStay safe,\nSIH Team`,
    });

    if (error) {
      console.error('Error from Resend API:', error);
    } else {
      console.log(`Confirmation email sent to ${email}. ID: ${data.id}`);
    }
  } catch (err) {
    console.error('Error sending confirmation email:', err);
  }
}

/**
 * Sends a risk escalation alert to an array of emails.
 * 
 * Note: Resend's free tier allows up to 50 recipients in a single API call
 * via the `bcc` field, which is perfect for this use case.
 */
async function sendRiskAlertEmail(emails, locationName, newRiskLevel) {
  if (!resend) {
    console.warn('RESEND_API_KEY is not set. Skipping risk alert emails.');
    return;
  }

  if (!emails || emails.length === 0) return;

  try {
    // Determine subject severity
    const subjectPrefix = newRiskLevel === 'severe' ? '🚨 SEVERE ALERT' : '⚠️ HIGH RISK ALERT';
    
    // Using bcc so recipients don't see each other's emails
    // Free tier limit: 50 emails max per request. If this scales, 
    // we would need to chunk the array into batches of 50.
    const { data, error } = await resend.emails.send({
      from: `SIH Landslide Alerts <${FROM_EMAIL}>`,
      to: FROM_EMAIL, // Send to self, bcc the list
      bcc: emails,
      subject: `${subjectPrefix}: Landslide Risk in ${locationName}`,
      html: `
        <h2>Landslide Risk Update</h2>
        <p>The landslide risk level for <strong>${locationName}</strong> has been elevated to <strong><span style="color:red; text-transform:uppercase;">${newRiskLevel}</span></strong>.</p>
        <p>Please exercise caution and follow instructions from local authorities.</p>
        <br/>
        <p><small>You are receiving this because you subscribed to alerts for this area on the SIH Landslide platform.</small></p>
      `,
    });

    if (error) {
      console.error('Resend API Error (Alert):', error);
    } else {
      console.log(`Successfully sent risk alert to ${emails.length} subscribers. ID: ${data.id}`);
    }
  } catch (err) {
    console.error('Failed to send risk alert email:', err);
  }
}

module.exports = {
  sendConfirmationEmail,
  sendRiskAlertEmail,
};
