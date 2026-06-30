const crypto = require('crypto');

function secureTokenEquals(expected, actual) {
  if (!expected || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  const collectorToken = String(process.env.SYSTEM_EVENTS_COLLECTOR_TOKEN || '').trim();
  const requestToken = String(req.get('x-collector-token') || '').trim()
    || String(req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (
    secureTokenEquals(collectorToken, requestToken)
    && req.originalUrl.startsWith('/api/system-events/ingest')
  ) {
    req.trustedCollector = true;
    return next();
  }
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ success: false, message: 'Please login first.' });
  }
  return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return requireAuth(req, res, next);
  if (roles.includes(req.user.role)) return next();
  return res.status(403).render('shared/error', {
    message: 'You do not have permission to open this page.',
  });
};

module.exports = { requireAuth, requireRole };
