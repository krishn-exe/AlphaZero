const jwt = require('jsonwebtoken');

const login = async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const JWT_SECRET = process.env.JWT_SECRET;

  if (!ADMIN_PASSWORD || !JWT_SECRET) {
    console.error('Admin password or JWT secret not configured in .env');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  if (password === ADMIN_PASSWORD) {
    // Generate a token valid for 24 hours
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1d' });
    return res.json({ token });
  }

  return res.status(401).json({ error: 'Invalid password' });
};

module.exports = {
  login
};
