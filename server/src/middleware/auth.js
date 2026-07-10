const jwt = require('jsonwebtoken');

/**
 * Express middleware that verifies a JWT from the Authorization header
 * and attaches the decoded user payload (id, name, email) to req.user.
 */
function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided, authorization denied' });
  }

  const token = header.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, name: decoded.name, email: decoded.email };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token, authorization denied' });
  }
}

module.exports = auth;
