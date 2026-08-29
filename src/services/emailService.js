const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// Use a verified domain or the default resend onboarding email for testing
const FROM_EMAIL = 'onboarding@resend.dev'; 

/**
 * Sends a welcome/confirmation email upon subscription.
 */
async function sendConfirmationEmail(email, districtName) {
  if (!process.env.RESEND_API_KEY) {
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
 * Sends a real-time alert when risk levels escalate.
 */
async function sendRiskAlertEmail(emails, districtName, riskLevel) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY is not set. Skipping risk alert email.');
    return;
  }
  
  if (!emails || emails.length === 0) return;

  try {
    const { data, error } = await resend.emails.send({
      from: `SIH Landslide Alerts <${FROM_EMAIL}>`,
      // NOTE: Resend's free tier only allows sending to the email address you signed up with.
      // If you need to send to multiple different emails during testing, you must verify a domain.
      to: emails, 
      subject: `🚨 URGENT: ${riskLevel.toUpperCase()} Landslide Risk in ${districtName}`,
      text: `URGENT ALERT\n\nThe AI model has predicted a ${riskLevel.toUpperCase()} landslide risk for ${districtName}. Please take necessary precautions and alert local authorities if you observe any hazards.\n\nStay safe,\nSIH Team`,
    });

    if (error) {
      console.error('Error from Resend API:', error);
    } else {
      console.log(`Alert email sent to ${emails.length} subscribers for ${districtName}. ID: ${data.id}`);
    }
  } catch (err) {
    console.error('Error sending risk alert email:', err);
  }
}

module.exports = {
  sendConfirmationEmail,
  sendRiskAlertEmail,
};
