const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'gstgpt_secret_key_2026';

const protect = (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (error) {
      return res.status(401).json({ detail: 'Not authorized, token failed' });
    }
  }

  // Fallback to guest user for seamless operation if no token sent
  req.user = { user_id: 'guest_user', name: 'Guest', email: 'guest@gstgpt.com', admin: false };
  next();
};

const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
};

module.exports = { protect, generateToken };
