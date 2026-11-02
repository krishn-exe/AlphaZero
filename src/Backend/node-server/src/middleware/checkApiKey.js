/**
 * Flexible API Key authentication middleware.
 * Checks for key in:
 * - req.body.key (multipart or json body)
 * - req.headers['x-api-key']
 * - req.headers.authorization (Bearer <key>)
 * - req.query.key
 */
function checkApiKey(req, res, next) {
  const key =
    req.body?.key ||
    req.headers['x-api-key'] ||
    (req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, '')) ||
    req.query?.key;

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
