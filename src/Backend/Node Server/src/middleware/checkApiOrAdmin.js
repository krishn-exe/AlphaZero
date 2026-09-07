const jwt = require('jsonwebtoken');

const checkApiOrAdmin = (req, res, next) => {
  // 1. Check for AIML API Key
  const apiKey = req.headers['x-api-key'];
  if (apiKey && apiKey === process.env.AIML_API_KEY) {
    return next();
  }

  // 2. If no valid API key, check for Admin JWT
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.role === 'admin') {
        req.admin = decoded;
        return next();
      }
    } catch (err) {
      // Token invalid, fall through to 401
      console.error('JWT Verification Error in combined middleware:', err);
    }
  }

  // 3. Neither provided/valid
  return res.status(401).json({ error: 'Unauthorized: Requires valid x-api-key or Admin token' });
};

module.exports = checkApiOrAdmin;
