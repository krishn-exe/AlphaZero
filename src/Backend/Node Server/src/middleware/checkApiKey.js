/**
 * Guards the PUT endpoints that AIML's pipeline calls to push risk scores.
 * Not full user auth — just a shared secret so random requests can't
 * overwrite risk data. Good enough for a hackathon-scoped internal endpoint.
 *
 * AIML includes this header on every PUT call:
 *   x-api-key: <value of AIML_API_KEY from your .env>
 */
function checkApiKey(req, res, next) {
  const key = req.header('x-api-key');

  if (!process.env.AIML_API_KEY) {
    console.error('AIML_API_KEY is not set in .env — refusing all writes');
    return res.status(500).json({ error: 'Server misconfigured: API key not set' });
  }

  if (key !== process.env.AIML_API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }

  next();
}

module.exports = checkApiKey;
